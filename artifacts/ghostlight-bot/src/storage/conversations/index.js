const { createPostgresPool } = require("../postgres/createPostgresPool");
const { normalizeAttachments, getInputTypes } = require("../../utils/attachments");

const SUPPORTED_EVENT_TYPES = Object.freeze([
  "message",
  "audio_transcription",
  "image_analysis",
  "summary_daily",
  "summary_weekly",
]);

const SUPPORTED_ROLES = Object.freeze([
  "user",
  "assistant",
  "system",
]);

const SUPPORTED_SOURCES = Object.freeze([
  "discord",
  "openai",
  "ghostlight",
]);

const SNIPPET_SEARCH_STOPWORDS = new Set([
  "about",
  "and",
  "can",
  "day",
  "did",
  "for",
  "from",
  "the",
  "that",
  "what",
  "when",
  "where",
  "with",
  "you",
]);

const CREATE_CONVERSATION_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS conversation_events (
    id BIGSERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    thread_id TEXT,
    channel_id TEXT NOT NULL,
    guild_id TEXT,
    discord_message_id TEXT,
    author_id TEXT,
    author_name TEXT,
    role TEXT NOT NULL,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    content_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const ENSURE_CONVERSATION_EVENTS_COLUMNS_SQL = [
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS id BIGSERIAL;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS conversation_id TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS thread_id TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS channel_id TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS guild_id TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS discord_message_id TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS author_id TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS author_name TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS role TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS source TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS event_type TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS content_text TEXT;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;",
  "ALTER TABLE conversation_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();",
];

const BACKFILL_CONVERSATION_EVENTS_REQUIRED_COLUMNS_SQL = `
  UPDATE conversation_events
  SET
    conversation_id = COALESCE(conversation_id, thread_id, channel_id, 'legacy-conversation'),
    channel_id = COALESCE(channel_id, thread_id, conversation_id, 'legacy-channel'),
    role = COALESCE(role, 'user'),
    source = COALESCE(source, 'discord'),
    event_type = COALESCE(event_type, 'message'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, NOW())
  WHERE conversation_id IS NULL
    OR channel_id IS NULL
    OR role IS NULL
    OR source IS NULL
    OR event_type IS NULL
    OR metadata IS NULL
    OR created_at IS NULL;
`;

const ENFORCE_CONVERSATION_EVENTS_NOT_NULL_SQL = [
  "ALTER TABLE conversation_events ALTER COLUMN conversation_id SET NOT NULL;",
  "ALTER TABLE conversation_events ALTER COLUMN channel_id SET NOT NULL;",
  "ALTER TABLE conversation_events ALTER COLUMN role SET NOT NULL;",
  "ALTER TABLE conversation_events ALTER COLUMN source SET NOT NULL;",
  "ALTER TABLE conversation_events ALTER COLUMN event_type SET NOT NULL;",
  "ALTER TABLE conversation_events ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;",
  "ALTER TABLE conversation_events ALTER COLUMN metadata SET NOT NULL;",
  "ALTER TABLE conversation_events ALTER COLUMN created_at SET DEFAULT NOW();",
  "ALTER TABLE conversation_events ALTER COLUMN created_at SET NOT NULL;",
];

const CREATE_CONVERSATION_EVENTS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS conversation_events_conversation_created_at_idx ON conversation_events (conversation_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS conversation_events_channel_created_at_idx ON conversation_events (channel_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS conversation_events_thread_created_at_idx ON conversation_events (thread_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS conversation_events_discord_message_id_idx ON conversation_events (discord_message_id);",
  "CREATE UNIQUE INDEX IF NOT EXISTS conversation_events_discord_message_message_unique_idx ON conversation_events (discord_message_id) WHERE discord_message_id IS NOT NULL AND event_type = 'message';",
];

function normalizeEnumValue(value) {
  return String(value || "").trim().toLowerCase();
}

function assertAllowedValue({ label, value, allowedValues }) {
  const normalizedValue = normalizeEnumValue(value);

  if (!allowedValues.includes(normalizedValue)) {
    throw new Error(`Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(", ")}.`);
  }

  return normalizedValue;
}

function normalizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Conversation event metadata must be a plain object.");
  }

  return metadata;
}

function buildEventContentText(event) {
  const content = event.content_text?.trim() || "";

  if (event.event_type === "message") {
    return content;
  }

  if (!content) {
    return `[${event.event_type}]`;
  }

  return `[${event.event_type}] ${content}`;
}

function mapEventToHistoryItem(event) {
  const metadata = normalizeMetadata(event.metadata || {});

  return {
    id: event.discord_message_id || String(event.id || ""),
    authorId: event.author_id || "",
    authorName: event.author_name || event.role || "unknown",
    isBot: metadata.isBot ?? event.role !== "user",
    content: buildEventContentText(event),
    attachments: Array.isArray(metadata.attachments) ? metadata.attachments : [],
    createdTimestamp: new Date(event.created_at).getTime(),
    role: event.role,
    source: event.source,
    eventType: event.event_type,
    metadata,
  };
}

// Summary transcripts feed an LLM and the generated summary is later persisted as a
// memory artifact. A persisted image_analysis description can be explicit/flagged, so
// folding it verbatim into a summary would re-introduce the same content the provider
// rejects (and seed it into long-term memory). Collapse it to a neutral marker here —
// this is the single chokepoint both the daily and weekly summarizers go through.
const SUMMARY_IMAGE_PLACEHOLDER = "[An image was shared in the conversation.]";

function formatEventAsPlainText(event) {
  const timestamp = new Date(event.created_at).toISOString();
  const author = event.author_name || event.role || "unknown";
  const body =
    event.event_type === "image_analysis"
      ? SUMMARY_IMAGE_PLACEHOLDER
      : buildEventContentText(event);

  return `[${timestamp}] ${author}: ${body}`.trim();
}

function getConversationLabel(metadata = {}, fallbackConversationId = "") {
  return metadata.threadName || metadata.channelName || fallbackConversationId || "unknown";
}

function normalizeSnippetSearchTerm(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

  if (normalized.length > 4 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function tokenizeSnippetSearchQuery(query = "") {
  return Array.from(new Set(
    String(query || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(normalizeSnippetSearchTerm)
      .filter((term) => term.length >= 3 && !SNIPPET_SEARCH_STOPWORDS.has(term)),
  )).slice(0, 8);
}

function escapePostgresLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function buildConversationSummary(row) {
  return {
    conversationId: row.conversation_id,
    threadId: row.thread_id,
    channelId: row.channel_id,
    parentChannelId: row.parent_channel_id || null,
    guildId: row.guild_id,
    label: getConversationLabel({
      threadName: row.thread_name,
      channelName: row.channel_name,
    }, row.conversation_id),
    threadName: row.thread_name || null,
    channelName: row.channel_name || null,
    parentChannelName: row.parent_channel_name || null,
    eventCount: Number(row.event_count || 0),
    messageEventCount: Number(row.message_event_count || 0),
    firstEventAt: row.first_event_at,
    lastEventAt: row.last_event_at,
    latestSummaryDate: row.latest_summary_date || null,
  };
}

function filterExportEvents(events, {
  includeSystem = true,
  includeSummaries = true,
} = {}) {
  return events.filter((event) => {
    if (!includeSystem && event.role === "system") {
      return false;
    }

    if (!includeSummaries && ["summary_daily", "summary_weekly"].includes(event.event_type)) {
      return false;
    }

    return true;
  });
}

function buildConversationExportHeader(events, conversation = null) {
  if (!events.length) {
    return [];
  }

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const metadata = normalizeMetadata(firstEvent.metadata || {});
  const label = conversation?.label || getConversationLabel(metadata, firstEvent.conversation_id);

  return [
    `# Conversation Export`,
    `Conversation ID: ${conversation?.conversationId || firstEvent.conversation_id}`,
    `Label: ${label}`,
    `Channel ID: ${conversation?.channelId || firstEvent.channel_id}`,
    `Thread ID: ${(conversation?.threadId || firstEvent.thread_id || "none")}`,
    `Event Count: ${events.length}`,
    `Date Range: ${new Date(firstEvent.created_at).toISOString()} -> ${new Date(lastEvent.created_at).toISOString()}`,
  ];
}

function formatConversationExport(events, {
  conversation = null,
  includeHeader = true,
  includeSystem = true,
  includeSummaries = true,
} = {}) {
  const filteredEvents = filterExportEvents(events, {
    includeSystem,
    includeSummaries,
  });

  if (!filteredEvents.length) {
    if (!includeHeader) {
      return "";
    }

    return [
      "# Conversation Export",
      `Conversation ID: ${conversation?.conversationId || "unknown"}`,
      "Event Count: 0",
      "",
      "[no matching events]",
    ].join("\n");
  }

  const sections = [];

  if (includeHeader) {
    sections.push(buildConversationExportHeader(filteredEvents, conversation).join("\n"));
  }

  sections.push(filteredEvents.map(formatEventAsPlainText).join("\n"));

  return sections.join("\n\n");
}

function validateEventInput({ role, source, eventType, metadata }) {
  return {
    role: assertAllowedValue({
      label: "role",
      value: role,
      allowedValues: SUPPORTED_ROLES,
    }),
    source: assertAllowedValue({
      label: "source",
      value: source,
      allowedValues: SUPPORTED_SOURCES,
    }),
    eventType: assertAllowedValue({
      label: "event_type",
      value: eventType,
      allowedValues: SUPPORTED_EVENT_TYPES,
    }),
    metadata: normalizeMetadata(metadata),
  };
}

function createNoopConversationStore({ logger }) {
  return {
    async init() {
      logger.warn("[storage] DATABASE_URL is not set; conversation persistence is disabled.");
    },
    async recordEvent() {},
    async listEventsByConversationId() {
      return [];
    },
    async listConversations() {
      return [];
    },
    async findSummaryEventByConversationAndDate() {
      return null;
    },
    async findSummaryEventByRange() {
      return null;
    },
    async listEventsByDate() {
      return [];
    },
    async listEventsByDateRange() {
      return [];
    },
    async listRecentEventsByDateRange() {
      return [];
    },
    async listEventsForExport() {
      return [];
    },
    async recordSyntheticEvent() {},
    formatEventsAsPlainText() {
      return "";
    },
    formatConversationExport() {
      return "";
    },
    mapEventsToHistoryItems() {
      return [];
    },
    async listRecentHistoryByConversationId() {
      return [];
    },
    async listRecentConversationSnippets() {
      return [];
    },
    async deleteEventsByConversationId() {
      return {
        deletedCount: 0,
        conversationId: null,
      };
    },
    async getStorageStats() {
      return {
        eventCount: 0,
        messageEventCount: 0,
        oldestEventAt: null,
        newestEventAt: null,
        conversationCount: 0,
        conversationBytes: 0,
        databaseBytes: 0,
      };
    },
    async pruneEventsOlderThan() {
      return {
        deletedCount: 0,
        cutoffDate: null,
      };
    },
    async close() {},
  };
}

function getThreadId(channel) {
  if (channel?.isThread?.()) {
    return channel.id;
  }

  return null;
}

function getConversationId(message) {
  return getThreadId(message.channel) || message.channelId;
}

function buildMessageMetadata(message, extraMetadata = {}) {
  const attachments = normalizeAttachments(message.attachments);
  const contentText = extraMetadata.contentText || message.content || "";
  const isThread = Boolean(message.channel?.isThread?.());
  const parentChannelName = isThread ? (message.channel.parent?.name || null) : null;

  return {
    mentionedBot: extraMetadata.mentionedBot,
    attachmentCount: attachments.length,
    attachments,
    inputTypes: getInputTypes({ content: contentText, attachments }),
    isBot: Boolean(message.author?.bot),
    channelName: isThread ? parentChannelName : (message.channel?.name || null),
    threadName: isThread ? message.channel.name : null,
    parentChannelId: isThread ? (message.channel.parentId || null) : null,
    parentChannelName,
    ...extraMetadata,
  };
}

function getDefaultAuthorName(message) {
  return message.member?.displayName || message.author?.globalName || message.author?.username || null;
}

function createConversationStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopConversationStore({ logger });
  }

  return {
    async init() {
      await pool.query(CREATE_CONVERSATION_EVENTS_TABLE_SQL);

      for (const statement of ENSURE_CONVERSATION_EVENTS_COLUMNS_SQL) {
        await pool.query(statement);
      }

      await pool.query(BACKFILL_CONVERSATION_EVENTS_REQUIRED_COLUMNS_SQL);

      for (const statement of ENFORCE_CONVERSATION_EVENTS_NOT_NULL_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_CONVERSATION_EVENTS_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.info?.("[db:migration] conversations schema ensured", {
        table: "conversation_events",
      });

      logger.debug?.("[storage] Conversation store ready", {
        provider: "postgres",
      });
    },

    async recordEvent({
      message,
      role,
      source,
      eventType = "message",
      contentText,
      metadata = {},
      discordMessageId,
      authorId,
      authorName,
      createdAt,
    }) {
      const validated = validateEventInput({
        role,
        source,
        eventType,
        metadata,
      });

      await pool.query(
        `
          INSERT INTO conversation_events (
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
        `,
        [
          getConversationId(message),
          getThreadId(message.channel),
          message.channelId,
          message.guildId || null,
          discordMessageId || message.id || null,
          authorId || message.author?.id || null,
          authorName || getDefaultAuthorName(message),
          validated.role,
          validated.source,
          validated.eventType,
          contentText || null,
          JSON.stringify(buildMessageMetadata(message, { ...validated.metadata, contentText })),
          createdAt || new Date(message.createdTimestamp || Date.now()),
        ],
      );
    },

    async listEventsByConversationId({ conversationId, limit = 500 }) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM (
            SELECT
              id,
              conversation_id,
              thread_id,
              channel_id,
              guild_id,
              discord_message_id,
              author_id,
              author_name,
              role,
              source,
              event_type,
              content_text,
              metadata,
              created_at
            FROM conversation_events
            WHERE conversation_id = $1
            ORDER BY created_at DESC
            LIMIT $2
          ) recent_events
          ORDER BY created_at ASC
        `,
        [conversationId, limit],
      );

      return rows;
    },

    async listConversations({ limit = 20, guildId = "", activeAfter = "", activeBefore = "" } = {}) {
      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 20, 1000));
      const values = [normalizedLimit];
      const clauses = [];
      const havingClauses = [];

      if (guildId) {
        values.push(String(guildId).trim());
        clauses.push(`guild_id = $${values.length}`);
      }

      if (activeAfter) {
        values.push(activeAfter);
        havingClauses.push(`MAX(created_at) >= $${values.length}`);
      }

      if (activeBefore) {
        values.push(activeBefore);
        havingClauses.push(`MAX(created_at) <= $${values.length}`);
      }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const havingClause = havingClauses.length ? `HAVING ${havingClauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `
          SELECT
            conversation_id,
            MAX(thread_id) FILTER (WHERE thread_id IS NOT NULL) AS thread_id,
            MAX(channel_id) AS channel_id,
            (
              ARRAY_AGG(NULLIF(metadata->>'parentChannelId', '') ORDER BY created_at DESC)
              FILTER (WHERE NULLIF(metadata->>'parentChannelId', '') IS NOT NULL)
            )[1] AS parent_channel_id,
            MAX(guild_id) AS guild_id,
            (
              ARRAY_AGG(NULLIF(metadata->>'threadName', '') ORDER BY created_at DESC)
              FILTER (WHERE NULLIF(metadata->>'threadName', '') IS NOT NULL)
            )[1] AS thread_name,
            (
              ARRAY_AGG(NULLIF(metadata->>'parentChannelName', '') ORDER BY created_at DESC)
              FILTER (WHERE NULLIF(metadata->>'parentChannelName', '') IS NOT NULL)
            )[1] AS parent_channel_name,
            (
              ARRAY_AGG(NULLIF(metadata->>'channelName', '') ORDER BY created_at DESC)
              FILTER (WHERE NULLIF(metadata->>'channelName', '') IS NOT NULL)
            )[1] AS channel_name,
            COUNT(*) AS event_count,
            COUNT(*) FILTER (WHERE event_type = 'message') AS message_event_count,
            MIN(created_at) AS first_event_at,
            MAX(created_at) AS last_event_at,
            MAX(metadata->>'summaryDate') FILTER (
              WHERE event_type = 'summary_daily' AND metadata ? 'summaryDate'
            ) AS latest_summary_date
          FROM conversation_events
          ${whereClause}
          GROUP BY conversation_id
          ${havingClause}
          ORDER BY MAX(created_at) DESC
          LIMIT $1
        `,
        values,
      );

      return rows.map(buildConversationSummary);
    },

    async findSummaryEventByConversationAndDate({ conversationId, summaryDate }) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM conversation_events
          WHERE conversation_id = $1
            AND event_type = 'summary_daily'
            AND metadata->>'summaryDate' = $2
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [conversationId, summaryDate],
      );

      return rows[0] || null;
    },

    async listEventsByDate({ summaryDate, limit = 1000, includeSummaries = false } = {}) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM conversation_events
          WHERE created_at::date = $1::date
            AND ($2::boolean = TRUE OR event_type NOT IN ('summary_daily', 'summary_weekly'))
          ORDER BY created_at ASC
          LIMIT $3
        `,
        [summaryDate, includeSummaries, limit],
      );

      return rows;
    },

    async listEventsByDateRange({ startDate, endDate, limit = 5000, includeSummaries = false } = {}) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM conversation_events
          WHERE created_at::date >= $1::date
            AND created_at::date <= $2::date
            AND ($3::boolean = TRUE OR event_type NOT IN ('summary_daily', 'summary_weekly'))
          ORDER BY created_at ASC
          LIMIT $4
        `,
        [startDate, endDate, includeSummaries, limit],
      );

      return rows;
    },

    async listRecentEventsByDateRange({ startDate, endDate, limit = 500, includeSummaries = false } = {}) {
      const { rows } = await pool.query(
        `
          SELECT *
          FROM (
            SELECT
              id,
              conversation_id,
              thread_id,
              channel_id,
              guild_id,
              discord_message_id,
              author_id,
              author_name,
              role,
              source,
              event_type,
              content_text,
              metadata,
              created_at
            FROM conversation_events
            WHERE created_at::date >= $1::date
              AND created_at::date <= $2::date
              AND ($3::boolean = TRUE OR event_type NOT IN ('summary_daily', 'summary_weekly'))
            ORDER BY created_at DESC, id DESC
            LIMIT $4
          ) recent_events
          ORDER BY created_at ASC, id ASC
        `,
        [startDate, endDate, includeSummaries, limit],
      );

      return rows;
    },

    async listEventsForExport({ guildId = "", limit = 100000 } = {}) {
      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100000, 250000));
      const values = [normalizedLimit];
      const clauses = [];

      if (guildId) {
        values.push(String(guildId).trim());
        clauses.push(`guild_id = $${values.length}`);
      }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM conversation_events
          ${whereClause}
          ORDER BY created_at ASC, id ASC
          LIMIT $1
        `,
        values,
      );

      return rows;
    },

    async getStorageStats({ guildId = "" } = {}) {
      const clauses = [];
      const values = [];

      if (guildId) {
        values.push(String(guildId).trim());
        clauses.push(`guild_id = $${values.length}`);
      }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const relationRef = guildId ? "conversation_events" : "conversation_events";
      const { rows } = await pool.query(
        `
          SELECT
            COUNT(*) AS event_count,
            COUNT(*) FILTER (WHERE event_type = 'message') AS message_event_count,
            MIN(created_at) AS oldest_event_at,
            MAX(created_at) AS newest_event_at,
            COUNT(DISTINCT conversation_id) AS conversation_count,
            pg_total_relation_size($${values.length + 1}) AS conversation_bytes,
            pg_database_size(current_database()) AS database_bytes
          FROM conversation_events
          ${whereClause}
        `,
        [...values, relationRef],
      );

      const row = rows[0] || {};

      return {
        eventCount: Number(row.event_count || 0),
        messageEventCount: Number(row.message_event_count || 0),
        oldestEventAt: row.oldest_event_at || null,
        newestEventAt: row.newest_event_at || null,
        conversationCount: Number(row.conversation_count || 0),
        conversationBytes: Number(row.conversation_bytes || 0),
        databaseBytes: Number(row.database_bytes || 0),
      };
    },

    async pruneEventsOlderThan({ olderThanDays, guildId = "" } = {}) {
      const normalizedDays = Number(olderThanDays);

      if (!Number.isFinite(normalizedDays) || normalizedDays <= 0) {
        throw new Error("Prune cutoff must be a positive number of days.");
      }

      const cutoffDate = new Date(Date.now() - (normalizedDays * 24 * 60 * 60 * 1000)).toISOString();
      const values = [cutoffDate];
      const clauses = ["created_at < $1"];

      if (guildId) {
        values.push(String(guildId).trim());
        clauses.push(`guild_id = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          DELETE FROM conversation_events
          WHERE ${clauses.join(" AND ")}
          RETURNING id
        `,
        values,
      );

      return {
        deletedCount: rows.length,
        cutoffDate,
      };
    },

    async deleteEventsByConversationId({ conversationId, guildId = "" } = {}) {
      const normalizedConversationId = String(conversationId || "").trim();

      if (!normalizedConversationId) {
        throw new Error("Conversation ID is required.");
      }

      const values = [normalizedConversationId];
      const clauses = ["conversation_id = $1"];

      if (guildId) {
        values.push(String(guildId).trim());
        clauses.push(`guild_id = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          DELETE FROM conversation_events
          WHERE ${clauses.join(" AND ")}
          RETURNING id
        `,
        values,
      );

      return {
        deletedCount: rows.length,
        conversationId: normalizedConversationId,
      };
    },

    async findSummaryEventByRange({ eventType, startDate, endDate }) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM conversation_events
          WHERE event_type = $1
            AND (
              (metadata->>'weekStartDate' = $2 AND metadata->>'weekEndDate' = $3)
              OR (metadata->>'startDate' = $2 AND metadata->>'endDate' = $3)
            )
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [eventType, startDate, endDate],
      );

      return rows[0] || null;
    },

    async recordSyntheticEvent({
      conversationId,
      threadId = null,
      channelId,
      guildId = null,
      role,
      source,
      eventType,
      contentText,
      metadata = {},
      authorId = null,
      authorName = null,
      createdAt = new Date(),
    }) {
      const validated = validateEventInput({
        role,
        source,
        eventType,
        metadata,
      });

      await pool.query(
        `
          INSERT INTO conversation_events (
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
        `,
        [
          conversationId,
          threadId,
          channelId,
          guildId,
          authorId,
          authorName,
          validated.role,
          validated.source,
          validated.eventType,
          contentText || null,
          JSON.stringify(validated.metadata),
          createdAt,
        ],
      );
    },

    formatEventsAsPlainText(events) {
      return events.map(formatEventAsPlainText).join("\n");
    },

    formatConversationExport(events, options = {}) {
      return formatConversationExport(events, options);
    },

    mapEventsToHistoryItems(events) {
      return events.map(mapEventToHistoryItem);
    },

    async listRecentHistoryByConversationId({ conversationId, limit = 8 }) {
      const events = await this.listEventsByConversationId({
        conversationId,
        limit: Math.max(limit * 3, limit + 5),
      });

      return events
        .filter((event) => event.event_type !== "summary_daily")
        .filter((event) => event.event_type !== "summary_weekly")
        .map(mapEventToHistoryItem)
        .filter((item) => item.content)
        .slice(-limit);
    },

    async listRecentConversationSnippets({
      guildId = "",
      excludeConversationId = "",
      excludeChannelId = "",
      since,
      until,
      query = "",
      limit = 50,
    } = {}) {
      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
      const normalizedSince = since ? new Date(since) : new Date(Date.now() - (48 * 60 * 60 * 1000));
      const normalizedUntil = until ? new Date(until) : null;
      const searchTerms = tokenizeSnippetSearchQuery(query);

      if (Number.isNaN(normalizedSince.getTime())) {
        throw new Error("A valid retrieval since date is required.");
      }

      if (normalizedUntil && Number.isNaN(normalizedUntil.getTime())) {
        throw new Error("A valid retrieval until date is required.");
      }

      const clauses = [
        "event_type = 'message'",
        "content_text IS NOT NULL",
        "TRIM(content_text) <> ''",
        `created_at >= $1`,
      ];
      const values = [normalizedSince];

      if (guildId) {
        values.push(String(guildId).trim());
        clauses.push(`guild_id = $${values.length}`);
      }

      if (normalizedUntil) {
        values.push(normalizedUntil);
        clauses.push(`created_at < $${values.length}`);
      }

      if (searchTerms.length) {
        const termClauses = [];

        for (const term of searchTerms) {
          values.push(`%${escapePostgresLike(term)}%`);
          termClauses.push(`content_text ILIKE $${values.length} ESCAPE '\\'`);
        }

        clauses.push(`(${termClauses.join(" OR ")})`);
      }

      if (excludeConversationId) {
        values.push(String(excludeConversationId).trim());
        clauses.push(`conversation_id <> $${values.length}`);
      }

      if (excludeChannelId) {
        values.push(String(excludeChannelId).trim());
        clauses.push(`channel_id <> $${values.length}`);
        clauses.push(`COALESCE(thread_id, '') <> $${values.length}`);
      }

      values.push(normalizedLimit);
      const { rows } = await pool.query(
        `
          SELECT
            id,
            conversation_id,
            thread_id,
            channel_id,
            guild_id,
            discord_message_id,
            author_id,
            author_name,
            role,
            source,
            event_type,
            content_text,
            metadata,
            created_at
          FROM conversation_events
          WHERE ${clauses.join(" AND ")}
          ORDER BY created_at DESC, id DESC
          LIMIT $${values.length}
        `,
        values,
      );

      return rows.reverse();
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createConversationStore,
  SUPPORTED_EVENT_TYPES,
  SUPPORTED_ROLES,
  SUPPORTED_SOURCES,
  buildEventContentText,
  buildConversationSummary,
  buildConversationExportHeader,
  filterExportEvents,
  formatConversationExport,
  mapEventToHistoryItem,
  formatEventAsPlainText,
  getConversationLabel,
  validateEventInput,
};
