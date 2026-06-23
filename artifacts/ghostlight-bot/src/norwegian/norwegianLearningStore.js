const { createPostgresPool } = require('../storage/postgres/createPostgresPool');
const { validateSourceStatus } = require('./norwegianSourceStatus');
const { normalizeNorwegianSettings } = require('./norwegianSettings');

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS norwegian_learning_profile (
    user_scope TEXT PRIMARY KEY,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS norwegian_lessons (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS norwegian_corrections (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    original_text TEXT NOT NULL DEFAULT '',
    corrected_text TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS norwegian_pronunciation_attempts (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    target_phrase TEXT NOT NULL DEFAULT '',
    -- transcript_text stored for comparison only; never logged to error streams
    transcript_text TEXT NOT NULL DEFAULT '',
    stt_confidence NUMERIC(3,2),
    score INTEGER,
    grade TEXT,
    feedback TEXT NOT NULL DEFAULT '',
    correction_focus TEXT NOT NULL DEFAULT '',
    attempt_number INTEGER NOT NULL DEFAULT 1,
    source_status TEXT NOT NULL,
    tts_example_provider TEXT,
    source_channel TEXT,
    source_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS norwegian_pronunciation_sessions (
    user_scope TEXT PRIMARY KEY,
    target_phrase TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
  );

  CREATE TABLE IF NOT EXISTS norwegian_vocabulary (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    word TEXT NOT NULL DEFAULT '',
    translation TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS norwegian_media_links (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    media_type TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS norwegian_review_items (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const MIGRATION_SQL = `
  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS target_phrase TEXT NOT NULL DEFAULT '';

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS transcript_text TEXT NOT NULL DEFAULT '';

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS stt_confidence NUMERIC(3,2);

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS score INTEGER;

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS grade TEXT;

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS feedback TEXT NOT NULL DEFAULT '';

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS correction_focus TEXT NOT NULL DEFAULT '';

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS tts_example_provider TEXT;

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS source_channel TEXT;

  ALTER TABLE IF EXISTS norwegian_pronunciation_attempts
  ADD COLUMN IF NOT EXISTS source_message_id TEXT;
`;

function normalizeUserScope(value) {
  const scope = String(value || '').trim();
  if (!scope) throw new Error('[norwegian] userScope is required');
  return scope;
}

function requireSourceStatus(event, fieldName = 'sourceStatus') {
  const status = event && event[fieldName];
  if (!status) throw new Error(`[norwegian] ${fieldName} is required`);
  return validateSourceStatus(status);
}

function createNoopNorwegianLearningStore({ logger }) {
  return {
    available: false,
    async init() {
      logger.warn('[norwegian] DATABASE_URL is not set; Norwegian learning store is disabled.');
    },
    async getProfile() { return null; },
    async saveProfile() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async saveLesson() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async saveCorrection() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async savePronunciationAttempt() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async saveVocabularyItem() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async saveMediaLink() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async saveReviewItem() { throw new Error('[norwegian] Store disabled — no DATABASE_URL.'); },
    async getOverview() { return null; },
  };
}

function createNorwegianLearningStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopNorwegianLearningStore({ logger });
  }

  return {
    available: true,

    async init() {
      await pool.query(CREATE_TABLES_SQL);
      await pool.query(MIGRATION_SQL);
      logger.info('[norwegian] storage initialised');
    },

    async getProfile(userScope) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT settings FROM norwegian_learning_profile WHERE user_scope = $1`,
        [scope],
      );

      if (!rows.length) {
        return null;
      }

      const settings = normalizeNorwegianSettings(rows[0].settings);
      logger.debug?.(`[norwegian] profile loaded userScope=${scope}`);
      return settings;
    },

    async saveProfile(userScope, settings) {
      const scope = normalizeUserScope(userScope);
      const normalized = normalizeNorwegianSettings(settings);

      await pool.query(
        `
          INSERT INTO norwegian_learning_profile (user_scope, settings, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (user_scope)
          DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
        `,
        [scope, JSON.stringify(normalized)],
      );

      logger.info(`[norwegian] profile saved userScope=${scope} enabled=${normalized.enabled} level=${normalized.level}`);
      return normalized;
    },

    async saveLesson(event) {
      const status = requireSourceStatus(event);
      const scope = normalizeUserScope(event.userScope);

      const { rows } = await pool.query(
        `
          INSERT INTO norwegian_lessons (user_scope, topic, level, source_status, notes)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          scope,
          String(event.topic || '').slice(0, 500),
          String(event.level || '').slice(0, 20),
          status,
          String(event.notes || '').slice(0, 1000),
        ],
      );

      return { id: rows[0].id };
    },

    async saveCorrection(event) {
      const status = requireSourceStatus(event);
      const scope = normalizeUserScope(event.userScope);

      const { rows } = await pool.query(
        `
          INSERT INTO norwegian_corrections (user_scope, original_text, corrected_text, explanation, source_status)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          scope,
          String(event.originalText || '').slice(0, 2000),
          String(event.correctedText || '').slice(0, 2000),
          String(event.explanation || '').slice(0, 2000),
          status,
        ],
      );

      return { id: rows[0].id };
    },

    async savePronunciationAttempt(event) {
      const status = requireSourceStatus(event);
      const scope = normalizeUserScope(event.userScope);

      const { rows } = await pool.query(
        `
          INSERT INTO norwegian_pronunciation_attempts (
            user_scope, target_phrase, transcript_text, stt_confidence, score, grade,
            feedback, correction_focus, attempt_number, source_status, tts_example_provider,
            source_channel, source_message_id, word_or_phrase
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id
        `,
        [
          scope,
          String(event.targetPhrase || event.wordOrPhrase || '').slice(0, 500),
          String(event.transcriptText || '').slice(0, 2000),
          event.sttConfidence !== undefined && event.sttConfidence !== null ? Number(event.sttConfidence) : null,
          event.score !== undefined && event.score !== null ? Number(event.score) : null,
          String(event.grade || '').slice(0, 20),
          String(event.feedback || '').slice(0, 2000),
          String(event.correctionFocus || '').slice(0, 500),
          event.attemptNumber !== undefined && event.attemptNumber !== null ? Number(event.attemptNumber) : 1,
          status,
          String(event.ttsExampleProvider || '').slice(0, 50),
          String(event.sourceChannel || '').slice(0, 50),
          String(event.sourceMessageId || '').slice(0, 50),
          String(event.wordOrPhrase || event.targetPhrase || '').slice(0, 500),
        ],
      );

      return { id: rows[0].id };
    },

    async saveVocabularyItem(event) {
      const status = requireSourceStatus(event);
      const scope = normalizeUserScope(event.userScope);

      const { rows } = await pool.query(
        `
          INSERT INTO norwegian_vocabulary (user_scope, word, translation, source_status, notes)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          scope,
          String(event.word || '').slice(0, 200),
          String(event.translation || '').slice(0, 500),
          status,
          String(event.notes || '').slice(0, 1000),
        ],
      );

      return { id: rows[0].id };
    },

    async saveMediaLink(event) {
      const status = requireSourceStatus(event);
      const scope = normalizeUserScope(event.userScope);

      const { rows } = await pool.query(
        `
          INSERT INTO norwegian_media_links (user_scope, title, media_type, source_id, source_status, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [
          scope,
          String(event.title || '').slice(0, 500),
          String(event.mediaType || '').slice(0, 50),
          String(event.sourceId || '').slice(0, 100),
          status,
          String(event.notes || '').slice(0, 1000),
        ],
      );

      return { id: rows[0].id };
    },

    async saveReviewItem(event) {
      const status = requireSourceStatus(event);
      const scope = normalizeUserScope(event.userScope);

      const { rows } = await pool.query(
        `
          INSERT INTO norwegian_review_items (user_scope, item_type, content, source_status, due_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          scope,
          String(event.itemType || '').slice(0, 50),
          String(event.content || '').slice(0, 2000),
          status,
          event.dueAt || null,
        ],
      );

      return { id: rows[0].id };
    },

    async getOverview(userScope) {
      const scope = normalizeUserScope(userScope);

      const [profileResult, countsResult] = await Promise.all([
        pool.query(`SELECT settings FROM norwegian_learning_profile WHERE user_scope = $1`, [scope]),
        pool.query(
          `
            SELECT
              (SELECT COUNT(*) FROM norwegian_lessons WHERE user_scope = $1) AS lesson_count,
              (SELECT COUNT(*) FROM norwegian_corrections WHERE user_scope = $1) AS correction_count,
              (SELECT COUNT(*) FROM norwegian_vocabulary WHERE user_scope = $1) AS vocabulary_count,
              (SELECT COUNT(*) FROM norwegian_review_items WHERE user_scope = $1 AND (due_at IS NULL OR due_at <= NOW())) AS review_due_count
          `,
          [scope],
        ),
      ]);

      const settings = profileResult.rows.length
        ? normalizeNorwegianSettings(profileResult.rows[0].settings)
        : null;

      const counts = countsResult.rows[0] || {};

      return {
        settings,
        lessonCount: Number(counts.lesson_count || 0),
        correctionCount: Number(counts.correction_count || 0),
        vocabularyCount: Number(counts.vocabulary_count || 0),
        reviewDueCount: Number(counts.review_due_count || 0),
      };
    },

    async listNorwegianLessons(userScope, limit = 50) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT id, topic, level, source_status, notes, created_at FROM norwegian_lessons WHERE user_scope = $1 ORDER BY created_at DESC LIMIT $2`,
        [scope, limit],
      );
      return rows;
    },

    async listNorwegianCorrections(userScope, limit = 50) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT id, original_text, corrected_text, explanation, source_status, created_at FROM norwegian_corrections WHERE user_scope = $1 ORDER BY created_at DESC LIMIT $2`,
        [scope, limit],
      );
      return rows;
    },

    async listNorwegianVocabulary(userScope, limit = 100) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT id, word, translation, source_status, notes, created_at FROM norwegian_vocabulary WHERE user_scope = $1 ORDER BY created_at DESC LIMIT $2`,
        [scope, limit],
      );
      return rows;
    },

    async listNorwegianMediaLinks(userScope, limit = 50) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT id, title, media_type, source_id, source_status, notes, created_at FROM norwegian_media_links WHERE user_scope = $1 ORDER BY created_at DESC LIMIT $2`,
        [scope, limit],
      );
      return rows;
    },

    async listNorwegianReviewItems(userScope, limit = 50) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT id, item_type, content, source_status, due_at, created_at FROM norwegian_review_items WHERE user_scope = $1 ORDER BY COALESCE(due_at, created_at) DESC LIMIT $2`,
        [scope, limit],
      );
      return rows;
    },

    async listNorwegianPronunciationAttempts(userScope, limit = 50) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT id, word_or_phrase, source_status, notes, created_at FROM norwegian_pronunciation_attempts WHERE user_scope = $1 ORDER BY created_at DESC LIMIT $2`,
        [scope, limit],
      );
      return rows;
    },

    async updateNorwegianReviewItem(userScope, itemId, updates) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `UPDATE norwegian_review_items SET due_at = COALESCE($3, due_at), content = COALESCE($4, content) WHERE id = $1 AND user_scope = $2 RETURNING *`,
        [itemId, scope, updates.dueAt || null, updates.content || null],
      );
      return rows[0] || null;
    },

    async createPronunciationSession(userScope, targetPhrase) {
      const scope = normalizeUserScope(userScope);
      const phrase = String(targetPhrase || '').trim();
      if (!phrase) throw new Error('[norwegian] Target phrase is required');

      await pool.query(
        `
          INSERT INTO norwegian_pronunciation_sessions (user_scope, target_phrase, active, expires_at)
          VALUES ($1, $2, true, NOW() + INTERVAL '30 minutes')
          ON CONFLICT (user_scope)
          DO UPDATE SET target_phrase = $2, started_at = NOW(), attempt_count = 0, active = true, expires_at = NOW() + INTERVAL '30 minutes'
        `,
        [scope, phrase.slice(0, 500)],
      );

      logger.info('[norwegian-pronunciation] session started', { userScope: scope, phraseLength: phrase.length });
      return { userScope: scope, targetPhrase: phrase };
    },

    async getPronunciationSession(userScope) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `SELECT * FROM norwegian_pronunciation_sessions WHERE user_scope = $1 AND active = true AND expires_at > NOW()`,
        [scope],
      );
      return rows[0] || null;
    },

    async updatePronunciationSession(userScope, updates) {
      const scope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `
          UPDATE norwegian_pronunciation_sessions
          SET attempt_count = COALESCE($2, attempt_count + 1),
              last_attempt_at = NOW(),
              active = COALESCE($3, active)
          WHERE user_scope = $1
          RETURNING *
        `,
        [scope, updates.attemptCount !== undefined ? updates.attemptCount : null, updates.active !== undefined ? updates.active : null],
      );
      return rows[0] || null;
    },

    async closePronunciationSession(userScope) {
      const scope = normalizeUserScope(userScope);
      await pool.query(
        `UPDATE norwegian_pronunciation_sessions SET active = false WHERE user_scope = $1`,
        [scope],
      );
      logger.info('[norwegian-pronunciation] session ended', { userScope: scope });
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createNorwegianLearningStore };
