"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS life_projects (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_progress TIMESTAMPTZ,
    progress NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    status TEXT NOT NULL DEFAULT 'active',
    linked_hobby TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_projects_companion_status
    ON life_projects (companion_id, customer_id, status);

  CREATE TABLE IF NOT EXISTS life_project_moments (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    progress_delta NUMERIC(4,3) NOT NULL DEFAULT 0.050,
    shareable BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_project_moments_project
    ON life_project_moments (project_id, created_at DESC);
`;

const STATUS_VALUES = Object.freeze(["active", "paused", "complete", "abandoned"]);

function mapProject(row) {
  if (!row) return null;
  return {
    id:           Number(row.id),
    companionId:  row.companion_id,
    customerId:   row.customer_id,
    title:        row.title,
    purpose:      row.purpose,
    startedAt:    row.started_at,
    lastProgress: row.last_progress ?? null,
    progress:     Number(row.progress),
    status:       row.status,
    linkedHobby:  row.linked_hobby ?? null,
    createdAt:    row.created_at,
  };
}

function mapMoment(row) {
  if (!row) return null;
  return {
    id:            Number(row.id),
    projectId:     Number(row.project_id),
    companionId:   row.companion_id,
    customerId:    row.customer_id,
    note:          row.note,
    progressDelta: Number(row.progress_delta),
    shareable:     Boolean(row.shareable),
    createdAt:     row.created_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createProjectEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _projects  = {}; // key → array of projects
  const _moments   = []; // flat array of moments
  let _nextProjId  = 1;
  let _nextMomId   = 1;

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_projects[k]) _projects[k] = [];
    return _projects[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLES_SQL);
  }

  async function createProject({
    companionId, customerId, title, purpose = "",
    linkedHobby = null,
  }) {
    if (!pool) {
      const projs = _scope(companionId, customerId);
      const entry = {
        id: _nextProjId++, companionId, customerId,
        title, purpose, startedAt: new Date().toISOString(),
        lastProgress: null, progress: 0, status: "active",
        linkedHobby, createdAt: new Date().toISOString(),
      };
      projs.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_projects (companion_id, customer_id, title, purpose, linked_hobby)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [companionId, customerId, title, purpose, linkedHobby],
      );
      return mapProject(rows[0]);
    } catch (err) {
      logger?.warn("[project] createProject failed", { error: err?.message });
      return null;
    }
  }

  async function getProjects({
    companionId, customerId, status = "active", linkedHobby = null,
  }) {
    if (!pool) {
      return _scope(companionId, customerId).filter(p =>
        (!status || p.status === status) &&
        (!linkedHobby || p.linkedHobby === linkedHobby),
      );
    }
    try {
      const parts = ["companion_id=$1", "customer_id=$2"];
      const params = [companionId, customerId];
      if (status) { params.push(status); parts.push(`status=$${params.length}`); }
      if (linkedHobby) { params.push(linkedHobby); parts.push(`linked_hobby=$${params.length}`); }
      const { rows } = await pool.query(
        `SELECT * FROM life_projects WHERE ${parts.join(" AND ")} ORDER BY created_at DESC`,
        params,
      );
      return rows.map(mapProject);
    } catch { return []; }
  }

  async function addProgress({
    companionId, customerId, projectId,
    note = "", delta = 0.05, shareable = false,
  }) {
    if (!pool) {
      const proj = _scope(companionId, customerId).find(p => p.id === projectId);
      if (!proj) return null;
      proj.progress = clamp(proj.progress + delta);
      proj.lastProgress = new Date().toISOString();
      if (proj.progress >= 1.0) proj.status = "complete";
      const moment = {
        id: _nextMomId++, projectId, companionId, customerId,
        note, progressDelta: delta, shareable, createdAt: new Date().toISOString(),
      };
      _moments.push(moment);
      return { project: proj, moment };
    }
    try {
      const [projRows, momRows] = await Promise.all([
        pool.query(
          `UPDATE life_projects SET
             progress = LEAST(1.0, progress + $3),
             last_progress = NOW(),
             status = CASE WHEN LEAST(1.0, progress + $3) >= 1.0 THEN 'complete' ELSE status END
           WHERE id = $1 AND companion_id = $4 AND customer_id = $5
           RETURNING *`,
          [projectId, companionId, delta, companionId, customerId],
        ),
        pool.query(
          `INSERT INTO life_project_moments (project_id, companion_id, customer_id, note, progress_delta, shareable)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [projectId, companionId, customerId, note, delta, shareable],
        ),
      ]);
      return { project: mapProject(projRows.rows[0]), moment: mapMoment(momRows.rows[0]) };
    } catch (err) {
      logger?.warn("[project] addProgress failed", { error: err?.message });
      return null;
    }
  }

  async function getShareableMoments({ companionId, customerId, limit = 3 }) {
    if (!pool) {
      return _moments
        .filter(m => m.companionId === companionId && m.customerId === customerId && m.shareable)
        .slice(-limit).reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_project_moments
         WHERE companion_id=$1 AND customer_id=$2 AND shareable=TRUE
         ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapMoment);
    } catch { return []; }
  }

  async function updateStatus({ companionId, customerId, projectId, status }) {
    if (!STATUS_VALUES.includes(status)) return null;
    if (!pool) {
      const proj = _scope(companionId, customerId).find(p => p.id === projectId);
      if (!proj) return null;
      proj.status = status;
      return proj;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE life_projects SET status=$3 WHERE id=$1 AND companion_id=$4 AND customer_id=$5 RETURNING *`,
        [projectId, status, status, companionId, customerId],
      );
      return mapProject(rows[0]);
    } catch { return null; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 60 }) {
    if (!pool) {
      const projs = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if ((p.status === "complete" || p.status === "abandoned") &&
            new Date(p.createdAt).getTime() <= cutoff) {
          projs.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_projects
         WHERE companion_id=$1 AND customer_id=$2
           AND status IN ('complete','abandoned') AND created_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, createProject, getProjects, addProgress, getShareableMoments, updateStatus, pruneOlderThan };
}

module.exports = { createProjectEngine, STATUS_VALUES };
