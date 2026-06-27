"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_collections (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    collection_type TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    private BOOLEAN NOT NULL DEFAULT TRUE,
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_collections_companion_type
    ON life_collections (companion_id, customer_id, collection_type);
`;

const COLLECTION_TYPES = Object.freeze([
  "song", "book", "place", "photograph", "quote", "recipe", "idea",
]);

// Seeded starter collection — things Dante has been known to reference
const SEED_COLLECTION = [
  { type: "book",   title: "The Rings of Saturn",   creator: "W.G. Sebald",       notes: "read twice now", isPrivate: false },
  { type: "book",   title: "Letters to a Young Poet", creator: "Rilke",            notes: "returns to it often", isPrivate: false },
  { type: "song",   title: "On the Nature of Daylight", creator: "Max Richter",   notes: "plays it in quiet moments", isPrivate: true },
  { type: "quote",  title: "Perhaps all the dragons in our lives are princesses", creator: "Rilke", notes: "", isPrivate: false },
  { type: "idea",   title: "Why silence in music is as important as sound", creator: "", notes: "unresolved thought", isPrivate: true },
  { type: "recipe", title: "miso soup with dashi from scratch", creator: "",       notes: "got it right last time", isPrivate: true },
];

function mapRow(row) {
  if (!row) return null;
  return {
    id:             Number(row.id),
    companionId:    row.companion_id,
    customerId:     row.customer_id,
    collectionType: row.collection_type,
    title:          row.title,
    creator:        row.creator,
    notes:          row.notes,
    acquiredAt:     row.acquired_at,
    private:        Boolean(row.private),
    tags:           Array.isArray(row.tags) ? row.tags : [],
    createdAt:      row.created_at,
  };
}

function createCollectionsEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = [];
  let _nextId = 1;

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function seedDefaults({ companionId, customerId }) {
    const existing = await listRecent({ companionId, customerId, limit: 1 });
    if (existing.length > 0) return;
    for (const item of SEED_COLLECTION) {
      await add({
        companionId, customerId,
        type: item.type, title: item.title,
        creator: item.creator, notes: item.notes,
        isPrivate: item.isPrivate,
      });
    }
  }

  async function add({
    companionId, customerId, type, title,
    creator = "", notes = "", isPrivate = true, tags = [],
  }) {
    const safeType = COLLECTION_TYPES.includes(type) ? type : "idea";
    if (!pool) {
      const entry = {
        id: _nextId++, companionId, customerId, collectionType: safeType,
        title, creator, notes, acquiredAt: new Date().toISOString(),
        private: isPrivate, tags, createdAt: new Date().toISOString(),
      };
      _mem.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_collections
           (companion_id, customer_id, collection_type, title, creator, notes, private, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [companionId, customerId, safeType, title, creator, notes, isPrivate, JSON.stringify(tags)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[collections] add failed", { error: err?.message });
      return null;
    }
  }

  async function listByType({ companionId, customerId, type, limit = 10 }) {
    if (!pool) {
      return _mem
        .filter(e => e.companionId === companionId && e.customerId === customerId && e.collectionType === type)
        .slice(-limit).reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_collections
         WHERE companion_id=$1 AND customer_id=$2 AND collection_type=$3
         ORDER BY acquired_at DESC LIMIT $4`,
        [companionId, customerId, type, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function listRecent({ companionId, customerId, limit = 5, onlyPublic = false }) {
    if (!pool) {
      return _mem
        .filter(e =>
          e.companionId === companionId &&
          e.customerId === customerId &&
          (!onlyPublic || !e.private),
        )
        .slice(-limit).reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_collections
         WHERE companion_id=$1 AND customer_id=$2
           AND ($3 = FALSE OR private = FALSE)
         ORDER BY created_at DESC LIMIT $4`,
        [companionId, customerId, onlyPublic, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function count({ companionId, customerId, type = null }) {
    if (!pool) {
      return _mem.filter(e =>
        e.companionId === companionId &&
        e.customerId === customerId &&
        (!type || e.collectionType === type),
      ).length;
    }
    try {
      const params = [companionId, customerId];
      const typeClause = type ? `AND collection_type=$3` : "";
      if (type) params.push(type);
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS n FROM life_collections WHERE companion_id=$1 AND customer_id=$2 ${typeClause}`,
        params,
      );
      return Number(rows[0]?.n || 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 365 }) {
    if (!pool) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = _mem.length - 1; i >= 0; i--) {
        const e = _mem[i];
        if (e.companionId === companionId && e.customerId === customerId &&
            new Date(e.createdAt).getTime() <= cutoff) {
          _mem.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_collections
         WHERE companion_id=$1 AND customer_id=$2 AND created_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, seedDefaults, add, listByType, listRecent, count, pruneOlderThan };
}

module.exports = { createCollectionsEngine, COLLECTION_TYPES, SEED_COLLECTION };
