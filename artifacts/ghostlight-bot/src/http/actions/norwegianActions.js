const { parseRequestForm } = require('../adminRequestUtils');
const { normalizeTheme, buildReturnLocation } = require('../adminUiHelpers');
const { normalizeNorwegianSettings } = require('../../norwegian/norwegianSettings');

const RETURN_PATH = '/admin/norwegian';

function fieldValue(fields, key) {
  const raw = fields[key];
  return String(Array.isArray(raw) ? raw[0] : raw || '').trim();
}

function redirect(innerRes, { returnTo, theme, message, error }) {
  return innerRes.writeHead(303, {
    Location: buildReturnLocation({
      returnTo,
      fallbackPath: RETURN_PATH,
      theme,
      message,
      error,
    }),
  }).end();
}

async function handleNorwegianActions({ req, res, url, context, withAdmin }) {
  if (req.method === 'POST' && url.pathname === '/admin/actions/norwegian-save') {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, 'returnTo') || RETURN_PATH;
      const store = innerContext.norwegianLearning || null;
      const userScope = innerContext.config?.memory?.userScope || 'user';

      if (!store || store.available !== true) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: 'Could not save — no database is configured for Norwegian Learning.',
        });
      }

      const parsed = {
        enabled: Boolean(fields.enabled),
        level: fieldValue(fields, 'level'),
        writtenStandard: 'bokmal',
        spokenTarget: 'oslo_standard_eastern',
        correctionStyle: fieldValue(fields, 'correctionStyle'),
        dailyLessonLengthMinutes: Number(fieldValue(fields, 'dailyLessonLengthMinutes')) || 5,
        mediaRecommendationsEnabled: Boolean(fields.mediaRecommendationsEnabled),
        newsRecommendationsEnabled: Boolean(fields.newsRecommendationsEnabled),
        youtubeRecommendationsEnabled: Boolean(fields.youtubeRecommendationsEnabled),
        tvRecommendationsEnabled: Boolean(fields.tvRecommendationsEnabled),
        voicePracticeEnabled: Boolean(fields.voicePracticeEnabled),
        requireSourceCheck: Boolean(fields.requireSourceCheck),
        allowUnverifiedPracticeHelp: Boolean(fields.allowUnverifiedPracticeHelp),
      };

      let normalized;
      try {
        normalized = normalizeNorwegianSettings(parsed);
      } catch (error) {
        innerContext.logger?.warn?.('[norwegian] Settings normalization failed', { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: 'Invalid Norwegian settings.' });
      }

      try {
        await store.saveProfile(userScope, normalized);
      } catch (error) {
        innerContext.logger?.error?.('[norwegian] Failed to save settings from dashboard.', {
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: 'Failed to save Norwegian Learning settings.' });
      }

      return redirect(innerRes, { returnTo, theme, message: 'Saved Norwegian Learning settings.' });
    })(req, res, context);
  }

  return false;
}

module.exports = { handleNorwegianActions };
