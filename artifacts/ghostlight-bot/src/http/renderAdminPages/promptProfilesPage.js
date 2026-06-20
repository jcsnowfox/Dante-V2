/**
 * renderPromptProfilesPage
 *
 * Phase 2 — admin editor for the companion prompt profile that feeds the ONE
 * shared prompt builder (Discord + Second Life). The owner edits the generic,
 * name-free persona sections here; the active profile is what the chat path
 * assembles. With no DB configured the page renders read-only and explains why.
 *
 * Reuses the existing ghb-* admin design system (shared with Inner Life) so no
 * new CSS is required. No chat input — this is a configuration surface only.
 */

const PROMPT_SECTIONS = [
  {
    field: "secondLifeBehaviorPrompt",
    label: "Second Life Behaviour",
    desc: "Only used in Second Life. How the companion behaves as an embodied avatar.",
    sl: true,
  },
  {
    field: "secondLifeLocalChatPrompt",
    label: "Second Life Local Chat",
    desc: "Only used in Second Life. How the companion speaks in shared local chat.",
    sl: true,
  },
];

function renderField({ section, value, escapeHtml }) {
  const slTag = section.sl
    ? "<span class=\"ghb-info-strip\" style=\"display:inline-block;margin:0 0 6px;padding:2px 8px;font-size:.72rem\">Second Life only</span>"
    : "";
  return [
    "<div class=\"ghb-field\" style=\"margin-bottom:18px\">",
    `<label class="ghb-section-title" style="font-size:1rem;display:block;margin-bottom:4px" for="pp-${escapeHtml(section.field)}">${escapeHtml(section.label)}</label>`,
    `<p class="ghb-copy" style="margin:0 0 6px">${escapeHtml(section.desc)}</p>`,
    slTag,
    `<textarea id="pp-${escapeHtml(section.field)}" name="${escapeHtml(section.field)}" rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:8px;border:1px solid rgba(124,58,237,.25);background:rgba(255,255,255,.04);color:inherit;resize:vertical">${escapeHtml(value || "")}</textarea>`,
    "</div>",
  ].join("");
}

function renderPromptProfilesPage({
  companionId = "",
  storeAvailable = false,
  profiles = [],
  activeProfile = null,
  editing = null,
  defaults = {},
  previews = { discord: "", secondLife: "" },
  theme = "light",
  helpers,
}) {
  const { escapeHtml, withThemeField, buildAdminLocation } = helpers;

  const values = editing || defaults || {};
  const editingId = editing && editing.id ? String(editing.id) : "";
  const activeId = activeProfile && activeProfile.id ? String(activeProfile.id) : "";
  const profileName = (editing && editing.profileName) || "Default";

  const storeWarning = storeAvailable
    ? ""
    : "<div class=\"ghb-info-strip\" style=\"margin-bottom:16px;background:rgba(254,243,199,.7);border-color:rgba(217,119,6,.3);color:#92400e\">No database is configured, so prompt profiles are read-only and the companion uses its built-in persona. Configure Postgres to save and activate profiles.</div>";

  const activeLabel = activeProfile
    ? `Active profile: <code style="background:rgba(124,58,237,.12);padding:2px 6px;border-radius:6px">${escapeHtml(activeProfile.profileName || "—")}</code>`
    : "No active profile — the companion uses its built-in persona (behaviour unchanged).";

  const fields = PROMPT_SECTIONS
    .map((section) => renderField({ section, value: values[section.field], escapeHtml }))
    .join("");

  const disabledAttr = storeAvailable ? "" : " disabled";

  const previewBlock = [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\">",
    "<span class=\"ghb-icon-bubble\">◉</span>",
    "<div>",
    "<h3 class=\"ghb-section-title\">Assembled Prompt Preview</h3>",
    "<p class=\"ghb-copy\">Exactly what the shared prompt builder produces from the values above. Second Life sections only appear in the Second Life preview.</p>",
    "</div>",
    "</div>",
    "<h4 class=\"ghb-copy\" style=\"margin:8px 0 4px;font-weight:600\">Discord</h4>",
    `<pre style="white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.18);padding:12px;border-radius:8px;font-size:.82rem;line-height:1.4">${escapeHtml(previews.discord || "")}</pre>`,
    "<h4 class=\"ghb-copy\" style=\"margin:14px 0 4px;font-weight:600\">Second Life</h4>",
    `<pre style="white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.18);padding:12px;border-radius:8px;font-size:.82rem;line-height:1.4">${escapeHtml(previews.secondLife || "")}</pre>`,
    "</section>",
  ].join("");

  const otherProfiles = (profiles || []).filter((p) => String(p.id) !== editingId);
  const switcher = otherProfiles.length
    ? [
      "<section class=\"ghb-card ghb-setting-card\">",
      "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">◈</span><div>",
      "<h3 class=\"ghb-section-title\">Other Profiles</h3>",
      "<p class=\"ghb-copy\">Open another saved profile to edit or activate it.</p>",
      "</div></div>",
      "<div class=\"ghb-field-grid\">",
      ...otherProfiles.map((p) => {
        const isActive = String(p.id) === activeId;
        return `<a class="ghb-copy" href="${escapeHtml(buildAdminLocation({ path: "/admin/prompt-profiles", theme, extra: { profileId: p.id } }))}">${escapeHtml(p.profileName || p.id)}${isActive ? " (active)" : ""}</a>`;
      }),
      "</div>",
      "</section>",
    ].join("")
    : "";

  return `<div class="ghb-settings-tab">
${storeWarning}
<section class="ghb-hero">
  <div class="ghb-hero-art" style="background-image:none;background:linear-gradient(135deg,#0f1f55 0%,#1d3a95 40%,#3a7ced 70%,#8bb4fa 100%)"></div>
  <div class="ghb-hero-text">
    <h2 class="ghb-title">Prompt Profiles ✎</h2>
    <p class="ghb-subtitle">One personality, every surface. These sections build the persona used for both Discord and Second Life — edit once and it applies everywhere. ${activeLabel}</p>
  </div>
  <aside class="ghb-card ghb-side-card">
    <h3 class="ghb-side-title">How it works</h3>
    <ul class="ghb-bullet-list">
      <li>Edit the persona sections below</li>
      <li>Save to store the profile</li>
      <li>Set Active to make the companion use it</li>
      <li>Reset restores the generic defaults</li>
      <li>Second Life sections only apply in-world</li>
    </ul>
    <p class="ghb-copy" style="margin-top:8px">Companion: <code style="background:rgba(124,58,237,.12);padding:2px 6px;border-radius:6px">${escapeHtml(companionId || "—")}</code></p>
  </aside>
</section>

<form id="pp-form" method="POST" action="/admin/actions/prompt-profiles-save">
  ${withThemeField(theme)}
  <input type="hidden" name="returnTo" value="/admin/prompt-profiles">
  <input type="hidden" name="profileId" value="${escapeHtml(editingId)}">

  <section class="ghb-main-grid">
    <div class="ghb-left">
      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">✎</span>
          <div>
            <h3 class="ghb-section-title">Persona Sections</h3>
            <p class="ghb-copy">Generic, name-free starting points. Edit them to define your companion's voice and behaviour.</p>
          </div>
        </div>
        <div class="ghb-field" style="margin-bottom:18px">
          <label class="ghb-section-title" style="font-size:1rem;display:block;margin-bottom:4px" for="pp-profileName">Profile name</label>
          <input id="pp-profileName" name="profileName" type="text" value="${escapeHtml(profileName)}" style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:8px;border:1px solid rgba(124,58,237,.25);background:rgba(255,255,255,.04);color:inherit"${disabledAttr}>
        </div>
        ${fields}
        <div class="ghb-field-grid" style="margin-top:8px">
          <label class="ghb-copy" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="set_active" value="true"${activeId && activeId === editingId ? " checked" : ""}${disabledAttr}>
            Set this profile as active after saving
          </label>
        </div>
        <div class="ghb-field-grid" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <button type="submit" class="ghb-btn"${disabledAttr} style="padding:10px 18px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save profile</button>
          <button type="submit" formaction="/admin/actions/prompt-profiles-reset"${disabledAttr} style="padding:10px 18px;border-radius:8px;border:1px solid rgba(124,58,237,.3);background:transparent;color:inherit;font:inherit;cursor:pointer">Reset to defaults</button>
        </div>
      </section>
      ${switcher}
    </div>
    <div class="ghb-right">
      ${previewBlock}
    </div>
  </section>
</form>
</div>`;
}

module.exports = {
  renderPromptProfilesPage,
  PROMPT_SECTIONS,
};
