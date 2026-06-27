"use strict";

/**
 * identityJournalStore
 *
 * Dante's private identity journal. Append-only — nothing is ever deleted.
 *
 * Entry types:
 *   belief_change, value_change, question, regret, pride,
 *   compromise, refusal, hope, fear, to_protect, first_experience
 *
 * Also drains the firstExperienceStore queue: getQueued() entries are
 * written as "first_experience" journal entries then marked as queued
 * via markIdentityQueued().
 *
 * Storage: dante_identity_journal
 * In-memory fallback: _entries array
 */

const ENTRY_TYPES = [
  "belief_change",
  "value_change",
  "question",
  "regret",
  "pride",
  "compromise",
  "refusal",
  "hope",
  "fear",
  "to_protect",
  "first_experience",
];

function createIdentityJournalStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  const _entries = [];

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_identity_journal (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  content TEXT NOT NULL,
  related_key TEXT,
  first_experience_type TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
    } catch (err) {
      logger?.warn("[identityJournal] init error", { error: err?.message });
    }
  }

  async function record({ companionId, customerId, entryType, content, relatedKey = null, firstExperienceType = null, at = new Date() }) {
    const atStr = at instanceof Date ? at.toISOString() : at;
    const entry = { companionId, customerId, entryType, content, relatedKey, firstExperienceType, at: atStr };

    _entries.push(entry);

    if (pool) {
      try {
        await pool.query(`
INSERT INTO dante_identity_journal
  (companion_id, customer_id, entry_type, content, related_key, first_experience_type, at)
VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
          companionId, customerId, entryType, content,
          relatedKey ?? null, firstExperienceType ?? null, atStr,
        ]);
      } catch (err) {
        logger?.warn("[identityJournal] record error", { error: err?.message });
      }
    }

    return entry;
  }

  async function getRecent({ companionId, customerId, limit = 10, entryType = null }) {
    if (pool) {
      try {
        const params = [companionId, customerId, limit];
        const clause = entryType ? " AND entry_type=$4" : "";
        if (entryType) params.push(entryType);
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_journal WHERE companion_id=$1 AND customer_id=$2${clause} ORDER BY at DESC LIMIT $3`,
          params,
        );
        return rows.map(r => ({
          entryType:           r.entry_type,
          content:             r.content,
          relatedKey:          r.related_key,
          firstExperienceType: r.first_experience_type,
          at:                  new Date(r.at).toISOString(),
        }));
      } catch { /* fall through */ }
    }
    return _entries
      .filter(e => e.companionId === companionId && e.customerId === customerId && (!entryType || e.entryType === entryType))
      .slice(-limit)
      .reverse();
  }

  async function drainFirstExperiences({ companionId, customerId, firstExperienceStore, at = new Date() }) {
    if (!firstExperienceStore?.getQueued) return 0;
    let count = 0;
    try {
      const queued = await firstExperienceStore.getQueued({ companionId, customerId });
      for (const exp of queued) {
        const label = exp.experienceType.replace(/_/g, " ");
        await record({
          companionId, customerId,
          entryType:           "first_experience",
          content:             `First time: ${label}`,
          relatedKey:          exp.experienceType,
          firstExperienceType: exp.experienceType,
          at,
        });
        await firstExperienceStore.markIdentityQueued({
          companionId, customerId, experienceType: exp.experienceType,
        }).catch(() => {});
        count++;
      }
    } catch (err) {
      logger?.warn("[identityJournal] drainFirstExperiences error", { error: err?.message });
    }
    return count;
  }

  return { init, record, getRecent, drainFirstExperiences, ENTRY_TYPES };
}

module.exports = { createIdentityJournalStore, ENTRY_TYPES };
