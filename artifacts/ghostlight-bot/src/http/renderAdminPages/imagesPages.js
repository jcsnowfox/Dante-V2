const { getRuntimeState, renderPageIntro, renderSubnav } = require("./shared");

function renderPresetCards({
  presets = [],
  theme,
  helpers,
  kind = "style",
  selectedPresetId = "",
}) {
  const { escapeHtml, buildAdminLocation } = helpers;

  if (!presets.length) {
    return "<p class=\"meta\">No presets yet.</p>";
  }

  return presets.map((preset) => [
    "<article class=\"card\">",
    `<p><strong>${escapeHtml(preset.name)}</strong>${preset.archivedAt ? " <span class=\"meta\">(archived)</span>" : ""}</p>`,
    `<p class="meta">${escapeHtml(preset.promptText)}</p>`,
    kind === "appearance"
      ? `<p class="meta">${preset.referenceImageStorageKey ? `Reference image attached${preset.referenceImageOriginalFilename ? `: ${escapeHtml(preset.referenceImageOriginalFilename)}` : "."}` : "No reference image attached."}</p>`
      : "",
    "<div class=\"toolbar\" style=\"margin-top:1rem\">",
    `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/tools/images", theme, extra: { imagesTab: kind, [`${kind}Preset`]: preset.presetId } }))}">${selectedPresetId === preset.presetId ? "Editing" : "Edit"}</a>`,
    `<form method="post" action="/admin/actions/image-preset-archive">`,
    helpers.withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/tools/images", theme, extra: { imagesTab: kind } }))}">`,
    `<input type="hidden" name="kind" value="${escapeHtml(kind)}">`,
    `<input type="hidden" name="presetId" value="${escapeHtml(preset.presetId)}">`,
    `<input type="hidden" name="archived" value="${preset.archivedAt ? "false" : "true"}">`,
    `<button type="submit" class="toolbar-button secondary">${preset.archivedAt ? "Restore" : "Archive"}</button>`,
    "</form>",
    `<form method="post" action="/admin/actions/image-preset-delete"${helpers.renderConfirmOnSubmit("Delete this preset?\n\nThis removes it permanently.")}>`,
    helpers.withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/tools/images", theme, extra: { imagesTab: kind } }))}">`,
    `<input type="hidden" name="kind" value="${escapeHtml(kind)}">`,
    `<input type="hidden" name="presetId" value="${escapeHtml(preset.presetId)}">`,
    "<button type=\"submit\" class=\"toolbar-button secondary\">Delete</button>",
    "</form>",
    "</div>",
    "</article>",
  ].join("")).join("");
}

function renderPresetEditor({
  title,
  actionLabel,
  kind,
  preset = null,
  theme = "light",
  helpers,
}) {
  const { escapeHtml, buildAdminLocation, withThemeField } = helpers;
  const referenceInputId = `${kind}PresetReferenceImage`;

  return [
    "<article class=\"card\">",
    `<h3>${escapeHtml(title)}</h3>`,
    `<form method="post" action="/admin/actions/image-preset-save"${kind === "appearance" ? " enctype=\"multipart/form-data\"" : ""}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/tools/images", theme, extra: { imagesTab: kind } }))}">`,
    `<input type="hidden" name="kind" value="${escapeHtml(kind)}">`,
    `<input type="hidden" name="presetId" value="${escapeHtml(preset?.presetId || "")}">`,
    `<label for="${escapeHtml(`${kind}PresetName`)}">Name</label>`,
    `<input id="${escapeHtml(`${kind}PresetName`)}" name="name" type="text" value="${escapeHtml(preset?.name || "")}" maxlength="120">`,
    `<label for="${escapeHtml(`${kind}PresetPrompt`)}">Prompt</label>`,
    `<textarea id="${escapeHtml(`${kind}PresetPrompt`)}" name="promptText" maxlength="1500">${escapeHtml(preset?.promptText || "")}</textarea>`,
    kind === "appearance"
      ? [
        `<label for="${escapeHtml(referenceInputId)}">Reference Image</label>`,
        "<p class=\"meta\">Optional. This helps preserve stable visual identity for this appearance preset. It does not replace pose, clothing, expression, framing, or scene description.</p>",
        preset?.referenceImageStorageKey
          ? `<p class="meta">Current reference image: ${escapeHtml(preset.referenceImageOriginalFilename || "attached image")}</p>`
          : "<p class=\"meta\">No reference image attached yet.</p>",
        "<div class=\"file-picker-row image-preset-file-picker-row\">",
        `<label class="toolbar-button secondary file-picker-button" for="${escapeHtml(referenceInputId)}">Choose image</label>`,
        `<span class="file-picker-label" data-file-picker-label="${escapeHtml(referenceInputId)}">No image selected</span>`,
        `<input id="${escapeHtml(referenceInputId)}" name="referenceImage" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose reference image" class="file-picker-input">`,
        "</div>",
        preset?.referenceImageStorageKey
          ? "<label class=\"checkbox-row\" style=\"margin-top:1rem\"><input type=\"checkbox\" name=\"removeReferenceImage\" value=\"on\"> <span>Remove current reference image</span></label>"
        : "",
      ].join("")
      : "",
    "<div class=\"toolbar\">",
    `<button type="submit">${escapeHtml(actionLabel)}</button>`,
    preset?.presetId
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/tools/images", theme, extra: { imagesTab: kind } }))}">Cancel</a>`
      : "",
    "</div>",
    "</form>",
    kind === "appearance"
      ? [
        "<script>",
        "(()=>{",
        `const fileInput=document.getElementById('${escapeHtml(referenceInputId)}');`,
        `const fileLabel=document.querySelector('[data-file-picker-label="${escapeHtml(referenceInputId)}"]');`,
        "fileInput?.addEventListener('change',()=>{",
        "if(!fileLabel){return;}",
        "const count=fileInput.files?.length||0;",
        "fileLabel.textContent=count?(count===1?fileInput.files[0].name:`${count} files selected`):'No image selected';",
        "});",
        "})();",
        "</script>",
      ].join("")
      : "",
    "</article>",
  ].join("");
}

const IMAGE_GENERATION_MODEL_OPTIONS = Object.freeze([
  { value: "gpt-image-2", label: "GPT Image 2" },
  { value: "grok-imagine-image", label: "Grok Imagine" },
  { value: "gemini-3-1-flash-image", label: "Nano Banana 2" },
  { value: "qwen-image-2-0", label: "Qwen Image 2.0" },
  { value: "qwen-image-2-0-pro", label: "Qwen Image 2.0 Pro" },
  { value: "seedream-4", label: "Seedream 4" },
  { value: "seedream-4-5", label: "Seedream 4.5" },
  { value: "seedream-5-lite", label: "Seedream 5.0 Lite" },
  { value: "wan-2-7-image", label: "Wan 2.7 Image" },
  { value: "wan-2-7-image-pro", label: "Wan 2.7 Image Pro" },
  { value: "z-image-turbo", label: "Z-Image Turbo" },
].sort((a, b) => a.label.localeCompare(b.label)));

function renderImageGenerationModelOptions(selectedValue = "", helpers = {}) {
  const { escapeHtml = (value) => String(value || "") } = helpers;
  const normalizedSelectedValue = String(selectedValue || "").trim() || "gemini-3-1-flash-image";

  return IMAGE_GENERATION_MODEL_OPTIONS.map((option) => {
    const selected = option.value === normalizedSelectedValue ? " selected" : "";
    return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function renderImageResolutionOptions(selectedValue = "") {
  const normalizedSelectedValue = ["1K", "2K", "4K"].includes(String(selectedValue || "").trim().toUpperCase())
    ? String(selectedValue || "").trim().toUpperCase()
    : "1K";
  const options = [
    { value: "1K", label: "Low (Default)" },
    { value: "2K", label: "Medium" },
    { value: "4K", label: "High" },
  ];

  return options.map((option) => {
    const selected = option.value === normalizedSelectedValue ? " selected" : "";
    return `<option value="${option.value}"${selected}>${option.label} (${option.value})</option>`;
  }).join("");
}

function renderHomepageFeedModeOptions(selectedValue = "") {
  const normalizedSelectedValue = ["recent", "randomized"].includes(String(selectedValue || "").trim().toLowerCase())
    ? String(selectedValue || "").trim().toLowerCase()
    : "randomized";
  const options = [
    { value: "recent", label: "Recent feed" },
    { value: "randomized", label: "Randomised picks" },
  ];

  return options.map((option) => {
    const selected = option.value === normalizedSelectedValue ? " selected" : "";
    return `<option value="${option.value}"${selected}>${option.label}</option>`;
  }).join("");
}

function formatImageDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatImageBytes(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatImageAspectRatioStyle(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);

  if (!match) {
    return "";
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "";
  }

  return ` style="aspect-ratio:${width} / ${height}"`;
}

function normalizeImageErrorMessage(value, maxLength = 320) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const extractMessage = (input) => {
    if (!input || typeof input !== "object") {
      return "";
    }

    if (typeof input.message === "string" && input.message.trim()) {
      return input.message.trim();
    }

    if (input.error && typeof input.error === "object") {
      const nestedErrorMessage = extractMessage(input.error);

      if (nestedErrorMessage) {
        return nestedErrorMessage;
      }
    }

    return "";
  };

  let normalized = raw;
  let prefix = "";
  let jsonPayload = raw;
  const firstJsonIndex = raw.search(/[\[{]/);

  if (firstJsonIndex > 0) {
    prefix = raw.slice(0, firstJsonIndex).trim();
    jsonPayload = raw.slice(firstJsonIndex).trim();
  }

  if (firstJsonIndex === 0 || (firstJsonIndex > 0 && (jsonPayload.startsWith("{") || jsonPayload.startsWith("[")))) {
    try {
      const parsed = JSON.parse(jsonPayload);
      const parsedMessage = extractMessage(parsed);

      if (parsedMessage) {
        normalized = prefix
          ? `${prefix} Message: "${parsedMessage}"`
          : parsedMessage;
      } else {
        normalized = prefix || raw;
      }
    } catch {
      normalized = raw;
    }
  }

  normalized = normalized.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function renderTagPills(tags = [], helpers) {
  const { escapeHtml } = helpers;
  const visibleTags = Array.isArray(tags) ? tags.filter(Boolean) : [];

  if (!visibleTags.length) {
    return "<p class=\"meta\">No tags yet.</p>";
  }

  return [
    "<div class=\"memory-chip-row\">",
    ...visibleTags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`),
    "</div>",
  ].join("");
}

function renderSelectedFilterPills(selectedOptions = [], helpers) {
  const { escapeHtml } = helpers;
  const options = Array.isArray(selectedOptions) ? selectedOptions.filter(Boolean) : [];

  return [
    "<div class=\"memory-chip-row\" data-selected-filter-pills>",
    ...options.map((option) => `<button type="button" class="toolbar-button secondary" data-filter-remove="${escapeHtml(option.value)}">${escapeHtml(option.label)} ×</button>`),
    "</div>",
  ].join("");
}

function renderImagesSettingsPage({
  config,
  theme = "light",
  stylePresets = [],
  appearancePresets = [],
  selectedStylePreset = null,
  selectedAppearancePreset = null,
  currentTab = "",
  helpers,
}) {
  const {
    escapeHtml,
    withThemeField,
    buildAdminLocation,
  } = helpers;
  const state = getRuntimeState({ config, helpers });
  const resolvedTab = currentTab === "appearance" || selectedAppearancePreset
    ? "appearance"
    : "style";
  const tabs = [
    { key: "style", label: "Style Presets" },
    { key: "appearance", label: "Appearance Presets" },
  ];
  const activeKind = resolvedTab === "appearance" ? "appearance" : "style";
  const activePresets = activeKind === "appearance" ? appearancePresets : stylePresets;
  const activeSelectedPreset = activeKind === "appearance" ? selectedAppearancePreset : selectedStylePreset;

  return [
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/tools/images", theme, extra: { imagesTab: resolvedTab } }))}">`,
    "<label class=\"switch-field image-settings-toggle\">",
    "<input type=\"hidden\" name=\"imageGenerationEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="imageGenerationEnabled" value="true"${state.imageGenerationEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label\">Enable image generation</span>",
    "</label>",
    "<div class=\"image-settings-row image-settings-row-balanced\">",
    [
      "<div>",
      "<label for=\"imageGenerationModel\">Image Generation Model</label>",
      `<select id="imageGenerationModel" name="imageGenerationModel">${renderImageGenerationModelOptions(state.imageGenerationModelValue, helpers)}</select>`,
      "</div>",
      "<div>",
      "<label for=\"imageGenerationResolution\">Image Resolution</label>",
      `<select id="imageGenerationResolution" name="imageGenerationResolution">${renderImageResolutionOptions(state.imageGenerationResolutionValue)}</select>`,
      "</div>",
      "<div>",
      "<label for=\"imageGenerationHomepageFeedMode\">Homepage Image Feed</label>",
      `<select id="imageGenerationHomepageFeedMode" name="imageGenerationHomepageFeedMode">${renderHomepageFeedModeOptions(state.imageGenerationHomepageFeedModeValue)}</select>`,
      "</div>",
      "<div class=\"image-settings-save\">",
      "<label>&nbsp;</label>",
      "<button type=\"submit\">Save Image Settings</button>",
      "</div>",
    ].join(""),
    "</div>",
    "</form>",
    "<div class=\"form-divider\"></div>",
    renderSubnav({
      items: tabs.map((tab) => ({
        ...tab,
        path: "/admin/tools/images",
        extra: { imagesTab: tab.key },
      })),
      currentKey: resolvedTab,
      theme,
      helpers,
    }),
    "<div class=\"form-divider\"></div>",
    renderPresetEditor({
      title: activeSelectedPreset
        ? `Edit ${activeKind === "appearance" ? "Appearance" : "Style"} Preset`
        : `New ${activeKind === "appearance" ? "Appearance" : "Style"} Preset`,
      actionLabel: activeSelectedPreset
        ? `Save ${activeKind === "appearance" ? "Appearance" : "Style"} Preset`
        : `Add ${activeKind === "appearance" ? "Appearance" : "Style"} Preset`,
      kind: activeKind,
      preset: activeSelectedPreset,
      theme,
      helpers,
    }),
    "<div class=\"form-divider\"></div>",
    `<div class="copy-block"><h3>Saved ${escapeHtml(activeKind === "appearance" ? "Appearance" : "Style")} Presets</h3></div>`,
    renderPresetCards({
      presets: activePresets,
      theme,
      helpers,
      kind: activeKind,
      selectedPresetId: activeSelectedPreset?.presetId || "",
    }),
    "</section>",
  ].join("");
}

function renderImagesLayout({ currentTab = "settings", tabBody = "", theme = "light", helpers }) {
  const tabs = [
    { key: "settings", label: "Settings", path: "/admin/tools/images" },
    { key: "gallery", label: "Library", path: "/admin/gallery/images" },
  ];

  return [
    renderPageIntro({
      title: currentTab === "settings" ? "Tools" : "Library",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: currentTab, theme, helpers }),
    "</section>",
    tabBody,
  ].join("");
}

function renderImagesGalleryPage({
  images = [],
  filters = {},
  availableTags = [],
  page = 1,
  pageSize = 24,
  totalItems = 0,
  theme = "light",
  helpers,
}) {
  const { escapeHtml, buildAdminLocation, withThemeField } = helpers;
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const filterExtras = {
    favorites: filters.favoritesOnly ? "true" : "",
    q: filters.q || "",
    filterTags: Array.isArray(filters.filterTags) ? filters.filterTags.join(",") : "",
  };
  const exportLocation = buildAdminLocation({
    path: "/admin/exports/images",
    theme,
    extra: filterExtras,
  });
  const availableTagMap = new Map((availableTags || []).map((option) => [option.value, option.label]));
  const selectedTagOptions = (Array.isArray(filters.filterTags) ? filters.filterTags : [])
    .map((value) => ({
      value,
      label: availableTagMap.get(value) || value,
    }));

  return [
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    `<form method="get" action="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/images" }))}" class="stack">`,
    withThemeField(theme),
    `<input type="hidden" name="filterTags" value="${escapeHtml(filterExtras.filterTags)}" data-filter-tags-hidden>`,
    "<div class=\"gallery-filter-grid image-gallery-filter-grid\">",
    `<div><label for="imageGalleryQuery">Search</label><input id="imageGalleryQuery" name="q" type="text" value="${escapeHtml(filters.q || "")}" placeholder="Search prompt text"></div>`,
    [
      "<div class=\"gallery-tag-field\">",
      "<label for=\"imageGalleryTagSearch\">Tags</label>",
      `<input id="imageGalleryTagSearch" type="text" list="imageGalleryTagOptions" placeholder="Type to search tags" data-filter-tag-search>`,
      "<datalist id=\"imageGalleryTagOptions\">",
      ...(availableTags || []).map((option) => `<option value="${escapeHtml(option.label)}" data-filter-value="${escapeHtml(option.value)}"></option>`),
      "</datalist>",
      `<select class="filter-options-source" data-filter-tag-options>${(availableTags || []).map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}</select>`,
      "</div>",
    ].join(""),
    "</div>",
    renderSelectedFilterPills(selectedTagOptions, helpers),
    "<div class=\"gallery-filter-actions\">",
    "<div class=\"toolbar\">",
    "<button type=\"submit\">Filter</button>",
    `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/images", theme }))}">Clear Filters</a>`,
    `<a class="button-link button-link-secondary" href="${escapeHtml(exportLocation)}">Export Current Results</a>`,
    `<button type="submit" class="toolbar-button danger image-gallery-selected-action" form="imageGalleryBulkDeleteForm" data-gallery-delete-selected hidden disabled>Delete selected</button>`,
    `<a class="button-link button-link-secondary image-gallery-selected-action" href="${escapeHtml(exportLocation)}" data-gallery-export-selected data-export-base="${escapeHtml(exportLocation)}" hidden>Export selected</a>`,
    "<span class=\"meta image-gallery-selected-action\" data-gallery-selected-count hidden>0 selected</span>",
    "<span class=\"meta\" data-gallery-delete-status aria-live=\"polite\" hidden></span>",
    "</div>",
    "<label class=\"switch-field image-gallery-favorite-toggle\">",
    `<span class="switch-control"><input type="checkbox" name="favorites" value="true"${filters.favoritesOnly ? " checked" : ""}><span aria-hidden="true"></span></span>`,
    "<span class=\"switch-label\">Favourites only</span>",
    "</label>",
    "</div>",
    "</form>",
    `<script>
(() => {
  const form = document.currentScript?.previousElementSibling;
  if (!form) return;
  const hidden = form.querySelector('[data-filter-tags-hidden]');
  const search = form.querySelector('[data-filter-tag-search]');
  const optionsSelect = form.querySelector('[data-filter-tag-options]');
  const pills = form.querySelector('[data-selected-filter-pills]');
  if (!hidden || !search || !optionsSelect || !pills) return;

  const optionMap = new Map(Array.from(optionsSelect.options).map((option) => [option.textContent, option.value]));
  const normalizedOptionMap = new Map(Array.from(optionsSelect.options).map((option) => [option.textContent.trim().toLowerCase(), option.value]));
  let selected = hidden.value ? hidden.value.split(',').map((value) => value.trim()).filter(Boolean) : [];

  const render = () => {
    hidden.value = selected.join(',');
    pills.innerHTML = selected.map((value) => {
      const option = Array.from(optionsSelect.options).find((item) => item.value === value);
      const label = option ? option.textContent : value;
      const safeValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<button type="button" class="toolbar-button secondary" data-filter-remove="' + safeValue + '">' + safeLabel + ' ×</button>';
    }).join('');
  };

  const commitPendingTag = () => {
    const rawSearchValue = search.value.trim();
    if (!rawSearchValue) return false;
    const value = optionMap.get(rawSearchValue) || normalizedOptionMap.get(rawSearchValue.toLowerCase());
    if (!value || selected.includes(value)) return false;
    selected.push(value);
    search.value = '';
    render();
    return true;
  };

  search.addEventListener('input', () => {
    commitPendingTag();
  });

  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitPendingTag();
  });

  form.addEventListener('submit', () => {
    commitPendingTag();
  });

  pills.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-remove]');
    if (!button) return;
    const value = button.getAttribute('data-filter-remove') || '';
    if (!value) return;
    selected = selected.filter((item) => item !== value);
    render();
  });
})();
</script>`,
    "<div class=\"form-divider\"></div>",
    images.length
      ? [
        `<form id="imageGalleryBulkDeleteForm" method="post" action="/admin/actions/image-bulk-delete" data-image-gallery-bulk-form hidden>`,
        withThemeField(theme),
        `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({
          path: "/admin/gallery/images",
          theme,
          extra: { ...filterExtras, page: page > 1 ? page : "" },
        }))}">`,
        "</form>",
        `<div class="image-gallery-feed" data-image-gallery-feed data-favorites-only="${filters.favoritesOnly ? "true" : "false"}">`,
        ...images.map((image) => {
          const detailLocation = buildAdminLocation({ path: `/admin/gallery/images/detail/${encodeURIComponent(image.imageId)}`, theme });
          const imageLabel = image.prompt || `Generated image from ${formatImageDate(image.createdAt)}`;
          const aspectRatioStyle = formatImageAspectRatioStyle(image.aspectRatio);
          const returnTo = buildAdminLocation({
            path: "/admin/gallery/images",
            theme,
            extra: { ...filterExtras, page: page > 1 ? page : "" },
          });
          const favoriteLabel = image.isFavorite ? "Remove from favourites" : "Add to favourites";
          const tileLink = image.previewUrl
            ? `<a href="${escapeHtml(detailLocation)}" class="image-gallery-tile${aspectRatioStyle ? " has-ratio" : ""}"${aspectRatioStyle}><img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(imageLabel)}" loading="lazy" decoding="async"></a>`
            : image.status === "failed"
              ? `<a href="${escapeHtml(detailLocation)}" class="gallery-thumbnail-state image-gallery-tile is-failed"${aspectRatioStyle}><img src="/assets/image-failed.svg" alt="" aria-hidden="true"><span>Generation failed</span></a>`
              : `<a href="${escapeHtml(detailLocation)}" class="gallery-thumbnail-state image-gallery-tile is-unavailable"${aspectRatioStyle}>Preview unavailable</a>`;
          return [
            `<article class="image-gallery-item" data-image-gallery-item data-image-id="${escapeHtml(image.imageId)}">`,
            `<input class="image-gallery-select-input" type="checkbox" name="imageId" value="${escapeHtml(image.imageId)}" form="imageGalleryBulkDeleteForm" aria-label="Select image" tabindex="-1">`,
            tileLink,
            "<div class=\"image-gallery-tile-actions\">",
            `<a href="${escapeHtml(detailLocation)}" class="feature-toggle-pill gallery-round-action image-gallery-details-pill" aria-label="Open image details" title="Open image details"><span aria-hidden="true">i</span></a>`,
            "<form method=\"post\" action=\"/admin/actions/image-favorite-toggle\" class=\"image-gallery-favorite-form\">",
            withThemeField(theme),
            `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
            `<input type="hidden" name="imageId" value="${escapeHtml(image.imageId)}">`,
            `<button type="submit" class="feature-toggle-pill gallery-round-action image-gallery-favorite-pill${image.isFavorite ? " is-active" : ""}" aria-label="${escapeHtml(favoriteLabel)}" title="${escapeHtml(favoriteLabel)}"><span aria-hidden="true">${image.isFavorite ? "♥" : "♡"}</span></button>`,
            "</form>",
            "</div>",
            "</article>",
          ].join("");
        }),
        "</div>",
        `<script>
(() => {
  const feed = document.currentScript?.previousElementSibling;
  if (!feed || !feed.matches('[data-image-gallery-feed]')) return;
  const bulkForm = document.getElementById('imageGalleryBulkDeleteForm');
  const deleteButton = document.querySelector('[data-gallery-delete-selected]');
  const exportSelectedLink = document.querySelector('[data-gallery-export-selected]');
  const selectedCount = document.querySelector('[data-gallery-selected-count]');
  const deleteStatus = document.querySelector('[data-gallery-delete-status]');
  const selectedActions = Array.from(document.querySelectorAll('.image-gallery-selected-action'));

  const getSelectedInputs = () => Array.from(feed.querySelectorAll('.image-gallery-select-input:checked'));
  const syncSelectionUi = () => {
    const selected = getSelectedInputs();
    const count = selected.length;
    for (const item of feed.querySelectorAll('[data-image-gallery-item]')) {
      const input = item.querySelector('.image-gallery-select-input');
      item.classList.toggle('is-selected', Boolean(input?.checked));
    }
    if (selectedCount) {
      selectedCount.textContent = count === 1 ? '1 selected' : count + ' selected';
    }
    if (deleteButton) {
      deleteButton.disabled = count === 0;
    }
    for (const action of selectedActions) {
      action.hidden = count === 0;
    }
    if (deleteStatus && !deleteStatus.textContent.trim()) {
      deleteStatus.hidden = count === 0;
    }
    if (exportSelectedLink) {
      const exportUrl = new URL(exportSelectedLink.dataset.exportBase || exportSelectedLink.href, window.location.origin);
      exportUrl.searchParams.set('imageIds', selected.map((input) => input.value).join(','));
      exportSelectedLink.href = exportUrl.pathname + exportUrl.search;
    }
  };

  const resizeTiles = () => {
    const styles = window.getComputedStyle(feed);
    const rowSize = Number.parseFloat(styles.gridAutoRows) || 8;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    for (const item of feed.querySelectorAll('.image-gallery-item')) {
      const tile = item.querySelector('.image-gallery-tile');
      if (!tile) continue;
      const height = tile.getBoundingClientRect().height;
      if (!height) continue;
      item.style.gridRowEnd = 'span ' + Math.ceil((height + rowGap) / (rowSize + rowGap));
    }
  };

  window.requestAnimationFrame(resizeTiles);
  window.addEventListener('resize', resizeTiles, { passive: true });
  for (const image of feed.querySelectorAll('img')) {
    if (!image.complete) {
      image.addEventListener('load', resizeTiles, { once: true });
    }
  }

  const submitFavoriteForm = async (form) => {
    const button = form.querySelector('.image-gallery-favorite-pill');
    if (!button) return;
    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Favourite update failed.');
      }

      const isFavorite = Boolean(result.isFavorite);
      const label = isFavorite ? 'Remove from favourites' : 'Add to favourites';
      button.classList.toggle('is-active', isFavorite);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      const icon = button.querySelector('span');
      if (icon) {
        icon.textContent = isFavorite ? '♥' : '♡';
      }

      if (!isFavorite && feed.dataset.favoritesOnly === 'true') {
        form.closest('.image-gallery-item')?.remove();
        syncSelectionUi();
        resizeTiles();
      }
    } catch (error) {
      button.disabled = false;
      return;
    } finally {
      button.disabled = false;
    }
  };

  for (const form of feed.querySelectorAll('.image-gallery-favorite-form')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitFavoriteForm(form);
    });
  }

  for (const input of feed.querySelectorAll('.image-gallery-select-input')) {
    input.addEventListener('change', syncSelectionUi);
  }

  bulkForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selected = getSelectedInputs();
    if (!selected.length || !deleteButton) return;
    const confirmed = window.confirm('Delete ' + selected.length + ' selected image' + (selected.length === 1 ? '' : 's') + ' from the gallery and bucket storage?');
    if (!confirmed) return;

    deleteButton.disabled = true;
    deleteButton.classList.add('is-loading');
    if (deleteStatus) {
      deleteStatus.textContent = 'Deleting...';
    }

    try {
      const formData = new FormData(bulkForm);
      formData.delete('imageId');
      for (const input of selected) {
        formData.append('imageId', input.value);
      }
      const response = await fetch(bulkForm.action, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Delete failed.');
      }

      const deletedIds = new Set(result.deletedImageIds || []);
      for (const imageId of deletedIds) {
        const item = feed.querySelector('[data-image-id="' + CSS.escape(imageId) + '"]');
        item?.remove();
      }
      if (deleteStatus) {
        const count = Number(result.deletedCount || deletedIds.size || 0);
        deleteStatus.textContent = count === 1 ? 'Deleted 1 image.' : 'Deleted ' + count + ' images.';
        deleteStatus.hidden = false;
      }
      syncSelectionUi();
      resizeTiles();
    } catch (error) {
      if (deleteStatus) {
        deleteStatus.textContent = error.message || 'Delete failed.';
      }
    } finally {
      deleteButton.classList.remove('is-loading');
      syncSelectionUi();
    }
  });

  feed.addEventListener('click', (event) => {
    const tile = event.target.closest('.image-gallery-tile');
    if (tile) {
      const item = tile.closest('[data-image-gallery-item]');
      const input = item?.querySelector('.image-gallery-select-input');
      if (input) {
        event.preventDefault();
        if (deleteStatus) {
          deleteStatus.textContent = '';
        }
        input.checked = !input.checked;
        syncSelectionUi();
      }
      return;
    }

    const button = event.target.closest('.image-gallery-favorite-pill');
    if (!button) return;
    const form = button.closest('.image-gallery-favorite-form');
    if (!form) return;
    event.preventDefault();
    submitFavoriteForm(form);
  });
})();
</script>`,
      ].join("")
      : "<p class=\"meta\">No images matched those filters yet.</p>",
    "<div class=\"form-divider\"></div>",
    "<div class=\"toolbar\" style=\"justify-content:center\">",
    previousPage
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/images", theme, extra: { ...filterExtras, page: previousPage } }))}">Previous</a>`
      : "<span class=\"button-link button-link-secondary\" aria-disabled=\"true\">Previous</span>",
    `<span class="meta">Page ${escapeHtml(String(page))} of ${escapeHtml(String(totalPages))}</span>`,
    nextPage
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/images", theme, extra: { ...filterExtras, page: nextPage } }))}">Next</a>`
      : "<span class=\"button-link button-link-secondary\" aria-disabled=\"true\">Next</span>",
    "</div>",
    "</section>",
  ].join("");
}

function renderImageDetailPage({
  image = null,
  theme = "light",
  helpers,
}) {
  const { escapeHtml, buildAdminLocation, withThemeField, renderConfirmOnSubmit } = helpers;

  if (!image) {
    return [
      "<section class=\"lite-panel page-frame no-divider\">",
      "<article class=\"card\"><p class=\"meta\">That image couldn’t be found.</p></article>",
      "</section>",
    ].join("");
  }

  return [
    "<section class=\"lite-panel page-frame no-divider\">",
    `<div class="toolbar toolbar-bottom-gap"><a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/images", theme }))}">Back to Gallery</a></div>`,
    "<div class=\"split-panel\">",
    "<article class=\"card\">",
    image.status === "failed"
      ? [
        "<div class=\"gallery-thumbnail-state image-detail-failed-state\">",
        "<img src=\"/assets/image-failed.svg\" alt=\"\" aria-hidden=\"true\">",
        "<span>Generation failed</span>",
        "</div>",
      ].join("")
      : image.downloadUrl
        ? `<img class="image-detail-preview" src="${escapeHtml(image.downloadUrl)}" alt="${escapeHtml(image.prompt || "Generated image")}">`
        : "<div class=\"empty-state image-detail-empty\">Preview unavailable</div>",
    "<div class=\"toolbar\">",
    image.downloadUrl
      ? `<a class="button-link" href="${escapeHtml(image.downloadUrl)}" target="_blank" rel="noreferrer">Download Image</a>`
      : "",
    `<form method="post" action="/admin/actions/image-favorite-toggle">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/images/detail/${encodeURIComponent(image.imageId)}`, theme }))}">`,
    `<input type="hidden" name="imageId" value="${escapeHtml(image.imageId)}">`,
    `<button type="submit" class="secondary">${escapeHtml(image.isFavorite ? "Unfavourite" : "Favourite")}</button>`,
    "</form>",
    `<form method="post" action="/admin/actions/image-delete"${renderConfirmOnSubmit("Delete this image from the gallery and bucket storage?\n\nThis removes the file itself, not just the record.")}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/images", theme }))}">`,
    `<input type="hidden" name="imageId" value="${escapeHtml(image.imageId)}">`,
    "<button type=\"submit\" class=\"secondary\">Delete Image</button>",
    "</form>",
    "</div>",
    "</article>",
    "<article class=\"card\">",
    "<h3>Details</h3>",
    `<p class="meta">Created ${escapeHtml(formatImageDate(image.createdAt))}</p>`,
    `<p><strong>Model:</strong> ${escapeHtml(image.model || "Unknown")}</p>`,
    `<p><strong>Format:</strong> ${escapeHtml(image.aspectRatio || "Unknown")}</p>`,
    `<p><strong>File size:</strong> ${escapeHtml(formatImageBytes(image.fileSizeBytes))}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(image.status || "unknown")}</p>`,
    image.errorMessage
      ? `<p class="image-error-copy"><strong>Error:</strong> ${escapeHtml(normalizeImageErrorMessage(image.errorMessage))}</p>`
      : "",
    "<div class=\"form-divider\"></div>",
    "<h3>Tags</h3>",
    renderTagPills(image.tags || [], helpers),
    "<div class=\"form-divider\"></div>",
    "<h3>Custom Tags</h3>",
    "<form method=\"post\" action=\"/admin/actions/image-tags-save\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/images/detail/${encodeURIComponent(image.imageId)}`, theme }))}">`,
    `<input type="hidden" name="imageId" value="${escapeHtml(image.imageId)}">`,
    `<input id="imageCustomTags" name="customTags" type="text" value="${escapeHtml((image.customTags || []).join(", "))}" placeholder="comma, separated, tags">`,
    "<div class=\"toolbar\"><button type=\"submit\">Save Tags</button></div>",
    "</form>",
    "</article>",
    "</div>",
    "<div class=\"form-divider\"></div>",
    "<article class=\"card\">",
    "<h3>Original Prompt</h3>",
    `<p class="meta">${escapeHtml(image.prompt || "")}</p>`,
    "<div class=\"form-divider\"></div>",
    "<h3>Composed Prompt</h3>",
    `<p class="meta">${escapeHtml(image.composedPrompt || "")}</p>`,
    "</article>",
    "</section>",
  ].join("");
}

module.exports = {
  renderImagesSettingsPage,
  renderImagesLayout,
  renderImagesGalleryPage,
  renderImageDetailPage,
};
