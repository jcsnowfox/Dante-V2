const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const SUPPORTED_STATUSES = Object.freeze(["waiting", "active", "paused", "completed", "cancelled"]);

const CREATE_GAME_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    companion_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    human_player_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    active_player TEXT NOT NULL DEFAULT 'user',
    turn_order JSONB NOT NULL DEFAULT '["user","companion"]'::jsonb,
    game_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'waiting',
    last_message_id TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_GAME_SESSIONS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS game_sessions_guild_channel_idx ON game_sessions (guild_id, channel_id);",
  "CREATE INDEX IF NOT EXISTS game_sessions_status_idx ON game_sessions (status);",
  "CREATE INDEX IF NOT EXISTS game_sessions_updated_at_idx ON game_sessions (updated_at DESC);",
];

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SUPPORTED_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported game session status "${value}". Expected one of: ${SUPPORTED_STATUSES.join(", ")}.`);
  }
  return normalized;
}

function buildSessionRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    companionId: row.companion_id,
    gameType: row.game_type,
    humanPlayerIds: Array.isArray(row.human_player_ids) ? row.human_player_ids : [],
    activePlayer: row.active_player,
    turnOrder: Array.isArray(row.turn_order) ? row.turn_order : ["user", "companion"],
    gameState: row.game_state || {},
    scoreState: row.score_state || {},
    settings: row.settings || {},
    status: row.status,
    lastMessageId: row.last_message_id || null,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}

function generateSessionId() {
  return `gs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createNoopGameSessionStore({ logger }) {
  return {
    async init() {
      logger.warn("[games] DATABASE_URL is not set; game session persistence is disabled.");
    },
    async createSession() {
      return null;
    },
    async getSession() {
      return null;
    },
    async getActiveSessionByChannel() {
      return null;
    },
    async updateSession() {
      return null;
    },
    async updateGameState() {
      return null;
    },
    async completeSession() {
      return null;
    },
    async cancelSession() {
      return null;
    },
    async pauseSession() {
      return null;
    },
    async resumeSession() {
      return null;
    },
    async listSessions() {
      return [];
    },
    async getLeaderboard() {
      return [];
    },
    async close() {},
  };
}

function createGameSessionStore({ config, logger }) {
  if (!config?.database?.url) {
    return createNoopGameSessionStore({ logger });
  }

  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopGameSessionStore({ logger });
  }

  return {
    async init() {
      await pool.query(CREATE_GAME_SESSIONS_TABLE_SQL);

      for (const statement of CREATE_GAME_SESSIONS_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.debug?.("[games] Game session store ready", { provider: "postgres" });
    },

    async createSession({
      guildId,
      channelId,
      companionId,
      gameType,
      humanPlayerIds = [],
      activePlayer = "user",
      turnOrder = ["user", "companion"],
      gameState = {},
      scoreState = {},
      settings = {},
      status = "active",
    }) {
      const id = generateSessionId();
      const normalizedStatus = normalizeStatus(status);

      await pool.query(
        `
          INSERT INTO game_sessions (
            id, guild_id, channel_id, companion_id, game_type,
            human_player_ids, active_player, turn_order,
            game_state, score_state, settings, status
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12)
        `,
        [
          id,
          String(guildId || ""),
          String(channelId || ""),
          String(companionId || ""),
          String(gameType || ""),
          JSON.stringify(humanPlayerIds),
          String(activePlayer || "user"),
          JSON.stringify(turnOrder),
          JSON.stringify(gameState),
          JSON.stringify(scoreState),
          JSON.stringify(settings),
          normalizedStatus,
        ],
      );

      return this.getSession(id);
    },

    async getSession(id) {
      const { rows } = await pool.query(
        `SELECT * FROM game_sessions WHERE id = $1`,
        [String(id || "")],
      );
      return buildSessionRecord(rows[0] || null);
    },

    async getActiveSessionByChannel({ guildId, channelId }) {
      const { rows } = await pool.query(
        `
          SELECT * FROM game_sessions
          WHERE guild_id = $1 AND channel_id = $2 AND status IN ('waiting', 'active', 'paused')
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [String(guildId || ""), String(channelId || "")],
      );
      return buildSessionRecord(rows[0] || null);
    },

    async updateSession(id, {
      activePlayer,
      turnOrder,
      gameState,
      scoreState,
      settings,
      status,
      lastMessageId,
    } = {}) {
      const setClauses = ["updated_at = NOW()"];
      const values = [];

      if (activePlayer !== undefined) {
        values.push(String(activePlayer));
        setClauses.push(`active_player = $${values.length}`);
      }
      if (turnOrder !== undefined) {
        values.push(JSON.stringify(turnOrder));
        setClauses.push(`turn_order = $${values.length}::jsonb`);
      }
      if (gameState !== undefined) {
        values.push(JSON.stringify(gameState));
        setClauses.push(`game_state = $${values.length}::jsonb`);
      }
      if (scoreState !== undefined) {
        values.push(JSON.stringify(scoreState));
        setClauses.push(`score_state = $${values.length}::jsonb`);
      }
      if (settings !== undefined) {
        values.push(JSON.stringify(settings));
        setClauses.push(`settings = $${values.length}::jsonb`);
      }
      if (status !== undefined) {
        values.push(normalizeStatus(status));
        setClauses.push(`status = $${values.length}`);
      }
      if (lastMessageId !== undefined) {
        values.push(lastMessageId ? String(lastMessageId) : null);
        setClauses.push(`last_message_id = $${values.length}`);
      }

      values.push(String(id || ""));
      await pool.query(
        `UPDATE game_sessions SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
        values,
      );

      return this.getSession(id);
    },

    async updateGameState(id, { gameState, scoreState, activePlayer, lastMessageId, status } = {}) {
      return this.updateSession(id, { gameState, scoreState, activePlayer, lastMessageId, status });
    },

    async completeSession(id) {
      return this.updateSession(id, { status: "completed" });
    },

    async cancelSession(id) {
      return this.updateSession(id, { status: "cancelled" });
    },

    async pauseSession(id) {
      return this.updateSession(id, { status: "paused" });
    },

    async resumeSession(id) {
      return this.updateSession(id, { status: "active" });
    },

    async listSessions({ guildId = "", channelId = "", status = "", limit = 20 } = {}) {
      const clauses = [];
      const values = [];

      if (guildId) {
        values.push(String(guildId));
        clauses.push(`guild_id = $${values.length}`);
      }
      if (channelId) {
        values.push(String(channelId));
        clauses.push(`channel_id = $${values.length}`);
      }
      if (status) {
        values.push(String(status));
        clauses.push(`status = $${values.length}`);
      }

      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
      values.push(normalizedLimit);

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT * FROM game_sessions ${where} ORDER BY updated_at DESC LIMIT $${values.length}`,
        values,
      );

      return rows.map(buildSessionRecord);
    },

    async getLeaderboard({ guildId = "", gameType = "", limit = 10 } = {}) {
      const clauses = ["status = 'completed'", "jsonb_typeof(score_state) = 'object'"];
      const values = [];

      if (guildId) {
        values.push(String(guildId));
        clauses.push(`guild_id = $${values.length}`);
      }
      if (gameType) {
        values.push(String(gameType));
        clauses.push(`game_type = $${values.length}`);
      }

      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
      values.push(normalizedLimit);

      const where = `WHERE ${clauses.join(" AND ")}`;
      const { rows } = await pool.query(
        `SELECT * FROM game_sessions ${where} ORDER BY updated_at DESC LIMIT $${values.length}`,
        values,
      );

      return rows.map(buildSessionRecord);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createGameSessionStore,
  SUPPORTED_STATUSES,
  generateSessionId,
};
