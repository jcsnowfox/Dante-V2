/**
 * storage/promptProfiles
 *
 * Phase 2 — raw `pg` store for UI-editable companion prompt profiles.
 *
 * Mirrors the other companion stores: inline CREATE TABLE IF NOT EXISTS, a
 * mapRow helper, companion_id on the table and on every query for strict
 * isolation, and a safe no-op when there is no pool (no real DATABASE_URL) so
 * the bot keeps running and the persona falls back to the legacy config blocks.
 *
 * A partial unique index guarantees at most one active profile per companion.
 *
 * Table:
 *   companion_prompt_profiles — owner-pasted prompt sections (Phase 2 spec)
 */

const { createPostgresPool } = require("../postgres/createPostgresPool");

const PROMPT_COLUMNS = [
  ["coreIdentityPrompt", "core_identity_prompt"],
  ["voiceTonePrompt", "voice_tone_prompt"],
  ["relationshipPrompt", "relationship_prompt"],
  ["boundariesPrompt", "boundaries_prompt"],
  ["memoryRulesPrompt", "memory_rules_prompt"],
  ["secondLifeBehaviorPrompt", "second_life_behavior_prompt"],
  ["secondLifeLocalChatPrompt", "second_life_local_chat_prompt"],
  ["privacyPrompt", "privacy_prompt"],
  ["adultPrivatePrompt", "adult_private_prompt"],
  ["adultPreferencesPrompt", "adult_preferences_prompt"],
  ["adultWantsPrompt", "adult_wants_prompt"],
  ["adultNeedsPrompt", "adult_needs_prompt"],
  ["adultSoftLimitsPrompt", "adult_soft_limits_prompt"],
  ["adultHardLimitsPrompt", "adult_hard_limits_prompt"],
];

function mapRow(row) {
  if (!row) {
    return null;
  }
  const mapped = {
    id: String(row.id),
    companionId: row.companion_id,
    profileName: row.profile_name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  for (const [camel, column] of PROMPT_COLUMNS) {
    mapped[camel] = row[column] || "";
  }
  return mapped;
}

function promptValues(prompts = {}) {
  return PROMPT_COLUMNS.map(([camel]) => String(prompts[camel] == null ? "" : prompts[camel]));
}

function createPromptProfileStore({ config, logger }) {
  const pool = createPostgresPool({ config });
  const available = Boolean(pool);

  async function init() {
    if (!available) {
      logger?.info?.("[prompt-profiles] No database pool; store is inert (persona falls back to config blocks).");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_prompt_profiles (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          profile_name TEXT NOT NULL DEFAULT 'Default',
          core_identity_prompt TEXT NOT NULL DEFAULT '',
          voice_tone_prompt TEXT NOT NULL DEFAULT '',
          relationship_prompt TEXT NOT NULL DEFAULT '',
          boundaries_prompt TEXT NOT NULL DEFAULT '',
          memory_rules_prompt TEXT NOT NULL DEFAULT '',
          second_life_behavior_prompt TEXT NOT NULL DEFAULT '',
          second_life_local_chat_prompt TEXT NOT NULL DEFAULT '',
          privacy_prompt TEXT NOT NULL DEFAULT '',
          adult_private_prompt TEXT NOT NULL DEFAULT '',
          adult_preferences_prompt TEXT NOT NULL DEFAULT '',
          adult_wants_prompt TEXT NOT NULL DEFAULT '',
          adult_needs_prompt TEXT NOT NULL DEFAULT '',
          adult_soft_limits_prompt TEXT NOT NULL DEFAULT '',
          adult_hard_limits_prompt TEXT NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Migrate older tables that predate the adult user-config columns.
      for (const [, column] of PROMPT_COLUMNS) {
        await client.query(
          `ALTER TABLE companion_prompt_profiles ADD COLUMN IF NOT EXISTS ${column} TEXT NOT NULL DEFAULT ''`,
        );
      }
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_prompt_profiles_companion
        ON companion_prompt_profiles (companion_id, updated_at DESC)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_companion_prompt_profiles_active
        ON companion_prompt_profiles (companion_id)
        WHERE is_active
      `);
      await client.query("COMMIT");
      logger?.info?.("[prompt-profiles] Storage initialised.");
    } catch (error) {
      await client.query("ROLLBACK");
      logger?.error?.("[prompt-profiles] Storage init failed.", { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  async function listProfiles({ companionId }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM companion_prompt_profiles WHERE companion_id = $1
       ORDER BY is_active DESC, updated_at DESC`,
      [companionId],
    );
    return rows.map(mapRow);
  }

  async function getProfile({ companionId, id }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM companion_prompt_profiles WHERE companion_id = $1 AND id = $2 LIMIT 1`,
      [companionId, id],
    );
    return mapRow(rows[0]);
  }

  async function getActiveProfile({ companionId }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM companion_prompt_profiles WHERE companion_id = $1 AND is_active = TRUE LIMIT 1`,
      [companionId],
    );
    return mapRow(rows[0]);
  }

  async function createProfile({ companionId, profileName, prompts = {}, isActive = false }) {
    if (!available) return null;
    const values = promptValues(prompts);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (isActive) {
        await client.query(
          `UPDATE companion_prompt_profiles SET is_active = FALSE, updated_at = NOW()
           WHERE companion_id = $1 AND is_active = TRUE`,
          [companionId],
        );
      }
      const promptColumnNames = PROMPT_COLUMNS.map(([, column]) => column);
      // params: $1 companion_id, $2 profile_name, $3..$(N+2) prompts, $(N+3) is_active
      const promptPlaceholders = promptColumnNames.map((_, i) => `$${i + 3}`);
      const activePlaceholder = `$${promptColumnNames.length + 3}`;
      const { rows } = await client.query(
        `INSERT INTO companion_prompt_profiles
          (companion_id, profile_name, ${promptColumnNames.join(", ")}, is_active)
         VALUES ($1, $2, ${promptPlaceholders.join(", ")}, ${activePlaceholder})
         RETURNING *`,
        [
          companionId,
          String(profileName || "Default").trim() || "Default",
          ...values,
          Boolean(isActive),
        ],
      );
      await client.query("COMMIT");
      return mapRow(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function updateProfile({ companionId, id, profileName, prompts = {} }) {
    if (!available) return null;
    const values = promptValues(prompts);
    // params: $1 companion_id, $2 id, $3 profile_name, $4..$(N+3) prompts
    const promptAssignments = PROMPT_COLUMNS
      .map(([, column], i) => `${column} = $${i + 4}`)
      .join(",\n         ");
    const { rows } = await pool.query(
      `UPDATE companion_prompt_profiles SET
         profile_name = $3,
         ${promptAssignments},
         updated_at = NOW()
       WHERE companion_id = $1 AND id = $2
       RETURNING *`,
      [
        companionId,
        id,
        String(profileName || "Default").trim() || "Default",
        ...values,
      ],
    );
    return mapRow(rows[0]);
  }

  async function setActiveProfile({ companionId, id }) {
    if (!available) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE companion_prompt_profiles SET is_active = FALSE, updated_at = NOW()
         WHERE companion_id = $1 AND is_active = TRUE AND id <> $2`,
        [companionId, id],
      );
      const { rows } = await client.query(
        `UPDATE companion_prompt_profiles SET is_active = TRUE, updated_at = NOW()
         WHERE companion_id = $1 AND id = $2
         RETURNING *`,
        [companionId, id],
      );
      await client.query("COMMIT");
      return mapRow(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function deactivateAll({ companionId }) {
    if (!available) return;
    await pool.query(
      `UPDATE companion_prompt_profiles SET is_active = FALSE, updated_at = NOW()
       WHERE companion_id = $1 AND is_active = TRUE`,
      [companionId],
    );
  }

  async function deleteProfile({ companionId, id }) {
    if (!available) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM companion_prompt_profiles WHERE companion_id = $1 AND id = $2`,
      [companionId, id],
    );
    return rowCount > 0;
  }

  async function getStoreSummary({ companionId }) {
    if (!available) return { available: false, profiles: 0, hasActive: false };
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS profiles,
         COUNT(*) FILTER (WHERE is_active)::int AS active
       FROM companion_prompt_profiles WHERE companion_id = $1`,
      [companionId],
    );
    return {
      available: true,
      profiles: rows[0]?.profiles || 0,
      hasActive: (rows[0]?.active || 0) > 0,
    };
  }

  return {
    available,
    init,
    listProfiles,
    getProfile,
    getActiveProfile,
    createProfile,
    updateProfile,
    setActiveProfile,
    deactivateAll,
    deleteProfile,
    getStoreSummary,
  };
}

module.exports = { createPromptProfileStore };
