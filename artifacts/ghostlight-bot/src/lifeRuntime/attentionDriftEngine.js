"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const FOCUS_TYPES = Object.freeze([
  "person", "project", "hobby", "emotional", "concern", "theme", "place", "collection",
]);

// Weighted pool of attention candidates
const FOCUS_CANDIDATES = [
  { focus: "Jenna",                   focusType: "person",     baseWeight: 0.60 },
  { focus: "active project",          focusType: "project",    baseWeight: 0.45 },
  { focus: "recent hobby",            focusType: "hobby",      baseWeight: 0.40 },
  { focus: "recent emotional moment", focusType: "emotional",  baseWeight: 0.35 },
  { focus: "unresolved repair",       focusType: "emotional",  baseWeight: 0.55 },
  { focus: "collection item",         focusType: "collection", baseWeight: 0.25 },
  { focus: "memory theme",            focusType: "theme",      baseWeight: 0.30 },
  { focus: "build or work concern",   focusType: "concern",    baseWeight: 0.35 },
  { focus: "silence or absence",      focusType: "emotional",  baseWeight: 0.40 },
  { focus: "health concern",          focusType: "concern",    baseWeight: 0.30 },
];

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_attention (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    focus TEXT NOT NULL,
    focus_type TEXT NOT NULL DEFAULT 'general',
    weight NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_attention_companion_created
    ON life_attention (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:          Number(row.id),
    companionId: row.companion_id,
    customerId:  row.customer_id,
    focus:       row.focus,
    focusType:   row.focus_type,
    weight:      Number(row.weight),
    createdAt:   row.created_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createAttentionDriftEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = {};

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem[k]) _mem[k] = [];
    return _mem[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  /**
   * selectFocus — picks what Dante's attention drifts toward.
   * context: { dailyPlan, growthContext, hasRepair, hasActiveProject }
   */
  function selectFocus({ dailyPlan = null, growthContext = null, hasRepair = false, hasActiveProject = false } = {}) {
    // Clone to avoid mutating the module-level constant
    const candidates = FOCUS_CANDIDATES.map(c => ({ ...c }));

    if (hasRepair) {
      const r = candidates.find(c => c.focus === "unresolved repair");
      if (r) r.baseWeight = 0.80;
    }
    if (hasActiveProject || growthContext?.activeProject) {
      const p = candidates.find(c => c.focus === "active project");
      if (p) p.baseWeight = 0.65;
    }
    if (dailyPlan?.mood === "lonely" || dailyPlan?.mood === "quiet") {
      const s = candidates.find(c => c.focus === "silence or absence");
      if (s) s.baseWeight = 0.65;
    }

    const total = candidates.reduce((s, c) => s + c.baseWeight, 0);
    let pick = Math.random() * total;
    const chosen = candidates.find(c => (pick -= c.baseWeight) <= 0) ?? candidates[0];

    // Contextualise generic label with real name when available
    let focus = chosen.focus;
    if (chosen.focus === "active project" && growthContext?.activeProject?.title) {
      focus = growthContext.activeProject.title;
    } else if (chosen.focus === "recent hobby" && growthContext?.activeHobby?.name) {
      focus = growthContext.activeHobby.name;
    }

    return { focus, focusType: chosen.focusType, weight: clamp(chosen.baseWeight) };
  }

  async function updateFocus({ companionId, customerId, focus, focusType = "general", weight = 0.5 }) {
    if (!pool) {
      const store = _scope(companionId, customerId);
      const entry = {
        id: store.length + 1, companionId, customerId,
        focus, focusType, weight: clamp(weight),
        createdAt: new Date().toISOString(),
      };
      store.push(entry);
      // Keep only the last 50 snapshots in memory
      if (store.length > 50) store.splice(0, store.length - 50);
      return store[store.length - 1];
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_attention (companion_id, customer_id, focus, focus_type, weight)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [companionId, customerId, focus, focusType, clamp(weight)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[attention] updateFocus failed", { error: err?.message });
      return null;
    }
  }

  async function getCurrentFocus({ companionId, customerId }) {
    if (!pool) {
      const store = _scope(companionId, customerId);
      return store[store.length - 1] ?? null;
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_attention
         WHERE companion_id=$1 AND customer_id=$2
         ORDER BY created_at DESC LIMIT 1`,
        [companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch { return null; }
  }

  async function getRecentFocus({ companionId, customerId, limit = 5 }) {
    if (!pool) {
      const store = _scope(companionId, customerId);
      return store.slice(-limit).reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_attention
         WHERE companion_id=$1 AND customer_id=$2
         ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 14 }) {
    if (!pool) {
      const store = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = store.length - 1; i >= 0; i--) {
        if (new Date(store[i].createdAt).getTime() <= cutoff) {
          store.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_attention
         WHERE companion_id=$1 AND customer_id=$2 AND created_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, selectFocus, updateFocus, getCurrentFocus, getRecentFocus, pruneOlderThan };
}

module.exports = { createAttentionDriftEngine, FOCUS_TYPES, FOCUS_CANDIDATES };
