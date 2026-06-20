const { getPoints } = require("../memory/qdrantClient");
const { SUPPORTED_MEMORY_TYPES } = require("../storage");

const MAX_MEMORY_MAP_POINTS = 1000;
const MAX_SEMANTIC_NEIGHBORS = 10;
const MEMORY_MAP_PADDING = 0.08;
const POWER_ITERATION_STEPS = 24;
const VECTOR_EPSILON = 1e-9;
const MEMORY_USAGE_ROLLING_WINDOWS = Object.freeze([
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
]);

function truncateExcerpt(value, maxLength = 180) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isUsableVector(vector, expectedLength = 0) {
  if (!Array.isArray(vector) || vector.length < 2) {
    return false;
  }

  if (expectedLength > 0 && vector.length !== expectedLength) {
    return false;
  }

  return vector.every(isFiniteNumber);
}

function dotProduct(left, right) {
  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }

  return total;
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(dotProduct(vector, vector));

  if (!Number.isFinite(magnitude) || magnitude <= VECTOR_EPSILON) {
    return null;
  }

  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left, right) {
  const leftNormalized = normalizeVector(left);
  const rightNormalized = normalizeVector(right);

  if (!leftNormalized || !rightNormalized) {
    return 0;
  }

  return dotProduct(leftNormalized, rightNormalized);
}

function buildSeedVector(length, variant = 0) {
  return Array.from({ length }, (_unused, index) => {
    const angle = (index + 1) * (variant + 1) * 0.61803398875;
    return Math.sin(angle) + Math.cos(angle * 0.5);
  });
}

function orthogonalize(vector, basisVectors = []) {
  const result = [...vector];

  for (const basis of basisVectors) {
    if (!Array.isArray(basis) || basis.length !== result.length) {
      continue;
    }

    const scale = dotProduct(result, basis);

    for (let index = 0; index < result.length; index += 1) {
      result[index] -= scale * basis[index];
    }
  }

  return result;
}

function multiplyByCovariance(centeredVectors, direction) {
  const result = new Array(direction.length).fill(0);
  const sampleCount = Math.max(1, centeredVectors.length);

  for (const vector of centeredVectors) {
    const projection = dotProduct(vector, direction);

    for (let index = 0; index < result.length; index += 1) {
      result[index] += vector[index] * projection;
    }
  }

  for (let index = 0; index < result.length; index += 1) {
    result[index] /= sampleCount;
  }

  return result;
}

function centerVectors(vectors) {
  if (!Array.isArray(vectors) || !vectors.length) {
    return [];
  }

  const dimensionCount = vectors[0].length;
  const means = new Array(dimensionCount).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < dimensionCount; index += 1) {
      means[index] += vector[index];
    }
  }

  for (let index = 0; index < dimensionCount; index += 1) {
    means[index] /= vectors.length;
  }

  return vectors.map((vector) => vector.map((value, index) => value - means[index]));
}

function runPowerIteration(centeredVectors, basisVectors = [], variant = 0) {
  if (!centeredVectors.length) {
    return null;
  }

  const dimensionCount = centeredVectors[0].length;
  let direction = normalizeVector(orthogonalize(buildSeedVector(dimensionCount, variant), basisVectors));

  if (!direction) {
    return null;
  }

  for (let step = 0; step < POWER_ITERATION_STEPS; step += 1) {
    const multiplied = multiplyByCovariance(centeredVectors, direction);
    const orthogonalized = orthogonalize(multiplied, basisVectors);
    const normalized = normalizeVector(orthogonalized);

    if (!normalized) {
      break;
    }

    direction = normalized;
  }

  return direction;
}

function normalizeProjectedCoordinates(points, { padding = MEMORY_MAP_PADDING } = {}) {
  if (!points.length) {
    return [];
  }

  const safePadding = Math.min(0.45, Math.max(0, Number(padding) || 0));
  const xs = points.map((point) => point.rawX);
  const ys = points.map((point) => point.rawY);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = maxX - minX;
  const yRange = maxY - minY;

  return points.map((point) => {
    const normalizedX = xRange <= VECTOR_EPSILON
      ? 0.5
      : safePadding + ((point.rawX - minX) / xRange) * (1 - safePadding * 2);
    const normalizedY = yRange <= VECTOR_EPSILON
      ? 0.5
      : 1 - (safePadding + ((point.rawY - minY) / yRange) * (1 - safePadding * 2));

    return {
      x: Number(normalizedX.toFixed(6)),
      y: Number(normalizedY.toFixed(6)),
    };
  });
}

function projectVectorsTo2d(vectors, options = {}) {
  if (!Array.isArray(vectors) || !vectors.length) {
    return [];
  }

  if (vectors.length === 1) {
    return [{ x: 0.5, y: 0.5 }];
  }

  const centeredVectors = centerVectors(vectors);
  const componentX = runPowerIteration(centeredVectors, [], 0);
  const componentY = componentX
    ? runPowerIteration(centeredVectors, [componentX], 1)
    : null;

  const projected = centeredVectors.map((vector) => ({
    rawX: componentX ? dotProduct(vector, componentX) : 0,
    rawY: componentY ? dotProduct(vector, componentY) : 0,
  }));

  return normalizeProjectedCoordinates(projected, options);
}

function sortMemoryTypes(types = []) {
  const order = new Map(SUPPORTED_MEMORY_TYPES.map((value, index) => [value, index]));

  return [...types].sort((left, right) => {
    const leftOrder = order.has(left) ? order.get(left) : Number.MAX_SAFE_INTEGER;
    const rightOrder = order.has(right) ? order.get(right) : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
  });
}

function buildMemoryEditPath({ memoryId, theme, buildAdminLocation }) {
  if (typeof buildAdminLocation === "function") {
    return buildAdminLocation({
      path: "/admin/memory/library/edit",
      theme,
      extra: {
        edit: memoryId,
      },
    });
  }

  const search = new URLSearchParams({
    edit: memoryId,
    theme: theme || "light",
  });
  return `/admin/memory/library/edit?${search.toString()}`;
}

function buildSemanticNeighbors(points, vectors, limit = MAX_SEMANTIC_NEIGHBORS) {
  const normalizedLimit = Math.max(0, Math.min(MAX_SEMANTIC_NEIGHBORS, Number(limit) || 0));

  if (!points.length || !normalizedLimit) {
    return points.map(() => []);
  }

  const normalizedVectors = vectors.map((vector) => normalizeVector(vector));

  return points.map((point, sourceIndex) => {
    const sourceVector = normalizedVectors[sourceIndex];
    const nearest = [];

    if (!sourceVector) {
      return [];
    }

    points.forEach((candidate, candidateIndex) => {
      if (candidateIndex === sourceIndex || !normalizedVectors[candidateIndex]) {
        return;
      }

      const similarity = dotProduct(sourceVector, normalizedVectors[candidateIndex]);
      const neighbor = {
        memoryId: candidate.memoryId,
        similarity: Number(similarity.toFixed(6)),
      };
      const insertIndex = nearest.findIndex((entry) => neighbor.similarity > entry.similarity);

      if (insertIndex === -1) {
        if (nearest.length < normalizedLimit) {
          nearest.push(neighbor);
        }
        return;
      }

      nearest.splice(insertIndex, 0, neighbor);

      if (nearest.length > normalizedLimit) {
        nearest.length = normalizedLimit;
      }
    });

    return nearest;
  });
}

function getRollingUsageSince(now, days) {
  const parsed = new Date(now || Date.now());

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid memory usage reference date "${now}".`);
  }

  return new Date(parsed.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString();
}

async function loadRollingUsageCounts({ memoryStore, memoryIds, userScope, now = new Date() }) {
  if (typeof memoryStore?.countMemoryUsage !== "function" || !memoryIds.length) {
    return new Map(MEMORY_USAGE_ROLLING_WINDOWS.map(({ key }) => [key, new Map()]));
  }

  const usageEntries = await Promise.all(MEMORY_USAGE_ROLLING_WINDOWS.map(async ({ key, days }) => {
    const rows = await memoryStore.countMemoryUsage({
      memoryIds,
      userScope,
      since: getRollingUsageSince(now, days),
    });
    const counts = new Map(
      (Array.isArray(rows) ? rows : []).map((row) => [String(row.memoryId || "").trim(), Number(row.count || 0)]),
    );
    return [key, counts];
  }));

  return new Map(usageEntries);
}

async function prepareMemoryMapData({
  memoryStore,
  config,
  theme = "light",
  buildAdminLocation,
  now = new Date(),
}) {
  const userScope = config?.memory?.userScope || "";
  const totalActiveMemories = typeof memoryStore?.countMemories === "function"
    ? await memoryStore.countMemories({ userScope, activeOnly: true })
    : 0;
  const memories = await memoryStore.listMemories({
    userScope,
    limit: MAX_MEMORY_MAP_POINTS,
    activeOnly: true,
  });

  if (!memories.length) {
    return {
      totalActiveMemories,
      plottedCount: 0,
      omittedWithoutVectorCount: 0,
      capped: totalActiveMemories > MAX_MEMORY_MAP_POINTS,
      projectionMethod: "pca",
      availableDomains: [],
      availableMemoryTypes: [],
      points: [],
    };
  }

  const qdrantPoints = await getPoints({
    config,
    ids: memories.map((memory) => memory.memoryId),
    withVector: true,
  });
  const qdrantPointById = new Map(
    qdrantPoints.map((point) => [String(point?.payload?.memory_id || point?.id || "").trim(), point]),
  );

  const vectors = [];
  const preparedMemories = [];
  const expectedLength = qdrantPoints.find((point) => Array.isArray(point?.vector) && point.vector.length >= 2)?.vector?.length || 0;

  for (const memory of memories) {
    const point = qdrantPointById.get(memory.memoryId);
    const vector = point?.vector;

    if (!isUsableVector(vector, expectedLength)) {
      continue;
    }

    preparedMemories.push(memory);
    vectors.push(vector.map(Number));
  }

  const coordinates = projectVectorsTo2d(vectors);
  const rollingUsageCounts = await loadRollingUsageCounts({
    memoryStore,
    memoryIds: preparedMemories.map((memory) => memory.memoryId),
    userScope,
    now,
  });
  const points = preparedMemories.map((memory, index) => ({
    memoryId: memory.memoryId,
    title: memory.title,
    excerpt: truncateExcerpt(memory.content),
    memoryType: memory.memoryType,
    domain: memory.domain,
    sensitivity: memory.sensitivity,
    importance: Number(memory.importance || 0),
    referenceDate: memory.referenceDate || "",
    updatedAt: memory.updatedAt || "",
    lastUsedAt: memory.lastUsedAt || "",
    useCount: Number(memory.useCount || 0),
    useCount7d: rollingUsageCounts.get("7d")?.get(memory.memoryId) || 0,
    useCount30d: rollingUsageCounts.get("30d")?.get(memory.memoryId) || 0,
    useCount90d: rollingUsageCounts.get("90d")?.get(memory.memoryId) || 0,
    editPath: buildMemoryEditPath({
      memoryId: memory.memoryId,
      theme,
      buildAdminLocation,
    }),
    x: coordinates[index]?.x ?? 0.5,
    y: coordinates[index]?.y ?? 0.5,
  }));
  const semanticNeighbors = buildSemanticNeighbors(points, vectors);
  const pointsWithNeighbors = points.map((point, index) => ({
    ...point,
    semanticNeighbors: semanticNeighbors[index] || [],
  }));

  return {
    totalActiveMemories,
    plottedCount: pointsWithNeighbors.length,
    omittedWithoutVectorCount: Math.max(0, memories.length - points.length),
    capped: totalActiveMemories > MAX_MEMORY_MAP_POINTS,
    projectionMethod: "pca",
    maxSemanticNeighbors: MAX_SEMANTIC_NEIGHBORS,
    availableDomains: [...new Set(pointsWithNeighbors.map((point) => point.domain).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
    availableMemoryTypes: sortMemoryTypes([...new Set(pointsWithNeighbors.map((point) => point.memoryType).filter(Boolean))]),
    points: pointsWithNeighbors,
  };
}

module.exports = {
  MAX_MEMORY_MAP_POINTS,
  MAX_SEMANTIC_NEIGHBORS,
  MEMORY_MAP_PADDING,
  MEMORY_USAGE_ROLLING_WINDOWS,
  cosineSimilarity,
  getRollingUsageSince,
  isUsableVector,
  loadRollingUsageCounts,
  normalizeProjectedCoordinates,
  projectVectorsTo2d,
  prepareMemoryMapData,
  truncateExcerpt,
};
