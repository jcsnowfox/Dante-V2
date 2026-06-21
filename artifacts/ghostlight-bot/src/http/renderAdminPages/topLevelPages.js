const {
  getRuntimeState,
  renderFieldLabelWithHelp,
  renderHelpIcon,
  renderPageIntro,
  renderSubnav,
} = require("./shared");
const { renderJournalMarkdownPreview } = require("./journalMarkdown");
const {
  RECOMMENDED_MODELS,
  getModelCapabilityBadges,
} = require("../../llm/modelValidation");
const {
  CUSTOM_REACTION_EMOJI_LIMIT,
  CUSTOM_REACTION_MOOD_LIMIT,
  customReactionLabel,
  normalizeCustomReactionEmojis,
} = require("../../reactions/customEmojiPalette");

const BEHAVIOUR_TABS = Object.freeze([
  { key: "models", label: "Default Models", path: "/admin/companion", extra: { companionTab: "models" } },
  { key: "runtime", label: "Runtime Settings", path: "/admin/companion", extra: { companionTab: "runtime" } },
  { key: "emojis", label: "Custom Emojis", path: "/admin/companion", extra: { companionTab: "emojis" } },
]);

function normalizeBehaviourTab(value) {
  const key = String(value || "").trim().toLowerCase();
  return BEHAVIOUR_TABS.some((tab) => tab.key === key) ? key : "models";
}

const COMPANION_TABS = Object.freeze([
  { key: "identity", label: "Identity", path: "/admin/companion", extra: {} },
  { key: "models", label: "Models", path: "/admin/companion", extra: { companionTab: "models" } },
  { key: "runtime", label: "Runtime", path: "/admin/companion", extra: { companionTab: "runtime" } },
  { key: "emojis", label: "Custom Emojis", path: "/admin/companion", extra: { companionTab: "emojis" } },
  { key: "private-mode", label: "Adult Private Mode", path: "/admin/companion", extra: { companionTab: "private-mode" } },
]);

function normalizeCompanionTab(value) {
  const key = String(value || "").trim().toLowerCase();
  return COMPANION_TABS.some((tab) => tab.key === key) ? key : "identity";
}

function renderHomePage({ stats, theme = "light", helpers }) {
  const { escapeHtml, buildAdminLocation, renderIconImage, withThemeField } = helpers;
  const warnings = Array.isArray(stats.warnings) ? stats.warnings : [];
  const updateNotice = stats.updateNotice || null;
  const statuses = Array.isArray(stats.statuses) ? stats.statuses : [];
  const featureStates = Array.isArray(stats.featureStates) ? stats.featureStates.filter(Boolean) : [];
  const recentDecisions = Array.isArray(stats.recentDecisions) ? stats.recentDecisions.filter(Boolean) : [];
  const recentJournals = Array.isArray(stats.recentJournals) ? stats.recentJournals.filter(Boolean) : [];
  const recentImages = Array.isArray(stats.recentImages) ? stats.recentImages.filter(Boolean) : [];
  const recentInnerLifeEntries = Array.isArray(stats.recentInnerLifeEntries) ? stats.recentInnerLifeEntries.filter(Boolean) : [];

  const INNER_LIFE_TYPE_LABELS = {
    private_thought: "Private Thought",
    unsent_thought: "Unsent Thought",
    between_message_note: "Between Messages",
    journal_entry: "Journal",
    dream: "Dream",
    micro_repair: "Micro Repair",
    little_ritual: "Little Ritual",
    habit_marker: "Habit",
    taste_marker: "Taste",
    mood_carryover: "Mood",
    private_lexicon: "Lexicon",
    repeated_tell: "Repeated Tell",
    room_sense: "Room Sense",
    almost_said: "Almost Said",
    affection_residue: "Affection",
    curiosity_seed: "Curiosity",
  };
  const INNER_LIFE_STATUS_LABELS = {
    active: "Active",
    used_in_prelude: "Used in prelude",
    archived: "Archived",
    expired: "Expired",
  };
  const timezone = String(stats.timezone || "").trim() || "UTC";
  const formatHomeDate = (value) => {
    if (!value) {
      return "Unknown time";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  };
  const formatHomeImageAspectStyle = (value) => {
    const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);

    if (!match) {
      return "";
    }

    const width = Number(match[1]);
    const height = Number(match[2]);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return "";
    }

    return ` style="--home-image-aspect:${escapeHtml(String(width / height))}"`;
  };
  const recentImageTiles = recentImages.length
    ? [...recentImages, ...recentImages].map((image, index) => [
      `<a class="home-image-tile" href="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/images/detail/${encodeURIComponent(image.imageId)}`, theme }))}"${index >= recentImages.length ? " aria-hidden=\"true\" tabindex=\"-1\"" : ""}${formatHomeImageAspectStyle(image.aspectRatio)}>`,
      `<img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(image.altText || "Recent generated image")}">`,
      "</a>",
    ].join("")).join("")
    : "";
  const recentJournalCards = recentJournals.length
    ? [...recentJournals, ...recentJournals].map((entry, index) => [
      `<a class="home-journal-tile" href="${escapeHtml(buildAdminLocation({ path: `/admin/journals/${encodeURIComponent(entry.entryId)}`, theme, extra: { journalPage: 1 } }))}"${index >= recentJournals.length ? " aria-hidden=\"true\" tabindex=\"-1\"" : ""}>`,
      `<p class="home-journal-date">${escapeHtml(formatHomeDate(entry.createdAt))}</p>`,
      `<div class="home-journal-excerpt journal-preview-prose">${renderJournalMarkdownPreview(entry.content, { escapeHtml, maxLines: 2, maxLength: 140, allowLinks: false })}</div>`,
      "</a>",
    ].join("")).join("")
    : "";
  const actionIconByExecutor = {
    send_check_in: "heartbeat_action_message",
    send_message: "heartbeat_action_message",
    send_journal_prompt: "heartbeat_action_journal",
    send_gif: "heartbeat_action_gif",
    start_thread: "heartbeat_action_thread",
  };
  const toolIconByName = {
    gif_search: "gif",
    web_search: "web_search",
    generate_image: "images",
    generate_audio: "audio",
    spotify: "playlist",
    spotify_curation: "playlist",
    spotify_playback: "music",
  };
  const getHomeDecisionIcon = (item) => {
    if (item.status === "skipped") {
      return "pause";
    }

    if (item.actionType === "journal" || item.executorType === "send_journal_prompt") {
      return "heartbeat_action_journal";
    }

    const firstTool = Array.isArray(item.enabledTools) ? item.enabledTools.find(Boolean) : "";

    if (firstTool && toolIconByName[firstTool]) {
      return toolIconByName[firstTool];
    }

    if (item.executorType === "send_gif") {
      return "gif";
    }

    if (item.actionType === "thread") {
      return "heartbeat_action_thread";
    }

    return actionIconByExecutor[item.executorType] || "heartbeat_action_message";
  };

  return [
    renderPageIntro({
      title: "Home",
      copy: "",
    }),
    updateNotice
      ? [
        "<section class=\"lite-panel page-frame home-update-notice\">",
        "<div class=\"home-update-notice-copy\">",
        updateNotice.eyebrow ? `<p class="stat-label">${escapeHtml(updateNotice.eyebrow)}</p>` : "",
        `<h3>${escapeHtml(updateNotice.title || "Ghostlight has been updated")}</h3>`,
        updateNotice.body ? `<p class="meta">${escapeHtml(updateNotice.body)}</p>` : "",
        Array.isArray(updateNotice.links) && updateNotice.links.length
          ? [
            "<div class=\"quick-links\">",
            ...updateNotice.links.map((link) => {
              const href = link.href
                ? String(link.href)
                : buildAdminLocation({ path: link.path || "/admin", theme, extra: link.extra || {} });
              const externalAttrs = link.href ? " target=\"_blank\" rel=\"noreferrer\"" : "";
              return `<a class="pill" href="${escapeHtml(href)}"${externalAttrs}>${escapeHtml(link.label || "Open")}</a>`;
            }),
            "</div>",
          ].join("")
          : "",
        "</div>",
        "<form method=\"post\" action=\"/admin/actions/update-notice-dismiss\" class=\"inline-form home-update-notice-dismiss\">",
        withThemeField ? withThemeField(theme) : "",
        `<input type="hidden" name="noticeId" value="${escapeHtml(updateNotice.id || "")}">`,
        "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/home\">",
        "<button class=\"secondary\" type=\"submit\">Dismiss</button>",
        "</form>",
        "</section>",
      ].join("")
      : "",
    warnings.length
      ? [
        "<section class=\"lite-panel page-frame\">",
        "<div class=\"quick-actions-row\">",
        "<h3>Needs Attention</h3>",
        "</div>",
        "<div class=\"stats-grid\">",
        ...warnings.map((warning) => [
          "<article class=\"stat-card\">",
          `<p class="stat-label">${escapeHtml(warning.title || "Attention")}</p>`,
          `<p class="stat-note">${escapeHtml(warning.detail || "")}</p>`,
          warning.path
            ? `<div class="quick-links quick-links-offset"><a class="pill" href="${escapeHtml(buildAdminLocation({ path: warning.path, theme }))}">${escapeHtml(warning.cta || "Open")}</a></div>`
            : "",
          "</article>",
        ].join("")),
        "</div>",
        "</section>",
      ].join("")
      : "",
    [
      "<section class=\"lite-panel page-frame\">",
      "<div class=\"home-dashboard-grid\">",
      "<section class=\"home-dashboard-panel home-dashboard-panel-setup\">",
      "<div class=\"section-title section-title-inline\">",
      "<h3>Current Setup</h3>",
      "</div>",
      statuses.length
        ? [
          "<div class=\"home-setup-list\">",
          ...statuses.map((status) => [
            "<article class=\"home-setup-item\">",
            `<span class="home-status-icon" title="${escapeHtml(status.helpText || status.label || "")}" aria-label="${escapeHtml(status.helpText || status.label || "")}">${renderIconImage(status.icon || "dashboard", theme, "", "home-status-icon-image")}</span>`,
            `<p class="home-setup-value">${escapeHtml(status.value || "—")}</p>`,
            "</article>",
          ].join("")),
          featureStates.length
            ? [
              "<div class=\"home-feature-row\">",
              ...featureStates.map((feature) => {
                const content = renderIconImage(feature.icon || "dashboard", theme, "", "home-feature-icon-image");
                const attrs = `class="home-feature-pill${feature.active ? " is-active" : " is-inactive"}" title="${escapeHtml(feature.helpText || feature.label || "")}" aria-label="${escapeHtml(feature.helpText || feature.label || "")}"`;
                return feature.path
                  ? `<a ${attrs} href="${escapeHtml(buildAdminLocation({ path: feature.path, theme }))}">${content}</a>`
                  : `<span ${attrs}>${content}</span>`;
              }),
              "</div>",
            ].join("")
            : "",
          "</div>",
        ].join("")
        : "<p class=\"meta\">No current setup details available.</p>",
      "</section>",
      "<section class=\"home-dashboard-panel home-dashboard-panel-actions\">",
      "<div class=\"section-title section-title-inline\">",
      "<h3>Recent Actions</h3>",
      "</div>",
      recentDecisions.length
        ? [
          "<div class=\"home-decision-grid\">",
          ...recentDecisions.map((item) => [
            `<a class="home-decision-card${item.status === "skipped" ? " is-muted" : ""}" href="${escapeHtml(buildAdminLocation({ path: "/admin/heartbeat/overview", theme }))}">`,
            `<span class="home-decision-icon" aria-hidden="true">${renderIconImage(getHomeDecisionIcon(item), theme, "", "home-decision-icon-image")}</span>`,
            "<div class=\"home-decision-copy\">",
            `<p class="home-decision-why">${escapeHtml(item.why || "No detail recorded.")}</p>`,
            `<p class="home-decision-time">${escapeHtml(formatHomeDate(item.at))}</p>`,
            "</div>",
            "</a>",
          ].join("")),
          "</div>",
        ].join("")
        : "",
      recentInnerLifeEntries.length
        ? [
          "<div class=\"home-il-section\">",
          "<div class=\"home-il-section-head\">",
          `<span class="stat-label">Inner Life</span>`,
          `<a class="pill" href="${escapeHtml(buildAdminLocation({ path: "/admin/inner-life/entries", theme }))}">All entries →</a>`,
          "</div>",
          "<div class=\"home-il-entry-list\">",
          ...recentInnerLifeEntries.map((entry) => {
            const typeLabel = INNER_LIFE_TYPE_LABELS[entry.entryType] || entry.entryType;
            const statusLabel = INNER_LIFE_STATUS_LABELS[entry.status] || entry.status;
            const content = String(entry.summary || "").trim();
            const truncated = content.length > 200 ? content.slice(0, 200) + "…" : content;
            return [
              "<div class=\"home-il-entry-card\">",
              "<div class=\"home-il-entry-top\">",
              `<span class="badge home-il-type-badge">${escapeHtml(typeLabel)}</span>`,
              `<span class="home-il-entry-time">${escapeHtml(formatHomeDate(entry.createdAt))}</span>`,
              "</div>",
              truncated ? `<p class="home-il-entry-content">${escapeHtml(truncated)}</p>` : "",
              `<span class="badge home-il-status-badge home-il-status-${escapeHtml(entry.status || "active")}">${escapeHtml(statusLabel)}</span>`,
              "</div>",
            ].join("");
          }),
          "</div>",
          "</div>",
        ].join("")
        : (!recentDecisions.length
          ? "<p class=\"meta\">Recent Heartbeat decisions and Inner Life entries will appear here.</p>"
          : ""),
      "</section>",
      "</div>",
      "</section>",
    ].join(""),
    recentImages.length
      ? [
        "<section class=\"lite-panel page-frame home-image-stream-section\">",
        "<div class=\"home-image-stream-wrap\">",
        "<div class=\"home-image-stream-track\">",
        recentImageTiles,
        "</div>",
        "</div>",
        "</section>",
      ].join("")
      : "",
    recentJournals.length
      ? [
        "<section class=\"lite-panel page-frame home-journal-stream-section\">",
        "<div class=\"home-journal-stream-wrap\">",
        "<div class=\"home-journal-stream-track\">",
        recentJournalCards,
        "</div>",
        "</div>",
        "</section>",
      ].join("")
      : "",
  ].join("");
}

function renderCompanionHeroCard({ runtimeSettings, theme, escapeHtml, withThemeField }) {
  const personaAvatarUrl = runtimeSettings["chat.promptBlocks.personaAvatarUrl"] || "";
  const personaName = runtimeSettings["chat.promptBlocks.personaName"] || "";
  const displayName = escapeHtml(personaName || "Your companion");

  const avatarContent = personaAvatarUrl
    ? `<img src="${escapeHtml(personaAvatarUrl)}" alt="${displayName} photo">`
    : `<div class="companion-hero-avatar-placeholder"><svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="26" cy="19" r="10" fill="currentColor" opacity="0.55"/><path d="M6 48c0-11.046 8.954-20 20-20s20 8.954 20 20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" opacity="0.42"/></svg></div>`;

  const removeButton = personaAvatarUrl
    ? [
      `<form method="post" action="/admin/actions/companion-avatar-remove" class="companion-hero-remove-form">`,
      withThemeField(theme),
      `<input type="hidden" name="returnTo" value="/admin/companion">`,
      `<button type="submit" class="companion-hero-remove-btn">Remove photo</button>`,
      `</form>`,
    ].join("")
    : "";

  return [
    `<div class="companion-hero">`,
    `<div class="companion-hero-avatar-col">`,
    `<div class="companion-hero-avatar">${avatarContent}</div>`,
    `<form method="post" action="/admin/actions/companion-avatar-upload" enctype="multipart/form-data" class="companion-hero-upload-form" id="companionAvatarUploadForm">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="/admin/companion">`,
    `<input type="file" name="avatarFile" id="companionAvatarFile" accept="image/png,image/jpeg,image/webp" class="companion-hero-file-input">`,
    `</form>`,
    `<button type="button" class="companion-hero-change-btn" onclick="document.getElementById('companionAvatarFile').click()">${personaAvatarUrl ? "Change photo" : "Upload photo"}</button>`,
    removeButton,
    `</div>`,
    `<div class="companion-hero-info-col">`,
    `<div class="companion-hero-name">${displayName}</div>`,
    `<div class="companion-hero-hint">Upload a photo and fill in the details below to shape your companion\u2019s identity.</div>`,
    `</div>`,
    `</div>`,
    `<script>(function(){var fi=document.getElementById('companionAvatarFile');if(fi){fi.addEventListener('change',function(){if(this.files&&this.files.length){this.closest('form').submit();}});}}());</script>`,
  ].join("");
}

function renderCompanionIdentityTab({ runtimeSettings, theme, helpers }) {
  const { escapeHtml, withThemeField } = helpers;
  const NAME_MAX_LENGTH = 100;
  const PROMPT_BLOCK_MAX_LENGTH = 1000;

  return [
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/companion\">",
    "<div class=\"companion-names\">",
    "<div class=\"companion-names-eyebrow\">Identity</div>",
    "<div class=\"identity-grid\">",
    `<div><label for="personaName">Companion Name <span class="field-help" tabindex="0" role="button" aria-expanded="false" aria-label="What should your companion be called?" data-help="What should your companion be called?"><span>?</span></span></label><input id="personaName" name="personaName" type="text" value="${escapeHtml(runtimeSettings["chat.promptBlocks.personaName"] || "")}" maxlength="${NAME_MAX_LENGTH}"></div>`,
    `<div><label for="userName">Your Name <span class="field-help" tabindex="0" role="button" aria-expanded="false" aria-label="What should your companion call you?" data-help="What should your companion call you?"><span>?</span></span></label><input id="userName" name="userName" type="text" value="${escapeHtml(runtimeSettings["chat.promptBlocks.userName"] || "")}" maxlength="${NAME_MAX_LENGTH}"></div>`,
    "</div>",
    "</div>",
    "<div class=\"companion-textarea-grid\">",
    "<div class=\"companion-field-card\">",
    renderFieldLabelWithHelp({
      forId: "personaProfile",
      label: "How Should They Talk?",
      help: "Describe their personality, texting style, humour, softness, romance level, swearing, pet names, and how direct they should be.",
    }, helpers),
    `<textarea id="personaProfile" name="personaProfile" maxlength="${PROMPT_BLOCK_MAX_LENGTH}">${escapeHtml(runtimeSettings["chat.promptBlocks.personaProfile"] || "")}</textarea>`,
    `<input type="hidden" name="toneGuidelines" value="${escapeHtml(runtimeSettings["chat.promptBlocks.toneGuidelines"] || "")}">`,
    "</div>",
    "<div class=\"companion-field-card\">",
    renderFieldLabelWithHelp({
      forId: "userProfile",
      label: "What Should They Know About You?",
      help: "Share anything that helps them understand you, your life, your likes, your routines, your comfort needs, and what matters to you.",
    }, helpers),
    `<textarea id="userProfile" name="userProfile" maxlength="${PROMPT_BLOCK_MAX_LENGTH}">${escapeHtml(runtimeSettings["chat.promptBlocks.userProfile"] || "")}</textarea>`,
    "</div>",
    "<div class=\"companion-field-card\">",
    renderFieldLabelWithHelp({
      forId: "companionPurpose",
      label: "How Should This Companion Relationship Work?",
      help: "Tell them how often to check in, how they should support you, what kind of relationship this is, what channels or rooms mean, and how active they should be.",
    }, helpers),
    `<textarea id="companionPurpose" name="companionPurpose" maxlength="${PROMPT_BLOCK_MAX_LENGTH}">${escapeHtml(runtimeSettings["chat.promptBlocks.companionPurpose"] || "")}</textarea>`,
    "</div>",
    "<div class=\"companion-field-card\">",
    renderFieldLabelWithHelp({
      forId: "boundaryRules",
      label: "Rules, Limits & Comfort Zones",
      help: "List anything they should avoid, respect, ask permission for, never joke about, or handle carefully.",
    }, helpers),
    `<textarea id="boundaryRules" name="boundaryRules" maxlength="${PROMPT_BLOCK_MAX_LENGTH}">${escapeHtml(runtimeSettings["chat.promptBlocks.boundaryRules"] || "")}</textarea>`,
    "</div>",
    "</div>",
    "<div class=\"toolbar\"><button type=\"submit\">Save Companion</button></div>",
    "</form>",
  ].join("");
}

function renderAdultPrivateModeTab({ state, theme, helpers }) {
  const { escapeHtml } = helpers;

  return [
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    renderBehaviourFormFields({ theme, tab: "private-mode", helpers }),
    "<p class=\"meta behaviour-tab-intro\">Bind a specific private Discord channel to a dedicated adult/intimacy model and behaviour layer. Only messages sent to the configured channel ID will use these overrides. Use <code>!adult</code> in any channel to toggle this mode on or off for that channel.</p>",
    "<label class=\"switch-field image-settings-toggle\">",
    "<input type=\"hidden\" name=\"adultPrivateModeEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="adultPrivateModeEnabled" value="true"${state.adultPrivateModeEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label field-label-with-help\">",
    "<span>Enable Adult Private Mode</span>",
    renderHelpIcon({
      help: "When enabled, messages in the configured private channel will use the adult model and behaviour settings below.",
    }, helpers),
    "</span>",
    "</label>",
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeChannelId",
      label: "Private Channel ID",
      help: "The Discord channel ID that Adult Private Mode applies to. Only this channel will use the adult model and prompt overrides.",
    }, helpers),
    `<input id="adultPrivateModeChannelId" name="adultPrivateModeChannelId" type="text" value="${escapeHtml(state.adultPrivateModeChannelId)}" placeholder="Discord channel ID (e.g. 1234567890123456789)">`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeModel",
      label: "Adult Mode Model Override",
      help: "Optional model slug to use in the private channel. Leave blank to use the Romance & Intimacy model from the Models tab (recommended), or the standard chat model if that is also not set.",
    }, helpers),
    `<input id="adultPrivateModeModel" name="adultPrivateModeModel" type="text" value="${escapeHtml(state.adultPrivateModeModel)}" placeholder="Leave blank to use Romance &amp; Intimacy model from Models tab">`,
    `<p class="meta model-recommendation">Recommended for Adult Mode: <code>${escapeHtml(RECOMMENDED_MODELS.adultPrivate)}</code></p>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeSystemPrompt",
      label: "Adult Mode System Prompt",
      help: "This is PREPENDED to the standard companion system prompt when Adult Private Mode is active. Use it to grant explicit permission and set the tone for intimate scenes.",
    }, helpers),
    `<textarea id="adultPrivateModeSystemPrompt" name="adultPrivateModeSystemPrompt" maxlength="4000" rows="8" placeholder="e.g. You are in a private adult channel. Explicit intimate content is permitted and encouraged. Stay in character throughout.">${escapeHtml(state.adultPrivateModeSystemPrompt)}</textarea>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeSafeword",
      label: "Safeword",
      help: "When the user sends this exact word or phrase, the bot immediately exits adult mode for this channel and switches to aftercare mode (if enabled). Default: red",
    }, helpers),
    `<input id="adultPrivateModeSafeword" name="adultPrivateModeSafeword" type="text" value="${escapeHtml(state.adultPrivateModeSafeword)}" placeholder="red">`,
    "<label class=\"switch-field image-settings-toggle\">",
    "<input type=\"hidden\" name=\"adultPrivateModeAftercareEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="adultPrivateModeAftercareEnabled" value="true"${state.adultPrivateModeAftercareEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label field-label-with-help\">",
    "<span>Enable Aftercare Mode</span>",
    renderHelpIcon({
      help: "When the safeword is used, the bot switches to a warm, grounded aftercare mode rather than returning to normal chat immediately.",
    }, helpers),
    "</span>",
    "</label>",
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeAftercarePrompt",
      label: "Aftercare Prompt",
      help: "Injected as a context note when the safeword is used. Use this to guide the bot into a safe, caring, decompression mode.",
    }, helpers),
    `<textarea id="adultPrivateModeAftercarePrompt" name="adultPrivateModeAftercarePrompt" maxlength="2000" rows="5" placeholder="e.g. The user has used the safeword. Shift to warm, grounded aftercare. Be gentle, present, and caring. Do not reference the scene. Ask how they are feeling.">${escapeHtml(state.adultPrivateModeAftercarePrompt)}</textarea>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeUserPreferences",
      label: "User Preferences",
      help: "General preferences that shape the experience — tone, pacing, communication style, things they enjoy. Injected into the adult mode context on every message.",
    }, helpers),
    `<textarea id="adultPrivateModeUserPreferences" name="adultPrivateModeUserPreferences" maxlength="2000" rows="4" placeholder="e.g. Prefers slow build-up, likes being called by name, enjoys descriptive detail, responds well to praise...">${escapeHtml(state.adultPrivateModeUserPreferences)}</textarea>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeUserWants",
      label: "User Wants",
      help: "What the user actively desires in this space — things they want to explore, ask for, or experience.",
    }, helpers),
    `<textarea id="adultPrivateModeUserWants" name="adultPrivateModeUserWants" maxlength="2000" rows="4" placeholder="e.g. Wants to explore power dynamics, wants dirty talk, wants to feel desired and pursued...">${escapeHtml(state.adultPrivateModeUserWants)}</textarea>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeUserNeeds",
      label: "User Needs",
      help: "Emotional or relational needs that must be met for this to feel safe and good — trust, connection, feeling seen, etc.",
    }, helpers),
    `<textarea id="adultPrivateModeUserNeeds" name="adultPrivateModeUserNeeds" maxlength="2000" rows="4" placeholder="e.g. Needs to feel emotionally safe, needs explicit consent-checking in longer scenes, needs to feel like the primary focus...">${escapeHtml(state.adultPrivateModeUserNeeds)}</textarea>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeSoftLimits",
      label: "Soft Limits",
      help: "Things the user is cautious about or wants approached carefully — not off-limits but requiring care, checking in, or gentleness.",
    }, helpers),
    `<textarea id="adultPrivateModeSoftLimits" name="adultPrivateModeSoftLimits" maxlength="2000" rows="4" placeholder="e.g. Certain themes are OK but only with build-up; certain language should be introduced gradually not suddenly...">${escapeHtml(state.adultPrivateModeSoftLimits)}</textarea>`,
    renderFieldLabelWithHelp({
      forId: "adultPrivateModeHardLimits",
      label: "Hard Limits",
      help: "Absolute boundaries. Never cross these. The bot will treat these as inviolable regardless of context or prompting.",
    }, helpers),
    `<textarea id="adultPrivateModeHardLimits" name="adultPrivateModeHardLimits" maxlength="2000" rows="4" placeholder="e.g. No degradation, no age ambiguity, no non-consent framing, no specific themes...">${escapeHtml(state.adultPrivateModeHardLimits)}</textarea>`,
    "<div class=\"toolbar\"><button type=\"submit\">Save Adult Private Mode</button></div>",
    "</form>",
  ].join("");
}

function renderCompanionPage({ config, theme = "light", helpers, companionTab = "identity", customReactionEmojiOptions = [] }) {
  const { escapeHtml, withThemeField } = helpers;
  const state = getRuntimeState({ config, helpers });
  const { runtimeSettings } = state;
  const tab = normalizeCompanionTab(companionTab);

  const tabContentBody = {
    identity: renderCompanionIdentityTab({ runtimeSettings, theme, helpers }),
    models: renderBehaviourModelsTab({ state, theme, helpers, config }),
    runtime: renderBehaviourRuntimeTab({ state, theme, helpers }),
    emojis: renderBehaviourEmojisTab({ config, theme, helpers, customReactionEmojiOptions }),
    "private-mode": renderAdultPrivateModeTab({ state, theme, helpers }),
  }[tab];

  return [
    renderPageIntro({ title: "Companion", copy: "" }),
    tab === "identity" ? renderCompanionHeroCard({ runtimeSettings, theme, escapeHtml, withThemeField }) : "",
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: COMPANION_TABS, currentKey: tab, theme, helpers }),
    "</section>",
    `<section class="lite-panel page-frame settings-form${tab !== "identity" ? " admin-tab-panel" : ""}">`,
    tabContentBody,
    "</section>",
  ].join("");
}

function renderCustomReactionEmojiPicker({ config, customReactionEmojiOptions = [], helpers }) {
  const { escapeHtml } = helpers;
  const selected = normalizeCustomReactionEmojis(config.chat?.customReactionEmojis || []);
  const selectedById = new Map(selected.map((emoji) => [emoji.id, emoji]));
  const options = Array.isArray(customReactionEmojiOptions)
    ? customReactionEmojiOptions
      .map((emoji) => ({
        id: String(emoji?.id || "").trim(),
        name: String(emoji?.name || "").trim(),
        animated: Boolean(emoji?.animated),
        url: String(emoji?.url || "").trim(),
        available: emoji?.available !== false,
      }))
      .filter((emoji) => emoji.id && emoji.name)
    : [];
  const optionIds = new Set(options.map((emoji) => emoji.id));
  const missingSelected = selected
    .filter((emoji) => !optionIds.has(emoji.id))
    .map((emoji) => ({
      ...emoji,
      url: "",
      available: false,
    }));
  const rows = [...options, ...missingSelected]
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }))
    .map((emoji) => {
      const saved = selectedById.get(emoji.id);
      const checked = Boolean(saved);
      const label = customReactionLabel(emoji);
      const mood = saved?.mood || "";
      const preview = emoji.url
        ? `<img src="${escapeHtml(emoji.url)}" alt="" loading="lazy">`
        : "<span aria-hidden=\"true\">?</span>";

      return [
        `<article class="custom-reaction-emoji-row${checked ? " is-selected" : ""}${emoji.available ? "" : " is-missing"}">`,
        `<input type="hidden" name="customReactionEmojiName_${escapeHtml(emoji.id)}" value="${escapeHtml(emoji.name)}">`,
        `<input type="hidden" name="customReactionEmojiAnimated_${escapeHtml(emoji.id)}" value="${emoji.animated ? "true" : "false"}">`,
        "<label class=\"custom-reaction-emoji-choice\">",
        `<input class="custom-reaction-emoji-toggle" type="checkbox" name="customReactionEmojiId" value="${escapeHtml(emoji.id)}"${checked ? " checked" : ""} data-custom-reaction-toggle>`,
        "<span class=\"custom-reaction-emoji-check\" aria-hidden=\"true\"></span>",
        `<span class="custom-reaction-emoji-preview">${preview}</span>`,
        `<span><strong>${escapeHtml(label)}</strong>${emoji.available ? "" : "<small>Not found in current server</small>"}</span>`,
        "</label>",
        "<label class=\"custom-reaction-emoji-mood\">",
        `<input type="text" name="customReactionEmojiMood_${escapeHtml(emoji.id)}" value="${escapeHtml(mood)}" maxlength="${CUSTOM_REACTION_MOOD_LIMIT}" placeholder="Mood / Meaning" aria-label="Mood or meaning for ${escapeHtml(label)}">`,
        "</label>",
        "</article>",
      ].join("");
    });

  return [
    "<p class=\"meta behaviour-tab-intro\">Ghostlight can only use emojis that already exist in this Discord server. Select the ones you want your AI to have access to, then add a short guide for each one.</p>",
    `<input type="hidden" name="customReactionEmojiId" value="">`,
    rows.length
      ? [
        `<div class="custom-reaction-emoji-picker" data-custom-reaction-picker data-custom-reaction-limit="${CUSTOM_REACTION_EMOJI_LIMIT}">`,
        `<p class="meta custom-reaction-emoji-count"><span data-custom-reaction-count>${selected.length}</span>/${CUSTOM_REACTION_EMOJI_LIMIT} selected</p>`,
        "<div class=\"custom-reaction-emoji-grid\">",
        ...rows,
        "</div>",
        "</div>",
        `<script>
(() => {
  const picker = document.querySelector('[data-custom-reaction-picker]');
  if (!picker) return;
  const limit = Number(picker.dataset.customReactionLimit || ${CUSTOM_REACTION_EMOJI_LIMIT});
  const toggles = Array.from(picker.querySelectorAll('[data-custom-reaction-toggle]'));
  const count = picker.querySelector('[data-custom-reaction-count]');
  const sync = () => {
    const selectedCount = toggles.filter((toggle) => toggle.checked).length;
    if (count) count.textContent = String(selectedCount);
    toggles.forEach((toggle) => {
      toggle.disabled = !toggle.checked && selectedCount >= limit;
      toggle.closest('.custom-reaction-emoji-row')?.classList.toggle('is-selected', toggle.checked);
    });
  };
  toggles.forEach((toggle) => toggle.addEventListener('change', sync));
  sync();
})();
</script>`,
      ].join("")
      : "<p class=\"meta\">No custom emojis are available from the configured Discord server yet.</p>",
  ].join("");
}

function renderBehaviourFormFields({ theme, tab, helpers }) {
  const { escapeHtml, withThemeField, buildAdminLocation } = helpers;

  return [
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/companion", theme, extra: { companionTab: tab } }))}">`,
  ].join("");
}

function renderBehaviourModelsTab({ state, theme, helpers, config = null }) {
  const { escapeHtml } = helpers;

  const renderBadges = (modelId, capability) => {
    const badges = getModelCapabilityBadges(config, modelId, capability);
    if (!badges.length) return "";
    const LABELS = {
      text: "Text",
      embeddings: "Embeddings",
      vision: "Vision",
      audio: "Audio",
      multimodal: "Multimodal",
      tools: "Tools",
      "text-only": "Text-only",
    };
    return [
      "<div class=\"model-compat-badges\">",
      badges.map((b) => `<span class="model-compat-badge model-compat-${escapeHtml(b)}">${LABELS[b] || escapeHtml(b)}</span>`).join(""),
      "</div>",
    ].join("");
  };

  const modelRows = [
    {
      id: "chatModel",
      name: "chatModel",
      label: "Chat",
      value: state.chatModelValue,
      capability: "chat",
      placeholder: "Enter chat model slug",
      notes: "The main conversation model used for everyday chat. Tool support is required for GIF and image features.",
      recommendation: RECOMMENDED_MODELS.dailyCompanion,
      recommendationLabel: "Recommended for daily use",
    },
    {
      id: "summaryModel",
      name: "summaryModel",
      label: "Summaries",
      value: state.summaryModelValue,
      capability: "summary",
      placeholder: "Enter summary model slug",
      notes: "Used for timeline summaries, imports, and other background continuity work. Text output only; tool support not required.",
      recommendation: null,
    },
    {
      id: "imageModel",
      name: "imageModel",
      label: "Image Analysis",
      value: state.imageModelValue,
      capability: "image",
      placeholder: "Enter image model slug",
      notes: "Used for analysing images you send to your AI. Model must support image (vision) input.",
      recommendation: null,
    },
    {
      id: "embeddingModel",
      name: "embeddingModel",
      label: "Embeddings",
      value: state.embeddingModelValue,
      capability: "embedding",
      placeholder: "Enter embedding model slug",
      notes: "Used for memory search and retrieval. Model must support embeddings output.",
      recommendation: null,
    },
    {
      id: "transcriptionModel",
      name: "transcriptionModel",
      label: "Transcription",
      value: state.transcriptionModelValue,
      capability: "transcription",
      placeholder: "Enter transcription model slug",
      notes: "Used for speech-to-text transcription when you send a voice note. Model must support audio input.",
      recommendation: null,
    },
    {
      id: "romanceModel",
      name: "romanceModel",
      label: "Romance & Intimacy",
      value: state.romanceModelValue || "",
      capability: "chat",
      placeholder: "Enter romance model slug (optional)",
      notes: "Used for romantic and intimate conversations. Falls back to the main chat model if not set.",
      recommendation: RECOMMENDED_MODELS.adultPrivate,
      recommendationLabel: "Recommended for Adult Mode",
    },
  ];

  return [
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    renderBehaviourFormFields({ theme, tab: "models", helpers }),
    "<div class=\"model-table-wrap\">",
    "<table class=\"model-table\">",
    "<thead><tr><th>Use</th><th>Model</th><th>What it’s for</th></tr></thead>",
    "<tbody>",
    ...modelRows.map(({ id, name, label, value, capability, placeholder, notes, recommendation, recommendationLabel }) => [
      "<tr>",
      `<td data-label="Use"><strong>${escapeHtml(label)}</strong></td>`,
      "<td data-label=\"Model\">",
      `<input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`,
      renderBadges(value, capability),
      recommendation
        ? `<p class="meta model-recommendation">${escapeHtml(recommendationLabel || "Recommended")}: <code>${escapeHtml(recommendation)}</code></p>`
        : "",
      "</td>",
      `<td data-label="What it’s for" class="notes">${escapeHtml(notes)}</td>`,
      "</tr>",
    ].join("")),
    "</tbody>",
    "</table>",
    "</div>",
    "<div class=\"toolbar\"><button type=\"submit\">Save Models</button></div>",
    "</form>",
    "<form method=\"post\" action=\"/admin/actions/refresh-openrouter-models\" class=\"inline-form\">",
    renderBehaviourFormFields({ theme, tab: "models", helpers }),
    "<div class=\"toolbar toolbar-secondary\">",
    "<button type=\"submit\" class=\"secondary\">Refresh OpenRouter Models</button>",
    "<span class=\"meta\"> Clears the cached model list and forces a fresh availability check on next save.</span>",
    "</div>",
    "</form>",
  ].join("");
}

function renderBehaviourRuntimeTab({ state, theme, helpers }) {
  const { escapeHtml } = helpers;

  return [
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    renderBehaviourFormFields({ theme, tab: "runtime", helpers }),
    renderFieldLabelWithHelp({
      forId: "chatTimezone",
      label: "Timezone",
      help: "Used for automations and proactive actions. Select your IANA timezone.",
    }, helpers),
    `<select id="chatTimezone" name="chatTimezone">${
      (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"])
        .map((z) => `<option value="${escapeHtml(z)}"${z === state.timezoneValue ? " selected" : ""}>${escapeHtml(z)}</option>`)
        .join("")
    }</select>`,
    "<div class=\"user-id-settings-row\">",
    "<div>",
    renderFieldLabelWithHelp({
      forId: "chatUserId",
      label: "Discord ID",
      help: "This lets your AI tag you in Discord. If Status Context is enabled, they can also notice music or games you share in your Discord status.",
    }, helpers),
    `<input id="chatUserId" name="chatUserId" type="text" value="${escapeHtml(state.chatUserIdValue)}" placeholder="Discord User ID">`,
    "</div>",
    "<label class=\"switch-field user-presence-toggle\">",
    "<input type=\"hidden\" name=\"mainUserPresenceContextEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="mainUserPresenceContextEnabled" value="true"${state.mainUserPresenceContextEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label field-label-with-help\">",
    "<span>Use my Discord Status Context</span>",
    renderHelpIcon({
      help: "Lets Ghostlight notice music or games from your Discord status. Requires Presence Intent in the Discord Developer Portal.",
    }, helpers),
    "</span>",
    "</label>",
    "</div>",
    renderFieldLabelWithHelp({
      forId: "historyLimit",
      label: "Conversation Memory",
      help: "How many recent chat turns Ghostlight keeps in play for replies.",
    }, helpers),
    `<input id="historyLimit" name="historyLimit" type="number" min="0" max="50" value="${escapeHtml(String(state.historyLimitValue))}">`,
    renderFieldLabelWithHelp({
      forId: "timelineDailyWindowDays",
      label: "Daily Timeline Window",
      help: "How many recent daily memories are used before weekly summaries take over.",
    }, helpers),
    `<input id="timelineDailyWindowDays" name="timelineDailyWindowDays" type="number" min="0" max="365" value="${escapeHtml(String(state.timelineDailyWindowDaysValue))}">`,
    "<label class=\"switch-field image-settings-toggle\">",
    "<input type=\"hidden\" name=\"memoryLookupEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input id="memoryLookupEnabled" type="checkbox" name="memoryLookupEnabled" value="true"${state.memoryLookupEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label field-label-with-help\">",
    "<span>Memory Lookup Tool</span>",
    renderHelpIcon({
      help: "Lets Ghostlight use an optional tool to search long-term memories when the automatic context seems incomplete. Channel mode memory filters still apply.",
    }, helpers),
    "</span>",
    "</label>",
    "<label class=\"switch-field image-settings-toggle\">",
    "<input type=\"hidden\" name=\"conversationRetrievalEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input id="conversationRetrievalEnabled" type="checkbox" name="conversationRetrievalEnabled" value="true"${state.conversationRetrievalEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label field-label-with-help\">",
    "<span>Recent Conversation Awareness</span>",
    renderHelpIcon({
      help: "Lets your AI use a tool to look up recent snippets from opted-in channels/threads. Control which channel modes share access in Admin → Channel Modes",
    }, helpers),
    "</span>",
    "</label>",
    `<input type="hidden" name="defaultMode" value="${escapeHtml(state.runtimeSettings["chat.defaultMode"] || "default")}">`,
    "<div class=\"toolbar\"><button type=\"submit\">Save Runtime Settings</button></div>",
    "</form>",
  ].join("");
}

function renderBehaviourEmojisTab({ config, theme, helpers, customReactionEmojiOptions = [] }) {
  return [
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    renderBehaviourFormFields({ theme, tab: "emojis", helpers }),
    renderCustomReactionEmojiPicker({ config, customReactionEmojiOptions, helpers }),
    "<div class=\"toolbar\"><button type=\"submit\">Save Custom Emojis</button></div>",
    "</form>",
  ].join("");
}

function renderBehaviourPage({ config, theme = "light", helpers, customReactionEmojiOptions = [], behaviourTab = "models" }) {
  return renderCompanionPage({
    config,
    theme,
    helpers,
    companionTab: behaviourTab,
    customReactionEmojiOptions,
  });
}

module.exports = {
  renderHomePage,
  renderCompanionPage,
  renderBehaviourPage,
};
