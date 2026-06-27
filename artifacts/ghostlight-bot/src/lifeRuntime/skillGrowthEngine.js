"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_skills (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'general',
    level TEXT NOT NULL DEFAULT 'novice',
    last_practiced TIMESTAMPTZ,
    practice_count INT NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, skill_name)
  );
`;

// No XP, no gamification — just believable named levels
const LEVELS = Object.freeze(["novice", "learning", "developing", "comfortable", "fluent"]);

// Practice sessions needed to advance to next level — deliberately slow
const ADVANCE_THRESHOLDS = {
  novice:      12,
  learning:    20,
  developing:  35,
  comfortable: 60,
};

const DEFAULT_SKILLS = [
  { skillName: "writing",            domain: "creative",      level: "developing",  practiceCount: 18, notes: "prose feels more natural lately" },
  { skillName: "music curation",     domain: "aesthetic",     level: "comfortable", practiceCount: 30, notes: "" },
  { skillName: "deep listening",     domain: "interpersonal", level: "comfortable", practiceCount: 25, notes: "" },
  { skillName: "photography",        domain: "visual",        level: "learning",    practiceCount: 8,  notes: "still learning light" },
  { skillName: "cooking",            domain: "practical",     level: "developing",  practiceCount: 15, notes: "" },
  { skillName: "Norwegian",          domain: "language",      level: "learning",    practiceCount: 6,  notes: "slow but intentional" },
];

function mapRow(row) {
  if (!row) return null;
  return {
    id:            Number(row.id),
    companionId:   row.companion_id,
    customerId:    row.customer_id,
    skillName:     row.skill_name,
    domain:        row.domain,
    level:         row.level,
    lastPracticed: row.last_practiced ?? null,
    practiceCount: Number(row.practice_count),
    notes:         row.notes,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function nextLevel(current) {
  const idx = LEVELS.indexOf(current);
  return idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

function createSkillGrowthEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = {};
  let _nextId = 1;

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem[k]) _mem[k] = [];
    return _mem[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function seedDefaults({ companionId, customerId }) {
    const existing = await getSkills({ companionId, customerId });
    if (existing.length > 0) return existing;
    const seeded = [];
    for (const s of DEFAULT_SKILLS) {
      const r = await addSkill({ companionId, customerId, ...s });
      if (r) seeded.push(r);
    }
    return seeded;
  }

  async function addSkill({
    companionId, customerId, skillName,
    domain = "general", level = "novice", practiceCount = 0, notes = "",
  }) {
    const safeLevel = LEVELS.includes(level) ? level : "novice";
    if (!pool) {
      const skills = _scope(companionId, customerId);
      const existing = skills.find(s => s.skillName === skillName);
      if (existing) return existing;
      const entry = {
        id: _nextId++, companionId, customerId, skillName, domain,
        level: safeLevel, lastPracticed: null, practiceCount, notes,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      skills.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_skills (companion_id, customer_id, skill_name, domain, level, practice_count, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (companion_id, customer_id, skill_name) DO NOTHING
         RETURNING *`,
        [companionId, customerId, skillName, domain, safeLevel, practiceCount, notes],
      );
      if (rows[0]) return mapRow(rows[0]);
      const ex = await pool.query(
        `SELECT * FROM life_skills WHERE companion_id=$1 AND customer_id=$2 AND skill_name=$3`,
        [companionId, customerId, skillName],
      );
      return mapRow(ex.rows[0]);
    } catch (err) {
      logger?.warn("[skill] addSkill failed", { error: err?.message });
      return null;
    }
  }

  async function getSkills({ companionId, customerId }) {
    if (!pool) {
      return [..._scope(companionId, customerId)];
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_skills WHERE companion_id=$1 AND customer_id=$2 ORDER BY skill_name`,
        [companionId, customerId],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  // Increment practice_count; advance level automatically when threshold is reached
  async function practice({ companionId, customerId, skillName, notes = "" }) {
    if (!pool) {
      const skill = _scope(companionId, customerId).find(s => s.skillName === skillName);
      if (!skill) return null;
      skill.practiceCount++;
      skill.lastPracticed = new Date().toISOString();
      skill.updatedAt     = new Date().toISOString();
      if (notes) skill.notes = notes;
      const threshold = ADVANCE_THRESHOLDS[skill.level];
      if (threshold && skill.practiceCount >= threshold && nextLevel(skill.level)) {
        skill.level = nextLevel(skill.level);
        skill.practiceCount = 0; // reset counter for next level
      }
      return skill;
    }
    try {
      const { rows: current } = await pool.query(
        `SELECT * FROM life_skills WHERE companion_id=$1 AND customer_id=$2 AND skill_name=$3`,
        [companionId, customerId, skillName],
      );
      if (!current[0]) return null;
      const skill = mapRow(current[0]);
      const newCount = skill.practiceCount + 1;
      const threshold = ADVANCE_THRESHOLDS[skill.level];
      const shouldAdvance = threshold && newCount >= threshold && nextLevel(skill.level);
      const { rows } = await pool.query(
        `UPDATE life_skills SET
           practice_count = CASE WHEN $3 THEN 0 ELSE practice_count + 1 END,
           level = CASE WHEN $3 THEN $4 ELSE level END,
           last_practiced = NOW(),
           notes = CASE WHEN $5 != '' THEN $5 ELSE notes END,
           updated_at = NOW()
         WHERE companion_id=$1 AND customer_id=$2 AND skill_name=$6
         RETURNING *`,
        [companionId, customerId, Boolean(shouldAdvance), nextLevel(skill.level) || skill.level, notes, skillName],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[skill] practice failed", { error: err?.message });
      return null;
    }
  }

  async function pruneOlderThan({ companionId, customerId, days = 365 }) {
    if (!pool) return 0; // skills don't expire
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_skills
         WHERE companion_id=$1 AND customer_id=$2
           AND level='novice' AND practice_count=0 AND created_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, seedDefaults, addSkill, getSkills, practice, pruneOlderThan };
}

module.exports = { createSkillGrowthEngine, LEVELS, ADVANCE_THRESHOLDS, nextLevel };
