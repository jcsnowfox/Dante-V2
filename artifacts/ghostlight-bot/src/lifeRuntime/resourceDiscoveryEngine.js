"use strict";

/**
 * resourceDiscoveryEngine
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Persistent store for real resources Dante discovers — books, articles,
 * music, project ideas, conversation topics. Every resource stored here was
 * actually sourced (web search, curiosity engine, Jenna's suggestions).
 * Dante never "claims to have read a book" — he stores a resource reference
 * and marks it as discovered, then queues it for reading/listening when
 * appropriate.
 *
 * Resource types: book | article | movie | music | video | course |
 *   image_reference | second_life_place | project_idea | conversation_topic
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const RESOURCE_TYPES = Object.freeze([
  "book", "article", "movie", "music", "video", "course",
  "image_reference", "second_life_place", "project_idea", "conversation_topic",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_discovered_resources (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    why_relevant TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'discovered',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS dante_discovered_resources_scope
    ON dante_discovered_resources (companion_id, customer_id, status, created_at DESC);
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
    source:       row.source,
    summary:      row.summary,
    whyRelevant:  row.why_relevant,
    status:       row.status,
    metadata:     row.metadata || {},
    createdAt:    row.created_at ? new Date(row.created_at) : null,
    updatedAt:    row.updated_at ? new Date(row.updated_at) : null,
  };
}

function createResourceDiscoveryEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  const _mem = [];

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (error) {
      logger?.warn("[resource-discovery] init failed", { error: error?.message });
    }
  }

  async function addResource({ companionId, customerId, resourceType, title, author = "", url = "", source = "", summary = "", whyRelevant = "", metadata = {} } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_discovered_resources
            (companion_id, customer_id, resource_type, title, author, url, source,
             summary, why_relevant, status, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'discovered',$10::jsonb)
           RETURNING *`,
          [companionId, customerId, resourceType, title, author, url, source, summary, whyRelevant, JSON.stringify(metadata)]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[resource-discovery] addResource DB error", { error: error?.message });
      }
    }

    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      companionId, customerId, resourceType, title, author, url, source,
      summary, whyRelevant, status: "discovered", metadata,
      createdAt: new Date(), updatedAt: new Date(),
    };
    _mem.push(entry);
    if (_mem.length > 200) _mem.splice(0, _mem.length - 200);
    return entry;
  }

  async function getResources({ companionId, customerId, resourceType = null, status = null, limit = 10 } = {}) {
    if (pool) {
      try {
        const conditions = ["companion_id = $1", "customer_id = $2"];
        const params = [companionId, customerId];
        if (resourceType) { params.push(resourceType); conditions.push(`resource_type = $${params.length}`); }
        if (status)       { params.push(status);       conditions.push(`status = $${params.length}`); }
        params.push(limit);
        const { rows } = await pool.query(
          `SELECT * FROM dante_discovered_resources WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length}`,
          params
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[resource-discovery] getResources DB error", { error: error?.message });
      }
    }
    return _mem
      .filter(r =>
        r.companionId === companionId &&
        r.customerId === customerId &&
        (!resourceType || r.resourceType === resourceType) &&
        (!status || r.status === status)
      )
      .slice(-limit)
      .reverse();
  }

  async function updateStatus({ companionId, customerId, resourceId, status } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `UPDATE dante_discovered_resources SET status=$1, updated_at=NOW()
           WHERE id=$2 AND companion_id=$3 AND customer_id=$4 RETURNING *`,
          [status, resourceId, companionId, customerId]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[resource-discovery] updateStatus DB error", { error: error?.message });
      }
    }
    const r = _mem.find(e => e.id === resourceId);
    if (r) { r.status = status; r.updatedAt = new Date(); }
    return r || null;
  }

  async function count({ companionId, customerId, status = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId];
        const statusClause = status ? `AND status = $3` : "";
        if (status) params.push(status);
        const { rows } = await pool.query(
          `SELECT COUNT(*) as n FROM dante_discovered_resources
           WHERE companion_id = $1 AND customer_id = $2 ${statusClause}`,
          params
        );
        return Number(rows[0]?.n) || 0;
      } catch { /* fall through */ }
    }
    return _mem.filter(r =>
      r.companionId === companionId &&
      r.customerId === customerId &&
      (!status || r.status === status)
    ).length;
  }

  async function pruneOlderThan({ companionId, customerId, days = 180 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM dante_discovered_resources
           WHERE companion_id=$1 AND customer_id=$2 AND created_at<$3 AND status='consumed'`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch (error) {
        logger?.warn("[resource-discovery] pruneOlderThan DB error", { error: error?.message });
      }
    }
    let removed = 0;
    for (let i = _mem.length - 1; i >= 0; i--) {
      const r = _mem[i];
      if (r.companionId === companionId && r.customerId === customerId &&
          r.createdAt < cutoff && r.status === "consumed") {
        _mem.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  return { init, addResource, getResources, updateStatus, count, pruneOlderThan, RESOURCE_TYPES };
}

module.exports = { createResourceDiscoveryEngine, RESOURCE_TYPES };
