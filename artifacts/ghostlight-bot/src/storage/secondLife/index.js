/**
 * storage/secondLife
 *
 * Phase 4 — raw `pg` store for the Second Life data model.
 *
 * Creates every Second Life settings/state table (plus the companion daily life
 * schedule from Phase 15) with companion_id on every table for strict
 * isolation. Follows the established store pattern: inline CREATE TABLE IF NOT
 * EXISTS inside a single BEGIN/COMMIT, a safe no-op when there is no pool, and
 * NO seeded customer data — the bridge stays empty until an owner configures it.
 *
 * Stage 1 ships the schema plus the shared-secret hashing helper and minimal
 * bridge-settings accessors. The richer per-table CRUD (outfits, landmarks,
 * commands, queue, world state, journal) arrives with the later bridge stages.
 *
 * Tables:
 *   second_life_bridge_settings
 *   second_life_avatar_relationships
 *   second_life_outfits
 *   second_life_landmarks
 *   second_life_objects
 *   second_life_commands
 *   second_life_command_queue
 *   second_life_world_state
 *   second_life_life_journal
 *   companion_daily_schedule
 */

const crypto = require("crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

/**
 * Hash a shared secret for at-rest storage. Returns "" for an empty secret so
 * callers can distinguish "no secret configured" from a real hash. The
 * plaintext secret must never be logged or persisted.
 */
function hashSharedSecret(secret) {
  const value = String(secret == null ? "" : secret);
  if (!value) {
    return "";
  }
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function mapBridgeSettingsRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    companionId: row.companion_id,
    enabled: Boolean(row.enabled),
    agentName: row.agent_name || "",
    agentUuid: row.agent_uuid || "",
    ownerAvatarUuid: row.owner_avatar_uuid || "",
    hasSharedSecret: Boolean(row.shared_secret_hash),
    homeRegion: row.home_region || "",
    homeCoordinates: row.home_coordinates_json || null,
    wanderRadiusMeters: row.wander_radius_meters == null ? null : Number(row.wander_radius_meters),
    localChatEnabled: Boolean(row.local_chat_enabled),
    strangerRepliesEnabled: Boolean(row.stranger_replies_enabled),
    autonomyEnabled: Boolean(row.autonomy_enabled),
    discoveryEnabled: Boolean(row.discovery_enabled),
    initiativeEnabled: Boolean(row.initiative_enabled),
    outfitsEnabled: Boolean(row.outfits_enabled),
    landmarksEnabled: Boolean(row.landmarks_enabled),
    objectInteractionEnabled: Boolean(row.object_interaction_enabled),
    furnitureInteractionEnabled: Boolean(row.furniture_interaction_enabled),
    dancePadInteractionEnabled: Boolean(row.dance_pad_interaction_enabled),
    quietHoursStart: row.quiet_hours_start || "",
    quietHoursEnd: row.quiet_hours_end || "",
    maxLocalRepliesPer10Min: row.max_local_replies_per_10_min == null ? null : Number(row.max_local_replies_per_10_min),
    maxStrangerRepliesPer30Min: row.max_stranger_replies_per_30_min == null ? null : Number(row.max_stranger_replies_per_30_min),
    // Phase 20 — safety flags. Privacy guard defaults ON (fail-safe) when the
    // column is absent/null; autonomy pause is a runtime kill-switch (default off).
    privacyGuardEnabled: row.privacy_guard_enabled == null ? true : Boolean(row.privacy_guard_enabled),
    autonomyPaused: Boolean(row.autonomy_paused),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSecondLifeStore({ config, logger }) {
  const pool = createPostgresPool({ config });
  const available = Boolean(pool);

  async function init() {
    if (!available) {
      logger?.info?.("[second-life] No database pool; Second Life store is inert.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_bridge_settings (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          agent_name TEXT NOT NULL DEFAULT '',
          agent_uuid TEXT NOT NULL DEFAULT '',
          owner_avatar_uuid TEXT NOT NULL DEFAULT '',
          shared_secret_hash TEXT NOT NULL DEFAULT '',
          home_region TEXT NOT NULL DEFAULT '',
          home_coordinates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          wander_radius_meters NUMERIC NOT NULL DEFAULT 0,
          local_chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          stranger_replies_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          autonomy_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          discovery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          initiative_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          outfits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          landmarks_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          object_interaction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          furniture_interaction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          dance_pad_interaction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          quiet_hours_start TEXT NOT NULL DEFAULT '',
          quiet_hours_end TEXT NOT NULL DEFAULT '',
          max_local_replies_per_10_min INTEGER NOT NULL DEFAULT 0,
          max_stranger_replies_per_30_min INTEGER NOT NULL DEFAULT 0,
          privacy_guard_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          autonomy_paused BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id)
        )
      `);

      // Phase 20 — idempotent migrations for databases created before the safety
      // flags existed (Stages 1-6). Both default to the safe value.
      await client.query(
        `ALTER TABLE second_life_bridge_settings
           ADD COLUMN IF NOT EXISTS privacy_guard_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
      );
      await client.query(
        `ALTER TABLE second_life_bridge_settings
           ADD COLUMN IF NOT EXISTS autonomy_paused BOOLEAN NOT NULL DEFAULT FALSE`,
      );

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_avatar_relationships (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          avatar_uuid TEXT NOT NULL,
          avatar_name TEXT NOT NULL DEFAULT '',
          relationship_type TEXT NOT NULL DEFAULT 'stranger',
          display_label TEXT NOT NULL DEFAULT '',
          is_owner BOOLEAN NOT NULL DEFAULT FALSE,
          is_family BOOLEAN NOT NULL DEFAULT FALSE,
          is_friend BOOLEAN NOT NULL DEFAULT FALSE,
          is_trusted BOOLEAN NOT NULL DEFAULT FALSE,
          is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
          chat_permission BOOLEAN NOT NULL DEFAULT TRUE,
          follow_permission BOOLEAN NOT NULL DEFAULT FALSE,
          private_memory_permission BOOLEAN NOT NULL DEFAULT FALSE,
          notes TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, avatar_uuid)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_avatar_relationships_companion
        ON second_life_avatar_relationships (companion_id, relationship_type)
      `);

      // Phase 21 — idempotent migrations for the People + Objects identity registry.
      // Extends second_life_avatar_relationships with rich identity/policy fields.
      const avatarCols = [
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS relationship_to_user TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS relationship_to_companion TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS reply_policy TEXT NOT NULL DEFAULT 'allowed_if_mentioned'`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS always_respond BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS never_respond BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS child_safe_only BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS public_identity_context_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS local_chat_chatter_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS min_seconds_between_replies INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0`,
        // Identity-mapping fields: preferred_display_name and identity_note let the
        // owner annotate an alternate-avatar record with the person's real identity so
        // the model uses the correct name instead of the raw SL avatar name.
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS preferred_display_name TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE second_life_avatar_relationships ADD COLUMN IF NOT EXISTS identity_note TEXT NOT NULL DEFAULT ''`,
      ];
      for (const sql of avatarCols) {
        await client.query(sql);
      }

      // Phase 21 — object identity / chatter relationships table.
      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_object_relationships (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          object_uuid TEXT NOT NULL DEFAULT '',
          object_name TEXT NOT NULL DEFAULT '',
          object_description_token TEXT NOT NULL DEFAULT '',
          nickname TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          relationship_to_user TEXT NOT NULL DEFAULT '',
          relationship_to_companion TEXT NOT NULL DEFAULT '',
          trust_level TEXT NOT NULL DEFAULT 'known',
          reply_policy TEXT NOT NULL DEFAULT 'ambient_only',
          private_channel_allowed BOOLEAN NOT NULL DEFAULT FALSE,
          child_safe_only BOOLEAN NOT NULL DEFAULT FALSE,
          always_respond BOOLEAN NOT NULL DEFAULT FALSE,
          never_respond BOOLEAN NOT NULL DEFAULT FALSE,
          public_identity_context_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          local_chat_chatter_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          min_seconds_between_replies INTEGER NOT NULL DEFAULT 180,
          notes TEXT NOT NULL DEFAULT '',
          first_seen_at TIMESTAMPTZ,
          last_seen_at TIMESTAMPTZ,
          last_reply_at TIMESTAMPTZ,
          message_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_obj_rel_companion
        ON second_life_object_relationships (companion_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_obj_rel_companion_uuid
        ON second_life_object_relationships (companion_id, object_uuid)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_obj_rel_companion_desc
        ON second_life_object_relationships (companion_id, object_description_token)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_outfits (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          trigger TEXT NOT NULL,
          outfit_name TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          context_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          requires_owner_permission BOOLEAN NOT NULL DEFAULT FALSE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, trigger)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_landmarks (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          trigger TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          coordinates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          description TEXT NOT NULL DEFAULT '',
          tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          favorite_score NUMERIC NOT NULL DEFAULT 0,
          is_home BOOLEAN NOT NULL DEFAULT FALSE,
          is_private BOOLEAN NOT NULL DEFAULT FALSE,
          allowed_relationships_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, trigger)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_objects (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          object_uuid TEXT NOT NULL,
          object_name TEXT NOT NULL DEFAULT '',
          object_type TEXT NOT NULL DEFAULT 'custom',
          region TEXT NOT NULL DEFAULT '',
          coordinates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          room_label TEXT NOT NULL DEFAULT '',
          use_type TEXT NOT NULL DEFAULT 'custom',
          allowed_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          requires_owner_permission BOOLEAN NOT NULL DEFAULT FALSE,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, object_uuid)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_commands (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          command_trigger TEXT NOT NULL,
          command_type TEXT NOT NULL DEFAULT 'custom',
          description TEXT NOT NULL DEFAULT '',
          payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          allowed_relationships_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          requires_owner_permission BOOLEAN NOT NULL DEFAULT FALSE,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, command_trigger)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_command_queue (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          agent_uuid TEXT NOT NULL DEFAULT '',
          command_type TEXT NOT NULL,
          payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          status TEXT NOT NULL DEFAULT 'pending',
          priority INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          claimed_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          failed_at TIMESTAMPTZ,
          error_message TEXT,
          source_event_id TEXT
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_command_queue_dispatch
        ON second_life_command_queue (companion_id, status, priority DESC, available_at)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_world_state (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          agent_uuid TEXT NOT NULL DEFAULT '',
          current_region TEXT NOT NULL DEFAULT '',
          current_parcel TEXT NOT NULL DEFAULT '',
          current_coordinates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          current_activity TEXT NOT NULL DEFAULT '',
          current_outfit TEXT NOT NULL DEFAULT '',
          current_animation TEXT NOT NULL DEFAULT '',
          owner_present BOOLEAN NOT NULL DEFAULT FALSE,
          nearby_avatars_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          nearby_objects_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          last_heartbeat_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_life_journal (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          entry_type TEXT NOT NULL DEFAULT 'note',
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          location_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          people_context_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          memory_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_life_journal_companion
        ON second_life_life_journal (companion_id, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_daily_schedule (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          day_of_week TEXT NOT NULL DEFAULT '',
          time_window_start TEXT NOT NULL DEFAULT '',
          time_window_end TEXT NOT NULL DEFAULT '',
          activity_type TEXT NOT NULL DEFAULT '',
          activity_label TEXT NOT NULL DEFAULT '',
          allowed_locations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          autonomy_level TEXT NOT NULL DEFAULT 'medium',
          requires_owner_present BOOLEAN NOT NULL DEFAULT FALSE,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_daily_schedule_companion
        ON companion_daily_schedule (companion_id, day_of_week, time_window_start)
      `);

      // Phase 16 — discovery log. Only ever holds places the companion really
      // visited / had registered / imported (source != 'fake'). visited stays
      // TRUE only for real visits so the discovery engine never invents places.
      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_discoveries (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          place_key TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          coordinates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          source TEXT NOT NULL DEFAULT 'visited',
          visited BOOLEAN NOT NULL DEFAULT TRUE,
          visit_count INTEGER NOT NULL DEFAULT 1,
          tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          rating INTEGER NOT NULL DEFAULT 0,
          bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
          is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
          shared BOOLEAN NOT NULL DEFAULT FALSE,
          notes TEXT NOT NULL DEFAULT '',
          first_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, place_key)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_discoveries_companion
        ON second_life_discoveries (companion_id, last_visited_at DESC)
      `);

      // Phase 17 — shared experience history (milestones + meaningful moments).
      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_shared_experiences (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          experience_type TEXT NOT NULL DEFAULT 'moment',
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          location_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          people_context_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_milestone BOOLEAN NOT NULL DEFAULT FALSE,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_shared_exp_companion
        ON second_life_shared_experiences (companion_id, occurred_at DESC)
      `);

      // Phase 19 — long-term goals (progress only advances on real events).
      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_goals (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          goal_type TEXT NOT NULL DEFAULT 'custom',
          label TEXT NOT NULL DEFAULT '',
          target_value INTEGER NOT NULL DEFAULT 0,
          current_value INTEGER NOT NULL DEFAULT 0,
          unit TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_goals_companion
        ON second_life_goals (companion_id, status)
      `);

      // Phase 18 — initiative log (every initiative must record WHY it happened).
      await client.query(`
        CREATE TABLE IF NOT EXISTS second_life_initiatives (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          initiative_type TEXT NOT NULL DEFAULT 'note',
          reason TEXT NOT NULL DEFAULT '',
          evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          status TEXT NOT NULL DEFAULT 'proposed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sl_initiatives_companion
        ON second_life_initiatives (companion_id, created_at DESC)
      `);

      await client.query("COMMIT");
      logger?.info?.("[second-life] Storage initialised.");
    } catch (error) {
      await client.query("ROLLBACK");
      logger?.error?.("[second-life] Storage init failed.", { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  async function loadBridgeSettings({ companionId }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_bridge_settings WHERE companion_id = $1 LIMIT 1`,
      [companionId],
    );
    return mapBridgeSettingsRow(rows[0]);
  }

  async function upsertBridgeSettings({ companionId, settings = {}, sharedSecret = undefined }) {
    if (!available) return null;

    // Only rewrite the secret hash when a new plaintext secret is supplied;
    // otherwise leave whatever is stored untouched. The plaintext is hashed
    // here and never persisted or returned.
    const rewriteSecret = sharedSecret !== undefined;
    const secretHash = rewriteSecret ? hashSharedSecret(sharedSecret) : "";

    const { rows } = await pool.query(
      `INSERT INTO second_life_bridge_settings (
         companion_id, enabled, agent_name, agent_uuid, owner_avatar_uuid,
         shared_secret_hash, home_region, home_coordinates_json, wander_radius_meters,
         local_chat_enabled, stranger_replies_enabled, autonomy_enabled, discovery_enabled,
         initiative_enabled, outfits_enabled, landmarks_enabled, object_interaction_enabled,
         furniture_interaction_enabled, dance_pad_interaction_enabled,
         quiet_hours_start, quiet_hours_end,
         max_local_replies_per_10_min, max_stranger_replies_per_30_min,
         privacy_guard_enabled, autonomy_paused, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8::jsonb, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19,
         $20, $21,
         $22, $23,
         $24, $25, NOW()
       )
       ON CONFLICT (companion_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         agent_name = EXCLUDED.agent_name,
         agent_uuid = EXCLUDED.agent_uuid,
         owner_avatar_uuid = EXCLUDED.owner_avatar_uuid,
         shared_secret_hash = CASE WHEN $26 THEN EXCLUDED.shared_secret_hash
                                   ELSE second_life_bridge_settings.shared_secret_hash END,
         home_region = EXCLUDED.home_region,
         home_coordinates_json = EXCLUDED.home_coordinates_json,
         wander_radius_meters = EXCLUDED.wander_radius_meters,
         local_chat_enabled = EXCLUDED.local_chat_enabled,
         stranger_replies_enabled = EXCLUDED.stranger_replies_enabled,
         autonomy_enabled = EXCLUDED.autonomy_enabled,
         discovery_enabled = EXCLUDED.discovery_enabled,
         initiative_enabled = EXCLUDED.initiative_enabled,
         outfits_enabled = EXCLUDED.outfits_enabled,
         landmarks_enabled = EXCLUDED.landmarks_enabled,
         object_interaction_enabled = EXCLUDED.object_interaction_enabled,
         furniture_interaction_enabled = EXCLUDED.furniture_interaction_enabled,
         dance_pad_interaction_enabled = EXCLUDED.dance_pad_interaction_enabled,
         quiet_hours_start = EXCLUDED.quiet_hours_start,
         quiet_hours_end = EXCLUDED.quiet_hours_end,
         max_local_replies_per_10_min = EXCLUDED.max_local_replies_per_10_min,
         max_stranger_replies_per_30_min = EXCLUDED.max_stranger_replies_per_30_min,
         privacy_guard_enabled = EXCLUDED.privacy_guard_enabled,
         autonomy_paused = EXCLUDED.autonomy_paused,
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        Boolean(settings.enabled),
        String(settings.agentName || ""),
        String(settings.agentUuid || ""),
        String(settings.ownerAvatarUuid || ""),
        secretHash,
        String(settings.homeRegion || ""),
        JSON.stringify(settings.homeCoordinates || {}),
        Number(settings.wanderRadiusMeters ?? 0),
        Boolean(settings.localChatEnabled),
        Boolean(settings.strangerRepliesEnabled),
        Boolean(settings.autonomyEnabled),
        Boolean(settings.discoveryEnabled),
        Boolean(settings.initiativeEnabled),
        Boolean(settings.outfitsEnabled),
        Boolean(settings.landmarksEnabled),
        Boolean(settings.objectInteractionEnabled),
        Boolean(settings.furnitureInteractionEnabled),
        Boolean(settings.dancePadInteractionEnabled),
        String(settings.quietHoursStart || ""),
        String(settings.quietHoursEnd || ""),
        Number(settings.maxLocalRepliesPer10Min ?? 0),
        Number(settings.maxStrangerRepliesPer30Min ?? 0),
        settings.privacyGuardEnabled === false ? false : true,
        Boolean(settings.autonomyPaused),
        rewriteSecret,
      ],
    );
    return mapBridgeSettingsRow(rows[0]);
  }

  async function getStoreSummary({ companionId }) {
    if (!available) {
      return { available: false };
    }
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM second_life_avatar_relationships WHERE companion_id = $1) AS relationships,
         (SELECT COUNT(*)::int FROM second_life_outfits WHERE companion_id = $1) AS outfits,
         (SELECT COUNT(*)::int FROM second_life_landmarks WHERE companion_id = $1) AS landmarks,
         (SELECT COUNT(*)::int FROM second_life_objects WHERE companion_id = $1) AS objects,
         (SELECT COUNT(*)::int FROM second_life_commands WHERE companion_id = $1) AS commands,
         (SELECT COUNT(*)::int FROM second_life_command_queue WHERE companion_id = $1) AS queued,
         (SELECT COUNT(*)::int FROM companion_daily_schedule WHERE companion_id = $1) AS schedule`,
      [companionId],
    );
    return {
      available: true,
      relationships: rows[0]?.relationships || 0,
      outfits: rows[0]?.outfits || 0,
      landmarks: rows[0]?.landmarks || 0,
      objects: rows[0]?.objects || 0,
      commands: rows[0]?.commands || 0,
      queued: rows[0]?.queued || 0,
      schedule: rows[0]?.schedule || 0,
    };
  }

  // ─── Stage 2 accessors ────────────────────────────────────────────────────

  function mapRelationshipRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      avatarUuid: row.avatar_uuid,
      avatarName: row.avatar_name || "",
      relationshipType: row.relationship_type || "stranger",
      displayLabel: row.display_label || "",
      isOwner: Boolean(row.is_owner),
      isFamily: Boolean(row.is_family),
      isFriend: Boolean(row.is_friend),
      isTrusted: Boolean(row.is_trusted),
      isBlocked: Boolean(row.is_blocked),
      chatPermission: Boolean(row.chat_permission),
      followPermission: Boolean(row.follow_permission),
      privateMemoryPermission: Boolean(row.private_memory_permission),
      notes: row.notes || "",
      // Phase 21 — identity registry fields
      nickname: row.nickname || "",
      category: row.category || "",
      relationshipToUser: row.relationship_to_user || "",
      relationshipToCompanion: row.relationship_to_companion || "",
      replyPolicy: row.reply_policy || "allowed_if_mentioned",
      alwaysRespond: Boolean(row.always_respond),
      neverRespond: Boolean(row.never_respond),
      childSafeOnly: Boolean(row.child_safe_only),
      publicIdentityContextEnabled: row.public_identity_context_enabled == null ? true : Boolean(row.public_identity_context_enabled),
      localChatChatterEnabled: row.local_chat_chatter_enabled == null ? true : Boolean(row.local_chat_chatter_enabled),
      minSecondsBetweenReplies: Number(row.min_seconds_between_replies || 0),
      // Identity-mapping fields (alternate-avatar support)
      preferredDisplayName: row.preferred_display_name || "",
      identityNote: row.identity_note || "",
      lastReplyAt: row.last_reply_at || null,
      firstSeenAt: row.first_seen_at || null,
      lastSeenAt: row.last_seen_at || null,
      messageCount: Number(row.message_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapObjectRelationshipRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      objectUuid: row.object_uuid || "",
      objectName: row.object_name || "",
      objectDescriptionToken: row.object_description_token || "",
      nickname: row.nickname || "",
      category: row.category || "",
      relationshipToUser: row.relationship_to_user || "",
      relationshipToCompanion: row.relationship_to_companion || "",
      trustLevel: row.trust_level || "known",
      replyPolicy: row.reply_policy || "ambient_only",
      privateChannelAllowed: Boolean(row.private_channel_allowed),
      childSafeOnly: Boolean(row.child_safe_only),
      alwaysRespond: Boolean(row.always_respond),
      neverRespond: Boolean(row.never_respond),
      publicIdentityContextEnabled: row.public_identity_context_enabled == null ? true : Boolean(row.public_identity_context_enabled),
      localChatChatterEnabled: row.local_chat_chatter_enabled == null ? true : Boolean(row.local_chat_chatter_enabled),
      minSecondsBetweenReplies: Number(row.min_seconds_between_replies || 180),
      notes: row.notes || "",
      firstSeenAt: row.first_seen_at || null,
      lastSeenAt: row.last_seen_at || null,
      lastReplyAt: row.last_reply_at || null,
      messageCount: Number(row.message_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapWorldStateRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      agentUuid: row.agent_uuid || "",
      currentRegion: row.current_region || "",
      currentParcel: row.current_parcel || "",
      currentCoordinates: row.current_coordinates_json || null,
      currentActivity: row.current_activity || "",
      currentOutfit: row.current_outfit || "",
      currentAnimation: row.current_animation || "",
      ownerPresent: Boolean(row.owner_present),
      nearbyAvatars: Array.isArray(row.nearby_avatars_json) ? row.nearby_avatars_json : [],
      nearbyObjects: Array.isArray(row.nearby_objects_json) ? row.nearby_objects_json : [],
      lastHeartbeatAt: row.last_heartbeat_at,
      updatedAt: row.updated_at,
    };
  }

  function mapCommandRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      agentUuid: row.agent_uuid || "",
      commandType: row.command_type,
      payload: row.payload_json || {},
      status: row.status,
      priority: Number(row.priority || 0),
      createdAt: row.created_at,
      availableAt: row.available_at,
      claimedAt: row.claimed_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      errorMessage: row.error_message || "",
      sourceEventId: row.source_event_id || "",
    };
  }

  function mapCommandDefinitionRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      commandTrigger: row.command_trigger,
      commandType: row.command_type || "custom",
      description: row.description || "",
      payload: row.payload_json || {},
      allowedRelationships: Array.isArray(row.allowed_relationships_json)
        ? row.allowed_relationships_json
        : [],
      requiresOwnerPermission: Boolean(row.requires_owner_permission),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapJournalRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      entryType: row.entry_type || "note",
      title: row.title || "",
      body: row.body || "",
      locationContext: row.location_context_json || null,
      peopleContext: Array.isArray(row.people_context_json) ? row.people_context_json : [],
      memoryRefs: Array.isArray(row.memory_refs_json) ? row.memory_refs_json : [],
      createdAt: row.created_at,
    };
  }

  /**
   * Constant-time comparison of a supplied plaintext secret against the stored
   * hash. Returns false when the bridge has no secret configured (you cannot
   * authenticate against an unset secret). The plaintext is never logged.
   */
  async function verifySharedSecret({ companionId, secret }) {
    if (!available) return false;
    const value = String(secret == null ? "" : secret);
    if (!value) return false;
    const { rows } = await pool.query(
      `SELECT shared_secret_hash FROM second_life_bridge_settings WHERE companion_id = $1 LIMIT 1`,
      [companionId],
    );
    const storedHash = rows[0]?.shared_secret_hash || "";
    if (!storedHash) return false;
    const candidate = hashSharedSecret(value);
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(storedHash, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * A relay/controller registers the agent UUID, name, owner UUID and marks the
   * bridge enabled. Seeds the world-state row so the dashboard has something to
   * show immediately. Never touches the shared secret.
   */
  async function registerAgent({ companionId, agentName, agentUuid, ownerAvatarUuid }) {
    if (!available) return null;
    // Upsert so the very first registration creates the settings row (all other
    // columns fall back to their schema defaults). On a re-register, only the
    // supplied identity fields are overwritten; existing config is preserved.
    const { rows } = await pool.query(
      `INSERT INTO second_life_bridge_settings (
         companion_id, enabled, agent_name, agent_uuid, owner_avatar_uuid, updated_at
       ) VALUES ($1, TRUE, $2, $3, $4, NOW())
       ON CONFLICT (companion_id) DO UPDATE SET
         enabled = TRUE,
         agent_name = COALESCE(NULLIF($2, ''), second_life_bridge_settings.agent_name),
         agent_uuid = COALESCE(NULLIF($3, ''), second_life_bridge_settings.agent_uuid),
         owner_avatar_uuid = COALESCE(NULLIF($4, ''), second_life_bridge_settings.owner_avatar_uuid),
         updated_at = NOW()
       RETURNING *`,
      [companionId, String(agentName || ""), String(agentUuid || ""), String(ownerAvatarUuid || "")],
    );
    await pool.query(
      `INSERT INTO second_life_world_state (companion_id, agent_uuid, last_heartbeat_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (companion_id) DO UPDATE SET
         agent_uuid = COALESCE(NULLIF(EXCLUDED.agent_uuid, ''), second_life_world_state.agent_uuid),
         last_heartbeat_at = NOW(),
         updated_at = NOW()`,
      [companionId, String(agentUuid || "")],
    );
    return mapBridgeSettingsRow(rows[0]);
  }

  async function recordHeartbeat({ companionId, agentUuid }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_world_state (companion_id, agent_uuid, last_heartbeat_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (companion_id) DO UPDATE SET
         agent_uuid = COALESCE(NULLIF(EXCLUDED.agent_uuid, ''), second_life_world_state.agent_uuid),
         last_heartbeat_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [companionId, String(agentUuid || "")],
    );
    return mapWorldStateRow(rows[0]);
  }

  async function loadWorldState({ companionId }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_world_state WHERE companion_id = $1 LIMIT 1`,
      [companionId],
    );
    return mapWorldStateRow(rows[0]);
  }

  /**
   * Patch the live world state. Only the supplied fields are written; everything
   * else is preserved. Used by location/scan/state events.
   */
  async function upsertWorldState({ companionId, patch = {} }) {
    if (!available) return null;
    const setMap = {
      agentUuid: "agent_uuid",
      currentRegion: "current_region",
      currentParcel: "current_parcel",
      currentActivity: "current_activity",
      currentOutfit: "current_outfit",
      currentAnimation: "current_animation",
    };
    const jsonMap = {
      currentCoordinates: "current_coordinates_json",
      nearbyAvatars: "nearby_avatars_json",
      nearbyObjects: "nearby_objects_json",
    };
    const cols = ["companion_id"];
    const placeholders = ["$1"];
    const values = [companionId];
    const updates = [];
    let i = 2;
    for (const [key, col] of Object.entries(setMap)) {
      if (patch[key] === undefined) continue;
      cols.push(col);
      placeholders.push(`$${i}`);
      values.push(String(patch[key] == null ? "" : patch[key]));
      updates.push(`${col} = EXCLUDED.${col}`);
      i += 1;
    }
    for (const [key, col] of Object.entries(jsonMap)) {
      if (patch[key] === undefined) continue;
      cols.push(col);
      placeholders.push(`$${i}::jsonb`);
      values.push(JSON.stringify(patch[key] == null ? (key === "currentCoordinates" ? {} : []) : patch[key]));
      updates.push(`${col} = EXCLUDED.${col}`);
      i += 1;
    }
    if (patch.ownerPresent !== undefined) {
      cols.push("owner_present");
      placeholders.push(`$${i}`);
      values.push(Boolean(patch.ownerPresent));
      updates.push("owner_present = EXCLUDED.owner_present");
      i += 1;
    }
    const { rows } = await pool.query(
      `INSERT INTO second_life_world_state (${cols.join(", ")}, updated_at)
       VALUES (${placeholders.join(", ")}, NOW())
       ON CONFLICT (companion_id) DO UPDATE SET
         ${[...updates, "updated_at = NOW()"].join(", ")}
       RETURNING *`,
      values,
    );
    return mapWorldStateRow(rows[0]);
  }

  async function getRelationshipByUuid({ companionId, avatarUuid }) {
    if (!available) return null;
    if (!avatarUuid) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_avatar_relationships
       WHERE companion_id = $1 AND avatar_uuid = $2 LIMIT 1`,
      [companionId, String(avatarUuid)],
    );
    return mapRelationshipRow(rows[0]);
  }

  async function listRelationships({ companionId, relationshipType } = {}) {
    if (!available) return [];
    const params = [companionId];
    let where = "companion_id = $1";
    if (relationshipType) {
      params.push(relationshipType);
      where += " AND relationship_type = $2";
    }
    const { rows } = await pool.query(
      `SELECT * FROM second_life_avatar_relationships WHERE ${where} ORDER BY avatar_name ASC`,
      params,
    );
    return rows.map(mapRelationshipRow);
  }

  /**
   * Create or update a relationship by (companionId, avatarUuid). UUID is the
   * source of truth; display name is weak metadata. The relationship_type label
   * plus the role booleans are stored as supplied so the resolver can derive a
   * single canonical tier. Empty/omitted fields fall back to the existing row.
   * Phase 21 adds the identity registry fields (nickname, category, replyPolicy, etc.).
   */
  async function upsertRelationship({
    companionId,
    avatarUuid,
    avatarName = "",
    relationshipType = "stranger",
    displayLabel = "",
    isOwner = false,
    isFamily = false,
    isFriend = false,
    isTrusted = false,
    isBlocked = false,
    chatPermission = true,
    followPermission = false,
    privateMemoryPermission = false,
    notes = "",
    // Phase 21 identity registry fields
    nickname = "",
    category = "",
    relationshipToUser = "",
    relationshipToCompanion = "",
    replyPolicy = "allowed_if_mentioned",
    alwaysRespond = false,
    neverRespond = false,
    childSafeOnly = false,
    publicIdentityContextEnabled = true,
    localChatChatterEnabled = true,
    minSecondsBetweenReplies = 0,
    // Identity-mapping fields (alternate-avatar support)
    preferredDisplayName = "",
    identityNote = "",
  }) {
    if (!available) return null;
    if (!avatarUuid) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_avatar_relationships
         (companion_id, avatar_uuid, avatar_name, relationship_type, display_label,
          is_owner, is_family, is_friend, is_trusted, is_blocked,
          chat_permission, follow_permission, private_memory_permission, notes,
          nickname, category, relationship_to_user, relationship_to_companion,
          reply_policy, always_respond, never_respond, child_safe_only,
          public_identity_context_enabled, local_chat_chatter_enabled, min_seconds_between_replies,
          preferred_display_name, identity_note,
          updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW())
       ON CONFLICT (companion_id, avatar_uuid) DO UPDATE SET
         avatar_name = COALESCE(NULLIF(EXCLUDED.avatar_name, ''), second_life_avatar_relationships.avatar_name),
         relationship_type = EXCLUDED.relationship_type,
         display_label = EXCLUDED.display_label,
         is_owner = EXCLUDED.is_owner,
         is_family = EXCLUDED.is_family,
         is_friend = EXCLUDED.is_friend,
         is_trusted = EXCLUDED.is_trusted,
         is_blocked = EXCLUDED.is_blocked,
         chat_permission = EXCLUDED.chat_permission,
         follow_permission = EXCLUDED.follow_permission,
         private_memory_permission = EXCLUDED.private_memory_permission,
         notes = EXCLUDED.notes,
         nickname = EXCLUDED.nickname,
         category = EXCLUDED.category,
         relationship_to_user = EXCLUDED.relationship_to_user,
         relationship_to_companion = EXCLUDED.relationship_to_companion,
         reply_policy = EXCLUDED.reply_policy,
         always_respond = EXCLUDED.always_respond,
         never_respond = EXCLUDED.never_respond,
         child_safe_only = EXCLUDED.child_safe_only,
         public_identity_context_enabled = EXCLUDED.public_identity_context_enabled,
         local_chat_chatter_enabled = EXCLUDED.local_chat_chatter_enabled,
         min_seconds_between_replies = EXCLUDED.min_seconds_between_replies,
         preferred_display_name = EXCLUDED.preferred_display_name,
         identity_note = EXCLUDED.identity_note,
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        String(avatarUuid),
        String(avatarName || ""),
        String(relationshipType || "stranger"),
        String(displayLabel || ""),
        Boolean(isOwner),
        Boolean(isFamily),
        Boolean(isFriend),
        Boolean(isTrusted),
        Boolean(isBlocked),
        Boolean(chatPermission),
        Boolean(followPermission),
        Boolean(privateMemoryPermission),
        String(notes || ""),
        String(nickname || ""),
        String(category || ""),
        String(relationshipToUser || ""),
        String(relationshipToCompanion || ""),
        String(replyPolicy || "allowed_if_mentioned"),
        Boolean(alwaysRespond),
        Boolean(neverRespond),
        Boolean(childSafeOnly),
        publicIdentityContextEnabled === false ? false : true,
        localChatChatterEnabled === false ? false : true,
        Number(minSecondsBetweenReplies || 0),
        String(preferredDisplayName || ""),
        String(identityNote || ""),
      ],
    );
    return mapRelationshipRow(rows[0]);
  }

  async function deleteRelationship({ companionId, avatarUuid }) {
    if (!available) return false;
    if (!avatarUuid) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_avatar_relationships
       WHERE companion_id = $1 AND avatar_uuid = $2`,
      [companionId, String(avatarUuid)],
    );
    return rowCount > 0;
  }

  // ─── Phase 21 — avatar seen/reply tracking ───────────────────────────────

  async function markRelationshipSeen({ companionId, avatarUuid, avatarName = "" }) {
    if (!available || !avatarUuid) return null;
    try {
      const { rows } = await pool.query(
        `INSERT INTO second_life_avatar_relationships
           (companion_id, avatar_uuid, avatar_name, first_seen_at, last_seen_at, message_count, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW(), 1, NOW())
         ON CONFLICT (companion_id, avatar_uuid) DO UPDATE SET
           avatar_name = COALESCE(NULLIF(EXCLUDED.avatar_name, ''), second_life_avatar_relationships.avatar_name),
           first_seen_at = COALESCE(second_life_avatar_relationships.first_seen_at, NOW()),
           last_seen_at = NOW(),
           message_count = second_life_avatar_relationships.message_count + 1,
           updated_at = NOW()
         RETURNING *`,
        [companionId, String(avatarUuid), String(avatarName || "")],
      );
      return mapRelationshipRow(rows[0]);
    } catch {
      return null;
    }
  }

  async function recordRelationshipReply({ companionId, avatarUuid }) {
    if (!available || !avatarUuid) return null;
    try {
      const { rows } = await pool.query(
        `UPDATE second_life_avatar_relationships
           SET last_reply_at = NOW(), updated_at = NOW()
         WHERE companion_id = $1 AND avatar_uuid = $2
         RETURNING *`,
        [companionId, String(avatarUuid)],
      );
      return mapRelationshipRow(rows[0]);
    } catch {
      return null;
    }
  }

  // ─── Phase 21 — object relationship accessors ────────────────────────────

  async function getObjectRelationshipByUuid({ companionId, objectUuid }) {
    if (!available || !objectUuid) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_object_relationships
       WHERE companion_id = $1 AND object_uuid = $2 LIMIT 1`,
      [companionId, String(objectUuid)],
    );
    return mapObjectRelationshipRow(rows[0]);
  }

  async function getObjectRelationshipByDescriptionToken({ companionId, objectDescription }) {
    if (!available || !objectDescription) return null;
    const desc = String(objectDescription);
    const { rows } = await pool.query(
      `SELECT * FROM second_life_object_relationships
       WHERE companion_id = $1
         AND object_description_token <> ''
         AND $2 LIKE '%' || object_description_token || '%'
       LIMIT 1`,
      [companionId, desc],
    );
    return mapObjectRelationshipRow(rows[0]);
  }

  async function listObjectRelationships({ companionId } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM second_life_object_relationships
       WHERE companion_id = $1
       ORDER BY nickname ASC, object_name ASC`,
      [companionId],
    );
    return rows.map(mapObjectRelationshipRow);
  }

  async function upsertObjectRelationship({
    companionId,
    objectUuid = "",
    objectName = "",
    objectDescriptionToken = "",
    nickname = "",
    category = "",
    relationshipToUser = "",
    relationshipToCompanion = "",
    trustLevel = "known",
    replyPolicy = "ambient_only",
    privateChannelAllowed = false,
    childSafeOnly = false,
    alwaysRespond = false,
    neverRespond = false,
    publicIdentityContextEnabled = true,
    localChatChatterEnabled = true,
    minSecondsBetweenReplies = 180,
    notes = "",
  }) {
    if (!available) return null;
    if (!objectUuid && !objectDescriptionToken && !objectName) return null;

    // Use (companionId, objectDescriptionToken) or (companionId, objectUuid) as the merge key.
    // If objectDescriptionToken is set, try to match on that first.
    if (objectDescriptionToken) {
      const existing = await getObjectRelationshipByDescriptionToken({ companionId, objectDescription: objectDescriptionToken });
      if (existing) {
        const { rows } = await pool.query(
          `UPDATE second_life_object_relationships SET
             object_uuid = COALESCE(NULLIF($3, ''), object_uuid),
             object_name = COALESCE(NULLIF($4, ''), object_name),
             object_description_token = $5,
             nickname = $6, category = $7,
             relationship_to_user = $8, relationship_to_companion = $9,
             trust_level = $10, reply_policy = $11,
             private_channel_allowed = $12, child_safe_only = $13,
             always_respond = $14, never_respond = $15,
             public_identity_context_enabled = $16, local_chat_chatter_enabled = $17,
             min_seconds_between_replies = $18, notes = $19,
             updated_at = NOW()
           WHERE companion_id = $1 AND id = $2
           RETURNING *`,
          [
            companionId, existing.id,
            String(objectUuid || ""), String(objectName || ""),
            String(objectDescriptionToken),
            String(nickname || ""), String(category || ""),
            String(relationshipToUser || ""), String(relationshipToCompanion || ""),
            String(trustLevel || "known"), String(replyPolicy || "ambient_only"),
            Boolean(privateChannelAllowed), Boolean(childSafeOnly),
            Boolean(alwaysRespond), Boolean(neverRespond),
            publicIdentityContextEnabled === false ? false : true,
            localChatChatterEnabled === false ? false : true,
            Number(minSecondsBetweenReplies || 180),
            String(notes || ""),
          ],
        );
        return mapObjectRelationshipRow(rows[0]);
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO second_life_object_relationships
         (companion_id, object_uuid, object_name, object_description_token,
          nickname, category, relationship_to_user, relationship_to_companion,
          trust_level, reply_policy, private_channel_allowed, child_safe_only,
          always_respond, never_respond, public_identity_context_enabled,
          local_chat_chatter_enabled, min_seconds_between_replies, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
       RETURNING *`,
      [
        companionId,
        String(objectUuid || ""), String(objectName || ""),
        String(objectDescriptionToken || ""),
        String(nickname || ""), String(category || ""),
        String(relationshipToUser || ""), String(relationshipToCompanion || ""),
        String(trustLevel || "known"), String(replyPolicy || "ambient_only"),
        Boolean(privateChannelAllowed), Boolean(childSafeOnly),
        Boolean(alwaysRespond), Boolean(neverRespond),
        publicIdentityContextEnabled === false ? false : true,
        localChatChatterEnabled === false ? false : true,
        Number(minSecondsBetweenReplies || 180),
        String(notes || ""),
      ],
    );
    return mapObjectRelationshipRow(rows[0]);
  }

  async function deleteObjectRelationship({ companionId, id }) {
    if (!available || !id) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_object_relationships WHERE companion_id = $1 AND id = $2`,
      [companionId, Number(id)],
    );
    return rowCount > 0;
  }

  async function markObjectRelationshipSeen({ companionId, objectUuid = "", objectName = "", objectDescriptionToken = "" }) {
    if (!available) return null;
    if (!objectUuid && !objectDescriptionToken) return null;
    try {
      const existing = objectUuid
        ? await getObjectRelationshipByUuid({ companionId, objectUuid })
        : objectDescriptionToken
          ? await getObjectRelationshipByDescriptionToken({ companionId, objectDescription: objectDescriptionToken })
          : null;
      if (!existing) return null;
      const { rows } = await pool.query(
        `UPDATE second_life_object_relationships SET
           object_name = COALESCE(NULLIF($3, ''), object_name),
           first_seen_at = COALESCE(first_seen_at, NOW()),
           last_seen_at = NOW(),
           message_count = message_count + 1,
           updated_at = NOW()
         WHERE companion_id = $1 AND id = $2
         RETURNING *`,
        [companionId, existing.id, String(objectName || "")],
      );
      return mapObjectRelationshipRow(rows[0]);
    } catch {
      return null;
    }
  }

  async function recordObjectRelationshipReply({ companionId, objectUuid = "", objectDescriptionToken = "" }) {
    if (!available) return null;
    if (!objectUuid && !objectDescriptionToken) return null;
    try {
      const existing = objectUuid
        ? await getObjectRelationshipByUuid({ companionId, objectUuid })
        : await getObjectRelationshipByDescriptionToken({ companionId, objectDescription: objectDescriptionToken });
      if (!existing) return null;
      const { rows } = await pool.query(
        `UPDATE second_life_object_relationships
           SET last_reply_at = NOW(), updated_at = NOW()
         WHERE companion_id = $1 AND id = $2
         RETURNING *`,
        [companionId, existing.id],
      );
      return mapObjectRelationshipRow(rows[0]);
    } catch {
      return null;
    }
  }

  async function listCommandDefinitions({ companionId } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM second_life_commands WHERE companion_id = $1
       ORDER BY command_trigger ASC`,
      [companionId],
    );
    return rows.map(mapCommandDefinitionRow);
  }

  async function getCommandDefinitionByTrigger({ companionId, trigger }) {
    if (!available) return null;
    if (!trigger) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_commands
       WHERE companion_id = $1 AND command_trigger = $2 LIMIT 1`,
      [companionId, String(trigger)],
    );
    return mapCommandDefinitionRow(rows[0]);
  }

  /**
   * Create or update a command definition by (companionId, command_trigger).
   * Used by the dashboard command-registry editor and the default-command seeder.
   */
  async function upsertCommandDefinition({
    companionId,
    commandTrigger,
    commandType = "custom",
    description = "",
    payload = {},
    allowedRelationships = [],
    requiresOwnerPermission = false,
    enabled = true,
  }) {
    if (!available) return null;
    if (!commandTrigger) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_commands
         (companion_id, command_trigger, command_type, description, payload_json,
          allowed_relationships_json, requires_owner_permission, enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8, NOW())
       ON CONFLICT (companion_id, command_trigger) DO UPDATE SET
         command_type = EXCLUDED.command_type,
         description = EXCLUDED.description,
         payload_json = EXCLUDED.payload_json,
         allowed_relationships_json = EXCLUDED.allowed_relationships_json,
         requires_owner_permission = EXCLUDED.requires_owner_permission,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        String(commandTrigger),
        String(commandType || "custom"),
        String(description || ""),
        JSON.stringify(payload || {}),
        JSON.stringify(Array.isArray(allowedRelationships) ? allowedRelationships : []),
        Boolean(requiresOwnerPermission),
        Boolean(enabled),
      ],
    );
    return mapCommandDefinitionRow(rows[0]);
  }

  async function deleteCommandDefinition({ companionId, commandTrigger }) {
    if (!available) return false;
    if (!commandTrigger) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_commands
       WHERE companion_id = $1 AND command_trigger = $2`,
      [companionId, String(commandTrigger)],
    );
    return rowCount > 0;
  }

  /**
   * Idempotently seed the spec's default command set. Existing triggers are left
   * untouched (ON CONFLICT DO NOTHING) so owner edits survive a restart. Returns
   * the count of newly inserted rows.
   */
  async function seedDefaultCommands({ companionId, defaults = [] }) {
    if (!available) return 0;
    if (!Array.isArray(defaults) || defaults.length === 0) return 0;
    let inserted = 0;
    for (const def of defaults) {
      if (!def || !def.commandTrigger) continue;
      const { rowCount } = await pool.query(
        `INSERT INTO second_life_commands
           (companion_id, command_trigger, command_type, description, payload_json,
            allowed_relationships_json, requires_owner_permission, enabled)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
         ON CONFLICT (companion_id, command_trigger) DO NOTHING`,
        [
          companionId,
          String(def.commandTrigger),
          String(def.commandType || "custom"),
          String(def.description || ""),
          JSON.stringify(def.payload || {}),
          JSON.stringify(Array.isArray(def.allowedRelationships) ? def.allowedRelationships : []),
          Boolean(def.requiresOwnerPermission),
          def.enabled === undefined ? true : Boolean(def.enabled),
        ],
      );
      inserted += rowCount || 0;
    }
    return inserted;
  }

  async function enqueueCommand({ companionId, agentUuid, commandType, payload = {}, priority = 0, sourceEventId = "" }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_command_queue
         (companion_id, agent_uuid, command_type, payload_json, status, priority, source_event_id)
       VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $6)
       RETURNING *`,
      [companionId, String(agentUuid || ""), String(commandType), JSON.stringify(payload || {}), Number(priority || 0), String(sourceEventId || "")],
    );
    return mapCommandRow(rows[0]);
  }

  /**
   * Atomically claim up to `limit` pending, available commands (highest priority,
   * oldest first) and mark them claimed so a second poll cannot re-dispatch them.
   */
  async function claimPendingCommands({ companionId, agentUuid, limit = 20 }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `UPDATE second_life_command_queue SET status = 'claimed', claimed_at = NOW(),
         agent_uuid = COALESCE(NULLIF($2, ''), agent_uuid)
       WHERE id IN (
         SELECT id FROM second_life_command_queue
         WHERE companion_id = $1 AND status = 'pending' AND available_at <= NOW()
         ORDER BY priority DESC, available_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [companionId, String(agentUuid || ""), Number(limit) || 20],
    );
    return rows.map(mapCommandRow);
  }

  async function markCommandResult({ companionId, commandId, status, errorMessage = "" }) {
    if (!available) return null;
    const normalized = status === "completed" ? "completed" : "failed";
    const { rows } = await pool.query(
      `UPDATE second_life_command_queue SET
         status = $3,
         completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
         failed_at = CASE WHEN $3 = 'failed' THEN NOW() ELSE failed_at END,
         error_message = $4
       WHERE companion_id = $1 AND id = $2
       RETURNING *`,
      [companionId, String(commandId), normalized, String(errorMessage || "")],
    );
    return mapCommandRow(rows[0]);
  }

  /**
   * Phase 20 — clear the pending command queue (owner "clear command queue" /
   * emergency stop). Only removes not-yet-claimed commands so an in-flight
   * dispatch is never corrupted. Returns the number removed; safe with no DB.
   */
  async function clearPendingCommands({ companionId }) {
    if (!available) return 0;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_command_queue WHERE companion_id = $1 AND status = 'pending'`,
      [companionId],
    );
    return rowCount || 0;
  }

  /**
   * Phase 20 — owner "CLEAR COMMAND QUEUE" / emergency stop. Thin alias over
   * clearPendingCommands so the safety controls have a clearly-named entry point.
   * Returns the number of pending commands removed; safe (0) with no DB.
   */
  async function clearCommandQueue({ companionId }) {
    return clearPendingCommands({ companionId });
  }

  /**
   * Phase 20 — runtime autonomy kill-switch. Pauses (or resumes) autonomous
   * behaviour by flipping the autonomy_paused flag without touching any other
   * bridge setting. No-ops safely (null) when there is no database.
   */
  async function setAutonomyPaused({ companionId, paused = true }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `UPDATE second_life_bridge_settings
         SET autonomy_paused = $2, updated_at = NOW()
       WHERE companion_id = $1
       RETURNING *`,
      [companionId, Boolean(paused)],
    );
    return mapBridgeSettingsRow(rows[0]);
  }

  /**
   * Phase 20 — owner "BLOCK AVATAR" safety control. Sets (or clears) the blocked
   * relationship flag for an avatar UUID, creating the relationship row if it
   * does not exist yet. Blocking also revokes chat permission. UUID is the source
   * of truth. No-ops safely (null) when there is no database or no UUID.
   */
  async function blockAvatar({ companionId, avatarUuid, blocked = true }) {
    if (!available) return null;
    if (!avatarUuid) return null;
    const isBlocked = Boolean(blocked);
    const { rows } = await pool.query(
      `INSERT INTO second_life_avatar_relationships
         (companion_id, avatar_uuid, relationship_type, is_blocked, chat_permission, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (companion_id, avatar_uuid) DO UPDATE SET
         is_blocked = EXCLUDED.is_blocked,
         relationship_type = CASE WHEN $4 THEN 'blocked'
                                  ELSE second_life_avatar_relationships.relationship_type END,
         chat_permission = CASE WHEN $4 THEN FALSE
                                ELSE second_life_avatar_relationships.chat_permission END,
         updated_at = NOW()
       RETURNING *`,
      [companionId, String(avatarUuid), isBlocked ? "blocked" : "stranger", isBlocked, !isBlocked],
    );
    return mapRelationshipRow(rows[0]);
  }

  async function appendJournalEntry({ companionId, entryType = "note", title = "", body = "", locationContext = null, peopleContext = [], memoryRefs = [] }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_life_journal
         (companion_id, entry_type, title, body, location_context_json, people_context_json, memory_refs_json)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       RETURNING *`,
      [
        companionId,
        String(entryType || "note"),
        String(title || ""),
        String(body || ""),
        JSON.stringify(locationContext || {}),
        JSON.stringify(Array.isArray(peopleContext) ? peopleContext : []),
        JSON.stringify(Array.isArray(memoryRefs) ? memoryRefs : []),
      ],
    );
    return mapJournalRow(rows[0]);
  }

  async function listRecentJournal({ companionId, entryType, limit = 20 } = {}) {
    if (!available) return [];
    const params = [companionId];
    let where = "companion_id = $1";
    if (entryType) {
      params.push(entryType);
      where += ` AND entry_type = $${params.length}`;
    }
    params.push(Number(limit) || 20);
    const { rows } = await pool.query(
      `SELECT * FROM second_life_life_journal WHERE ${where}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapJournalRow);
  }

  async function upsertObject({ companionId, objectUuid, objectName, objectType, region, coordinates, roomLabel, useType, allowedActions, requiresOwnerPermission }) {
    if (!available) return null;
    if (!objectUuid) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_objects
         (companion_id, object_uuid, object_name, object_type, region, coordinates_json,
          room_label, use_type, allowed_actions_json, requires_owner_permission, last_seen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, NOW(), NOW())
       ON CONFLICT (companion_id, object_uuid) DO UPDATE SET
         object_name = COALESCE(NULLIF(EXCLUDED.object_name, ''), second_life_objects.object_name),
         object_type = COALESCE(NULLIF(EXCLUDED.object_type, ''), second_life_objects.object_type),
         region = COALESCE(NULLIF(EXCLUDED.region, ''), second_life_objects.region),
         coordinates_json = EXCLUDED.coordinates_json,
         room_label = COALESCE(NULLIF(EXCLUDED.room_label, ''), second_life_objects.room_label),
         use_type = COALESCE(NULLIF(EXCLUDED.use_type, ''), second_life_objects.use_type),
         allowed_actions_json = EXCLUDED.allowed_actions_json,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        String(objectUuid),
        String(objectName || ""),
        String(objectType || "custom"),
        String(region || ""),
        JSON.stringify(coordinates || {}),
        String(roomLabel || ""),
        String(useType || "custom"),
        JSON.stringify(Array.isArray(allowedActions) ? allowedActions : []),
        Boolean(requiresOwnerPermission),
      ],
    );
    return rows[0] ? { id: String(rows[0].id), objectUuid: rows[0].object_uuid } : null;
  }

  // ─── Stage 4 maps (outfits, landmarks, objects) ──────────────────────────
  function mapOutfitRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      trigger: row.trigger,
      outfitName: row.outfit_name || "",
      description: row.description || "",
      contextTags: Array.isArray(row.context_tags_json) ? row.context_tags_json : [],
      requiresOwnerPermission: Boolean(row.requires_owner_permission),
      isDefault: Boolean(row.is_default),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapLandmarkRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      trigger: row.trigger,
      name: row.name || "",
      region: row.region || "",
      coordinates: row.coordinates_json || null,
      description: row.description || "",
      tags: Array.isArray(row.tags_json) ? row.tags_json : [],
      favoriteScore: Number(row.favorite_score || 0),
      isHome: Boolean(row.is_home),
      isPrivate: Boolean(row.is_private),
      allowedRelationships: Array.isArray(row.allowed_relationships_json) ? row.allowed_relationships_json : [],
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapObjectRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      objectUuid: row.object_uuid,
      objectName: row.object_name || "",
      objectType: row.object_type || "custom",
      region: row.region || "",
      coordinates: row.coordinates_json || null,
      roomLabel: row.room_label || "",
      useType: row.use_type || "custom",
      allowedActions: Array.isArray(row.allowed_actions_json) ? row.allowed_actions_json : [],
      requiresOwnerPermission: Boolean(row.requires_owner_permission),
      enabled: Boolean(row.enabled),
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Stage 4 — outfit registry (Phase 10) ────────────────────────────────
  async function listOutfits({ companionId } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM second_life_outfits WHERE companion_id = $1 ORDER BY trigger ASC`,
      [companionId],
    );
    return rows.map(mapOutfitRow);
  }

  async function getOutfitByTrigger({ companionId, trigger }) {
    if (!available) return null;
    if (!trigger) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_outfits WHERE companion_id = $1 AND trigger = $2 LIMIT 1`,
      [companionId, String(trigger)],
    );
    return mapOutfitRow(rows[0]);
  }

  async function upsertOutfit({
    companionId,
    trigger,
    outfitName = "",
    description = "",
    contextTags = [],
    requiresOwnerPermission = false,
    isDefault = false,
    enabled = true,
  }) {
    if (!available) return null;
    if (!trigger) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_outfits
         (companion_id, trigger, outfit_name, description, context_tags_json,
          requires_owner_permission, is_default, enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8, NOW())
       ON CONFLICT (companion_id, trigger) DO UPDATE SET
         outfit_name = EXCLUDED.outfit_name,
         description = EXCLUDED.description,
         context_tags_json = EXCLUDED.context_tags_json,
         requires_owner_permission = EXCLUDED.requires_owner_permission,
         is_default = EXCLUDED.is_default,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        String(trigger),
        String(outfitName || ""),
        String(description || ""),
        JSON.stringify(Array.isArray(contextTags) ? contextTags : []),
        Boolean(requiresOwnerPermission),
        Boolean(isDefault),
        Boolean(enabled),
      ],
    );
    return mapOutfitRow(rows[0]);
  }

  async function deleteOutfit({ companionId, trigger }) {
    if (!available) return false;
    if (!trigger) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_outfits WHERE companion_id = $1 AND trigger = $2`,
      [companionId, String(trigger)],
    );
    return rowCount > 0;
  }

  /**
   * Idempotently seed the generic default outfit set (one per spec context).
   * Existing triggers are left untouched (ON CONFLICT DO NOTHING) so owner edits
   * survive a restart. Returns the count of newly inserted rows.
   */
  async function seedDefaultOutfits({ companionId, defaults = [] }) {
    if (!available) return 0;
    if (!Array.isArray(defaults) || defaults.length === 0) return 0;
    let inserted = 0;
    for (const def of defaults) {
      if (!def || !def.trigger) continue;
      const { rowCount } = await pool.query(
        `INSERT INTO second_life_outfits
           (companion_id, trigger, outfit_name, description, context_tags_json,
            requires_owner_permission, is_default, enabled)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
         ON CONFLICT (companion_id, trigger) DO NOTHING`,
        [
          companionId,
          String(def.trigger),
          String(def.outfitName || ""),
          String(def.description || ""),
          JSON.stringify(Array.isArray(def.contextTags) ? def.contextTags : []),
          Boolean(def.requiresOwnerPermission),
          def.isDefault === undefined ? true : Boolean(def.isDefault),
          def.enabled === undefined ? true : Boolean(def.enabled),
        ],
      );
      inserted += rowCount || 0;
    }
    return inserted;
  }

  // ─── Stage 4 — landmark registry (Phase 11) ──────────────────────────────
  async function listLandmarks({ companionId } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM second_life_landmarks WHERE companion_id = $1
       ORDER BY favorite_score DESC, trigger ASC`,
      [companionId],
    );
    return rows.map(mapLandmarkRow);
  }

  async function getLandmarkByTrigger({ companionId, trigger }) {
    if (!available) return null;
    if (!trigger) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_landmarks WHERE companion_id = $1 AND trigger = $2 LIMIT 1`,
      [companionId, String(trigger)],
    );
    return mapLandmarkRow(rows[0]);
  }

  async function getHomeLandmark({ companionId }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_landmarks
       WHERE companion_id = $1 AND is_home = TRUE AND enabled = TRUE
       ORDER BY favorite_score DESC LIMIT 1`,
      [companionId],
    );
    return mapLandmarkRow(rows[0]);
  }

  async function upsertLandmark({
    companionId,
    trigger,
    name = "",
    region = "",
    coordinates = {},
    description = "",
    tags = [],
    favoriteScore = 0,
    isHome = false,
    isPrivate = false,
    allowedRelationships = [],
    enabled = true,
  }) {
    if (!available) return null;
    if (!trigger) return null;
    // A single home landmark: clear the flag on every other landmark first.
    if (Boolean(isHome)) {
      await pool.query(
        `UPDATE second_life_landmarks SET is_home = FALSE
         WHERE companion_id = $1 AND trigger <> $2`,
        [companionId, String(trigger)],
      );
    }
    const { rows } = await pool.query(
      `INSERT INTO second_life_landmarks
         (companion_id, trigger, name, region, coordinates_json, description, tags_json,
          favorite_score, is_home, is_private, allowed_relationships_json, enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12, NOW())
       ON CONFLICT (companion_id, trigger) DO UPDATE SET
         name = EXCLUDED.name,
         region = EXCLUDED.region,
         coordinates_json = EXCLUDED.coordinates_json,
         description = EXCLUDED.description,
         tags_json = EXCLUDED.tags_json,
         favorite_score = EXCLUDED.favorite_score,
         is_home = EXCLUDED.is_home,
         is_private = EXCLUDED.is_private,
         allowed_relationships_json = EXCLUDED.allowed_relationships_json,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        String(trigger),
        String(name || ""),
        String(region || ""),
        JSON.stringify(coordinates || {}),
        String(description || ""),
        JSON.stringify(Array.isArray(tags) ? tags : []),
        Number(favoriteScore || 0),
        Boolean(isHome),
        Boolean(isPrivate),
        JSON.stringify(Array.isArray(allowedRelationships) ? allowedRelationships : []),
        Boolean(enabled),
      ],
    );
    return mapLandmarkRow(rows[0]);
  }

  async function deleteLandmark({ companionId, trigger }) {
    if (!available) return false;
    if (!trigger) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_landmarks WHERE companion_id = $1 AND trigger = $2`,
      [companionId, String(trigger)],
    );
    return rowCount > 0;
  }

  // ─── Stage 4 — object registry reads (Phase 12) ──────────────────────────
  async function listObjects({ companionId } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM second_life_objects WHERE companion_id = $1
       ORDER BY object_name ASC, object_uuid ASC`,
      [companionId],
    );
    return rows.map(mapObjectRow);
  }

  async function getObjectByUuid({ companionId, objectUuid }) {
    if (!available) return null;
    if (!objectUuid) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_objects WHERE companion_id = $1 AND object_uuid = $2 LIMIT 1`,
      [companionId, String(objectUuid)],
    );
    return mapObjectRow(rows[0]);
  }

  async function deleteObject({ companionId, objectUuid }) {
    if (!available) return false;
    if (!objectUuid) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_objects WHERE companion_id = $1 AND object_uuid = $2`,
      [companionId, String(objectUuid)],
    );
    return rowCount > 0;
  }

  /**
   * Find registered objects by a free-text name fragment, an exact use_type, or a
   * room label fragment. Used by the object-interaction engine to resolve natural
   * language references ("sit on the couch", "go to the bar") to a known object.
   */
  async function findObjects({ companionId, name = "", useType = "", roomLabel = "", limit = 10 } = {}) {
    if (!available) return [];
    const params = [companionId];
    let where = "companion_id = $1 AND enabled = TRUE";
    if (name) {
      params.push(`%${String(name).toLowerCase()}%`);
      const idx = params.length;
      where += ` AND (LOWER(object_name) LIKE $${idx} OR LOWER(use_type) LIKE $${idx} OR LOWER(object_type) LIKE $${idx} OR LOWER(room_label) LIKE $${idx})`;
    }
    if (useType) {
      params.push(String(useType).toLowerCase());
      where += ` AND LOWER(use_type) = $${params.length}`;
    }
    if (roomLabel) {
      params.push(`%${String(roomLabel).toLowerCase()}%`);
      where += ` AND LOWER(room_label) LIKE $${params.length}`;
    }
    params.push(Number(limit) || 10);
    const { rows } = await pool.query(
      `SELECT * FROM second_life_objects WHERE ${where} ORDER BY object_name ASC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapObjectRow);
  }

  /**
   * Count reply commands (say_local / send_im) queued within the last
   * `windowMinutes`, optionally restricted to a single avatar. Used by the
   * adapter to enforce the owner-configured local-chat reply rate limits.
   */
  async function countRecentReplies({ companionId, windowMinutes = 10, avatarUuid } = {}) {
    if (!available) return 0;
    const params = [companionId, Number(windowMinutes) || 10];
    let where = `companion_id = $1
      AND command_type IN ('say_local', 'send_im')
      AND created_at >= NOW() - ($2 || ' minutes')::interval`;
    if (avatarUuid) {
      params.push(String(avatarUuid));
      where += ` AND payload_json->>'avatarUuid' = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM second_life_command_queue WHERE ${where}`,
      params,
    );
    return rows[0]?.n || 0;
  }

  /**
   * One-shot read powering the dashboard status panels and GET /status. Combines
   * bridge settings, live world state, queue counts, and recent journal entries.
   */
  async function getBridgeStatus({ companionId }) {
    if (!available) {
      return { available: false };
    }
    const [settings, worldState, queueCounts, recentActions, recentErrors] = await Promise.all([
      loadBridgeSettings({ companionId }),
      loadWorldState({ companionId }),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'claimed')::int AS claimed,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM second_life_command_queue WHERE companion_id = $1`,
        [companionId],
      ),
      listRecentJournal({ companionId, entryType: "action", limit: 10 }),
      listRecentJournal({ companionId, entryType: "error", limit: 10 }),
    ]);
    const { rows: pendingRows } = await pool.query(
      `SELECT * FROM second_life_command_queue
       WHERE companion_id = $1 AND status IN ('pending', 'claimed')
       ORDER BY priority DESC, available_at ASC LIMIT 20`,
      [companionId],
    );
    return {
      available: true,
      enabled: Boolean(settings?.enabled),
      settings,
      worldState,
      queue: {
        pending: queueCounts.rows[0]?.pending || 0,
        claimed: queueCounts.rows[0]?.claimed || 0,
        completed: queueCounts.rows[0]?.completed || 0,
        failed: queueCounts.rows[0]?.failed || 0,
        items: pendingRows.map(mapCommandRow),
      },
      recentActions,
      recentErrors,
    };
  }

  // ─── Stage 5 — daily schedule (Phase 15) ─────────────────────────────────
  function mapScheduleRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      dayOfWeek: row.day_of_week || "",
      timeWindowStart: row.time_window_start || "",
      timeWindowEnd: row.time_window_end || "",
      activityType: row.activity_type || "",
      activityLabel: row.activity_label || "",
      allowedLocations: Array.isArray(row.allowed_locations_json) ? row.allowed_locations_json : [],
      autonomyLevel: row.autonomy_level || "medium",
      requiresOwnerPresent: Boolean(row.requires_owner_present),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function listSchedule({ companionId } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM companion_daily_schedule WHERE companion_id = $1
       ORDER BY day_of_week ASC, time_window_start ASC`,
      [companionId],
    );
    return rows.map(mapScheduleRow);
  }

  async function getScheduleEntry({ companionId, id }) {
    if (!available) return null;
    if (!id) return null;
    const { rows } = await pool.query(
      `SELECT * FROM companion_daily_schedule WHERE companion_id = $1 AND id = $2 LIMIT 1`,
      [companionId, Number(id)],
    );
    return mapScheduleRow(rows[0]);
  }

  async function upsertScheduleEntry({
    companionId,
    id = null,
    dayOfWeek = "",
    timeWindowStart = "",
    timeWindowEnd = "",
    activityType = "",
    activityLabel = "",
    allowedLocations = [],
    autonomyLevel = "medium",
    requiresOwnerPresent = false,
    enabled = true,
  }) {
    if (!available) return null;
    const locations = JSON.stringify(Array.isArray(allowedLocations) ? allowedLocations : []);
    if (id) {
      const { rows } = await pool.query(
        `UPDATE companion_daily_schedule SET
           day_of_week = $3,
           time_window_start = $4,
           time_window_end = $5,
           activity_type = $6,
           activity_label = $7,
           allowed_locations_json = $8::jsonb,
           autonomy_level = $9,
           requires_owner_present = $10,
           enabled = $11,
           updated_at = NOW()
         WHERE companion_id = $1 AND id = $2
         RETURNING *`,
        [
          companionId,
          Number(id),
          String(dayOfWeek || ""),
          String(timeWindowStart || ""),
          String(timeWindowEnd || ""),
          String(activityType || ""),
          String(activityLabel || ""),
          locations,
          String(autonomyLevel || "medium"),
          Boolean(requiresOwnerPresent),
          Boolean(enabled),
        ],
      );
      return mapScheduleRow(rows[0]);
    }
    const { rows } = await pool.query(
      `INSERT INTO companion_daily_schedule
         (companion_id, day_of_week, time_window_start, time_window_end, activity_type,
          activity_label, allowed_locations_json, autonomy_level, requires_owner_present, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       RETURNING *`,
      [
        companionId,
        String(dayOfWeek || ""),
        String(timeWindowStart || ""),
        String(timeWindowEnd || ""),
        String(activityType || ""),
        String(activityLabel || ""),
        locations,
        String(autonomyLevel || "medium"),
        Boolean(requiresOwnerPresent),
        Boolean(enabled),
      ],
    );
    return mapScheduleRow(rows[0]);
  }

  async function deleteScheduleEntry({ companionId, id }) {
    if (!available) return false;
    if (!id) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM companion_daily_schedule WHERE companion_id = $1 AND id = $2`,
      [companionId, Number(id)],
    );
    return rowCount > 0;
  }

  /**
   * Idempotently seed the generic default schedule templates. Only inserts when
   * the companion has no schedule rows yet, so owner edits are never overwritten.
   * Returns the count of newly inserted rows.
   */
  async function seedDefaultSchedule({ companionId, defaults = [] }) {
    if (!available) return 0;
    if (!Array.isArray(defaults) || defaults.length === 0) return 0;
    const { rows: existing } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM companion_daily_schedule WHERE companion_id = $1`,
      [companionId],
    );
    if ((existing[0]?.n || 0) > 0) return 0;
    let inserted = 0;
    for (const def of defaults) {
      if (!def) continue;
      const { rowCount } = await pool.query(
        `INSERT INTO companion_daily_schedule
           (companion_id, day_of_week, time_window_start, time_window_end, activity_type,
            activity_label, allowed_locations_json, autonomy_level, requires_owner_present, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [
          companionId,
          String(def.dayOfWeek || ""),
          String(def.timeWindowStart || ""),
          String(def.timeWindowEnd || ""),
          String(def.activityType || ""),
          String(def.activityLabel || ""),
          JSON.stringify(Array.isArray(def.allowedLocations) ? def.allowedLocations : []),
          String(def.autonomyLevel || "medium"),
          Boolean(def.requiresOwnerPresent),
          def.enabled === undefined ? true : Boolean(def.enabled),
        ],
      );
      inserted += rowCount || 0;
    }
    return inserted;
  }

  // ─── Stage 5 — discovery log (Phase 16) ──────────────────────────────────
  function mapDiscoveryRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      placeKey: row.place_key,
      name: row.name || "",
      region: row.region || "",
      coordinates: row.coordinates_json || null,
      source: row.source || "visited",
      visited: Boolean(row.visited),
      visitCount: Number(row.visit_count || 0),
      tags: Array.isArray(row.tags_json) ? row.tags_json : [],
      rating: Number(row.rating || 0),
      bookmarked: Boolean(row.bookmarked),
      isFavorite: Boolean(row.is_favorite),
      shared: Boolean(row.shared),
      notes: row.notes || "",
      firstVisitedAt: row.first_visited_at,
      lastVisitedAt: row.last_visited_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function listDiscoveries({ companionId, favoritesOnly = false, limit = 50 } = {}) {
    if (!available) return [];
    const params = [companionId];
    let where = "companion_id = $1";
    if (favoritesOnly) {
      where += " AND is_favorite = TRUE";
    }
    params.push(Number(limit) || 50);
    const { rows } = await pool.query(
      `SELECT * FROM second_life_discoveries WHERE ${where}
       ORDER BY is_favorite DESC, last_visited_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapDiscoveryRow);
  }

  async function getDiscovery({ companionId, placeKey }) {
    if (!available) return null;
    if (!placeKey) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_discoveries WHERE companion_id = $1 AND place_key = $2 LIMIT 1`,
      [companionId, String(placeKey)],
    );
    return mapDiscoveryRow(rows[0]);
  }

  /**
   * Record a REAL visit (or registered/imported place). On conflict the visit
   * count increments and last_visited_at advances. `visited` is forced TRUE here
   * because this accessor is only ever called for genuine places.
   */
  async function upsertDiscovery({
    companionId,
    placeKey,
    name = "",
    region = "",
    coordinates = {},
    source = "visited",
    tags = [],
  }) {
    if (!available) return null;
    if (!placeKey) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_discoveries
         (companion_id, place_key, name, region, coordinates_json, source, visited, visit_count, tags_json)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,TRUE,1,$7::jsonb)
       ON CONFLICT (companion_id, place_key) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), second_life_discoveries.name),
         region = COALESCE(NULLIF(EXCLUDED.region, ''), second_life_discoveries.region),
         coordinates_json = EXCLUDED.coordinates_json,
         source = EXCLUDED.source,
         visited = TRUE,
         visit_count = second_life_discoveries.visit_count + 1,
         tags_json = EXCLUDED.tags_json,
         last_visited_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        String(placeKey),
        String(name || ""),
        String(region || ""),
        JSON.stringify(coordinates || {}),
        String(source || "visited"),
        JSON.stringify(Array.isArray(tags) ? tags : []),
      ],
    );
    return mapDiscoveryRow(rows[0]);
  }

  async function setDiscoveryBookmark({ companionId, placeKey, bookmarked = true }) {
    if (!available) return null;
    if (!placeKey) return null;
    const { rows } = await pool.query(
      `UPDATE second_life_discoveries SET bookmarked = $3, updated_at = NOW()
       WHERE companion_id = $1 AND place_key = $2 RETURNING *`,
      [companionId, String(placeKey), Boolean(bookmarked)],
    );
    return mapDiscoveryRow(rows[0]);
  }

  async function setDiscoveryRating({ companionId, placeKey, rating = 0 }) {
    if (!available) return null;
    if (!placeKey) return null;
    const clamped = Math.max(0, Math.min(5, Number(rating) || 0));
    const { rows } = await pool.query(
      `UPDATE second_life_discoveries SET rating = $3, updated_at = NOW()
       WHERE companion_id = $1 AND place_key = $2 RETURNING *`,
      [companionId, String(placeKey), clamped],
    );
    return mapDiscoveryRow(rows[0]);
  }

  async function setDiscoveryFavorite({ companionId, placeKey, isFavorite = true }) {
    if (!available) return null;
    if (!placeKey) return null;
    const { rows } = await pool.query(
      `UPDATE second_life_discoveries SET is_favorite = $3, updated_at = NOW()
       WHERE companion_id = $1 AND place_key = $2 RETURNING *`,
      [companionId, String(placeKey), Boolean(isFavorite)],
    );
    return mapDiscoveryRow(rows[0]);
  }

  async function setDiscoveryShared({ companionId, placeKey, shared = true }) {
    if (!available) return null;
    if (!placeKey) return null;
    const { rows } = await pool.query(
      `UPDATE second_life_discoveries SET shared = $3, updated_at = NOW()
       WHERE companion_id = $1 AND place_key = $2 RETURNING *`,
      [companionId, String(placeKey), Boolean(shared)],
    );
    return mapDiscoveryRow(rows[0]);
  }

  async function deleteDiscovery({ companionId, placeKey }) {
    if (!available) return false;
    if (!placeKey) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_discoveries WHERE companion_id = $1 AND place_key = $2`,
      [companionId, String(placeKey)],
    );
    return rowCount > 0;
  }

  // ─── Phase 17 — shared experiences ────────────────────────────────────────
  function mapSharedExperienceRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      experienceType: row.experience_type || "moment",
      title: row.title || "",
      body: row.body || "",
      locationContext: row.location_context_json || {},
      peopleContext: Array.isArray(row.people_context_json) ? row.people_context_json : [],
      isMilestone: Boolean(row.is_milestone),
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function listSharedExperiences({ companionId, experienceType, milestonesOnly = false, limit = 50 } = {}) {
    if (!available) return [];
    const params = [companionId];
    let where = "companion_id = $1";
    if (experienceType) {
      params.push(String(experienceType));
      where += ` AND experience_type = $${params.length}`;
    }
    if (milestonesOnly) where += " AND is_milestone = TRUE";
    params.push(Number(limit) || 50);
    const { rows } = await pool.query(
      `SELECT * FROM second_life_shared_experiences WHERE ${where}
       ORDER BY occurred_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapSharedExperienceRow);
  }

  async function getSharedExperience({ companionId, id }) {
    if (!available || !id) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_shared_experiences WHERE companion_id = $1 AND id = $2 LIMIT 1`,
      [companionId, Number(id)],
    );
    return mapSharedExperienceRow(rows[0]);
  }

  async function upsertSharedExperience({
    companionId,
    id = null,
    experienceType = "moment",
    title = "",
    body = "",
    locationContext = null,
    peopleContext = [],
    isMilestone = false,
    occurredAt = null,
  }) {
    if (!available) return null;
    const location = JSON.stringify(locationContext || {});
    const people = JSON.stringify(Array.isArray(peopleContext) ? peopleContext : []);
    if (id) {
      const { rows } = await pool.query(
        `UPDATE second_life_shared_experiences SET
           experience_type = $3,
           title = $4,
           body = $5,
           location_context_json = $6::jsonb,
           people_context_json = $7::jsonb,
           is_milestone = $8,
           updated_at = NOW()
         WHERE companion_id = $1 AND id = $2
         RETURNING *`,
        [
          companionId,
          Number(id),
          String(experienceType || "moment"),
          String(title || ""),
          String(body || ""),
          location,
          people,
          Boolean(isMilestone),
        ],
      );
      return mapSharedExperienceRow(rows[0]);
    }
    const { rows } = await pool.query(
      `INSERT INTO second_life_shared_experiences
         (companion_id, experience_type, title, body, location_context_json,
          people_context_json, is_milestone, occurred_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,COALESCE($8::timestamptz, NOW()))
       RETURNING *`,
      [
        companionId,
        String(experienceType || "moment"),
        String(title || ""),
        String(body || ""),
        location,
        people,
        Boolean(isMilestone),
        occurredAt ? new Date(occurredAt).toISOString() : null,
      ],
    );
    return mapSharedExperienceRow(rows[0]);
  }

  async function deleteSharedExperience({ companionId, id }) {
    if (!available || !id) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_shared_experiences WHERE companion_id = $1 AND id = $2`,
      [companionId, Number(id)],
    );
    return rowCount > 0;
  }

  // ─── Phase 19 — long-term goals ───────────────────────────────────────────
  function mapGoalRow(row) {
    if (!row) return null;
    const target = Number(row.target_value) || 0;
    const current = Number(row.current_value) || 0;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      goalType: row.goal_type || "custom",
      label: row.label || "",
      targetValue: target,
      currentValue: current,
      unit: row.unit || "",
      status: row.status || "active",
      metadata: row.metadata_json || {},
      progressPct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function listGoals({ companionId, status, limit = 100 } = {}) {
    if (!available) return [];
    const params = [companionId];
    let where = "companion_id = $1";
    if (status) {
      params.push(String(status));
      where += ` AND status = $${params.length}`;
    }
    params.push(Number(limit) || 100);
    const { rows } = await pool.query(
      `SELECT * FROM second_life_goals WHERE ${where}
       ORDER BY status ASC, created_at ASC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapGoalRow);
  }

  async function getGoal({ companionId, id }) {
    if (!available || !id) return null;
    const { rows } = await pool.query(
      `SELECT * FROM second_life_goals WHERE companion_id = $1 AND id = $2 LIMIT 1`,
      [companionId, Number(id)],
    );
    return mapGoalRow(rows[0]);
  }

  async function upsertGoal({
    companionId,
    id = null,
    goalType = "custom",
    label = "",
    targetValue = 0,
    currentValue = 0,
    unit = "",
    status = "active",
    metadata = null,
  }) {
    if (!available) return null;
    const meta = JSON.stringify(metadata || {});
    if (id) {
      const { rows } = await pool.query(
        `UPDATE second_life_goals SET
           goal_type = $3,
           label = $4,
           target_value = $5,
           unit = $6,
           status = $7,
           metadata_json = $8::jsonb,
           updated_at = NOW()
         WHERE companion_id = $1 AND id = $2
         RETURNING *`,
        [
          companionId,
          Number(id),
          String(goalType || "custom"),
          String(label || ""),
          Math.max(0, Number(targetValue) || 0),
          String(unit || ""),
          String(status || "active"),
          meta,
        ],
      );
      return mapGoalRow(rows[0]);
    }
    const { rows } = await pool.query(
      `INSERT INTO second_life_goals
         (companion_id, goal_type, label, target_value, current_value, unit, status, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING *`,
      [
        companionId,
        String(goalType || "custom"),
        String(label || ""),
        Math.max(0, Number(targetValue) || 0),
        Math.max(0, Number(currentValue) || 0),
        String(unit || ""),
        String(status || "active"),
        meta,
      ],
    );
    return mapGoalRow(rows[0]);
  }

  /**
   * Advance a goal's progress by a real, positive amount. Auto-completes the
   * goal when it reaches its target. Only ever called from real events — there
   * is no decrement / fake path. Returns the updated goal (or null).
   */
  async function incrementGoalProgress({ companionId, id, amount = 1 }) {
    if (!available || !id) return null;
    const step = Math.max(0, Number(amount) || 0);
    if (step === 0) return getGoal({ companionId, id });
    const { rows } = await pool.query(
      `UPDATE second_life_goals SET
         current_value = current_value + $3,
         status = CASE
           WHEN target_value > 0 AND current_value + $3 >= target_value THEN 'completed'
           ELSE status
         END,
         updated_at = NOW()
       WHERE companion_id = $1 AND id = $2 AND status <> 'completed'
       RETURNING *`,
      [companionId, Number(id), step],
    );
    return rows[0] ? mapGoalRow(rows[0]) : getGoal({ companionId, id });
  }

  async function deleteGoal({ companionId, id }) {
    if (!available || !id) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM second_life_goals WHERE companion_id = $1 AND id = $2`,
      [companionId, Number(id)],
    );
    return rowCount > 0;
  }

  // ─── Phase 18 — initiative log ────────────────────────────────────────────
  function mapInitiativeRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      companionId: row.companion_id,
      initiativeType: row.initiative_type || "note",
      reason: row.reason || "",
      evidence: row.evidence_json || {},
      status: row.status || "proposed",
      createdAt: row.created_at,
    };
  }

  async function recordInitiative({ companionId, initiativeType = "note", reason = "", evidence = null, status = "proposed" }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO second_life_initiatives
         (companion_id, initiative_type, reason, evidence_json, status)
       VALUES ($1,$2,$3,$4::jsonb,$5)
       RETURNING *`,
      [
        companionId,
        String(initiativeType || "note"),
        String(reason || ""),
        JSON.stringify(evidence || {}),
        String(status || "proposed"),
      ],
    );
    return mapInitiativeRow(rows[0]);
  }

  async function listInitiatives({ companionId, limit = 30 } = {}) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM second_life_initiatives WHERE companion_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [companionId, Number(limit) || 30],
    );
    return rows.map(mapInitiativeRow);
  }

  async function countInitiativesSince({ companionId, since, status = "delivered" }) {
    if (!available) return 0;
    const params = [companionId];
    let where = "companion_id = $1";
    if (since) {
      params.push(new Date(since).toISOString());
      where += ` AND created_at >= $${params.length}`;
    }
    if (status) {
      params.push(String(status));
      where += ` AND status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM second_life_initiatives WHERE ${where}`,
      params,
    );
    return rows[0] ? Number(rows[0].n) || 0 : 0;
  }

  return {
    available,
    init,
    hashSharedSecret,
    loadBridgeSettings,
    upsertBridgeSettings,
    getStoreSummary,
    verifySharedSecret,
    registerAgent,
    recordHeartbeat,
    loadWorldState,
    upsertWorldState,
    getRelationshipByUuid,
    listRelationships,
    upsertRelationship,
    deleteRelationship,
    markRelationshipSeen,
    recordRelationshipReply,
    getObjectRelationshipByUuid,
    getObjectRelationshipByDescriptionToken,
    listObjectRelationships,
    upsertObjectRelationship,
    deleteObjectRelationship,
    markObjectRelationshipSeen,
    recordObjectRelationshipReply,
    listCommandDefinitions,
    getCommandDefinitionByTrigger,
    upsertCommandDefinition,
    deleteCommandDefinition,
    seedDefaultCommands,
    enqueueCommand,
    claimPendingCommands,
    markCommandResult,
    clearPendingCommands,
    clearCommandQueue,
    setAutonomyPaused,
    blockAvatar,
    appendJournalEntry,
    listRecentJournal,
    upsertObject,
    listOutfits,
    getOutfitByTrigger,
    upsertOutfit,
    deleteOutfit,
    seedDefaultOutfits,
    listLandmarks,
    getLandmarkByTrigger,
    getHomeLandmark,
    upsertLandmark,
    deleteLandmark,
    listObjects,
    getObjectByUuid,
    deleteObject,
    findObjects,
    countRecentReplies,
    getBridgeStatus,
    listSchedule,
    getScheduleEntry,
    upsertScheduleEntry,
    deleteScheduleEntry,
    seedDefaultSchedule,
    listDiscoveries,
    getDiscovery,
    upsertDiscovery,
    setDiscoveryBookmark,
    setDiscoveryRating,
    setDiscoveryFavorite,
    setDiscoveryShared,
    deleteDiscovery,
    listSharedExperiences,
    getSharedExperience,
    upsertSharedExperience,
    deleteSharedExperience,
    listGoals,
    getGoal,
    upsertGoal,
    incrementGoalProgress,
    deleteGoal,
    recordInitiative,
    listInitiatives,
    countInitiativesSince,
  };
}

module.exports = {
  createSecondLifeStore,
  hashSharedSecret,
};
