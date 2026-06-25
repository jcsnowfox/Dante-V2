const { renderHelpIcon, renderPageIntro, renderSubnav } = require("./shared");
const { renderMemoryReviewPage } = require("./memoryReviewPage");

function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const MEMORY_TYPE_LABELS = Object.freeze({
  anchor: "Anchor",
  canon: "Canon",
  resolved: "Resolved",
  roleplay: "Roleplay",
  timeline_daily: "Daily",
  timeline_weekly: "Weekly",
});

const MEMORY_TYPE_PALETTE = Object.freeze({
  anchor: { dark: "#F9F9F9", light: "#719e6b" },
  canon: { dark: "#6068be", light: "#4c5696" },
  resolved: { dark: "#9a9fd6", light: "#8c92b8" },
  roleplay: { dark: "#de7eb3", light: "#bc4e5a" },
  timeline_daily: { dark: "#66aeb7", light: "#3c848e" },
  timeline_weekly: { dark: "#9ecbd1", light: "#84bbc2" },
  default: { dark: "#A8ACDC", light: "#9399C8" },
});

function formatMemoryTypeLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return MEMORY_TYPE_LABELS[normalized] || normalized.replace(/_/g, " ") || "Memory";
}

function formatDomainLabel(value = "") {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "Uncategorised";
  }

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderMemoryLayout({ currentTab, tabBody, theme = "light", helpers }) {
  const tabs = [
    { key: "library", label: "Library", path: "/admin/memory/library" },
    { key: "map", label: "Map", path: "/admin/memory/map" },
    { key: "curator", label: "Curator", path: "/admin/memory/curator" },
    { key: "review", label: "Review", path: "/admin/memory/review" },
    { key: "imports", label: "Import Memories", path: "/admin/memory/imports" },
  ];

  return [
    renderPageIntro({
      title: "Memories",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: currentTab, theme, helpers }),
    "</section>",
    `<section class="lite-panel page-frame memory-page-shell">${tabBody}</section>`,
  ].join("");
}

function renderMemoryMapPage({ mapData = {}, theme = "light", helpers }) {
  const { escapeHtml } = helpers;
  const totalActiveMemories = Number(mapData.totalActiveMemories || 0);
  const plottedCount = Number(mapData.plottedCount || 0);
  const omittedWithoutVectorCount = Number(mapData.omittedWithoutVectorCount || 0);
  const capped = Boolean(mapData.capped);
  const maxSemanticNeighbors = Math.max(0, Number(mapData.maxSemanticNeighbors || 10));
  const defaultNeighborCount = Math.min(3, maxSemanticNeighbors);
  const availableDomains = Array.isArray(mapData.availableDomains) ? mapData.availableDomains : [];
  const availableMemoryTypes = Array.isArray(mapData.availableMemoryTypes) ? mapData.availableMemoryTypes : [];
  const points = Array.isArray(mapData.points) ? mapData.points : [];
  const qdrantError = mapData.qdrantError || null;
  const savedMemoryCount = Number(mapData.savedMemoryCount || totalActiveMemories || 0);
  const domainOptions = availableDomains.map((value) => (
    `<option value="${escapeHtml(value)}">${escapeHtml(formatDomainLabel(value))}</option>`
  )).join("");
  const typeOptions = availableMemoryTypes.map((value) => (
    `<option value="${escapeHtml(value)}">${escapeHtml(formatMemoryTypeLabel(value))}</option>`
  )).join("");
  const memoryTypeLegend = availableMemoryTypes.map((value) => {
    const palette = MEMORY_TYPE_PALETTE[value] || MEMORY_TYPE_PALETTE.default;
    const color = palette[theme === "dark" ? "dark" : "light"];

    return [
      "<span class=\"memory-map-legend-item\">",
      `<span class="memory-map-legend-dot" style="--memory-map-legend-color:${escapeHtml(color)}"></span>`,
      `<span>${escapeHtml(formatMemoryTypeLabel(value))}</span>`,
      "</span>",
    ].join("");
  }).join("");
  const neighborOptions = Array.from({ length: maxSemanticNeighbors + 1 }, (_unused, index) => (
    `<option value="${escapeHtml(String(index))}"${index === defaultNeighborCount ? " selected" : ""}>${escapeHtml(String(index))}</option>`
  )).join("");
  const glowOptions = [
    ["lifetime", "All-time"],
    ["7d", "7 days"],
    ["30d", "30 days"],
    ["90d", "90 days"],
  ].map(([value, label]) => (
    `<option value="${escapeHtml(value)}"${value === "lifetime" ? " selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
  const topNote = [
    capped ? "Showing the newest 1000 active memories." : "",
    omittedWithoutVectorCount > 0 ? `${omittedWithoutVectorCount} memories are not shown because they do not have embeddings yet.` : "",
  ].filter(Boolean).join(" ");
  const emptyState = qdrantError
    ? [
      "<section class=\"memory-map-empty-state\">",
      "<h3>Memory Map unavailable &mdash; vector index unreachable</h3>",
      `<p class="meta">The Qdrant vector index could not be reached. Your ${escapeHtml(String(savedMemoryCount))} saved ${savedMemoryCount === 1 ? "memory is" : "memories are"} safe in the database.</p>`,
      `<p class="meta"><code class="error-code">${escapeHtml(qdrantError)}</code></p>`,
      "<div class=\"memory-action-row\" style=\"display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem\">",
      "<form method=\"POST\" action=\"/admin/actions/memory-rebuild\">",
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/memory/map\">",
      "<button type=\"submit\" class=\"toolbar-button primary\">Retry Resync</button>",
      "</form>",
      "<a href=\"/admin/memory/library\" class=\"toolbar-button secondary\">View Library</a>",
      "</div>",
      "</section>",
    ].join("")
    : totalActiveMemories <= 0
      ? [
        "<section class=\"memory-map-empty-state\">",
        "<h3>No active memories yet</h3>",
        "<p class=\"meta\">Once you’ve saved a few active memories, they’ll appear here as a spatial map.</p>",
        "</section>",
      ].join("")
      : plottedCount <= 0
        ? [
          "<section class=\"memory-map-empty-state\">",
          "<h3>Map unavailable until memories are synced</h3>",
          "<p class=\"meta\">Active memories were found, but none have usable embeddings yet. Run a memory resync and this view should wake up.</p>",
          "</section>",
        ].join("")
        : "";
  const serializedMapData = serializeForInlineScript({
    ...mapData,
    theme,
  });

  return [
    "<section class=\"memory-section memory-map-page\">",
    emptyState || [
      "<section class=\"memory-map-shell\" data-memory-map-root>",
      "<section class=\"lite-toolbar stack memory-toolbar-shell memory-map-toolbar\">",
      "<div class=\"toolbar-row filters\">",
      "<div class=\"toolbar-group memory-toolbar-group memory-toolbar-group-filters\">",
      `<div class="toolbar-field select memory-map-filter-field"><label for="memoryMapNeighbours">Connection Depth</label><select id="memoryMapNeighbours" data-memory-map-neighbours aria-label="Semantic neighbours">${neighborOptions}</select></div>`,
      `<div class="toolbar-field select memory-map-filter-field"><label for="memoryMapGlowMetric">Usage Window</label><select id="memoryMapGlowMetric" data-memory-map-glow-metric aria-label="Usage highlight">${glowOptions}</select></div>`,
      "<div class=\"toolbar-field search memory-map-filter-field\"><label for=\"memoryMapSearch\">Search</label><input id=\"memoryMapSearch\" type=\"search\" placeholder=\"Search memories...\" data-memory-map-search></div>",
      `<div class="toolbar-field select memory-map-filter-field"><label for="memoryMapTypeFilter">Type</label><select id="memoryMapTypeFilter" data-memory-map-type><option value="">All</option>${typeOptions}</select></div>`,
      `<div class="toolbar-field select memory-map-filter-field"><label for="memoryMapDomainFilter">Category</label><select id="memoryMapDomainFilter" data-memory-map-domain><option value="">All</option>${domainOptions}</select></div>`,
      "<button type=\"button\" class=\"toolbar-button secondary\" data-memory-map-reset>Reset Filters</button>",
      "</div>",
      "</div>",
      "</section>",
      "<section class=\"memory-map-main-grid\">",
      "<div class=\"lite-panel memory-map-canvas-card memory-map-visual-card\">",
      "<div class=\"memory-map-canvas-wrap\">",
      "<svg class=\"memory-map-svg\" viewBox=\"0 0 1000 760\" role=\"img\" aria-label=\"Memory similarity map\" data-memory-map-svg>",
      "<rect class=\"memory-map-hit-surface\" x=\"0\" y=\"0\" width=\"1000\" height=\"760\" fill=\"transparent\" pointer-events=\"all\" data-memory-map-hit-surface></rect>",
      "<g data-memory-map-viewport></g>",
      "</svg>",
      "<div class=\"memory-map-tooltip\" data-memory-map-tooltip hidden></div>",
      "</div>",
      "<div class=\"memory-map-mobile-selection\" data-memory-map-mobile-selection>",
      "<span class=\"memory-map-mobile-selection-label\">Selected</span>",
      "<strong data-memory-map-mobile-selection-title>Tap a memory to inspect it</strong>",
      "</div>",
      "<section class=\"memory-map-key-strip\">",
      memoryTypeLegend ? `<div class="memory-map-legend" aria-label="Memory type colours">${memoryTypeLegend}</div>` : "",
      "<div class=\"memory-map-inline-stats\" aria-label=\"Map counts\">",
      `<span><span>Active</span><strong data-memory-map-stat="active">${escapeHtml(String(totalActiveMemories))}</strong></span>`,
      `<span><span>Visible</span><strong data-memory-map-stat="visible">${escapeHtml(String(plottedCount))}</strong></span>`,
      "<span><span>Hidden</span><strong data-memory-map-stat=\"hidden\">0</strong></span>",
      `<span><span>Omitted</span><strong data-memory-map-stat="omitted">${escapeHtml(String(Math.max(0, totalActiveMemories - plottedCount)))}</strong></span>`,
      "</div>",
      topNote ? `<p class="meta memory-map-top-note">${escapeHtml(topNote)}</p>` : "",
      "</section>",
      "</div>",
      "<aside class=\"lite-panel memory-map-detail-card\" data-memory-map-detail>",
      "<h3>Memory Inspector</h3>",
      "<div class=\"memory-map-detail-empty\" data-memory-map-detail-empty>",
      "<p class=\"memory-map-detail-empty-title\">No memory selected</p>",
      "<p class=\"meta\">Click a node in the map to view its details, usage, and editor link.</p>",
      "</div>",
      "<div class=\"memory-map-detail-content\" data-memory-map-detail-content hidden>",
      "<h3 data-memory-map-detail-title></h3>",
      "<div class=\"memory-chip-row\" data-memory-map-detail-badges></div>",
      "<p class=\"memory-map-detail-excerpt\" data-memory-map-detail-excerpt></p>",
      "<dl class=\"memory-map-detail-meta\" data-memory-map-detail-meta></dl>",
      "<h4 class=\"memory-map-reference-title\">Usage in Chat</h4>",
      "<section class=\"memory-map-reference-grid\" data-memory-map-reference-grid aria-label=\"Reference counts\"></section>",
      "<p><a class=\"toolbar-button secondary memory-map-detail-link\" data-memory-map-detail-link href=\"#\">Open in Editor</a></p>",
      "</div>",
      "</aside>",
      "</section>",
      `<script type="application/json" id="memoryMapData">${serializedMapData}</script>`,
      `<script>
(() => {
  const dataElement = document.getElementById('memoryMapData');
  const root = document.querySelector('[data-memory-map-root]');
  if (!dataElement || !root) return;

  const data = JSON.parse(dataElement.textContent || '{}');
  const points = Array.isArray(data.points) ? data.points : [];
  const svg = root.querySelector('[data-memory-map-svg]');
  const viewport = root.querySelector('[data-memory-map-viewport]');
  const tooltip = root.querySelector('[data-memory-map-tooltip]');
  const mobileSelection = root.querySelector('[data-memory-map-mobile-selection]');
  const mobileSelectionTitle = root.querySelector('[data-memory-map-mobile-selection-title]');
  const searchInput = document.querySelector('[data-memory-map-search]');
  const neighbourSelect = document.querySelector('[data-memory-map-neighbours]');
  const glowMetricSelect = document.querySelector('[data-memory-map-glow-metric]');
  const typeSelect = document.querySelector('[data-memory-map-type]');
  const domainSelect = document.querySelector('[data-memory-map-domain]');
  const resetButton = document.querySelector('[data-memory-map-reset]');
  const statElements = new Map(Array.from(root.querySelectorAll('[data-memory-map-stat]')).map((element) => [element.dataset.memoryMapStat, element]));
  const detailCard = root.querySelector('[data-memory-map-detail]');
  const detailEmpty = root.querySelector('[data-memory-map-detail-empty]');
  const detailContent = root.querySelector('[data-memory-map-detail-content]');
  const detailTitle = root.querySelector('[data-memory-map-detail-title]');
  const detailBadges = root.querySelector('[data-memory-map-detail-badges]');
  const detailReferences = root.querySelector('[data-memory-map-reference-grid]');
  const detailMeta = root.querySelector('[data-memory-map-detail-meta]');
  const detailExcerpt = root.querySelector('[data-memory-map-detail-excerpt]');
  const detailLink = root.querySelector('[data-memory-map-detail-link]');
  const ns = 'http://www.w3.org/2000/svg';
  const viewWidth = 1000;
  const viewHeight = 760;
  const isDarkTheme = data.theme === 'dark';
  const memoryTypeLabels = ${serializeForInlineScript(MEMORY_TYPE_LABELS)};
  const memoryTypePalette = ${serializeForInlineScript(MEMORY_TYPE_PALETTE)};
  const themeColors = {
    primaryAccent: isDarkTheme ? '#78B8C0' : '#4C919A',
    accentHover: isDarkTheme ? '#96CDD4' : '#3B7E87',
    secondaryAccent: isDarkTheme ? '#7B82C9' : '#656EB0',
    highlightMetallic: isDarkTheme ? '#B9BEC8' : '#9FA7B5',
    textPrimary: isDarkTheme ? '#F1F4F8' : '#18202B',
    textSecondary: isDarkTheme ? '#ABB6C7' : '#526173',
    neutralPoint: isDarkTheme ? '#5A6678' : '#97A5B6',
  };
  const isCoarsePointer = Boolean(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
  const isCompactMapMode = isCoarsePointer || Boolean(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);
  const minMapScale = isCompactMapMode ? 1 : 0.75;
  const maxMapScale = isCompactMapMode ? 14 : 6;
  const nodeScaleCompensationStrength = isCompactMapMode ? 0.28 : 0.5;
  const nodeSizeMultiplier = isCompactMapMode ? 1.35 : 1;
  let renderedNodeVisuals = [];
  let latestVisiblePoints = points;
  const activePointers = new Map();
  let viewAnimationFrame = 0;
  const state = {
    query: '',
    memoryType: '',
    domain: '',
    selectedId: '',
    hoveredId: '',
    neighbourCount: ${JSON.stringify(defaultNeighborCount)},
    usageMetric: 'lifetime',
    scale: 1,
    panX: 0,
    panY: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragPanX: 0,
    dragPanY: 0,
    dragMoved: false,
    dragging: false,
    pinching: false,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    pinchWorldX: 0,
    pinchWorldY: 0,
  };

  function escapeInlineHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMemoryTypeLabel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return memoryTypeLabels[normalized] || normalized.replace(/_/g, ' ') || 'Memory';
  }

  function formatDomainLabel(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return 'Uncategorised';

    return normalized
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function getTypeColor(memoryType) {
    const paletteEntry = memoryTypePalette[String(memoryType || '').trim().toLowerCase()] || memoryTypePalette.default;
    return isDarkTheme ? paletteEntry.dark : paletteEntry.light;
  }

  function getPointColor(point, isSelected, isHovered) {
    if (isSelected || isHovered) {
      return getTypeColor(point.memoryType);
    }

    return getTypeColor(point.memoryType);
  }

  function getPointUsageValue(point) {
    if (state.usageMetric === '7d') return Number(point.useCount7d || 0);
    if (state.usageMetric === '30d') return Number(point.useCount30d || 0);
    if (state.usageMetric === '90d') return Number(point.useCount90d || 0);
    return Number(point.useCount || 0);
  }

  function withAlpha(hex, alpha) {
    const normalized = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return hex;
    }

    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + alpha + ')';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatDateValue(value) {
    const normalized = String(value || '').trim();

    if (!normalized) {
      return '—';
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return normalized;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  }

  function createSvgNode(tagName, attributes = {}) {
    const node = document.createElementNS(ns, tagName);
    Object.entries(attributes).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });
    return node;
  }

  function createDot(cx, cy, size, attributes = {}) {
    return createSvgNode('circle', {
      cx,
      cy,
      r: size,
      ...attributes,
    });
  }

  function createAnimateNode(attributes = {}) {
    return createSvgNode('animate', attributes);
  }

  function animateNeighborLine(line, {
    selectedX,
    selectedY,
    targetX,
    targetY,
    duration = 1000,
    delay = 0,
    opacity = 1,
  }) {
    line.setAttribute('x2', String(selectedX));
    line.setAttribute('y2', String(selectedY));
    line.setAttribute('opacity', '0');

    window.setTimeout(() => {
      const startedAt = performance.now();

      const step = (now) => {
        const progress = clamp((now - startedAt) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        line.setAttribute('x2', String(selectedX + ((targetX - selectedX) * eased)));
        line.setAttribute('y2', String(selectedY + ((targetY - selectedY) * eased)));
        line.setAttribute('opacity', String(opacity * eased));

        if (progress < 1 && line.isConnected) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    }, delay);
  }

  function getNodeCompensationTransform() {
    const safeScale = state.scale > 0 ? state.scale : 1;
    const compensation = Math.pow(1 / safeScale, nodeScaleCompensationStrength);
    return 'scale(' + compensation.toFixed(5) + ')';
  }

  function updateNodeScaleCompensation() {
    renderedNodeVisuals.forEach((group) => {
      group.setAttribute('transform', getNodeCompensationTransform());
    });
  }

  function stopViewAnimation() {
    if (viewAnimationFrame) {
      cancelAnimationFrame(viewAnimationFrame);
      viewAnimationFrame = 0;
    }
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function animateViewTo(nextView, duration = 180) {
    stopViewAnimation();
    const startView = {
      scale: state.scale,
      panX: state.panX,
      panY: state.panY,
    };
    const startedAt = performance.now();

    const step = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = easeOutCubic(progress);
      state.scale = startView.scale + ((nextView.scale ?? startView.scale) - startView.scale) * eased;
      state.panX = startView.panX + ((nextView.panX ?? startView.panX) - startView.panX) * eased;
      state.panY = startView.panY + ((nextView.panY ?? startView.panY) - startView.panY) * eased;
      applyTransform();

      if (progress < 1) {
        viewAnimationFrame = requestAnimationFrame(step);
      } else {
        viewAnimationFrame = 0;
      }
    };

    viewAnimationFrame = requestAnimationFrame(step);
  }

  function buildVisiblePointMap(visiblePoints) {
    return new Map(visiblePoints.map((point) => [point.memoryId, point]));
  }

  function buildVisiblePoints() {
    return points.filter((point) => {
      if (state.memoryType && point.memoryType !== state.memoryType) return false;
      if (state.domain && point.domain !== state.domain) return false;
      return true;
    });
  }

  function pointMatchesSearch(point) {
    const query = state.query.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const haystack = [point.title, point.excerpt, point.domain, point.memoryType]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  function getSvgPointFromClient(clientX, clientY) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  function getSvgPoint(event) {
    return getSvgPointFromClient(event.clientX, event.clientY);
  }

  function getNodeLocalRadius(point) {
    const safeScale = state.scale > 0 ? state.scale : 1;
    const compensation = Math.pow(1 / safeScale, nodeScaleCompensationStrength);
    const isSelected = state.selectedId === point.memoryId;
    const isHovered = state.hoveredId === point.memoryId;
    const baseSize = (isSelected ? 4.4 : isHovered ? 3.1 : 2.35) * nodeSizeMultiplier;
    return baseSize * compensation;
  }

  function getViewportPointFromClient(clientX, clientY) {
    const matrix = viewport.getScreenCTM();
    if (!matrix) return null;

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(matrix.inverse());
  }

  function isClientPointInsideSvg(clientX, clientY) {
    const bounds = svg.getBoundingClientRect();
    return clientX >= bounds.left
      && clientX <= bounds.right
      && clientY >= bounds.top
      && clientY <= bounds.bottom;
  }

  function getPointAtClientPosition(clientX, clientY) {
    if (!latestVisiblePoints.length) return null;
    if (!isClientPointInsideSvg(clientX, clientY)) return null;

    const viewportPoint = getViewportPointFromClient(clientX, clientY);
    if (!viewportPoint) return null;

    const safeScale = state.scale > 0 ? state.scale : 1;
    let closestPoint = null;
    let closestDistance = Infinity;

    latestVisiblePoints.forEach((point) => {
      const nodeX = point.x * viewWidth;
      const nodeY = point.y * viewHeight;
      const hitRadius = Math.max(4.75 / safeScale, getNodeLocalRadius(point) + (2 / safeScale));
      const distance = Math.hypot(viewportPoint.x - nodeX, viewportPoint.y - nodeY);

      if (distance <= hitRadius && distance < closestDistance) {
        closestPoint = point;
        closestDistance = distance;
      }
    });

    return closestPoint;
  }

  function getPointerDistance(firstPointer, secondPointer) {
    return Math.hypot(secondPointer.x - firstPointer.x, secondPointer.y - firstPointer.y);
  }

  function getPointerMidpoint(firstPointer, secondPointer) {
    return {
      x: (firstPointer.x + secondPointer.x) / 2,
      y: (firstPointer.y + secondPointer.y) / 2,
    };
  }

  function beginPinchGesture() {
    const pointers = Array.from(activePointers.values());
    if (pointers.length < 2) return;

    const [firstPointer, secondPointer] = pointers;
    const midpoint = getPointerMidpoint(firstPointer, secondPointer);
    const svgPoint = getSvgPointFromClient(midpoint.x, midpoint.y);
    state.pinching = true;
    state.dragging = false;
    state.pinchStartDistance = Math.max(1, getPointerDistance(firstPointer, secondPointer));
    state.pinchStartScale = state.scale;
    state.pinchWorldX = (svgPoint.x - state.panX) / state.scale;
    state.pinchWorldY = (svgPoint.y - state.panY) / state.scale;
  }

  function updateTooltip(event, point) {
    if (!tooltip || isCoarsePointer) return;

    tooltip.hidden = false;
    tooltip.style.display = 'grid';
    tooltip.innerHTML = [
      '<strong>' + escapeInlineHtml(point.title || 'Untitled memory') + '</strong>',
      '<span>' + escapeInlineHtml(formatMemoryTypeLabel(point.memoryType)) + ' · ' + escapeInlineHtml(formatDomainLabel(point.domain)) + '</span>',
    ].join('');
    const bounds = root.getBoundingClientRect();
    const left = event.clientX - bounds.left + 14;
    const top = event.clientY - bounds.top + 14;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.hidden = true;
      tooltip.style.display = 'none';
    }
  }

  function syncTooltipWithPointer(event) {
    const hoveredPoint = getPointAtClientPosition(event.clientX, event.clientY);

    if (hoveredPoint && !state.dragging && !state.pinching) {
      updateTooltip(event, hoveredPoint);
    } else {
      hideTooltip();
    }
  }

  function setSelectedPoint(point) {
    state.selectedId = point ? point.memoryId : '';

    if (!point) {
      if (detailCard) detailCard.hidden = false;
      if (detailEmpty) detailEmpty.hidden = false;
      if (detailContent) detailContent.hidden = true;
      if (mobileSelection) {
        mobileSelection.dataset.state = 'empty';
      }
      if (mobileSelectionTitle) {
        mobileSelectionTitle.textContent = 'Tap a memory to inspect it';
      }
      return;
    }

    if (detailCard) detailCard.hidden = false;
    if (detailEmpty) detailEmpty.hidden = true;
    detailContent.hidden = false;
    detailTitle.textContent = point.title || 'Untitled memory';
    detailExcerpt.textContent = point.excerpt || 'No excerpt available.';
    detailLink.href = point.editPath || '#';
    if (mobileSelection) {
      mobileSelection.dataset.state = 'selected';
    }
    if (mobileSelectionTitle) {
      mobileSelectionTitle.textContent = point.title || 'Untitled memory';
    }

    detailBadges.replaceChildren();
    [
      { kind: 'type', value: formatMemoryTypeLabel(point.memoryType) },
      { kind: 'domain', value: formatDomainLabel(point.domain) },
    ].filter((entry) => entry.value).forEach((entry) => {
      const badge = document.createElement('span');
      badge.className = 'badge ' + entry.kind;
      badge.textContent = entry.value;
      detailBadges.appendChild(badge);
    });

    if (detailReferences) {
      const referenceEntries = [
        ['Lifetime', String(point.useCount || 0)],
        ['7 days', String(point.useCount7d || 0)],
        ['30 days', String(point.useCount30d || 0)],
        ['90 days', String(point.useCount90d || 0)],
      ];
      detailReferences.replaceChildren();
      referenceEntries.forEach(([label, value]) => {
        const card = document.createElement('article');
        card.className = 'memory-map-reference-card';
        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        const valueElement = document.createElement('strong');
        valueElement.textContent = value;
        card.append(labelElement, valueElement);
        detailReferences.appendChild(card);
      });
    }

    const metaEntries = [
      ['Sensitivity', point.sensitivity || '—'],
      ['Last Update', formatDateValue(point.updatedAt)],
      ['Last Referenced', formatDateValue(point.lastUsedAt)],
    ];
    detailMeta.replaceChildren();
    metaEntries.forEach(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      detailMeta.append(term, description);
    });
  }

  function applyTransform() {
    viewport.setAttribute('transform', 'translate(' + state.panX + ' ' + state.panY + ') scale(' + state.scale + ')');
    updateNodeScaleCompensation();
  }

  function updateInlineStats({ visiblePoints }) {
    const filteredPoints = Math.max(0, points.length - visiblePoints.length);
    const omittedPoints = Math.max(0, Number(data.totalActiveMemories || 0) - points.length);
    const values = {
      active: String(data.totalActiveMemories || 0),
      visible: String(visiblePoints.length),
      hidden: String(filteredPoints),
      omitted: String(omittedPoints),
    };

    statElements.forEach((element, key) => {
      element.textContent = values[key] || '0';
    });
  }

  function render() {
    const visiblePoints = buildVisiblePoints();
    const visiblePointMap = buildVisiblePointMap(visiblePoints);
    const hasSearchQuery = Boolean(state.query.trim());
    latestVisiblePoints = visiblePoints;

    if (state.selectedId && !visiblePoints.some((point) => point.memoryId === state.selectedId)) {
      state.selectedId = '';
    }
    if (state.hoveredId && !visiblePoints.some((point) => point.memoryId === state.hoveredId)) {
      state.hoveredId = '';
    }

    viewport.replaceChildren();
    const lineLayer = createSvgNode('g', {
      'data-memory-map-lines': 'true',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      fill: 'none',
    });
    const nodeLayer = createSvgNode('g');
    viewport.append(lineLayer, nodeLayer);
    renderedNodeVisuals = [];

    const selectedPoint = visiblePoints.find((point) => point.memoryId === state.selectedId) || null;
    const selectedNeighbors = selectedPoint && Array.isArray(selectedPoint.semanticNeighbors)
      ? selectedPoint.semanticNeighbors
        .slice(0, state.neighbourCount)
        .filter((neighbor) => visiblePointMap.has(neighbor.memoryId))
      : [];
    const selectedFocusIds = new Set(selectedPoint ? [selectedPoint.memoryId] : []);
    selectedNeighbors.forEach((neighbor) => {
      selectedFocusIds.add(neighbor.memoryId);
    });
    const maxUseGlowPoints = isCompactMapMode ? 20 : 40;
    const useGlowCandidates = visiblePoints
      .filter((point) => getPointUsageValue(point) > 0)
      .sort((left, right) => getPointUsageValue(right) - getPointUsageValue(left))
      .slice(0, maxUseGlowPoints);
    const maxUseCount = Math.max(0, ...useGlowCandidates.map((point) => getPointUsageValue(point)));
    const useGlowWeights = new Map(useGlowCandidates.map((point) => [
      point.memoryId,
      maxUseCount > 0 ? Math.sqrt(getPointUsageValue(point) / maxUseCount) : 0,
    ]));

    if (selectedPoint && state.neighbourCount > 0) {
      const selectedX = selectedPoint.x * viewWidth;
      const selectedY = selectedPoint.y * viewHeight;
      const selectedColor = getTypeColor(selectedPoint.memoryType);

      selectedNeighbors.forEach((neighbor, neighborIndex) => {
        const targetPoint = visiblePointMap.get(neighbor.memoryId);

        if (!targetPoint) {
          return;
        }

        const similarity = Number(neighbor.similarity || 0);
        const targetX = targetPoint.x * viewWidth;
        const targetY = targetPoint.y * viewHeight;
        const lineColor = selectedColor;
        const opacity = clamp(0.16 + (similarity * 0.24), 0.14, 0.38);
        const animationDelay = neighborIndex * 60;
        const drawDuration = 920 + ((1 - similarity) * 220);
        const glowLine = createSvgNode('line', {
          x1: selectedX,
          y1: selectedY,
          x2: selectedX,
          y2: selectedY,
          stroke: withAlpha(lineColor, isDarkTheme ? clamp(opacity + 0.18, 0.22, 0.48) : clamp(opacity + 0.1, 0.18, 0.32)),
          opacity: 0,
          'stroke-width': (0.34 + similarity * 0.1).toFixed(3),
          'vector-effect': 'non-scaling-stroke',
          style: 'filter: blur(' + (isDarkTheme ? 1.8 : 0.9) + 'px);',
        });
        const line = createSvgNode('line', {
          x1: selectedX,
          y1: selectedY,
          x2: selectedX,
          y2: selectedY,
          stroke: withAlpha(lineColor, isDarkTheme ? clamp(opacity + 0.22, 0.26, 0.58) : clamp(opacity + 0.18, 0.22, 0.46)),
          opacity: 0,
          'stroke-width': (0.22 + similarity * 0.08).toFixed(3),
          'vector-effect': 'non-scaling-stroke',
        });
        lineLayer.append(glowLine, line);
        animateNeighborLine(glowLine, {
          selectedX,
          selectedY,
          targetX,
          targetY,
          duration: drawDuration,
          delay: animationDelay,
          opacity: 0.86,
        });
        animateNeighborLine(line, {
          selectedX,
          selectedY,
          targetX,
          targetY,
          duration: drawDuration,
          delay: animationDelay,
          opacity: 1,
        });
      });
    }

    visiblePoints.forEach((point) => {
      const cx = point.x * viewWidth;
      const cy = point.y * viewHeight;
      const group = createSvgNode('g', {
        'data-node-id': point.memoryId,
        tabindex: 0,
        role: 'button',
        'aria-label': point.title || 'Memory point',
        transform: 'translate(' + cx + ' ' + cy + ')',
      });
      const visualGroup = createSvgNode('g');
      const isSelected = state.selectedId === point.memoryId;
      const isHovered = state.hoveredId === point.memoryId;
      const isSearchMatch = hasSearchQuery && pointMatchesSearch(point);
      const isSelectedFocus = Boolean(selectedPoint && selectedFocusIds.has(point.memoryId));
      const isDimmedBySearch = hasSearchQuery && !isSearchMatch;
      const isDimmedBySelection = Boolean(selectedPoint && !isSelectedFocus);
      const isDimmed = isDimmedBySearch || isDimmedBySelection;
      const baseSize = (isSelected ? 4.4 : isHovered ? 3.1 : 2.35) * nodeSizeMultiplier;
      const touchHitSize = isCompactMapMode ? 14.5 : 0;
      const fill = getPointColor(point, isSelected, isHovered);
      const defaultFill = isSelected
        ? withAlpha(fill, 1)
        : isHovered
          ? withAlpha(fill, isDarkTheme ? 0.92 : 0.88)
          : withAlpha(fill, isDarkTheme ? 0.84 : 0.78);
      const nodeOpacity = isSelected
        ? 1
        : isHovered || isSearchMatch || isSelectedFocus
          ? 0.96
          : isDimmed
            ? (isDimmedBySelection ? 0.18 : 0.24)
            : 0.66;

      if (touchHitSize > 0) {
        visualGroup.appendChild(createDot(0, 0, touchHitSize, {
          fill: 'rgba(255,255,255,0.001)',
          stroke: 'none',
          'pointer-events': 'all',
        }));
      }

      const useGlowWeight = useGlowWeights.get(point.memoryId) || 0;
      if (useGlowWeight > 0 && !isDimmed) {
        visualGroup.appendChild(createDot(0, 0, baseSize + 7 + (useGlowWeight * 18), {
          fill: withAlpha(fill, isDarkTheme ? 0.06 + (useGlowWeight * 0.18) : 0.035 + (useGlowWeight * 0.12)),
          'pointer-events': 'none',
          style: 'filter: blur(' + (isDarkTheme ? 11 : 6) + 'px);',
        }));
      }

      if (isSearchMatch && !isSelected) {
        const searchRing = createDot(0, 0, baseSize + 3.8, {
          fill: 'none',
          stroke: isDarkTheme ? withAlpha(themeColors.accentHover, 0.78) : withAlpha(themeColors.primaryAccent, 0.62),
          'stroke-width': 0.82,
          opacity: 0.9,
          'pointer-events': 'none',
          'vector-effect': 'non-scaling-stroke',
        });
        searchRing.appendChild(createAnimateNode({
          attributeName: 'opacity',
          values: '0.42;0.92;0.42',
          dur: '2.6s',
          repeatCount: 'indefinite',
        }));
        visualGroup.appendChild(searchRing);
      }

      if (isSelected) {
        const farHalo = createDot(0, 0, baseSize + 14, {
          fill: withAlpha(fill, isDarkTheme ? 0.3 : 0.16),
          'pointer-events': 'none',
          style: 'filter: blur(' + (isDarkTheme ? 14 : 7.2) + 'px);',
        });
        farHalo.appendChild(createAnimateNode({
          attributeName: 'r',
          values: (baseSize + 7.2) + ';' + (baseSize + 16.8) + ';' + (baseSize + 7.2),
          dur: '4.2s',
          repeatCount: 'indefinite',
        }));
        farHalo.appendChild(createAnimateNode({
          attributeName: 'opacity',
          values: '0.28;0.84;0.28',
          dur: '4.2s',
          repeatCount: 'indefinite',
        }));

        const nearHalo = createDot(0, 0, baseSize + 4.4, {
          fill: withAlpha(fill, isDarkTheme ? 0.46 : 0.24),
          'pointer-events': 'none',
        });
        nearHalo.appendChild(createAnimateNode({
          attributeName: 'opacity',
          values: '0.5;0.96;0.5',
          dur: '2.5s',
          repeatCount: 'indefinite',
        }));

        const ring = createDot(0, 0, baseSize + 2.8, {
          fill: 'none',
          stroke: isDarkTheme ? withAlpha(fill, 0.98) : withAlpha(fill, 0.78),
          'stroke-width': 1,
          'pointer-events': 'none',
          'vector-effect': 'non-scaling-stroke',
        });
        ring.appendChild(createAnimateNode({
          attributeName: 'r',
          values: (baseSize + 2.1) + ';' + (baseSize + 7.2) + ';' + (baseSize + 2.1),
          dur: '3.4s',
          repeatCount: 'indefinite',
        }));
        ring.appendChild(createAnimateNode({
          attributeName: 'opacity',
          values: '0.22;0.9;0.22',
          dur: '3.4s',
          repeatCount: 'indefinite',
        }));

        const echoRing = createDot(0, 0, baseSize + 5.6, {
          fill: 'none',
          stroke: isDarkTheme ? withAlpha(fill, 0.42) : withAlpha(fill, 0.28),
          'stroke-width': 0.72,
          'pointer-events': 'none',
          'vector-effect': 'non-scaling-stroke',
        });
        echoRing.appendChild(createAnimateNode({
          attributeName: 'r',
          values: (baseSize + 5.6) + ';' + (baseSize + 10.2) + ';' + (baseSize + 5.6),
          dur: '4.4s',
          begin: '1.1s',
          repeatCount: 'indefinite',
        }));
        echoRing.appendChild(createAnimateNode({
          attributeName: 'opacity',
          values: '0.1;0.48;0.1',
          dur: '4.4s',
          begin: '1.1s',
          repeatCount: 'indefinite',
        }));

        visualGroup.append(farHalo, nearHalo, ring, echoRing);
      }

      const core = createDot(0, 0, baseSize, {
        'data-memory-map-core': 'true',
        'data-memory-id': point.memoryId,
        fill: defaultFill,
        opacity: nodeOpacity,
        'pointer-events': 'visiblePainted',
      });
      if (isSelected) {
        core.appendChild(createAnimateNode({
          attributeName: 'r',
          values: baseSize + ';' + (baseSize + 0.42) + ';' + baseSize,
          dur: '2.3s',
          repeatCount: 'indefinite',
        }));
      }
      visualGroup.appendChild(core);
      group.addEventListener('click', () => {
        state.selectedId = point.memoryId;
        state.hoveredId = '';
        hideTooltip();
        render();
      });
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.selectedId = point.memoryId;
          state.hoveredId = '';
          hideTooltip();
          render();
        }
      });

      group.appendChild(visualGroup);
      nodeLayer.appendChild(group);
      renderedNodeVisuals.push(visualGroup);
    });

    applyTransform();
    setSelectedPoint(selectedPoint);
    updateInlineStats({ visiblePoints });
  }

  searchInput?.addEventListener('input', () => {
    state.query = searchInput.value || '';
    render();
  });

  neighbourSelect?.addEventListener('change', () => {
    state.neighbourCount = Number(neighbourSelect.value || 0);
    render();
  });

  glowMetricSelect?.addEventListener('change', () => {
    state.usageMetric = glowMetricSelect.value || 'lifetime';
    render();
  });

  typeSelect?.addEventListener('change', () => {
    state.memoryType = typeSelect.value || '';
    render();
  });

  domainSelect?.addEventListener('change', () => {
    state.domain = domainSelect.value || '';
    render();
  });

  resetButton?.addEventListener('click', () => {
    state.query = '';
    state.memoryType = '';
    state.domain = '';
    state.selectedId = '';
    state.hoveredId = '';
    state.neighbourCount = ${JSON.stringify(defaultNeighborCount)};
    state.usageMetric = 'lifetime';
    if (searchInput) searchInput.value = '';
    if (typeSelect) typeSelect.value = '';
    if (domainSelect) domainSelect.value = '';
    if (neighbourSelect) neighbourSelect.value = String(state.neighbourCount);
    if (glowMetricSelect) glowMetricSelect.value = state.usageMetric;
    hideTooltip();
    render();
    animateViewTo({ scale: 1, panX: 0, panY: 0 }, 280);
  });

  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    stopViewAnimation();
    const previousScale = state.scale;
    const nextScale = clamp(previousScale * (event.deltaY > 0 ? 0.92 : 1.08), minMapScale, maxMapScale);
    const point = getSvgPoint(event);
    const worldX = (point.x - state.panX) / previousScale;
    const worldY = (point.y - state.panY) / previousScale;

    state.scale = nextScale;
    state.panX = point.x - worldX * nextScale;
    state.panY = point.y - worldY * nextScale;
    applyTransform();
  }, { passive: false });

  svg.addEventListener('pointerdown', (event) => {
    stopViewAnimation();
    if (!event.target.closest('[data-node-id]')) {
      hideTooltip();
    }
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activePointers.size >= 2) {
      beginPinchGesture();
      svg.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.target.closest('[data-node-id]')) return;

    state.dragging = true;
    state.pinching = false;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragPanX = state.panX;
    state.dragPanY = state.panY;
    state.dragMoved = false;
    svg.setPointerCapture?.(event.pointerId);
  });

  svg.addEventListener('pointermove', (event) => {
    syncTooltipWithPointer(event);

    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }

    if (state.pinching && activePointers.size >= 2) {
      event.preventDefault();
      const pointers = Array.from(activePointers.values());
      const [firstPointer, secondPointer] = pointers;
      const midpoint = getPointerMidpoint(firstPointer, secondPointer);
      const nextScale = clamp(
        state.pinchStartScale * (getPointerDistance(firstPointer, secondPointer) / state.pinchStartDistance),
        minMapScale,
        maxMapScale,
      );
      const midpointSvg = getSvgPointFromClient(midpoint.x, midpoint.y);

      state.scale = nextScale;
      state.panX = midpointSvg.x - state.pinchWorldX * nextScale;
      state.panY = midpointSvg.y - state.pinchWorldY * nextScale;
      applyTransform();
      return;
    }

    if (!state.dragging) return;

    const dragDeltaX = event.clientX - state.dragStartX;
    const dragDeltaY = event.clientY - state.dragStartY;
    state.dragMoved = state.dragMoved || Math.hypot(dragDeltaX, dragDeltaY) > 4;
    state.panX = state.dragPanX + dragDeltaX;
    state.panY = state.dragPanY + dragDeltaY;
    applyTransform();
  });

  const stopDragging = (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      state.pinching = false;
    }
    if (!state.dragging) {
      svg.releasePointerCapture?.(event.pointerId);
      return;
    }
    const shouldClearSelection = !state.dragMoved
      && state.selectedId
      && !event.target.closest('[data-node-id]');
    state.dragging = false;
    state.dragMoved = false;
    svg.releasePointerCapture?.(event.pointerId);

    if (shouldClearSelection) {
      state.selectedId = '';
      state.hoveredId = '';
      hideTooltip();
      render();
    }
  };

  svg.addEventListener('pointerup', stopDragging);
  svg.addEventListener('pointercancel', stopDragging);
  svg.addEventListener('pointerleave', stopDragging);
  svg.addEventListener('pointerleave', hideTooltip);
  document.addEventListener('pointermove', syncTooltipWithPointer);
  window.addEventListener('scroll', hideTooltip, true);

  render();
})();
</script>`,
      "</section>",
    ].join(""),
    "</section>",
  ].join("");
}

function renderMemoryImportsPage({ theme = "light", helpers }) {
  const { escapeHtml, withThemeField } = helpers;

  return [
    "<section class=\"memory-section\">",
    "<article class=\"memory-form-card memory-surface-plain\">",
    "<form method=\"post\" action=\"/admin/actions/stage-chat-import\" enctype=\"multipart/form-data\" class=\"memory-import-form\">",
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/memory/imports\">",
    "<fieldset class=\"memory-radio-group\">",
    "<legend>Import Type</legend>",
    "<label class=\"memory-radio-option\" for=\"importKindDaily\"><input id=\"importKindDaily\" type=\"radio\" name=\"importKind\" value=\"daily\" checked><span>Daily log</span></label>",
    "<label class=\"memory-radio-option\" for=\"importKindWeekly\"><input id=\"importKindWeekly\" type=\"radio\" name=\"importKind\" value=\"weekly\"><span>Weekly log</span></label>",
    "</fieldset>",
    "<div class=\"memory-field-block\" data-import-mode=\"daily\">",
    "<label for=\"summaryDateImport\">Date</label>",
    "<input id=\"summaryDateImport\" name=\"summaryDate\" type=\"date\">",
    "</div>",
    "<div class=\"memory-field-block is-hidden\" data-import-mode=\"weekly\">",
    "<label>Dates</label>",
    "<div class=\"memory-date-row\">",
    "<div>",
    "<label for=\"weekStartDate\" class=\"meta-label\">Start date</label>",
    "<input id=\"weekStartDate\" name=\"startDate\" type=\"date\">",
    "</div>",
    "<div>",
    "<label for=\"weekEndDate\" class=\"meta-label\">End date</label>",
    "<input id=\"weekEndDate\" name=\"endDate\" type=\"date\">",
    "</div>",
    "</div>",
    "</div>",
    "<label for=\"importText\">Paste text</label>",
    "<textarea id=\"importText\" name=\"text\" placeholder=\"Paste a rough summary, one chat log, or a weekly export here, or upload .txt or .md file(s) below.\"></textarea>",
    "<label for=\"importFiles\">Upload Files</label>",
    "<div class=\"file-picker-row\">",
    "<label class=\"toolbar-button secondary file-picker-button\" for=\"importFiles\">Choose files</label>",
    "<span class=\"file-picker-label\" data-file-label>No files selected</span>",
    `<input id="importFiles" name="files" type="file" accept=".md,.txt,text/plain,text/markdown" multiple class="file-picker-input">`,
    "</div>",
    "<div class=\"form-spacer\"></div>",
    "<button type=\"submit\">Summarise &amp; Save</button>",
    "</form>",
    "</article>",
    "</section>",
    `<script>
(() => {
  const daily = document.getElementById('importKindDaily');
  const weekly = document.getElementById('importKindWeekly');
  const dailyBlock = document.querySelector('[data-import-mode="daily"]');
  const weeklyBlock = document.querySelector('[data-import-mode="weekly"]');
  const updateMode = () => {
    const weeklyActive = weekly && weekly.checked;
    if (dailyBlock) dailyBlock.classList.toggle('is-hidden', weeklyActive);
    if (weeklyBlock) weeklyBlock.classList.toggle('is-hidden', !weeklyActive);
  };
  daily?.addEventListener('change', updateMode);
  weekly?.addEventListener('change', updateMode);
  updateMode();

  const fileInput = document.getElementById('importFiles');
  const fileLabel = document.querySelector('[data-file-label]');
  fileInput?.addEventListener('change', () => {
    if (!fileLabel) return;
    const count = fileInput.files?.length || 0;
    fileLabel.textContent = count ? (count === 1 ? fileInput.files[0].name : \`\${count} files selected\`) : 'No files selected';
  });
})();
</script>`,
  ].join("");
}

function formatCuratorActionLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "create_memory") return "Create";
  if (normalized === "update_existing") return "Update";
  if (normalized === "resolve_existing") return "Resolve";
  if (normalized === "merge_existing") return "Merge";
  if (normalized === "split_existing") return "Split";
  if (normalized === "archive_existing") return "Archive";
  return "Curate";
}

function formatCuratorLaneLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  const labels = {
    preferences: "Preferences",
    people_places: "People/Places",
    rituals_dynamic: "Rituals/Dynamic",
    routines_care: "Routines/Care",
    project_work_system: "Project/Work/System",
    new_durable_context: "New Context",
    changed_context: "Changed Context",
    resolved_context: "Resolved Context",
    reinforced_context: "Reinforced Context",
    personal_context: "Personal Context",
    relationship_context: "Relationship Context",
    other: "Other",
  };

  return labels[normalized] || "";
}

function renderMemoryCuratorPage({
  lookbackHours = 24,
  attentionLookbackHours = 6,
  channelCount = 0,
  channelOptions = [],
  selectedChannelIds = [],
  timelineMemoryEnabled = false,
  dailySummaryTime = '04:00',
  weeklySummaryDay = 'monday',
  memoryCuratorEnabled = false,
  stageTwoModelMode = 'summary',
  theme = 'light',
  helpers,
}) {
  const { escapeHtml, buildAdminLocation, renderHelpIcon, withThemeField } = helpers;
  const isChatDrafting = String(stageTwoModelMode || '').trim().toLowerCase() === 'chat';
  const help = (text) => renderHelpIcon ? renderHelpIcon({ help: text }, helpers) : '';
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const normalizedWeeklyDay = weekdays.includes(String(weeklySummaryDay || '').trim().toLowerCase())
    ? String(weeklySummaryDay || '').trim().toLowerCase()
    : 'monday';
  const weekdayLabel = normalizedWeeklyDay.charAt(0).toUpperCase() + normalizedWeeklyDay.slice(1);
  const returnTo = escapeHtml(buildAdminLocation({ path: '/admin/memory/curator', theme }));
  const weekdayOptions = weekdays.map((day) =>
    '<option value="' + escapeHtml(day) + '"' + (day === normalizedWeeklyDay ? ' selected' : '') + '>' + escapeHtml(day.charAt(0).toUpperCase() + day.slice(1)) + '</option>'
  ).join('');

  return [
    '<section class="memory-section mc-scope">',

    '<form id="mc-main-form" method="post" action="/admin/actions/settings-save" class="curator-automation-form" data-mc-form>',
    withThemeField(theme),
    '<input type="hidden" name="returnTo" value="' + returnTo + '">',
    '<input type="hidden" name="longTermMemoryEnabled" value="false">',
    '<input type="hidden" name="memoryCuratorEnabled" value="false">',

    '<div class="mc-layout">',
    '<div class="mc-main">',

    '<div class="mc-card mc-hero-card">',
    '<div class="mc-hero-top">',
    '<div>',
    '<h2 class="mc-hero-title">Memory Curator</h2>',
    '<p class="mc-hero-subtitle">Quietly manage memory, summaries, drafts, and follow-ups.</p>',
    '</div>',
    '<span class="mc-status-pill' + (memoryCuratorEnabled ? ' mc-status-active' : ' mc-status-inactive') + '">',
    '<span class="mc-status-dot"></span>',
    '<span>' + (memoryCuratorEnabled ? 'Active' : 'Inactive') + '</span>',
    '</span>',
    '</div>',
    '<div class="mc-hero-meta">',
    '<div class="mc-hero-stat"><span class="mc-hero-stat-label">Last Scan</span><span class="mc-hero-stat-value">—</span></div>',
    '<div class="mc-hero-stat"><span class="mc-hero-stat-label">Next Scan</span><span class="mc-hero-stat-value">' + escapeHtml(dailySummaryTime) + ' &middot; ' + escapeHtml(weekdayLabel) + '</span></div>',
    '<div class="mc-hero-stat"><span class="mc-hero-stat-label">Channels</span><span class="mc-hero-stat-value">' + escapeHtml(String(channelCount)) + '</span></div>',
    '<div class="mc-hero-stat"><span class="mc-hero-stat-label">Pending Review</span><span class="mc-hero-stat-value">0</span></div>',
    '</div>',
    '</div>',

    '<div class="mc-card">',
    '<div class="mc-card-header">',
    '<span class="mc-card-icon" aria-hidden="true"><img src="/assets/ghostlight/24-magic.svg" alt=""></span>',
    '<h3 class="mc-card-title">Features</h3>',
    '</div>',
    '<div class="mc-toggle-grid">',

    '<label class="mc-toggle-card">',
    '<div class="mc-toggle-switch"><span class="switch-control">',
    '<input id="memoryCuratorEnabled" type="checkbox" name="memoryCuratorEnabled" value="true"' + (memoryCuratorEnabled ? ' checked' : '') + '>',
    '<span></span></span></div>',
    '<div class="mc-toggle-body">',
    '<p class="mc-toggle-name">Capture New Memories</p>',
    '<p class="mc-toggle-desc">Suggest important details from selected conversations.</p>',
    '</div>',
    '</label>',

    '<label class="mc-toggle-card">',
    '<div class="mc-toggle-switch"><span class="switch-control">',
    '<input id="timelineMemoryEnabled" type="checkbox" name="longTermMemoryEnabled" value="true"' + (timelineMemoryEnabled ? ' checked' : '') + '>',
    '<span></span></span></div>',
    '<div class="mc-toggle-body">',
    '<p class="mc-toggle-name">Build Timeline Summaries</p>',
    '<p class="mc-toggle-desc">Create clean summaries of relationship history, events, and progress.</p>',
    '</div>',
    '</label>',

    '<input type="hidden" name="memoryCuratorStageTwoModelMode" value="summary">',
    '<label class="mc-toggle-card">',
    '<div class="mc-toggle-switch"><span class="switch-control">',
    '<input id="curatorIntelligentDrafting" type="checkbox" name="memoryCuratorStageTwoModelMode" value="chat"' + (isChatDrafting ? ' checked' : '') + '>',
    '<span></span></span></div>',
    '<div class="mc-toggle-body">',
    '<p class="mc-toggle-name">Smart Drafting</p>',
    '<p class="mc-toggle-desc">Draft suggested memories before saving so you can approve them.</p>',
    '</div>',
    '</label>',

    '</div>',
    '</div>',

    '<div class="mc-card">',
    '<div class="mc-card-header">',
    '<span class="mc-card-icon" aria-hidden="true"><img src="/assets/ghostlight/10-calendar.svg" alt=""></span>',
    '<h3 class="mc-card-title">Scan Rhythm</h3>',
    '</div>',
    '<p class="meta mc-card-hint">Quiet scans work best overnight or during low activity.</p>',
    '<div class="mc-rhythm-row">',
    '<div><label for="dailySummaryTime">Time</label><input id="dailySummaryTime" name="dailySummaryTime" type="time" value="' + escapeHtml(dailySummaryTime) + '"></div>',
    '<div><label for="weeklySummaryDay">Weekly day</label><select id="weeklySummaryDay" name="weeklySummaryDay" aria-label="Weekly timeline memory day">' + weekdayOptions + '</select></div>',
    '</div>',
    '</div>',

    '<div class="mc-card">',
    '<div class="mc-card-header">',
    '<span class="mc-card-icon" aria-hidden="true"><img src="/assets/ghostlight/15-notifications.svg" alt=""></span>',
    '<h3 class="mc-card-title">Channel Sources</h3>',
    '</div>',
    '<div class="mc-channel-head">',
    '<p class="meta" style="margin:0">Choose which channels to include in memory scans.</p>',
    '<div class="mc-channel-actions">',
    '<button type="button" class="toolbar-button secondary" data-memory-channel-select="all">Select All</button>',
    '<button type="button" class="toolbar-button secondary" data-memory-channel-select="none">Clear</button>',
    '</div>',
    '</div>',
    renderMemoryChannelPicker({ channelOptions, selectedChannelIds, showLabel: false, showActions: false, helpers }),
    '</div>',

    '</div>',

    '<aside class="mc-aside">',

    '<div class="mc-card">',
    '<div class="mc-card-header">',
    '<span class="mc-card-icon" aria-hidden="true"><img src="/assets/ghostlight/25-heartbeat.svg" alt=""></span>',
    '<h3 class="mc-card-title">Memory Heartbeat</h3>',
    '</div>',
    '<dl class="mc-heartbeat-list">',
    '<div class="mc-hb-row"><dt class="mc-hb-label">Status</dt><dd class="mc-hb-value">' + (memoryCuratorEnabled ? 'Active' : 'Inactive') + '</dd></div>',
    '<div class="mc-hb-row"><dt class="mc-hb-label">Last scan</dt><dd class="mc-hb-value">—</dd></div>',
    '<div class="mc-hb-row"><dt class="mc-hb-label">Next scan</dt><dd class="mc-hb-value">' + escapeHtml(dailySummaryTime) + ' &middot; ' + escapeHtml(weekdayLabel) + '</dd></div>',
    '<div class="mc-hb-row"><dt class="mc-hb-label">Channels selected</dt><dd class="mc-hb-value">' + escapeHtml(String(channelCount)) + '</dd></div>',
    '<div class="mc-hb-row"><dt class="mc-hb-label">Pending review</dt><dd class="mc-hb-value">0</dd></div>',
    '<div class="mc-hb-row"><dt class="mc-hb-label">Suggested memories</dt><dd class="mc-hb-value">0</dd></div>',
    '</dl>',
    '</div>',

    '<div class="mc-card">',
    '<div class="mc-card-header">',
    '<span class="mc-card-icon" aria-hidden="true"><img src="/assets/ghostlight/11-automation-pulse.svg" alt=""></span>',
    '<h3 class="mc-card-title">Manual Memory Tools</h3>',
    '</div>',
    '<div class="mc-tool-list">',

    '<div class="mc-tool-card">',
    '<div class="mc-tool-info"><p class="mc-tool-name">Tidy-Up Scan</p><p class="mc-tool-desc">Find duplicates, long, and quiet memories.</p></div>',
    '<button type="button" class="toolbar-button secondary mc-tool-btn" data-mc-tidy-trigger>Run</button>',
    '</div>',

    '<div class="mc-tool-card">',
    '<div class="mc-tool-info"><p class="mc-tool-name">Open Loop Scan</p><p class="mc-tool-desc">Surface unresolved threads and follow-ups.</p></div>',
    '<button type="button" class="toolbar-button secondary mc-tool-btn" disabled title="Coming soon">Soon</button>',
    '</div>',

    '<div class="mc-tool-card">',
    '<div class="mc-tool-info"><p class="mc-tool-name">Timeline Repair</p><p class="mc-tool-desc">Rebuild and correct timeline memory summaries.</p></div>',
    '<button type="button" class="toolbar-button secondary mc-tool-btn" disabled title="Coming soon">Soon</button>',
    '</div>',

    '</div>',
    '</div>',

    '</aside>',
    '</div>',

    '<div class="mc-save-bar" data-mc-save-bar aria-live="polite">',
    '<span class="mc-save-bar-label">Unsaved memory settings</span>',
    '<button type="submit" class="toolbar-button mc-save-bar-btn">Save Memory Settings</button>',
    '</div>',

    '</form>',

    '<form id="mc-maintenance-form" method="post" action="/admin/actions/memory-curator-maintenance-run" class="curator-maintenance-form" data-curator-run-form style="position:absolute;left:-9999px;opacity:0;pointer-events:none;height:0;overflow:hidden">',
    withThemeField(theme),
    '<input type="hidden" name="returnTo" value="' + returnTo + '">',
    '<input type="checkbox" name="maintenanceJob" value="duplicates" checked>',
    '<input type="checkbox" name="maintenanceJob" value="long" checked>',
    '<input type="checkbox" name="maintenanceJob" value="quiet" checked>',
    '<button type="submit" data-loading-label="Running scan...">Run</button>',
    '<p class="meta curator-submit-status" data-curator-submit-status hidden>Running maintenance scan. This can take a moment.</p>',
    '</form>',

    '<script>',
    '(()=>{',
    'const form=document.getElementById("mc-main-form");',
    'const bar=document.querySelector("[data-mc-save-bar]");',
    'if(form&&bar){const markDirty=()=>bar.classList.add("is-visible");form.querySelectorAll("input,select,textarea").forEach((el)=>el.addEventListener("change",markDirty));}',
    'const tidyBtn=document.querySelector("[data-mc-tidy-trigger]");',
    'const maintForm=document.getElementById("mc-maintenance-form");',
    'if(tidyBtn&&maintForm){tidyBtn.addEventListener("click",()=>{if(typeof maintForm.requestSubmit==="function"){maintForm.requestSubmit();}else{maintForm.submit();}});}',
    'document.querySelectorAll("[data-curator-run-form]").forEach((f)=>{',
    'f.addEventListener("submit",(evt)=>{',
    'if(f.dataset.submitted==="true"){evt.preventDefault();return;}',
    'f.dataset.submitted="true";f.setAttribute("aria-busy","true");',
    "const sub=evt.submitter&&evt.submitter.matches('button')?evt.submitter:f.querySelector(\"button[type='submit']\");",
    "f.querySelectorAll(\"button[type='submit']\").forEach((b)=>{b.disabled=true;});",
    'if(sub){sub.classList.add("is-loading");sub.textContent=sub.dataset.loadingLabel||"Working...";}',
    'const status=f.querySelector("[data-curator-submit-status]");',
    'if(status){status.hidden=false;}',
    '});',
    '});',
    '})();',
    '</script>',

    '</section>',
  ].join('');
}
function normalizeSelectedChannelIds(value = "") {
  return Array.from(new Set(String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)));
}

function renderMemoryChannelPicker({ channelOptions = [], selectedChannelIds = [], showLabel = true, showActions = true, helpers }) {
  const { escapeHtml } = helpers;
  const selectedSet = new Set(selectedChannelIds);
  const optionValues = new Set();
  const normalizedOptions = [];

  for (const option of Array.isArray(channelOptions) ? channelOptions : []) {
    const value = String(option?.value || "").trim();
    const label = String(option?.label || "").trim();

    if (!value || value === "daily" || optionValues.has(value)) {
      continue;
    }

    optionValues.add(value);
    normalizedOptions.push({
      value,
      label: label || value,
    });
  }

  if (!normalizedOptions.length) {
    return [
      showLabel ? "<label for=\"dailySummaryChannelIds\">Channels to include in Long Term Memory</label>" : "",
      "<p class=\"meta\">Discord channels could not be loaded right now. Paste channel IDs here as a fallback.</p>",
      `<textarea id="dailySummaryChannelIds" name="dailySummaryChannelIds">${escapeHtml(selectedChannelIds.join("\n"))}</textarea>`,
    ].join("");
  }

  const rows = normalizedOptions.map((option) => {
    const checked = selectedSet.has(option.value) ? " checked" : "";

    return [
      "<label class=\"memory-choice-row memory-channel-option\">",
      `<input type="checkbox" name="dailySummaryChannelIds" value="${escapeHtml(option.value)}"${checked} class="memory-choice-toggle">`,
      "<span class=\"memory-choice-check\" aria-hidden=\"true\"></span>",
      "<span>",
      `<strong>${escapeHtml(option.label)}</strong>`,
      "</span>",
      "</label>",
    ].join("");
  }).join("");
  const selectedOptionCount = normalizedOptions.filter((option) => selectedSet.has(option.value)).length;

  return [
    "<section class=\"memory-channel-section\">",
    showLabel ? "<div class=\"memory-channel-heading\">" : "",
    showLabel ? "<label class=\"field-label-with-help memory-channel-label\">" : "",
    showLabel ? "<span id=\"memoryChannelPickerLabel\">Channels to include in Long Term Memory</span>" : "",
    showLabel ? renderHelpIcon({
      help: "Choose the channels Ghostlight uses when building daily and weekly memories.",
    }, helpers) : "",
    showLabel ? "</label>" : "",
    showActions ? "<div class=\"memory-channel-actions\">" : "",
    showActions ? "<button type=\"button\" class=\"toolbar-button secondary\" data-memory-channel-select=\"all\">Select All</button>" : "",
    showActions ? "<button type=\"button\" class=\"toolbar-button secondary\" data-memory-channel-select=\"none\">Clear</button>" : "",
    showActions ? "</div>" : "",
    showLabel ? "</div>" : "",
    "<input type=\"hidden\" name=\"dailySummaryChannelIds\" value=\"\">",
    `<div class="memory-channel-picker" role="group"${showLabel ? " aria-labelledby=\"memoryChannelPickerLabel\"" : ""} data-memory-channel-picker>`,
    rows,
    "</div>",
    `<p class="meta" data-memory-channel-count>${escapeHtml(String(selectedOptionCount))} selected</p>`,
    "</section>",
    "<script>",
    "(()=>{",
    "const picker=document.querySelector('[data-memory-channel-picker]');",
    "const count=document.querySelector('[data-memory-channel-count]');",
    "if(!picker||!count){return;}",
    "const boxes=Array.from(picker.querySelectorAll('input[type=\"checkbox\"]'));",
    "const update=()=>{const total=boxes.filter((box)=>box.checked).length;count.textContent=`${total} selected`;};",
    "document.querySelectorAll('[data-memory-channel-select]').forEach((button)=>{",
    "button.addEventListener('click',()=>{const checked=button.dataset.memoryChannelSelect==='all';boxes.forEach((box)=>{box.checked=checked;});update();});",
    "});",
    "boxes.forEach((box)=>box.addEventListener('change',update));",
    "update();",
    "})();",
    "</script>",
  ].join("");
}

module.exports = {
  renderMemoryLayout,
  renderMemoryMapPage,
  renderMemoryImportsPage,
  renderMemoryReviewPage,
  renderMemoryCuratorPage,
};
