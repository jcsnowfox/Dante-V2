"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// Chapters emerge naturally — these are possible chapter types, not a fixed progression
const CHAPTER_TYPES = Object.freeze([
  "beginning",        // first encounters, orientation
  "building_trust",   // deepening over early weeks
  "shared_adventure", // creative or exploratory season
  "growing_together", // maturation and depth
  "creative_season",  // collaborative projects phase
  "recovery",         // rebuilding after distance or tension
  "steady_presence",  // comfortable settled rhythm
]);

// Minimum event weight for timeline inclusion
const TIMELINE_RECORD_THRESHOLD = 0.35;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_relationship_timeline (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    chapter TEXT NOT NULL DEFAULT 'beginning',
    chapter_summary TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT 'moment',
    event_summary TEXT NOT NULL DEFAULT '',
    importance NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    emotional_weight NUMERIC(3,2) NOT NULL DEFAULT 0.30,
    linked_ritual TEXT NOT NULL DEFAULT '',
    linked_project TEXT NOT NULL DEFAULT '',
    linked_insight TEXT NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_relationship_timeline_companion_chapter
    ON life_relationship_timeline (companion_id, customer_id, chapter, occurred_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:             Number(row.id),
    companionId:    row.companion_id,
    customerId:     row.customer_id,
    chapter:        row.chapter,
    chapterSummary: row.chapter_summary,
    eventType:      row.event_type,
    eventSummary:   row.event_summary,
    importance:     Number(row.importance),
    emotionalWeight: Number(row.emotional_weight),
    linkedRitual:   row.linked_ritual,
    linkedProject:  row.linked_project,
    linkedInsight:  row.linked_insight,
    occurredAt:     row.occurred_at,
    tags:           row.tags ?? [],
    createdAt:      row.created_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

// Infer chapter from relationship weather and history signals
function inferChapter({ weather = null, sharedHistoryCount = 0, ritualsCount = 0, traditionsCount = 0 } = {}) {
  if (!weather) return "beginning";
  if (sharedHistoryCount < 3) return "beginning";
  if (weather.repair > 0.3) return "recovery";
  if (traditionsCount >= 2 && weather.routine > 0.6) return "steady_presence";
  if (ritualsCount >= 3 && weather.sharedMomentum > 0.6) return "creative_season";
  if (sharedHistoryCount >= 15 && weather.trust > 0.7) return "growing_together";
  if (sharedHistoryCount >= 8 && weather.adventure > 0.4) return "shared_adventure";
  if (sharedHistoryCount >= 3 && weather.trust > 0.5) return "building_trust";
  return "beginning";
}

function createRelationshipTimelineEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = {};
  let _nextId = 1;
  const _chapterCache = {};

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem[k]) _mem[k] = [];
    return _mem[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function addEvent({
    companionId, customerId,
    chapter = null,
    chapterSummary = "",
    eventType = "moment",
    eventSummary = "",
    importance = 0.5,
    emotionalWeight = 0.3,
    linkedRitual = "",
    linkedProject = "",
    linkedInsight = "",
    occurredAt = null,
    tags = [],
    // Context for auto chapter inference
    weather = null, sharedHistoryCount = 0, ritualsCount = 0, traditionsCount = 0,
  }) {
    if (clamp(importance) < TIMELINE_RECORD_THRESHOLD) return null;

    const resolvedChapter = chapter ?? inferChapter({ weather, sharedHistoryCount, ritualsCount, traditionsCount });
    const now = occurredAt ? new Date(occurredAt) : new Date();
    const k = `${companionId}:${customerId}`;
    _chapterCache[k] = resolvedChapter;

    if (!pool) {
      const entry = {
        id: _nextId++, companionId, customerId,
        chapter: resolvedChapter, chapterSummary, eventType, eventSummary,
        importance: clamp(importance), emotionalWeight: clamp(emotionalWeight),
        linkedRitual, linkedProject, linkedInsight,
        occurredAt: now.toISOString(), tags,
        createdAt: new Date().toISOString(),
      };
      _scope(companionId, customerId).push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_relationship_timeline
           (companion_id, customer_id, chapter, chapter_summary, event_type, event_summary,
            importance, emotional_weight, linked_ritual, linked_project, linked_insight,
            occurred_at, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [companionId, customerId, resolvedChapter, chapterSummary, eventType, eventSummary,
         clamp(importance), clamp(emotionalWeight),
         linkedRitual, linkedProject, linkedInsight,
         now.toISOString(), JSON.stringify(tags)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[timeline] addEvent failed", { error: err?.message });
      return null;
    }
  }

  async function getCurrentChapter({ companionId, customerId }) {
    const k = `${companionId}:${customerId}`;
    if (_chapterCache[k]) return _chapterCache[k];
    if (!pool) {
      const events = _scope(companionId, customerId);
      return events.length > 0 ? events[events.length - 1].chapter : "beginning";
    }
    try {
      const { rows } = await pool.query(
        `SELECT chapter FROM life_relationship_timeline
         WHERE companion_id=$1 AND customer_id=$2
         ORDER BY occurred_at DESC LIMIT 1`,
        [companionId, customerId],
      );
      const chapter = rows[0]?.chapter ?? "beginning";
      _chapterCache[k] = chapter;
      return chapter;
    } catch { return "beginning"; }
  }

  async function getChapterSummary({ companionId, customerId, chapter }) {
    if (!pool) {
      const events = _scope(companionId, customerId)
        .filter(e => e.chapter === chapter && e.chapterSummary)
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
      return events[0]?.chapterSummary ?? "";
    }
    try {
      const { rows } = await pool.query(
        `SELECT chapter_summary FROM life_relationship_timeline
         WHERE companion_id=$1 AND customer_id=$2 AND chapter=$3 AND chapter_summary!=''
         ORDER BY occurred_at DESC LIMIT 1`,
        [companionId, customerId, chapter],
      );
      return rows[0]?.chapter_summary ?? "";
    } catch { return ""; }
  }

  async function getRecent({ companionId, customerId, limit = 5 }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
        .slice(0, limit);
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_relationship_timeline
         WHERE companion_id=$1 AND customer_id=$2
         ORDER BY occurred_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 730, keepMinImportance = 0.65 }) {
    if (!pool) {
      const events = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.importance >= keepMinImportance) continue;
        if (new Date(e.createdAt).getTime() <= cutoff) {
          events.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_relationship_timeline
         WHERE companion_id=$1 AND customer_id=$2 AND importance<$3 AND created_at<=$4`,
        [companionId, customerId, keepMinImportance, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, addEvent, getCurrentChapter, getChapterSummary, getRecent, pruneOlderThan, inferChapter, CHAPTER_TYPES, TIMELINE_RECORD_THRESHOLD };
}

module.exports = { createRelationshipTimelineEngine, CHAPTER_TYPES, TIMELINE_RECORD_THRESHOLD, inferChapter };
