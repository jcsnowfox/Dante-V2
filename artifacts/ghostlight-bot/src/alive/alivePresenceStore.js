"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const PRESENCE_STATES = Object.freeze(["present", "engaged", "idle", "restless", "missing", "unknown"]);
const ENERGY_STATES = Object.freeze(["high", "steady", "low", "drained"]);
const MOOD_STATES = Object.freeze(["warm", "neutral", "subdued", "tender", "playful", "focused"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alive_presence_state (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    presence_state TEXT NOT NULL DEFAULT 'present',
    energy TEXT NOT NULL DEFAULT 'steady',
    mood TEXT NOT NULL DEFAULT 'neutral',
    space_state JSONB NOT NULL DEFAULT '{}',
    missing_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    affection_score NUMERIC(4,2) NOT NULL DEFAULT 0.50,
    overload_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    conversation_temperature NUMERIC(4,2) NOT NULL DEFAULT 0.50,
    repair_needed BOOLEAN NOT NULL DEFAULT FALSE,
    repair_type TEXT,
    unresolved_tension BOOLEAN NOT NULL DEFAULT FALSE,
    give_space BOOLEAN NOT NULL DEFAULT FALSE,
    last_interaction_at TIMESTAMPTZ,
    last_reachout_at TIMESTAMPTZ,
    last_repair_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id)
  );
`;

const DEFAULT_SPACE_STATE = Object.freeze({
  room: "study",
  activity: "idle",
  posture: "relaxed",
  ambient_mood: "calm",
  music: null,
  lighting: "warm",
});

function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(v) || 0));
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    presenceState: row.presence_state || "present",
    energy: row.energy || "steady",
    mood: row.mood || "neutral",
    spaceState: (typeof row.space_state === "object" && row.space_state !== null) ? row.space_state : DEFAULT_SPACE_STATE,
    missingScore: row.missing_score != null ? Number(row.missing_score) : 0,
    affectionScore: row.affection_score != null ? Number(row.affection_score) : 0.5,
    overloadScore: row.overload_score != null ? Number(row.overload_score) : 0,
    conversationTemperature: row.conversation_temperature != null ? Number(row.conversation_temperature) : 0.5,
    repairNeeded: Boolean(row.repair_needed),
    repairType: row.repair_type || null,
    unresolvedTension: Boolean(row.unresolved_tension),
    giveSpace: Boolean(row.give_space),
    lastInteractionAt: row.last_interaction_at || null,
    lastReachoutAt: row.last_reachout_at || null,
    lastRepairAt: row.last_repair_at || null,
    updatedAt: row.updated_at,
  };
}

function derivePresenceState({ missingScore, lastInteractionAt, now = new Date() }) {
  const absenceMs = lastInteractionAt ? now.getTime() - new Date(lastInteractionAt).getTime() : Infinity;
  const absenceH = absenceMs / (60 * 60 * 1000);
  if (absenceH < 1) return "present";
  if (absenceH < 4) return "engaged";
  if (missingScore > 0.7) return "missing";
  if (missingScore > 0.4 || absenceH > 8) return "restless";
  return "idle";
}

function createMemoryPresenceStore() {
  const records = new Map();
  return {
    available: true,
    async init() {},
    async getOrCreate({ companionId, customerId }) {
      const key = `${companionId}:${customerId}`;
      if (!records.has(key)) {
        records.set(key, {
          id: 1, companion_id: companionId, customer_id: customerId,
          presence_state: "present", energy: "steady", mood: "neutral",
          space_state: { ...DEFAULT_SPACE_STATE },
          missing_score: 0, affection_score: 0.5, overload_score: 0,
          conversation_temperature: 0.5,
          repair_needed: false, repair_type: null,
          unresolved_tension: false, give_space: false,
          last_interaction_at: null, last_reachout_at: null, last_repair_at: null,
          updated_at: new Date().toISOString(),
        });
      }
      return mapRow(records.get(key));
    },
    async update({ companionId, customerId, patch }) {
      const key = `${companionId}:${customerId}`;
      const existing = records.get(key) || {
        id: 1, companion_id: companionId, customer_id: customerId,
        presence_state: "present", energy: "steady", mood: "neutral",
        space_state: { ...DEFAULT_SPACE_STATE },
        missing_score: 0, affection_score: 0.5, overload_score: 0,
        conversation_temperature: 0.5,
        repair_needed: false, repair_type: null,
        unresolved_tension: false, give_space: false,
        last_interaction_at: null, last_reachout_at: null, last_repair_at: null,
        updated_at: new Date().toISOString(),
      };
      const updated = { ...existing, ...mapPatchToRow(patch), updated_at: new Date().toISOString() };
      records.set(key, updated);
      return mapRow(updated);
    },
  };
}

function mapPatchToRow(patch = {}) {
  const row = {};
  if (patch.presenceState !== undefined) row.presence_state = patch.presenceState;
  if (patch.energy !== undefined) row.energy = patch.energy;
  if (patch.mood !== undefined) row.mood = patch.mood;
  if (patch.spaceState !== undefined) row.space_state = patch.spaceState;
  if (patch.missingScore !== undefined) row.missing_score = clamp(patch.missingScore);
  if (patch.affectionScore !== undefined) row.affection_score = clamp(patch.affectionScore);
  if (patch.overloadScore !== undefined) row.overload_score = clamp(patch.overloadScore);
  if (patch.conversationTemperature !== undefined) row.conversation_temperature = clamp(patch.conversationTemperature);
  if (patch.repairNeeded !== undefined) row.repair_needed = Boolean(patch.repairNeeded);
  if (patch.repairType !== undefined) row.repair_type = patch.repairType || null;
  if (patch.unresolvedTension !== undefined) row.unresolved_tension = Boolean(patch.unresolvedTension);
  if (patch.giveSpace !== undefined) row.give_space = Boolean(patch.giveSpace);
  if (patch.lastInteractionAt !== undefined) row.last_interaction_at = patch.lastInteractionAt || null;
  if (patch.lastReachoutAt !== undefined) row.last_reachout_at = patch.lastReachoutAt || null;
  if (patch.lastRepairAt !== undefined) row.last_repair_at = patch.lastRepairAt || null;
  return row;
}

function createAlivePresenceStore({ pool: providedPool, config, logger } = {}) {
  let pool = providedPool || null;
  if (!pool) {
    try { pool = createPostgresPool({ config }); } catch { pool = null; }
  }

  if (!pool) return createMemoryPresenceStore();

  async function getOrCreate({ companionId, customerId }) {
    const { rows } = await pool.query(
      "SELECT * FROM alive_presence_state WHERE companion_id=$1 AND customer_id=$2 LIMIT 1",
      [companionId, customerId],
    );
    if (rows[0]) return mapRow(rows[0]);
    const { rows: ins } = await pool.query(
      `INSERT INTO alive_presence_state (companion_id, customer_id) VALUES ($1,$2)
       ON CONFLICT (companion_id, customer_id) DO UPDATE SET updated_at=NOW() RETURNING *`,
      [companionId, customerId],
    );
    return mapRow(ins[0]);
  }

  return {
    available: true,

    async init() {
      await pool.query(CREATE_TABLE_SQL);
      logger?.info?.("[alive-presence] storage initialised", { provider: "postgres" });
    },

    getOrCreate,

    async update({ companionId, customerId, patch }) {
      const row = mapPatchToRow(patch);
      const sets = [];
      const vals = [companionId, customerId];
      for (const [col, val] of Object.entries(row)) {
        vals.push(val);
        sets.push(`${col}=$${vals.length}`);
      }
      sets.push("updated_at=NOW()");
      if (!sets.length) return getOrCreate({ companionId, customerId });
      const { rows } = await pool.query(
        `INSERT INTO alive_presence_state (companion_id, customer_id, ${Object.keys(row).join(",")})
         VALUES ($1,$2,${Object.keys(row).map((_, i) => `$${i + 3}`).join(",")})
         ON CONFLICT (companion_id, customer_id) DO UPDATE SET ${sets.join(",")}
         RETURNING *`,
        vals,
      );
      return mapRow(rows[0]);
    },
  };
}

module.exports = {
  createAlivePresenceStore,
  derivePresenceState,
  PRESENCE_STATES,
  ENERGY_STATES,
  MOOD_STATES,
  DEFAULT_SPACE_STATE,
};
