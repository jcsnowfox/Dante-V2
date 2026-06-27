"use strict";

/**
 * resourceLibraryStore
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Dante's personal resource library — distinct from dante_discovered_resources
 * (resourceDiscoveryEngine), which tracks raw discovered items. The library
 * tracks Dante's *relationship* with resources: "I found this", "still want
 * to read", "think Jenna would like".
 *
 * Valences:
 *   "found"           — Dante discovered/read/watched this
 *   "want"            — Dante wants to explore this
 *   "jenna_would_like" — Dante thinks Jenna would enjoy this
 *
 * Status:
 *   "new"       — just added
 *   "consuming" — actively reading/watching/listening
 *   "completed" — finished
 *   "recommended" — shared with Jenna
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const VALENCES = Object.freeze(["found", "want", "jenna_would_like"]);
const STATUSES = Object.freeze(["new", "consuming", "completed", "recommended"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_resource_library (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'article',
    title TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    valence TEXT NOT NULL DEFAULT 'found',
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'discovery',
    why_relevant TEXT NOT NULL DEFAULT '',
    jenna_tag BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS dante_resource_library_scope
    ON dante_resource_library (companion_id, customer_id, added_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:           Number(row.id),
    companionId:  row.companion_id,
    customerId:   row.customer_id,
    resourceType: row.resource_type,
    title:        row.title,
    author:       row.author,
    url:          row.url,
    note:         row.note,
    valence:      row.valence,
    status:       row.status,
    source:       row.source,
    whyRelevant:  row.why_relevant,
    jennaTag:     Boolean(row.jenna_tag),
    metadata:     row.metadata || {},
    addedAt:      row.added_at ? new Date(row.added_at) : null,
    updatedAt:    row.updated_at ? new Date(row.updated_at) : null,
  };
}

function createResourceLibraryStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  const _mem = [];
  let _nextId = 1;

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (error) {
      logger?.warn("[resource-library-store] init failed", { error: error?.message });
    }
  }

  async function add({
    companionId, customerId, resourceType = "article", title = "", author = "",
    url = "", note = "", valence = "found", source = "discovery",
    whyRelevant = "", jennaTag = false, metadata = {},
  } = {}) {
    const safeValence = VALENCES.includes(valence) ? valence : "found";

    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_resource_library
            (companion_id, customer_id, resource_type, title, author, url, note,
             valence, source, why_relevant, jenna_tag, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           RETURNING *`,
          [
            companionId, customerId, resourceType, title, author, url, note,
            safeValence, source, whyRelevant, jennaTag, JSON.stringify(metadata),
          ]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[resource-library-store] add DB error", { error: error?.message });
      }
    }

    const entry = {
      id: _nextId++, companionId, customerId, resourceType, title, author, url, note,
      valence: safeValence, status: "new", source, whyRelevant, jennaTag, metadata,
      addedAt: new Date(), updatedAt: new Date(),
    };
    _mem.push(entry);
    return entry;
  }

  async function getLibrary({
    companionId, customerId, valence = null, status = null,
    jennaTag = null, limit = 20,
  } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId, limit];
        let where = "";
        if (valence)                    { params.push(valence);  where += ` AND valence = $${params.length}`; }
        if (status)                     { params.push(status);   where += ` AND status = $${params.length}`; }
        if (jennaTag !== null)          { params.push(jennaTag); where += ` AND jenna_tag = $${params.length}`; }
        const { rows } = await pool.query(
          `SELECT * FROM dante_resource_library
           WHERE companion_id = $1 AND customer_id = $2 ${where}
           ORDER BY added_at DESC LIMIT $3`,
          params
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[resource-library-store] getLibrary DB error", { error: error?.message });
      }
    }
    return _mem
      .filter(e =>
        e.companionId === companionId && e.customerId === customerId &&
        (!valence  || e.valence  === valence) &&
        (!status   || e.status   === status) &&
        (jennaTag === null || e.jennaTag === jennaTag)
      )
      .slice(-limit)
      .reverse();
  }

  async function updateStatus({ id, companionId, customerId, status } = {}) {
    const safeStatus = STATUSES.includes(status) ? status : "new";
    if (pool) {
      try {
        const { rows } = await pool.query(
          `UPDATE dante_resource_library SET status = $1, updated_at = NOW()
           WHERE id = $2 AND companion_id = $3 AND customer_id = $4
           RETURNING *`,
          [safeStatus, id, companionId, customerId]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[resource-library-store] updateStatus DB error", { error: error?.message });
      }
    }
    const entry = _mem.find(e => e.id === id && e.companionId === companionId && e.customerId === customerId);
    if (entry) { entry.status = safeStatus; entry.updatedAt = new Date(); }
    return entry ?? null;
  }

  async function tagForJenna({ id, companionId, customerId } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `UPDATE dante_resource_library SET jenna_tag = TRUE, valence = 'jenna_would_like', updated_at = NOW()
           WHERE id = $1 AND companion_id = $2 AND customer_id = $3
           RETURNING *`,
          [id, companionId, customerId]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[resource-library-store] tagForJenna DB error", { error: error?.message });
      }
    }
    const entry = _mem.find(e => e.id === id && e.companionId === companionId && e.customerId === customerId);
    if (entry) { entry.jennaTag = true; entry.valence = "jenna_would_like"; entry.updatedAt = new Date(); }
    return entry ?? null;
  }

  async function count({ companionId, customerId, valence = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId];
        const where = valence ? `AND valence = $3` : "";
        if (valence) params.push(valence);
        const { rows } = await pool.query(
          `SELECT COUNT(*) as n FROM dante_resource_library
           WHERE companion_id = $1 AND customer_id = $2 ${where}`,
          params
        );
        return Number(rows[0]?.n) || 0;
      } catch { /* fall through */ }
    }
    return _mem.filter(e =>
      e.companionId === companionId && e.customerId === customerId &&
      (!valence || e.valence === valence)
    ).length;
  }

  async function pruneOlderThan({ companionId, customerId, days = 180 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM dante_resource_library
           WHERE companion_id = $1 AND customer_id = $2 AND added_at < $3 AND status IN ('completed', 'recommended')`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch (error) {
        logger?.warn("[resource-library-store] pruneOlderThan DB error", { error: error?.message });
      }
    }
    let removed = 0;
    for (let i = _mem.length - 1; i >= 0; i--) {
      const e = _mem[i];
      if (e.companionId === companionId && e.customerId === customerId &&
          e.addedAt < cutoff && ["completed", "recommended"].includes(e.status)) {
        _mem.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  return { init, add, getLibrary, updateStatus, tagForJenna, count, pruneOlderThan };
}

module.exports = { createResourceLibraryStore, VALENCES, STATUSES };
