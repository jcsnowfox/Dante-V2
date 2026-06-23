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
    word_or_phrase TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
          INSERT INTO norwegian_pronunciation_attempts (user_scope, word_or_phrase, source_status, notes)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [
          scope,
          String(event.wordOrPhrase || '').slice(0, 500),
          status,
          String(event.notes || '').slice(0, 1000),
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

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createNorwegianLearningStore };
