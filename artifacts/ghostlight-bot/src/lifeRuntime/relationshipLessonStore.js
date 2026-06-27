"use strict";

const crypto = require("crypto");
const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const LESSON_TYPES = Object.freeze(["hurt_pattern","repair_success","repair_failure","trust_repair","boundary_learning","communication_preference","evidence_integrity","perception_boundary","promise_learning","give_space_learning","followup_learning","tone_learning","naturalism_learning"]);
const STATUSES = Object.freeze(["active","maturing","stable","challenged","retired"]);

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS relationship_lessons (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  lesson_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  evidence_ids JSONB NOT NULL DEFAULT '[]',
  source_consequence_ids JSONB NOT NULL DEFAULT '[]',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  strength NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  status TEXT NOT NULL DEFAULT 'active',
  future_behavior_guidance TEXT NOT NULL DEFAULT '',
  last_reinforced_at TIMESTAMPTZ,
  last_challenged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS relationship_lessons_scope_idx ON relationship_lessons (companion_id, customer_id, status, updated_at DESC);
`;

function clamp(n, d = 0.5) { const v = Number(n); return Math.max(0, Math.min(1, Number.isFinite(v) ? v : d)); }
function arr(v) { return Array.isArray(v) ? Array.from(new Set(v.map(String).filter(Boolean))) : []; }
function nowIso(v = new Date()) { return v instanceof Date ? v.toISOString() : String(v); }
function row(r) { return r && { id:r.id, companionId:r.companion_id, customerId:r.customer_id, lessonType:r.lesson_type, title:r.title, summary:r.summary, evidenceIds:r.evidence_ids||[], sourceConsequenceIds:r.source_consequence_ids||[], confidence:clamp(r.confidence), strength:clamp(r.strength), status:r.status, futureBehaviorGuidance:r.future_behavior_guidance||"", lastReinforcedAt:r.last_reinforced_at, lastChallengedAt:r.last_challenged_at, createdAt:r.created_at, updatedAt:r.updated_at, metadata:r.metadata||{} }; }
function keyOf(x) { return String(x.lessonKey || x.title || x.lessonType || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80); }

function createRelationshipLessonStore({ config = {}, logger = null } = {}) {
  let pool = null; try { pool = createPostgresPool({ config }); } catch { pool = null; }
  const mem = new Map();
  const scope = (c,u) => `${c}:${u}`;
  async function init() { if (pool) await pool.query(CREATE_TABLE_SQL); }
  async function upsertLesson(input = {}) {
    const companionId = input.companionId || input.companion_id || "";
    const customerId = input.customerId || input.customer_id || "user";
    const lessonType = LESSON_TYPES.includes(input.lessonType) ? input.lessonType : "hurt_pattern";
    const title = String(input.title || lessonType).slice(0, 180);
    const lessonKey = keyOf(input);
    const id = input.id || `${companionId}:${customerId}:${lessonKey}`;
    const at = nowIso(input.now || new Date());
    if (!pool) {
      const k = scope(companionId, customerId); if (!mem.has(k)) mem.set(k, []);
      const list = mem.get(k); let ex = list.find(l => l.id === id || l.metadata?.lessonKey === lessonKey);
      if (ex) {
        const challenged = input.direction === "challenge";
        ex.confidence = clamp(ex.confidence + (challenged ? -0.12 : Number(input.confidenceDelta ?? 0.08)));
        ex.strength = clamp(ex.strength + (challenged ? -0.08 : Number(input.strengthDelta ?? 0.06)));
        ex.status = challenged ? "challenged" : (ex.confidence >= 0.8 && ex.strength >= 0.75 ? "stable" : "maturing");
        ex.evidenceIds = arr([...ex.evidenceIds, ...arr(input.evidenceIds)]);
        ex.sourceConsequenceIds = arr([...ex.sourceConsequenceIds, ...arr(input.sourceConsequenceIds)]);
        ex.summary = input.summary || ex.summary; ex.futureBehaviorGuidance = input.futureBehaviorGuidance || ex.futureBehaviorGuidance;
        ex.metadata = { ...ex.metadata, ...(input.metadata || {}), lessonKey };
        if (challenged) ex.lastChallengedAt = at; else ex.lastReinforcedAt = at; ex.updatedAt = at;
        return { ...ex };
      }
      ex = { id, companionId, customerId, lessonType, title, summary:String(input.summary||""), evidenceIds:arr(input.evidenceIds), sourceConsequenceIds:arr(input.sourceConsequenceIds), confidence:clamp(input.confidence), strength:clamp(input.strength), status:STATUSES.includes(input.status)?input.status:"active", futureBehaviorGuidance:String(input.futureBehaviorGuidance||""), lastReinforcedAt: input.direction === "challenge" ? null : at, lastChallengedAt: input.direction === "challenge" ? at : null, createdAt:at, updatedAt:at, metadata:{ ...(input.metadata||{}), lessonKey } };
      list.push(ex); return { ...ex };
    }
    try {
      const { rows } = await pool.query(`INSERT INTO relationship_lessons (id,companion_id,customer_id,lesson_type,title,summary,evidence_ids,source_consequence_ids,confidence,strength,status,future_behavior_guidance,last_reinforced_at,last_challenged_at,created_at,updated_at,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16) ON CONFLICT (id) DO UPDATE SET summary=EXCLUDED.summary,evidence_ids=(SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(relationship_lessons.evidence_ids || EXCLUDED.evidence_ids) AS t(x)),source_consequence_ids=(SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(relationship_lessons.source_consequence_ids || EXCLUDED.source_consequence_ids) AS t(x)),confidence=LEAST(1, GREATEST(0, relationship_lessons.confidence + $17)),strength=LEAST(1, GREATEST(0, relationship_lessons.strength + $18)),status=EXCLUDED.status,future_behavior_guidance=COALESCE(NULLIF(EXCLUDED.future_behavior_guidance,''),relationship_lessons.future_behavior_guidance),last_reinforced_at=COALESCE(EXCLUDED.last_reinforced_at, relationship_lessons.last_reinforced_at),last_challenged_at=COALESCE(EXCLUDED.last_challenged_at, relationship_lessons.last_challenged_at),updated_at=$15,metadata=relationship_lessons.metadata || EXCLUDED.metadata RETURNING *`, [id,companionId,customerId,lessonType,title,String(input.summary||""),JSON.stringify(arr(input.evidenceIds)),JSON.stringify(arr(input.sourceConsequenceIds)),clamp(input.confidence),clamp(input.strength),input.direction === "challenge" ? "challenged" : (input.status||"active"),String(input.futureBehaviorGuidance||""),input.direction === "challenge" ? null : at,input.direction === "challenge" ? at : null,at,JSON.stringify({ ...(input.metadata||{}), lessonKey }), input.direction === "challenge" ? -0.12 : Number(input.confidenceDelta ?? 0.08), input.direction === "challenge" ? -0.08 : Number(input.strengthDelta ?? 0.06)]);
      return row(rows[0]);
    } catch (err) { logger?.warn?.("[relationshipLessonStore] upsert failed", { error: err.message }); return null; }
  }
  async function listLessons({ companionId, customerId, status = null, limit = 50 } = {}) {
    if (!pool) return (mem.get(scope(companionId, customerId)) || []).filter(l => !status || l.status === status).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit).map(l=>({ ...l }));
    const { rows } = await pool.query(`SELECT * FROM relationship_lessons WHERE companion_id=$1 AND customer_id=$2 ${status ? "AND status=$3" : ""} ORDER BY updated_at DESC LIMIT ${Number(limit)||50}`, status ? [companionId, customerId, status] : [companionId, customerId]); return rows.map(row);
  }
  async function getStatus({ companionId, customerId } = {}) { const lessons = await listLessons({ companionId, customerId, limit: 100 }); return { relationship_lessons_count: lessons.length, active_relationship_lessons: lessons.filter(l=>["active","maturing","stable","challenged"].includes(l.status)).length, recent_lesson_types: lessons.slice(0,5).map(l=>l.lessonType), last_repair_lesson_at: lessons[0]?.updatedAt || null, behavior_guidance_active: lessons.some(l=>l.futureBehaviorGuidance) }; }
  return { init, upsertLesson, listLessons, getStatus, LESSON_TYPES, STATUSES };
}
module.exports = { createRelationshipLessonStore, LESSON_TYPES, STATUSES };
