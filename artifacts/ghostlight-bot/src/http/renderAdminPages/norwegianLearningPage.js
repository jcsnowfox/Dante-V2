const {
  NORWEGIAN_LEVELS,
  NORWEGIAN_CORRECTION_STYLES,
  NORWEGIAN_DAILY_LESSON_LENGTHS,
  DEFAULT_NORWEGIAN_SETTINGS,
} = require('../../norwegian/norwegianSettings');

function renderNorwegianLearningPage({
  settings,
  overview = null,
  storeAvailable = false,
  theme = 'light',
  helpers = {},
}) {
  const esc = helpers.escapeHtml || ((v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
  const withThemeField = helpers.withThemeField || (() => '');

  const s = settings || DEFAULT_NORWEGIAN_SETTINGS;
  const isEnabled = Boolean(s.enabled);

  const storeWarning = storeAvailable ? '' : `
    <p class="nw-notice nw-notice-warn">
      No database connection — settings cannot be saved and Norwegian Learning Mode stays inactive.
    </p>`;

  function renderToggleRow(id, name, label, description, checked) {
    return `
      <div class="nw-row">
        <div class="nw-row-info">
          <label class="nw-row-label" for="nw-${esc(id)}">${esc(label)}</label>
          <p class="nw-row-desc">${esc(description)}</p>
        </div>
        <label class="nw-toggle-wrap" aria-label="${esc(label)}">
          <input class="nw-toggle" type="checkbox" id="nw-${esc(id)}" name="${esc(name)}" value="true"${checked ? ' checked' : ''} />
        </label>
      </div>`;
  }

  function renderSelectRow(id, name, label, description, options, currentValue) {
    const opts = options.map((o) => {
      const val = typeof o === 'object' ? o.value : String(o);
      const lab = typeof o === 'object' ? o.label : String(o);
      return `<option value="${esc(val)}"${currentValue === val ? ' selected' : ''}>${esc(lab)}</option>`;
    }).join('');
    return `
      <div class="nw-row">
        <div class="nw-row-info">
          <label class="nw-row-label" for="nw-${esc(id)}">${esc(label)}</label>
          <p class="nw-row-desc">${esc(description)}</p>
        </div>
        <select id="nw-${esc(id)}" name="${esc(name)}" class="nw-select">
          ${opts}
        </select>
      </div>`;
  }

  const levelOptions = NORWEGIAN_LEVELS.map((l) => ({ value: l, label: l }));
  const correctionOptions = NORWEGIAN_CORRECTION_STYLES.map((c) => ({
    value: c,
    label: c.charAt(0).toUpperCase() + c.slice(1),
  }));
  const lessonLengthOptions = NORWEGIAN_DAILY_LESSON_LENGTHS.map((n) => ({
    value: String(n),
    label: `${n} minutes`,
  }));

  const overviewHtml = overview ? `
    <div class="nw-overview-grid">
      <div class="nw-stat">
        <span class="nw-stat-value">${esc(String(overview.lessonCount || 0))}</span>
        <span class="nw-stat-label">Lessons</span>
      </div>
      <div class="nw-stat">
        <span class="nw-stat-value">${esc(String(overview.correctionCount || 0))}</span>
        <span class="nw-stat-label">Corrections</span>
      </div>
      <div class="nw-stat">
        <span class="nw-stat-value">${esc(String(overview.vocabularyCount || 0))}</span>
        <span class="nw-stat-label">Vocabulary items</span>
      </div>
      <div class="nw-stat">
        <span class="nw-stat-value">${esc(String(overview.reviewDueCount || 0))}</span>
        <span class="nw-stat-label">Reviews due</span>
      </div>
    </div>` : '';

  return `
<style>
.nw-page { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; }
.nw-header { margin-bottom: 24px; }
.nw-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 6px; }
.nw-subtitle { font-size: .93rem; color: var(--gl-text-muted, #666); margin: 0; }
.nw-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; font-weight: 600; background: var(--gl-badge-bg, #e8f5e9); color: var(--gl-badge-text, #2e7d32); vertical-align: middle; margin-left: 8px; }
.nw-badge-off { background: var(--gl-badge-off-bg, #f5f5f5); color: var(--gl-badge-off-text, #888); }
.nw-card { background: var(--gl-card-bg, #fff); border: 1px solid var(--gl-line, #e0e0e0); border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
.nw-section-title { font-size: 1rem; font-weight: 700; margin: 0 0 4px; }
.nw-section-desc { font-size: .88rem; color: var(--gl-text-muted, #666); margin: 0 0 16px; }
.nw-row { display: flex; align-items: flex-start; gap: 16px; padding: 12px 0; border-top: 1px solid var(--gl-line, #f0f0f0); }
.nw-row:first-of-type { border-top: none; }
.nw-row-info { flex: 1; min-width: 0; }
.nw-row-label { font-weight: 600; font-size: .92rem; display: block; margin-bottom: 2px; }
.nw-row-desc { font-size: .83rem; color: var(--gl-text-muted, #666); margin: 0; }
.nw-toggle-wrap { flex-shrink: 0; cursor: pointer; }
.nw-toggle { width: 44px; height: 24px; cursor: pointer; }
.nw-select { padding: 6px 10px; border: 1px solid var(--gl-line, #ccc); border-radius: 8px; font-size: .92rem; background: var(--gl-input-bg, #fafafa); color: var(--gl-text, #222); min-width: 140px; }
.nw-save-bar { position: sticky; bottom: 0; background: rgba(255,255,255,.97); border-top: 1px solid var(--gl-line, #e0e0e0); padding: 12px 24px; display: flex; align-items: center; gap: 12px; z-index: 10; backdrop-filter: blur(4px); }
.nw-save-bar-title { flex: 1; font-weight: 600; font-size: .95rem; margin: 0; }
.nw-btn { padding: 8px 20px; border-radius: 8px; border: 1px solid var(--gl-line, #ccc); background: var(--gl-btn-bg, #f5f5f5); color: var(--gl-text, #222); font-size: .92rem; font-weight: 600; cursor: pointer; }
.nw-btn-primary { background: var(--gl-accent, #3d5afe); color: #fff; border-color: var(--gl-accent, #3d5afe); }
.nw-notice { padding: 10px 14px; border-radius: 8px; font-size: .88rem; margin: 0 0 16px; }
.nw-notice-warn { background: #fff8e1; color: #7c5300; border: 1px solid #ffe082; }
.nw-source-info { background: var(--gl-info-bg, #f0f4ff); border: 1px solid var(--gl-info-line, #c5cae9); border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; font-size: .88rem; }
.nw-source-info h3 { margin: 0 0 6px; font-size: .93rem; font-weight: 700; }
.nw-source-info ul { margin: 0; padding-left: 18px; }
.nw-source-info li { margin-bottom: 4px; }
.nw-overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-top: 12px; }
.nw-stat { text-align: center; padding: 12px; background: var(--gl-card-alt, #fafafa); border-radius: 8px; border: 1px solid var(--gl-line, #e0e0e0); }
.nw-stat-value { display: block; font-size: 1.5rem; font-weight: 700; }
.nw-stat-label { display: block; font-size: .78rem; color: var(--gl-text-muted, #666); margin-top: 2px; }
</style>

<div class="nw-page">
  <div class="nw-header">
    <h1 class="nw-title">
      Norwegian Learning Mode
      <span class="nw-badge${isEnabled ? '' : ' nw-badge-off'}">${isEnabled ? 'Enabled' : 'Disabled'}</span>
    </h1>
    <p class="nw-subtitle">
      Written standard: Bokmål &mdash; Spoken target: Oslo-region / Standard Eastern Norwegian.
      Source-checked learning only.
    </p>
  </div>

  ${storeWarning}

  <div class="nw-source-info">
    <h3>Source Policy</h3>
    <ul>
      <li>Vocabulary and grammar must be verified or labelled as unverified practice.</li>
      <li>If a source and the AI disagree, the source wins.</li>
      <li>Media links are only shown when verified as real URLs.</li>
      <li>Norwegian has many dialects — this system teaches a practical Oslo-region standard, not a claim of universal correctness.</li>
    </ul>
  </div>

  <form id="nw-settings-form" method="POST" action="/admin/actions/norwegian-save">
    ${withThemeField(theme)}

    <div class="nw-card">
      <h2 class="nw-section-title">Core Settings</h2>
      <p class="nw-section-desc">Enable and configure Norwegian Learning Mode.</p>

      ${renderToggleRow('enabled', 'enabled', 'Norwegian mode enabled',
        'Turn on to enable Norwegian learning features.', isEnabled)}

      ${renderSelectRow('level', 'level', 'Level',
        'Your current Norwegian proficiency level.',
        levelOptions, s.level)}

      ${renderSelectRow('correction-style', 'correctionStyle', 'Correction style',
        'How Dante gives feedback on your Norwegian.',
        correctionOptions, s.correctionStyle)}

      ${renderSelectRow('lesson-length', 'dailyLessonLengthMinutes', 'Daily lesson length',
        'Target length for daily learning sessions.',
        lessonLengthOptions, String(s.dailyLessonLengthMinutes))}
    </div>

    <div class="nw-card">
      <h2 class="nw-section-title">Source &amp; Accuracy</h2>
      <p class="nw-section-desc">Controls that enforce source-checked learning.</p>

      ${renderToggleRow('source-check', 'requireSourceCheck', 'Require source check',
        'Content must have a source status before being used. Strongly recommended.',
        Boolean(s.requireSourceCheck))}

      ${renderToggleRow('unverified-practice', 'allowUnverifiedPracticeHelp', 'Allow unverified practice help',
        'Allow AI-generated practice help labelled as unverified_practice. Off by default.',
        Boolean(s.allowUnverifiedPracticeHelp))}
    </div>

    <div class="nw-card">
      <h2 class="nw-section-title">Media Recommendations</h2>
      <p class="nw-section-desc">Enable media types for Norwegian learning recommendations. Only verified URLs will be shown.</p>

      ${renderToggleRow('media', 'mediaRecommendationsEnabled', 'Media recommendations',
        'Allow Norwegian media recommendations.', Boolean(s.mediaRecommendationsEnabled))}

      ${renderToggleRow('news', 'newsRecommendationsEnabled', 'News recommendations',
        'Allow Norwegian news recommendations (e.g. NRK Nyheter).', Boolean(s.newsRecommendationsEnabled))}

      ${renderToggleRow('youtube', 'youtubeRecommendationsEnabled', 'YouTube recommendations',
        'Allow verified YouTube content recommendations.', Boolean(s.youtubeRecommendationsEnabled))}

      ${renderToggleRow('tv', 'tvRecommendationsEnabled', 'TV recommendations',
        'Allow Norwegian TV recommendations (e.g. NRK TV).', Boolean(s.tvRecommendationsEnabled))}
    </div>

    <div class="nw-card">
      <h2 class="nw-section-title">Voice Practice</h2>
      <p class="nw-section-desc">Foundation toggle only — full voice coaching comes in a later phase.</p>

      ${renderToggleRow('voice-practice', 'voicePracticeEnabled', 'Voice practice enabled',
        'Reserve for Phase 2+ voice practice features. No voice processing is active in Phase 1.',
        Boolean(s.voicePracticeEnabled))}
    </div>

    <div class="nw-save-bar" id="nw-save-bar">
      <p class="nw-save-bar-title" id="nw-bar-title">Norwegian Learning Settings</p>
      <button type="button" class="nw-btn" onclick="nwReset()">Reset</button>
      <button type="submit" class="nw-btn nw-btn-primary"${storeAvailable ? '' : ' disabled aria-disabled="true"'}>
        Save Settings
      </button>
    </div>
  </form>

  ${overview ? `
  <div class="nw-card" style="margin-top: 8px;">
    <h2 class="nw-section-title">Learning Overview</h2>
    <p class="nw-section-desc">Stats for this user scope.</p>
    ${overviewHtml}
  </div>` : ''}

  <div class="nw-card" style="margin-top: 8px;">
    <h2 class="nw-section-title">Written Standard &amp; Spoken Target</h2>
    <p class="nw-section-desc">
      <strong>Written standard:</strong> Bokmål &mdash;
      <strong>Spoken target:</strong> Oslo-region / Standard Eastern Norwegian.
      Norwegian has many dialects. This is a practical choice for a learner,
      not a claim that other dialects are incorrect.
    </p>
  </div>
</div>

<script>
(function(){
  var form = document.getElementById('nw-settings-form');
  var barTitle = document.getElementById('nw-bar-title');
  var initial = {};

  if (form) {
    form.querySelectorAll('input[type=checkbox],select').forEach(function(el) {
      initial[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    form.addEventListener('change', function() {
      if (barTitle) barTitle.textContent = 'Unsaved changes — save when ready';
    });
  }

  window.nwReset = function() {
    if (!form) return;
    form.querySelectorAll('input[type=checkbox],select').forEach(function(el) {
      if (el.name in initial) {
        if (el.type === 'checkbox') el.checked = initial[el.name];
        else el.value = initial[el.name];
      }
    });
    if (barTitle) barTitle.textContent = 'Norwegian Learning Settings';
  };
})();
</script>`;
}

module.exports = { renderNorwegianLearningPage };
