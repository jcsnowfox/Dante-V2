const { DEFAULT_NORWEGIAN_SETTINGS } = require('../../norwegian/norwegianSettings');

function renderNorwegianDashboard({
  settings = null,
  overview = null,
  lessons = [],
  corrections = [],
  vocabulary = [],
  mediaLinks = [],
  reviewItems = [],
  pronunciationAttempts = [],
  storeAvailable = false,
  theme = 'light',
  helpers = {},
  activeTab = 'overview',
}) {
  const esc = helpers.escapeHtml || ((v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );

  const s = settings || DEFAULT_NORWEGIAN_SETTINGS;
  const isEnabled = Boolean(s.enabled);

  function renderSourceStatusBadge(status) {
    const labels = {
      verified: '✅ Verified',
      partial: '⚠️ Partial',
      stt_based_practice: '🎤 STT-based',
      low_confidence: '❓ Low confidence',
      unverified_practice: '📚 Unverified',
      not_checked: '⬜ Not checked',
    };
    return labels[status] || status;
  }

  function renderGradeBadge(grade) {
    const grades = { A: '✅ A', B: '👍 B', C: '⚠️ C', D: '❌ D', Retry: '🔄 Retry' };
    return grades[grade] || grade;
  }

  function renderOverviewTab() {
    if (!overview) {
      return `
        <div class="nw-empty">
          <p>No learning data available. Use /norwegian commands in Discord to get started.</p>
        </div>`;
    }

    const o = overview;
    return `
      <div class="nw-overview">
        <div class="nw-overview-grid">
          <div class="nw-stat">
            <span class="nw-stat-value">${o.lessonCount || 0}</span>
            <span class="nw-stat-label">Lessons</span>
          </div>
          <div class="nw-stat">
            <span class="nw-stat-value">${o.correctionCount || 0}</span>
            <span class="nw-stat-label">Corrections</span>
          </div>
          <div class="nw-stat">
            <span class="nw-stat-value">${o.vocabularyCount || 0}</span>
            <span class="nw-stat-label">Vocabulary</span>
          </div>
          <div class="nw-stat">
            <span class="nw-stat-value">${o.reviewDueCount || 0}</span>
            <span class="nw-stat-label">Due for review</span>
          </div>
        </div>

        <div class="nw-settings-summary">
          <h3>Learning Profile</h3>
          <table class="nw-summary-table">
            <tr><td>Mode:</td><td>${isEnabled ? '🟢 Enabled' : '🔴 Disabled'}</td></tr>
            <tr><td>Level:</td><td>${esc(s.level)}</td></tr>
            <tr><td>Written Standard:</td><td>Bokmål</td></tr>
            <tr><td>Spoken Target:</td><td>Oslo-region / Standard Eastern Norwegian</td></tr>
            <tr><td>Correction Style:</td><td>${esc(s.correctionStyle)}</td></tr>
            <tr><td>Require Source Check:</td><td>${s.requireSourceCheck ? '✅ Yes' : '❌ No'}</td></tr>
          </table>
        </div>
      </div>`;
  }

  function renderLessonsTab() {
    if (lessons.length === 0) {
      return `<div class="nw-empty"><p>No lessons yet. Use /norwegian lesson in Discord.</p></div>`;
    }

    const html = lessons.slice(0, 20).map((lesson) => {
      const notes = lesson.notes ? JSON.parse(lesson.notes) : {};
      return `
        <div class="nw-lesson-card">
          <div class="nw-card-header">
            <h3>${esc(notes.title || 'Lesson')}</h3>
            <span class="nw-badge-status">${renderSourceStatusBadge(lesson.source_status)}</span>
          </div>
          <div class="nw-card-meta">
            <span class="nw-meta-item">📅 ${new Date(lesson.created_at).toLocaleDateString()}</span>
            <span class="nw-meta-item">📚 Level: ${esc(lesson.level)}</span>
            <span class="nw-meta-item">🎯 Topic: ${esc(lesson.topic)}</span>
          </div>
          ${notes.vocabulary && notes.vocabulary.length > 0 ? `
            <div class="nw-card-vocab">
              <strong>Vocabulary:</strong> ${notes.vocabulary.map((v) => `<code>${esc(v.word)}</code>`).join(', ')}
            </div>
          ` : ''}
          ${notes.exampleSentences && notes.exampleSentences.length > 0 ? `
            <div class="nw-card-examples">
              <strong>Examples:</strong>
              ${notes.exampleSentences.slice(0, 2).map((ex) => `<div class="nw-example"><em>${esc(ex.norwegian)}</em></div>`).join('')}
            </div>
          ` : ''}
        </div>`;
    }).join('');

    return `<div class="nw-cards">${html}</div>`;
  }

  function renderCorrectionsTab() {
    if (corrections.length === 0) {
      return `<div class="nw-empty"><p>No corrections yet. Use /norwegian correct in Discord.</p></div>`;
    }

    const html = corrections.slice(0, 20).map((corr) => `
      <div class="nw-correction-card">
        <div class="nw-card-header">
          <h3>Correction</h3>
          <span class="nw-badge-status">${renderSourceStatusBadge(corr.source_status)}</span>
        </div>
        <div class="nw-card-meta">
          <span class="nw-meta-item">📅 ${new Date(corr.created_at).toLocaleDateString()}</span>
        </div>
        <div class="nw-correction-pair">
          <div class="nw-correction-row">
            <strong>Original:</strong>
            <code>${esc(corr.original_text)}</code>
          </div>
          <div class="nw-correction-row">
            <strong>Corrected:</strong>
            <code>${esc(corr.corrected_text)}</code>
          </div>
        </div>
        ${corr.explanation ? `
          <div class="nw-explanation">
            <strong>Why:</strong> ${esc(corr.explanation)}
          </div>
        ` : ''}
      </div>`).join('');

    return `<div class="nw-cards">${html}</div>`;
  }

  function renderVocabularyTab() {
    if (vocabulary.length === 0) {
      return `<div class="nw-empty"><p>No vocabulary yet. Use /norwegian word in Discord.</p></div>`;
    }

    const html = vocabulary.slice(0, 30).map((word) => `
      <div class="nw-vocab-card">
        <div class="nw-vocab-header">
          <h3>${esc(word.word)}</h3>
          <span class="nw-badge-status">${renderSourceStatusBadge(word.source_status)}</span>
        </div>
        <div class="nw-vocab-meaning">
          <strong>English:</strong> ${esc(word.translation)}
        </div>
        <div class="nw-vocab-meta">
          <span class="nw-meta-item">📅 ${new Date(word.created_at).toLocaleDateString()}</span>
        </div>
      </div>`).join('');

    return `<div class="nw-cards">${html}</div>`;
  }

  function renderMediaTab() {
    if (mediaLinks.length === 0) {
      return `<div class="nw-empty"><p>No media recommendations yet. Use /norwegian media in Discord.</p></div>`;
    }

    const html = mediaLinks.slice(0, 20).map((media) => {
      const notes = media.notes ? JSON.parse(media.notes) : {};
      return `
        <div class="nw-media-card">
          <div class="nw-card-header">
            <h3><a href="${esc(media.source_id)}" target="_blank" rel="noopener">${esc(media.title)}</a></h3>
            <span class="nw-badge-status">${renderSourceStatusBadge(media.source_status)}</span>
          </div>
          <div class="nw-card-meta">
            <span class="nw-meta-item">📺 ${esc(media.media_type)}</span>
            <span class="nw-meta-item">📅 ${new Date(media.created_at).toLocaleDateString()}</span>
            ${notes.level ? `<span class="nw-meta-item">📚 ${esc(notes.level)}</span>` : ''}
            ${notes.source ? `<span class="nw-meta-item">📍 ${esc(notes.source)}</span>` : ''}
          </div>
          <div class="nw-media-url">
            <a href="${esc(media.source_id)}" target="_blank" rel="noopener">Open link →</a>
          </div>
        </div>`;
    }).join('');

    return `<div class="nw-cards">${html}</div>`;
  }

  function renderReviewTab() {
    if (reviewItems.length === 0) {
      return `<div class="nw-empty"><p>No review items yet. Corrections and lessons will appear here.</p></div>`;
    }

    const html = reviewItems.slice(0, 20).map((item) => `
      <div class="nw-review-card">
        <div class="nw-card-header">
          <h3>${esc(item.item_type)}</h3>
          <span class="nw-badge-status">${renderSourceStatusBadge(item.source_status)}</span>
        </div>
        ${item.due_at ? `
          <div class="nw-card-meta">
            <span class="nw-meta-item">⏰ Due: ${new Date(item.due_at).toLocaleDateString()}</span>
          </div>
        ` : ''}
        <div class="nw-review-meta">
          <span class="nw-meta-item">📅 Created: ${new Date(item.created_at).toLocaleDateString()}</span>
        </div>
      </div>`).join('');

    return `<div class="nw-cards">${html}</div>`;
  }

  function renderPronunciationTab() {
    if (pronunciationAttempts.length === 0) {
      return `
        <div class="nw-empty">
          <p>📢 Pronunciation coaching comes in Phase 4.</p>
          <p>This tab will show voice-note attempts, grades, and feedback.</p>
        </div>`;
    }

    const html = pronunciationAttempts.slice(0, 20).map((attempt) => `
      <div class="nw-pronunciation-card">
        <div class="nw-card-header">
          <h3>${esc(attempt.word_or_phrase)}</h3>
          <span class="nw-badge-status">${renderSourceStatusBadge(attempt.source_status)}</span>
        </div>
        <div class="nw-card-meta">
          <span class="nw-meta-item">📅 ${new Date(attempt.created_at).toLocaleDateString()}</span>
        </div>
      </div>`).join('');

    return `<div class="nw-cards">${html}</div>`;
  }

  function renderSettingsTab() {
    const storeWarning = storeAvailable ? '' : `
      <div class="nw-notice nw-notice-warn">
        No database — settings cannot be saved.
      </div>`;

    return `
      ${storeWarning}
      <form method="POST" action="/admin/actions/norwegian-save" class="nw-settings-form">
        <div class="nw-settings-group">
          <h3>Learning Mode</h3>
          <label class="nw-toggle-row">
            <input type="checkbox" name="enabled" value="true"${s.enabled ? ' checked' : ''} />
            <span>Enable Norwegian Learning Mode</span>
          </label>
        </div>

        <div class="nw-settings-group">
          <h3>Language Standards</h3>
          <div class="nw-form-row">
            <label>Level:</label>
            <select name="level">
              <option${s.level === 'beginner' ? ' selected' : ''}>beginner</option>
              <option${s.level === 'A1' ? ' selected' : ''}>A1</option>
              <option${s.level === 'A2' ? ' selected' : ''}>A2</option>
              <option${s.level === 'B1' ? ' selected' : ''}>B1</option>
              <option${s.level === 'B2' ? ' selected' : ''}>B2</option>
            </select>
          </div>
          <div class="nw-form-row">
            <label>Written Standard:</label>
            <div class="nw-text-field">Bokmål (fixed)</div>
          </div>
          <div class="nw-form-row">
            <label>Spoken Target:</label>
            <div class="nw-text-field">Oslo-region / Standard Eastern Norwegian (fixed)</div>
          </div>
        </div>

        <div class="nw-settings-group">
          <h3>Corrections</h3>
          <div class="nw-form-row">
            <label>Correction Style:</label>
            <select name="correctionStyle">
              <option${s.correctionStyle === 'gentle' ? ' selected' : ''}>gentle</option>
              <option${s.correctionStyle === 'direct' ? ' selected' : ''}>direct</option>
              <option${s.correctionStyle === 'strict' ? ' selected' : ''}>strict</option>
            </select>
          </div>
        </div>

        <div class="nw-settings-group">
          <h3>Daily Lessons</h3>
          <div class="nw-form-row">
            <label>Daily Lesson Length (minutes):</label>
            <select name="dailyLessonLengthMinutes">
              <option${s.dailyLessonLengthMinutes === 3 ? ' selected' : ''}>3</option>
              <option${s.dailyLessonLengthMinutes === 5 ? ' selected' : ''}>5</option>
              <option${s.dailyLessonLengthMinutes === 10 ? ' selected' : ''}>10</option>
            </select>
          </div>
        </div>

        <div class="nw-settings-group">
          <h3>Recommendations</h3>
          <label class="nw-toggle-row">
            <input type="checkbox" name="mediaRecommendationsEnabled"${s.mediaRecommendationsEnabled ? ' checked' : ''} />
            <span>Enable media recommendations</span>
          </label>
          <label class="nw-toggle-row">
            <input type="checkbox" name="newsRecommendationsEnabled"${s.newsRecommendationsEnabled ? ' checked' : ''} />
            <span>Enable news recommendations</span>
          </label>
          <label class="nw-toggle-row">
            <input type="checkbox" name="youtubeRecommendationsEnabled"${s.youtubeRecommendationsEnabled ? ' checked' : ''} />
            <span>Enable YouTube recommendations</span>
          </label>
          <label class="nw-toggle-row">
            <input type="checkbox" name="tvRecommendationsEnabled"${s.tvRecommendationsEnabled ? ' checked' : ''} />
            <span>Enable TV recommendations</span>
          </label>
        </div>

        <div class="nw-settings-group">
          <h3>Source Control</h3>
          <label class="nw-toggle-row">
            <input type="checkbox" name="requireSourceCheck"${s.requireSourceCheck ? ' checked' : ''} />
            <span>Require source check on learning content</span>
          </label>
          <label class="nw-toggle-row">
            <input type="checkbox" name="allowUnverifiedPracticeHelp"${s.allowUnverifiedPracticeHelp ? ' checked' : ''} />
            <span>Allow unverified practice help</span>
          </label>
        </div>

        <div class="nw-form-actions">
          <button type="submit" class="nw-btn nw-btn-primary"${!storeAvailable ? ' disabled' : ''}>Save Settings</button>
        </div>
      </form>`;
  }

  const tabContent = {
    overview: renderOverviewTab(),
    lessons: renderLessonsTab(),
    corrections: renderCorrectionsTab(),
    vocabulary: renderVocabularyTab(),
    media: renderMediaTab(),
    review: renderReviewTab(),
    pronunciation: renderPronunciationTab(),
    settings: renderSettingsTab(),
  };

  return `
<style>
.nw-dashboard { max-width: 1200px; margin: 0 auto; padding: 24px 16px 48px; }
.nw-dashboard-header { margin-bottom: 24px; }
.nw-dashboard-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 6px; }
.nw-dashboard-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--gl-line, #e0e0e0); margin-bottom: 24px; }
.nw-tab-btn { padding: 12px 20px; background: none; border: none; border-bottom: 3px solid transparent; font-size: .95rem; font-weight: 600; color: var(--gl-text-muted, #666); cursor: pointer; transition: all .2s; }
.nw-tab-btn:hover { color: var(--gl-text, #222); }
.nw-tab-btn.active { color: var(--gl-accent, #3d5afe); border-bottom-color: var(--gl-accent, #3d5afe); }
.nw-tab-content { display: none; }
.nw-tab-content.active { display: block; }
.nw-empty { padding: 40px; text-align: center; color: var(--gl-text-muted, #666); }
.nw-cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.nw-lesson-card, .nw-correction-card, .nw-vocab-card, .nw-media-card, .nw-review-card, .nw-pronunciation-card {
  background: var(--gl-card-bg, #fff);
  border: 1px solid var(--gl-line, #e0e0e0);
  border-radius: 8px;
  padding: 16px;
}
.nw-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.nw-card-header h3 { margin: 0; font-size: .95rem; font-weight: 600; }
.nw-card-header a { color: var(--gl-accent, #3d5afe); text-decoration: none; }
.nw-card-header a:hover { text-decoration: underline; }
.nw-badge-status { display: inline-block; font-size: .75rem; padding: 4px 8px; background: var(--gl-badge-bg, #f0f0f0); border-radius: 4px; white-space: nowrap; }
.nw-card-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: .78rem; color: var(--gl-text-muted, #666); margin-bottom: 12px; }
.nw-meta-item { display: inline-block; }
.nw-overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; margin-bottom: 24px; }
.nw-stat { text-align: center; padding: 16px; background: var(--gl-card-alt, #fafafa); border-radius: 8px; border: 1px solid var(--gl-line, #e0e0e0); }
.nw-stat-value { display: block; font-size: 1.8rem; font-weight: 700; }
.nw-stat-label { display: block; font-size: .75rem; color: var(--gl-text-muted, #666); margin-top: 4px; }
.nw-settings-summary { background: var(--gl-card-bg, #fff); border: 1px solid var(--gl-line, #e0e0e0); border-radius: 8px; padding: 16px; margin-top: 24px; }
.nw-settings-summary h3 { margin: 0 0 12px; font-size: .95rem; }
.nw-summary-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.nw-summary-table td { padding: 6px 0; border-bottom: 1px solid var(--gl-line, #f0f0f0); }
.nw-summary-table td:first-child { font-weight: 600; color: var(--gl-text-muted, #666); width: 200px; }
.nw-correction-pair { background: var(--gl-card-alt, #fafafa); padding: 12px; border-radius: 6px; margin-bottom: 12px; }
.nw-correction-row { margin-bottom: 8px; }
.nw-correction-row:last-child { margin-bottom: 0; }
.nw-correction-row code { background: var(--gl-code-bg, #fff); padding: 2px 4px; border-radius: 3px; font-family: monospace; }
.nw-explanation { font-size: .85rem; color: var(--gl-text-muted, #666); }
.nw-vocab-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.nw-vocab-header h3 { margin: 0; font-size: .95rem; font-family: monospace; }
.nw-vocab-meaning { font-size: .88rem; margin-bottom: 8px; }
.nw-media-url { margin-top: 8px; }
.nw-media-url a { color: var(--gl-accent, #3d5afe); font-size: .85rem; text-decoration: none; }
.nw-media-url a:hover { text-decoration: underline; }
.nw-settings-form { background: var(--gl-card-bg, #fff); border: 1px solid var(--gl-line, #e0e0e0); border-radius: 8px; padding: 24px; }
.nw-settings-group { margin-bottom: 24px; }
.nw-settings-group h3 { margin: 0 0 12px; font-size: .95rem; font-weight: 600; }
.nw-form-row { margin-bottom: 12px; }
.nw-form-row label { display: block; margin-bottom: 4px; font-weight: 600; font-size: .9rem; }
.nw-form-row select { padding: 6px 10px; border: 1px solid var(--gl-line, #ccc); border-radius: 6px; font-size: .9rem; width: 100%; max-width: 200px; }
.nw-text-field { padding: 6px 10px; background: var(--gl-card-alt, #fafafa); border-radius: 6px; font-size: .9rem; color: var(--gl-text-muted, #666); }
.nw-toggle-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; }
.nw-toggle-row input { width: 18px; height: 18px; cursor: pointer; }
.nw-toggle-row span { font-size: .9rem; }
.nw-form-actions { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--gl-line, #e0e0e0); }
.nw-btn { padding: 8px 20px; border-radius: 6px; border: 1px solid var(--gl-line, #ccc); background: var(--gl-btn-bg, #f5f5f5); color: var(--gl-text, #222); font-size: .9rem; font-weight: 600; cursor: pointer; }
.nw-btn:hover { background: #e8e8e8; }
.nw-btn-primary { background: var(--gl-accent, #3d5afe); color: #fff; border-color: var(--gl-accent, #3d5afe); }
.nw-btn-primary:hover { background: #1e40af; }
.nw-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.nw-notice { padding: 10px 14px; border-radius: 6px; font-size: .85rem; margin-bottom: 16px; }
.nw-notice-warn { background: #fff8e1; color: #7c5300; border: 1px solid #ffe082; }
</style>

<div class="nw-dashboard">
  <div class="nw-dashboard-header">
    <h1 class="nw-dashboard-title">
      Norwegian Learning Dashboard
      <span class="nw-badge-status">${isEnabled ? '🟢 Active' : '🔴 Inactive'}</span>
    </h1>
  </div>

  <div class="nw-dashboard-tabs">
    <button class="nw-tab-btn${activeTab === 'overview' ? ' active' : ''}" data-tab="overview">Overview</button>
    <button class="nw-tab-btn${activeTab === 'lessons' ? ' active' : ''}" data-tab="lessons">Lessons</button>
    <button class="nw-tab-btn${activeTab === 'corrections' ? ' active' : ''}" data-tab="corrections">Corrections</button>
    <button class="nw-tab-btn${activeTab === 'vocabulary' ? ' active' : ''}" data-tab="vocabulary">Vocabulary</button>
    <button class="nw-tab-btn${activeTab === 'media' ? ' active' : ''}" data-tab="media">Media</button>
    <button class="nw-tab-btn${activeTab === 'review' ? ' active' : ''}" data-tab="review">Review</button>
    <button class="nw-tab-btn${activeTab === 'pronunciation' ? ' active' : ''}" data-tab="pronunciation">Pronunciation</button>
    <button class="nw-tab-btn${activeTab === 'settings' ? ' active' : ''}" data-tab="settings">Settings</button>
  </div>

  <div class="nw-tab-content${activeTab === 'overview' ? ' active' : ''}" id="nw-overview-tab">${tabContent.overview}</div>
  <div class="nw-tab-content${activeTab === 'lessons' ? ' active' : ''}" id="nw-lessons-tab">${tabContent.lessons}</div>
  <div class="nw-tab-content${activeTab === 'corrections' ? ' active' : ''}" id="nw-corrections-tab">${tabContent.corrections}</div>
  <div class="nw-tab-content${activeTab === 'vocabulary' ? ' active' : ''}" id="nw-vocabulary-tab">${tabContent.vocabulary}</div>
  <div class="nw-tab-content${activeTab === 'media' ? ' active' : ''}" id="nw-media-tab">${tabContent.media}</div>
  <div class="nw-tab-content${activeTab === 'review' ? ' active' : ''}" id="nw-review-tab">${tabContent.review}</div>
  <div class="nw-tab-content${activeTab === 'pronunciation' ? ' active' : ''}" id="nw-pronunciation-tab">${tabContent.pronunciation}</div>
  <div class="nw-tab-content${activeTab === 'settings' ? ' active' : ''}" id="nw-settings-tab">${tabContent.settings}</div>
</div>

<script>
(function() {
  const tabButtons = document.querySelectorAll('.nw-tab-btn');
  const tabContents = document.querySelectorAll('.nw-tab-content');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.dataset.tab;

      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById('nw-' + tab + '-tab').classList.add('active');

      window.history.replaceState(null, '', '?view=norwegian&tab=' + tab);
    });
  });
})();
</script>
`;
}

module.exports = { renderNorwegianDashboard };
