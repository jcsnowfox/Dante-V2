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
const { listClockPresets } = require("../../temporal/clockPresets");
const { NORDIC_DASHBOARD_ASSET_BASE } = require("../nordicDashboardAssets");
const {
  renderBattleRhythmDayCard,
  renderNordicDivider,
  renderNordicIcon,
  renderNordicJournalCard,
  renderNordicPill,
  renderTravelChecklistItem,
} = require("./nordicDashboardComponents");

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

const BATTLE_RHYTHM_DAYS = Object.freeze([
  { day: "Monday", training: "Strength", meal: "Carnivore" },
  { day: "Tuesday", training: "Recovery", meal: "Carnivore" },
  { day: "Wednesday", training: "Cardio", meal: "Controlled carb / torch day" },
  { day: "Thursday", training: "Recovery / reset", meal: "Carnivore" },
  { day: "Friday", training: "Endurance", meal: "Carnivore" },
  { day: "Saturday", training: "Active recovery / torch/refuel support", meal: "Controlled carb / torch day" },
  { day: "Sunday", training: "Full reset / flexible day", meal: "Flexible / Irish fry-up / reset" },
]);

const LOW_CARB_NORDIC_RECIPE_SEEDS = Object.freeze([
  {
    id: "low-carb-norwegian-fiskesuppe",
    title: "Low-Carb Norwegian Fish Soup",
    cultureTag: "Norwegian",
    carbsPerServing: 19,
    carbType: "total",
    time: "26 min",
    sourceName: "Easy and Delish",
    sourceUrl: "https://www.easyanddelish.com/norwegian-fish-soup-recipe/",
    imageAsset: "05-recipe-photos/seared-salmon-roasted-roots.png",
    tags: ["Fiskesuppe", "Seafood", "Low carb"],
  },
  {
    id: "low-carb-salmon-soup-dill",
    title: "Low-Carb Salmon Soup with Dill",
    cultureTag: "Nordic-adjacent",
    carbsPerServing: 4,
    carbType: "net",
    time: "35 min",
    sourceName: "Step Away From The Carbs",
    sourceUrl: "https://stepawayfromthecarbs.com/low-carb-salmon-soup/",
    imageAsset: "05-recipe-photos/seared-salmon-roasted-roots.png",
    tags: ["Salmon", "Dill", "Keto"],
  },
  {
    id: "keto-smoked-salmon-chowder",
    title: "Keto Smoked Salmon Chowder",
    cultureTag: "Nordic-adjacent",
    carbsPerServing: 9.2,
    carbType: "net",
    time: "20 min",
    sourceName: "Ruled Me",
    sourceUrl: "https://www.ruled.me/easy-keto-smoked-salmon-chowder/",
    imageAsset: "05-recipe-photos/lamb-root-stew.png",
    tags: ["Smoked salmon", "Chowder", "Keto"],
  },
  {
    id: "keto-swedish-meatballs",
    title: "Keto Swedish Meatballs",
    cultureTag: "Swedish",
    carbsPerServing: 3.3,
    carbType: "net",
    time: "25 min",
    sourceName: "Sugar Free Londoner",
    sourceUrl: "https://sugarfreelondoner.com/keto-swedish-meatballs/",
    imageAsset: "05-recipe-photos/lamb-root-stew.png",
    tags: ["Meatballs", "Scandinavian", "Keto"],
  },
  {
    id: "keto-lohikeitto",
    title: "Keto Finnish Salmon Soup",
    cultureTag: "Finnish",
    carbsPerServing: 5.1,
    carbType: "net",
    time: "30 min",
    sourceName: "Low-Carb, So Simple",
    sourceUrl: "https://www.lowcarbsosimple.com/hearty-finnish-salmon-soup-lohikeitto-simplified-and-made-keto/",
    imageAsset: "05-recipe-photos/skyr-berries-honey.png",
    tags: ["Lohikeitto", "Salmon", "Keto"],
  },
]);

function selectRotatingRecipes({ now = new Date(), count = 4 } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  const daySeed = Number.isFinite(date.getTime()) ? Math.floor(date.getTime() / 86400000) : 0;
  const safeCount = Math.min(Math.max(Number(count) || 4, 3), 5, LOW_CARB_NORDIC_RECIPE_SEEDS.length);
  return Array.from({ length: safeCount }, (_, index) => LOW_CARB_NORDIC_RECIPE_SEEDS[(daySeed + index) % LOW_CARB_NORDIC_RECIPE_SEEDS.length]);
}

function getHomeHeroExcerpt(profile) {
  const fallback = "Live companion systems, memory, gallery, and rituals gathered into one cinematic dashboard.";
  const text = String(profile || fallback).replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const excerpt = sentences.slice(0, 3).join(" ").trim();
  return excerpt.length > 360 ? `${excerpt.slice(0, 357).trim()}…` : excerpt;
}

function assetUrl(relativePath = "") {
  return `${NORDIC_DASHBOARD_ASSET_BASE}/${String(relativePath).replace(/^\/+/, "")}`;
}

function renderHomePage({ stats, theme = "light", helpers }) {
  const { escapeHtml, buildAdminLocation, withThemeField } = helpers;
  const warnings = Array.isArray(stats.warnings) ? stats.warnings : [];
  const updateNotice = stats.updateNotice || null;
  const statuses = Array.isArray(stats.statuses) ? stats.statuses : [];
  const featureStates = Array.isArray(stats.featureStates) ? stats.featureStates.filter(Boolean) : [];
  const recentDecisions = (Array.isArray(stats.recentDecisions) ? stats.recentDecisions.filter(Boolean) : [])
    .filter((item) => item.status === "fired" || item.status === "failed" || (item.status === "skipped" && ["low_confidence", "hold_back"].includes(item.reason)))
    .slice(0, 4);
  const recentJournals = Array.isArray(stats.recentJournals) ? stats.recentJournals.filter(Boolean) : [];
  const recentImages = Array.isArray(stats.recentImages) ? stats.recentImages.filter(Boolean) : [];
  const recentInnerLifeEntries = Array.isArray(stats.recentInnerLifeEntries) ? stats.recentInnerLifeEntries.filter(Boolean) : [];
  const travel = stats.travel || {};
  const travelTrips = Array.isArray(travel.trips) ? travel.trips.filter(Boolean) : [];
  const travelChecklistByTrip = travel.checklistByTrip || {};
  const nextTravelTrip = travel.nextTrip || travelTrips.find((trip) => ["booked", "planned", "wishlist"].includes(trip.status)) || travelTrips[0] || null;
  const nextTravelChecklistItems = Array.isArray(travel.nextChecklistItems) ? travel.nextChecklistItems.filter(Boolean) : (nextTravelTrip ? (travelChecklistByTrip[nextTravelTrip.id] || []) : []);
  const companion = stats.companion || {};
  const timezone = String(stats.timezone || "").trim() || "UTC";
  const now = new Date();
  const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const currentRhythm = BATTLE_RHYTHM_DAYS[todayIndex];
  const nextRhythm = BATTLE_RHYTHM_DAYS[(todayIndex + 1) % BATTLE_RHYTHM_DAYS.length];

  const formatHomeDate = (value) => {
    if (!value) return "Unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(date);
  };
  const formatHomeImageAspectStyle = (value) => {
    const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return "";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "";
    return ` style="--home-image-aspect:${escapeHtml(String(width / height))}"`;
  };

  const renderRecentActionDetail = (item) => {
    const doing = String(item.doing || "").trim();
    const thinking = String(item.thinking || "").trim();

    if (doing || thinking) {
      return [
        doing ? `<small><b>Doing:</b> ${escapeHtml(doing)}</small>` : "",
        thinking ? `<small><b>Thinking:</b> ${escapeHtml(thinking)}</small>` : "",
      ].filter(Boolean).join("");
    }

    return `<small>${escapeHtml(item.why || "No detail recorded.")}</small>`;
  };

  const actionIconByExecutor = {
    send_check_in: "heartbeat",
    send_message: "heartbeat",
    send_journal_prompt: "journal",
    send_gif: "gif",
    start_thread: "automation",
  };
  const toolIconByName = {
    gif_search: "gif",
    web_search: "web_search",
    generate_image: "gallery",
    generate_audio: "voiceNote",
    spotify: "spotifyPlaylist",
    spotify_curation: "spotifyPlaylist",
    spotify_playback: "spotifySong",
  };
  const getHomeDecisionIcon = (item) => {
    if (item.status === "skipped") return "automation";
    if (item.actionType === "journal" || item.executorType === "send_journal_prompt") return "journal";
    const firstTool = Array.isArray(item.enabledTools) ? item.enabledTools.find(Boolean) : "";
    if (firstTool && toolIconByName[firstTool]) return toolIconByName[firstTool];
    if (item.executorType === "send_gif") return "gif";
    if (item.actionType === "thread") return "automation";
    return actionIconByExecutor[item.executorType] || "heartbeat";
  };

  const safeLink = ({ path, label, className = "nordic-pill", extra }) => `<a class="${escapeHtml(className)}" href="${escapeHtml(buildAdminLocation({ path, theme, extra }))}">${escapeHtml(label)}</a>`;
  const unavailable = (label = "Unavailable") => `<span class="nordic-home-muted">${escapeHtml(label)}</span>`;

  const companionName = String(companion.name || "Dante").trim() || "Dante";
  const companionAvatarUrl = String(companion.avatarUrl || "").trim();
  const heroExcerpt = getHomeHeroExcerpt(companion.profile);
  const heroStatusPills = ["Online", "Private", timezone ? `Last active ${formatHomeDate(new Date().toISOString())}` : "Command center ready"];
  const heroPortrait = companionAvatarUrl
    ? `<img class="nordic-home-hero__portrait" src="${escapeHtml(companionAvatarUrl)}" alt="${escapeHtml(companionName)} portrait">`
    : `<div class="nordic-home-hero__empty" aria-label="No companion portrait configured">${renderNordicIcon("companion", { decorative: true, size: "4.8rem" })}<span>Portrait not configured</span></div>`;

  const warningMarkup = warnings.length
    ? `<section class="nordic-home-alerts">${warnings.map((warning) => `<article class="nordic-home-alert"><strong>${escapeHtml(warning.title || "Attention")}</strong><span>${escapeHtml(warning.detail || "")}</span>${warning.path ? safeLink({ path: warning.path, label: warning.cta || "Open" }) : ""}</article>`).join("")}</section>`
    : "";

  const updateNoticeMarkup = updateNotice
    ? [
      "<section class=\"nordic-home-update nordic-panel\">",
      updateNotice.eyebrow ? `<p class="nordic-eyebrow">${escapeHtml(updateNotice.eyebrow)}</p>` : "",
      `<h2>${escapeHtml(updateNotice.title || "Dante has been updated")}</h2>`,
      updateNotice.body ? `<p>${escapeHtml(updateNotice.body)}</p>` : "",
      "<form method=\"post\" action=\"/admin/actions/update-notice-dismiss\" class=\"inline-form\">",
      withThemeField ? withThemeField(theme) : "",
      `<input type="hidden" name="noticeId" value="${escapeHtml(updateNotice.id || "")}">`,
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/home\">",
      "<button class=\"secondary\" type=\"submit\">Dismiss</button>",
      "</form>",
      "</section>",
    ].join("")
    : "";

  const setupItems = [
    ...statuses.map((status) => ({ label: status.label || "Status", value: status.value || "Unavailable", icon: status.icon || "behaviour", path: status.path || "", extra: status.extra || {} })),
    { label: "Channels", value: stats.channelStatus || "Unconfigured", icon: "web_search" },
    { label: "Voice", value: stats.voiceStatus || "Unconfigured", icon: "voiceNote", path: "/admin/tools/audio" },
    { label: "Image generation", value: stats.imageGenerationStatus || "Unconfigured", icon: "gallery", path: "/admin/tools/images" },
  ].slice(0, 9);

  const setupMarkup = setupItems.map((item) => {
    const content = `${renderNordicIcon(item.icon, { decorative: true })}<span><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value || "Unavailable")}</strong></span>`;
    return item.path
      ? `<a class="nordic-home-setup-card" href="${escapeHtml(buildAdminLocation({ path: item.path, theme, extra: item.extra || {} }))}">${content}</a>`
      : `<article class="nordic-home-setup-card">${content}</article>`;
  }).join("");

  const featureMarkup = featureStates.length
    ? `<div class="nordic-home-feature-row">${featureStates.map((feature) => {
      const content = `${renderNordicIcon(feature.icon || "behaviour", { decorative: true })}<span>${escapeHtml(feature.label || "Feature")}</span>`;
      return feature.path
        ? `<a class="nordic-home-feature-pill${feature.active ? " is-active" : ""}" href="${escapeHtml(buildAdminLocation({ path: feature.path, theme }))}" title="${escapeHtml(feature.helpText || feature.label || "")}">${content}</a>`
        : `<span class="nordic-home-feature-pill${feature.active ? " is-active" : ""}" title="${escapeHtml(feature.helpText || feature.label || "")}">${content}</span>`;
    }).join("")}</div>`
    : "";

  const recentActionMarkup = recentDecisions.length
    ? `<div class="nordic-home-action-list">${recentDecisions.map((item) => `<a class="nordic-home-action${item.status === "skipped" ? " is-muted" : ""}" href="${escapeHtml(buildAdminLocation({ path: "/admin/heartbeat/overview", theme }))}">${renderNordicIcon(getHomeDecisionIcon(item), { decorative: true })}<span><strong>${escapeHtml(item.label || item.status || "Heartbeat")}</strong>${renderRecentActionDetail(item)}<time>${escapeHtml(formatHomeDate(item.at))}</time></span></a>`).join("")}</div>`
    : `<p class="nordic-empty">Recent Heartbeat decisions will appear here.</p>`;

  const galleryMarkup = recentImages.length
    ? `<div class="nordic-home-gallery-track nordic-gallery-strip">${recentImages.map((image) => {
      const previewUrl = String(image.previewUrl || "").trim();
      const caption = String(image.tagline || image.altText || "Generated image").trim();
      const shortCaption = caption.length > 80 ? `${caption.slice(0, 77)}…` : caption;
      return `<a class="nordic-home-gallery-tile nordic-gallery-card" href="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/images/detail/${encodeURIComponent(image.imageId)}`, theme }))}"${formatHomeImageAspectStyle(image.aspectRatio)}><span class="nordic-gallery-media"><img class="nordic-gallery-media-bg" src="${escapeHtml(previewUrl)}" alt="" aria-hidden="true" loading="lazy"><img class="nordic-gallery-img" src="${escapeHtml(previewUrl)}" alt="Generated gallery image" loading="lazy"></span><span class="nordic-gallery-caption"><strong>${escapeHtml(image.sourceLabel || "Generated image")}</strong><small>${escapeHtml(shortCaption)}</small></span></a>`;
    }).join("")}</div>`
    : `<div class="nordic-home-empty-gallery"><p>No gallery images yet.</p>${safeLink({ path: "/admin/gallery/images", label: "Open Gallery" })}</div>`;

  const recipeMarkup = `<div class="nordic-home-recipe-list">${selectRotatingRecipes({ now }).map((recipe) => `<a class="nordic-home-recipe-card" href="${escapeHtml(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(assetUrl(recipe.imageAsset))}" alt="" aria-hidden="true" loading="lazy"><div><p class="nordic-eyebrow">${escapeHtml(recipe.cultureTag)} · ${escapeHtml(recipe.sourceName)}</p><h3>${escapeHtml(recipe.title)}</h3><p>${escapeHtml(recipe.time)} · ${escapeHtml(recipe.carbsPerServing)}g ${escapeHtml(recipe.carbType)} carbs / serving</p><div>${recipe.tags.map((tag) => renderNordicPill({ label: tag })).join("")}</div></div></a>`).join("")}</div>`;

  const battleMarkup = `<div class="nordic-home-rhythm-summary"><p><strong>Today:</strong> ${escapeHtml(currentRhythm.day)} · ${escapeHtml(currentRhythm.training)} · ${escapeHtml(currentRhythm.meal)}</p><p><strong>Next:</strong> ${escapeHtml(nextRhythm.day)} · ${escapeHtml(nextRhythm.training)}</p></div><div class="nordic-home-battle-grid">${BATTLE_RHYTHM_DAYS.map((day, index) => renderBattleRhythmDayCard({ day: day.day, status: index === todayIndex ? "Today" : day.training, items: [day.training, day.meal] })).join("")}</div>`;

  const travelMarkup = travelTrips.length
    ? `<div class="nordic-home-travel-map" aria-hidden="true"><img src="${escapeHtml(assetUrl("07-travel-concierge/travel-saga-map-bg.png"))}" alt=""></div><div class="nordic-home-travel-cards">${travelTrips.slice(0, 3).map((trip) => `<a class="travel-saga-card" href="${escapeHtml(buildAdminLocation({ path: `/admin/travel/${encodeURIComponent(trip.id)}`, theme }))}">${renderNordicIcon("companion", { decorative: true })}<p class="nordic-eyebrow">${escapeHtml([trip.location, trip.country].filter(Boolean).join(", ") || "Destination")} · ${escapeHtml(trip.status || "wishlist")}</p><h3>${escapeHtml(trip.title || "Untitled trip")}</h3><p>${escapeHtml(trip.notes || "Open the Adventure Book to add notes, preferences, and checklist items.")}</p><div class="travel-tag-row">${Array.isArray(trip.vibeTags) ? trip.vibeTags.slice(0, 4).map((tag) => renderNordicPill({ label: tag })).join("") : ""}</div></a>`).join("")}</div>`
    : `<div class="nordic-home-empty-gallery"><p>No saved travel destinations yet.</p>${safeLink({ path: "/admin/travel", label: "Open Adventure Book" })}</div>`;

  const checklistMarkup = nextTravelTrip && nextTravelChecklistItems.length
    ? `<div class="nordic-home-checklist">${nextTravelChecklistItems.slice(0, 6).map((item) => `<form class="travel-home-check-item${item.checked ? " is-complete" : ""}" method="post" action="/admin/actions/travel-checklist-toggle"><input type="hidden" name="theme" value="${escapeHtml(theme)}"><input type="hidden" name="returnTo" value="/admin/home"><input type="hidden" name="itemId" value="${escapeHtml(item.id)}"><input type="hidden" name="checked" value="${item.checked ? "false" : "true"}"><button type="submit" class="travel-check-button" aria-label="${item.checked ? "Uncheck" : "Check"} ${escapeHtml(item.label || "checklist item")}">${item.checked ? "✓" : ""}</button><span><strong>${escapeHtml(item.label || "Checklist item")}</strong><small>${escapeHtml(nextTravelTrip.title || "Travel")}${item.category ? ` · ${escapeHtml(item.category)}` : ""}</small></span></form>`).join("")}</div>`
    : `<div class="nordic-home-empty-gallery"><p>${nextTravelTrip ? "No checklist items for this trip yet." : "No travel checklist yet."}</p>${safeLink({ path: nextTravelTrip ? `/admin/travel/${encodeURIComponent(nextTravelTrip.id)}` : "/admin/travel", label: nextTravelTrip ? "Open Trip" : "Open Adventure Book" })}</div>`;

  const conciergeMarkup = `<div class="nordic-home-concierge"><p>${nextTravelTrip ? `Travel Concierge Preview is ready for ${escapeHtml(nextTravelTrip.title)}. Open the trip to copy a planning brief built from saved preferences, notes, dates, and checklist state.` : "Add a destination in the Adventure Book, then Dante Concierge Planning Brief can compile a preview from saved trip context. Live web search is not connected here yet."}</p>${safeLink({ path: nextTravelTrip ? `/admin/travel/${encodeURIComponent(nextTravelTrip.id)}` : "/admin/travel", label: nextTravelTrip ? "Open Planning Brief" : "Open Adventure Book" })}</div>`;

  const innerLifeMarkup = recentInnerLifeEntries.length
    ? `<div class="nordic-home-innerlife">${recentInnerLifeEntries.slice(0, 4).map((entry) => `<article><strong>${escapeHtml(entry.title || entry.entryType || "Inner life")}</strong><span>${escapeHtml(entry.summary || "No summary recorded.")}</span></article>`).join("")}</div>`
    : "";

  const journalMarkup = recentJournals.length
    ? `<div class="nordic-home-journal-ribbon">${recentJournals.map((entry) => renderNordicJournalCard({ title: entry.title || "Journal entry", date: formatHomeDate(entry.createdAt), excerpt: renderJournalMarkdownPreview(entry.content, { escapeHtml, maxLines: 2, maxLength: 140, allowLinks: false }).replace(/<[^>]*>/g, ""), href: buildAdminLocation({ path: `/admin/journals/${encodeURIComponent(entry.entryId)}`, theme, extra: { journalPage: 1 } }) })).join("")}</div>`
    : `<p class="nordic-empty">No journal entries yet.</p>`;

  return [
    `<section class="nordic-dashboard nordic-home-shell nordic-home-wide nordic-bg" data-dashboard="nordic-home" style="--nordic-home-bg:url('${escapeHtml(assetUrl("02 backgrounds/aurora-fjord-dashboard-bg.png"))}');--nordic-home-fortress:url('${escapeHtml(assetUrl("02 backgrounds/moonlit-coastal-fortress.png"))}');--nordic-home-frame:url('${escapeHtml(assetUrl("03-frames-svg/panel-frame-wide.svg"))}');--nordic-home-hero-frame:url('${escapeHtml(assetUrl("03-frames-svg/panel-frame-hero.svg"))}');--nordic-home-runes:url('${escapeHtml(assetUrl("03-frames-svg/rune-strip.svg"))}');--nordic-home-travel-bg:url('${escapeHtml(assetUrl("07-travel-concierge/travel-world-map-cinematic.png"))}')">`,
    updateNoticeMarkup,
    warningMarkup,
    "<div class=\"nordic-home-top\">",
    "<section class=\"nordic-panel nordic-panel--hero nordic-home-hero\">",
    "<div class=\"nordic-home-hero__copy\">",
    "<p class=\"nordic-eyebrow\">Companion command center</p>",
    `<h1>${escapeHtml(companionName)}</h1>`,
    "<p class=\"nordic-home-hero__status\">" + heroStatusPills.map((pill) => `<span>${escapeHtml(pill)}</span>`).join("") + "</p>",
    `<p class="nordic-home-hero__excerpt">${escapeHtml(heroExcerpt)}</p>`,
    "<div class=\"nordic-home-hero__actions\">",
    safeLink({ path: "/admin/companion", label: "Companion" }),
    safeLink({ path: "/admin/memory/library", label: "Memory" }),
    safeLink({ path: "/admin/gallery/images", label: "Gallery" }),
    "</div>",
    "</div>",
    heroPortrait,
    "</section>",
    "<section class=\"nordic-panel nordic-home-setup\">",
    "<div class=\"nordic-panel__header\"><div><p class=\"nordic-eyebrow\">Live configuration</p><h2 class=\"nordic-panel__title\">Current Setup</h2></div></div>",
    `<div class="nordic-home-setup-grid">${setupMarkup || unavailable("No setup data available")}</div>`,
    featureMarkup,
    "</section>",
    "</div>",
    "<div class=\"nordic-home-middle\">",
    `<section class="nordic-panel nordic-home-recent"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Heartbeat</p><h2 class="nordic-panel__title">Recent Actions</h2></div></div>${recentActionMarkup}${innerLifeMarkup}</section>`,
    `<section class="nordic-panel nordic-home-gallery"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Live generated media</p><h2 class="nordic-panel__title">Gallery</h2></div>${safeLink({ path: "/admin/gallery/images", label: "Open Gallery" })}</div>${galleryMarkup}</section>`,
    `<section class="nordic-panel nordic-home-recipes"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Real low-carb recipe links</p><h2 class="nordic-panel__title">Nordic Low-Carb Recipes</h2></div><span class="nordic-pill">Rotates daily</span></div>${recipeMarkup}</section>`,
    "</div>",
    renderNordicDivider({ label: "Saga planning", icon: "companion" }),
    "<div class=\"nordic-home-lower\">",
    `<section class="nordic-panel nordic-home-battle"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">UI-only rhythm</p><h2 class="nordic-panel__title">Battle Rhythm Training</h2></div></div>${battleMarkup}</section>`,
    `<section class="nordic-panel nordic-home-travel"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Adventure book</p><h2 class="nordic-panel__title">Travel Saga</h2></div></div>${travelMarkup}</section>`,
    `<section class="nordic-panel nordic-home-travel-check"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Checklist shell</p><h2 class="nordic-panel__title">Travel Checklist</h2></div></div>${checklistMarkup}</section>`,
    `<section class="nordic-panel nordic-home-concierge-panel"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Planning brief</p><h2 class="nordic-panel__title">Dante Concierge Planning Brief</h2></div><span class="nordic-pill">No live web search</span></div>${conciergeMarkup}</section>`,
    "</div>",
    `<section class="nordic-panel nordic-home-journals"><div class="nordic-panel__header"><div><p class="nordic-eyebrow">Memory ribbon</p><h2 class="nordic-panel__title">Journal Entries</h2></div>${safeLink({ path: "/admin/journals", label: "Open Journals" })}</div>${journalMarkup}</section>`,
    "</section>",
  ].join("");
}

renderHomePage.BATTLE_RHYTHM_DAYS = BATTLE_RHYTHM_DAYS;


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
  const diagnosticRows = [
    ["Adult Private Mode enabled", state.adultPrivateModeEnabled ? "Yes" : "No"],
    ["Current channel adult-enabled", state.adultPrivateModeChannelId ? "Configured channel only" : "No channel configured"],
    ["Current user matches adult-mode owner/user", state.chatUserIdValue ? "Configured owner only" : "No owner configured"],
    ["Adult model override active", state.adultPrivateModeModel ? "Configured model override" : "Uses Romance/default fallback"],
    ["Adult prompt injected", state.adultPrivateModeSystemPrompt ? "When scope matches" : "No adult prompt configured"],
    ["adultModeEscalation injected", state.adultPrivateModeEnabled && state.adultPrivateModeChannelId && state.chatUserIdValue ? "When scope matches" : "Blocked until enabled/channel/user all match"],
    ["Aftercare currently active", "Only after safeword/stop/discomfort in matched channel"],
    ["Last adult-mode refusal/block reason", "See structured logs: refusal_detected / refusal_blocked / reason"],
  ];

  return [
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    renderBehaviourFormFields({ theme, tab: "private-mode", helpers }),
    `<section class="lite-panel"><h3>Adult Private Mode Diagnostics</h3><dl class="settings-diagnostics">`,
    diagnosticRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join(""),
    `</dl><p class="meta">Live message-scoped values are written to structured logs on every chat turn.</p></section>`,
    "<p class=\"meta behaviour-tab-intro\">Bind a specific private Discord channel to a dedicated adult/intimacy model and behaviour layer. Only messages sent to the configured channel ID by the configured owner/user will use these overrides. Use <code>!adult</code> in any channel to toggle this mode on or off for that channel.</p>",
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
      capability: "companion",
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
      capability: "companion",
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
    renderFieldLabelWithHelp({ forId: "temporalPreferredTimeFormat", label: "Preferred Time Format", help: "Controls how temporal context is formatted for speech, journals, dreams, and schedules." }, helpers),
    `<select id="temporalPreferredTimeFormat" name="temporalPreferredTimeFormat"><option value="12h"${(state.runtimeSettings["temporal.preferredTimeFormat"] || "12h") === "12h" ? " selected" : ""}>12h</option><option value="24h"${state.runtimeSettings["temporal.preferredTimeFormat"] === "24h" ? " selected" : ""}>24h</option></select>`,
    `<div class="form-grid two">`,
    `<label>Quiet Hours Start<input type="time" name="temporalQuietHoursStart" value="${escapeHtml(state.runtimeSettings["temporal.quietHoursStart"] || "23:00")}"></label>`,
    `<label>Quiet Hours End<input type="time" name="temporalQuietHoursEnd" value="${escapeHtml(state.runtimeSettings["temporal.quietHoursEnd"] || "07:00")}"></label>`,
    `<label>Active Hours Start<input type="time" name="temporalActiveHoursStart" value="${escapeHtml(state.runtimeSettings["temporal.activeHoursStart"] || "09:00")}"></label>`,
    `<label>Active Hours End<input type="time" name="temporalActiveHoursEnd" value="${escapeHtml(state.runtimeSettings["temporal.activeHoursEnd"] || "22:00")}"></label>`,
    "</div>",
    `<label class="switch-field image-settings-toggle"><input type="hidden" name="temporalSeasonalAwarenessEnabled" value="false"><span class="switch-control"><input type="checkbox" name="temporalSeasonalAwarenessEnabled" value="true"${state.runtimeSettings["temporal.seasonalAwarenessEnabled"] === false ? "" : " checked"}><span></span></span><span class="switch-label">Seasonal Awareness</span></label>`,
    `<label class="switch-field image-settings-toggle"><input type="hidden" name="temporalDayCycleAwarenessEnabled" value="false"><span class="switch-control"><input type="checkbox" name="temporalDayCycleAwarenessEnabled" value="true"${state.runtimeSettings["temporal.dayCycleAwarenessEnabled"] === false ? "" : " checked"}><span></span></span><span class="switch-label">Day-Cycle Awareness</span></label>`,
    renderFieldLabelWithHelp({ forId: "temporalClockPresetId", label: "Clock Preset", help: "Companion-specific emotional and stylistic relationship to time." }, helpers),
    `<select id="temporalClockPresetId" name="temporalClockPresetId">${listClockPresets().map((preset) => `<option value="${escapeHtml(preset.id)}"${preset.id === (state.runtimeSettings["temporal.clockPresetId"] || "dante-wolf-hour-clock") ? " selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}</select>`,
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
  LOW_CARB_NORDIC_RECIPE_SEEDS,
  selectRotatingRecipes,
  renderHomePage,
  renderCompanionPage,
  renderBehaviourPage,
};
