function renderMemoriesPage({
  config,
  memories = [],
  activeFilter = "active",
  page = 1,
  pageSize = 10,
  totalMemories = 0,
  theme = "light",
  searchQuery = "",
  memoryTypeFilter = "",
  domainFilter = "",
  sortKey = "updatedAt",
  sortDirection = "desc",
  currentPath = "/admin/memory/library",
  helpers,
}) {
  const {
    canSyncMemories,
    escapeHtml,
    formatDateValue,
    renderOptions,
    buildMemoryCategoryOptions,
    buildAdminLocation,
    renderIconImage,
    renderConfirmOnSubmit,
    withThemeField,
    DURABLE_MEMORY_TYPES,
    MANUAL_MEMORY_TYPES,
    MEMORY_DELETE_CONFIRMATION_MESSAGE,
  } = helpers;
  const categoryOptions = buildMemoryCategoryOptions(domainFilter);

  function buildSortLink(nextSortKey) {
    const nextDirection = sortKey === nextSortKey && sortDirection === "asc" ? "desc" : "asc";

    return buildAdminLocation({
      path: currentPath,
      theme,
      extra: {
        active: activeFilter,
        q: searchQuery,
        memoryType: memoryTypeFilter,
        domain: domainFilter,
        page: 1,
        sort: nextSortKey,
        direction: nextDirection,
      },
    });
  }

  function renderSortableHeader(label, key) {
    const isActive = sortKey === key;
    const marker = isActive ? (sortDirection === "asc" ? " ↑" : " ↓") : "";

    return `<a class="sort-link" href="${escapeHtml(buildSortLink(key))}">${escapeHtml(label + marker)}</a>`;
  }

  function formatMemoryTypeLabel(value = "") {
    const memoryType = String(value || "").trim().toLowerCase();

    if (memoryType === "timeline_daily") return "Daily";
    if (memoryType === "timeline_weekly") return "Weekly";
    return memoryType || "memory";
  }

  const syncAvailable = canSyncMemories(config);
  const totalPages = Math.max(1, Math.ceil(totalMemories / pageSize));
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const memoryRows = memories.map((memory) => [
    "<tr>",
    "<td data-label=\"Title\">",
    `<p class="memory-title"><a class="memory-title-link" href="${escapeHtml(buildAdminLocation({
      path: "/admin/memory/library/edit",
      theme,
      extra: {
        active: activeFilter,
        q: searchQuery,
        memoryType: memoryTypeFilter,
        domain: domainFilter,
        page,
        edit: memory.memoryId,
        sort: sortKey,
        direction: sortDirection,
      },
    }))}">${escapeHtml(memory.title)}</a></p>`,
    "</td>",
    `<td data-label="Content"><div class="memory-content">${escapeHtml(memory.content)}</div></td>`,
    `<td data-label="Type"><div class="memory-chip-row"><span class="badge type">${escapeHtml(formatMemoryTypeLabel(memory.memoryType))}</span></div></td>`,
    `<td data-label="Category"><div class="memory-chip-row"><span class="badge domain">${escapeHtml(memory.domain)}</span></div></td>`,
    `<td data-label="Updated" class="updated-col">${escapeHtml(formatDateValue(memory.updatedAt))}</td>`,
    "<td data-label=\"Actions\" class=\"actions-col\">",
    "<div class=\"row-actions\">",
    `<a class="icon-button" href="${escapeHtml(buildAdminLocation({
      path: "/admin/memory/library/edit",
      theme,
      extra: {
        active: activeFilter,
        q: searchQuery,
        memoryType: memoryTypeFilter,
        domain: domainFilter,
        page,
        edit: memory.memoryId,
        sort: sortKey,
        direction: sortDirection,
      },
    }))}" aria-label="Edit memory" title="Edit memory">${renderIconImage("edit", theme, "Edit", "table-action-icon")}</a>`,
    "<form method=\"post\" action=\"/admin/actions/memory-archive\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    `<input type="hidden" name="active" value="${escapeHtml(activeFilter)}">`,
    `<input type="hidden" name="q" value="${escapeHtml(searchQuery)}">`,
    `<input type="hidden" name="memoryTypeFilter" value="${escapeHtml(memoryTypeFilter)}">`,
    `<input type="hidden" name="domainFilter" value="${escapeHtml(domainFilter)}">`,
    `<input type="hidden" name="page" value="${escapeHtml(String(page))}">`,
    `<input type="hidden" name="sort" value="${escapeHtml(sortKey)}">`,
    `<input type="hidden" name="direction" value="${escapeHtml(sortDirection)}">`,
    `<input type="hidden" name="memoryId" value="${escapeHtml(memory.memoryId)}">`,
    `<button type="submit" class="icon-button" aria-label="${escapeHtml(memory.active ? "Archive memory" : "Restore memory")}" title="${escapeHtml(memory.active ? "Archive memory" : "Restore memory")}">${renderIconImage(memory.active ? "archive" : "restore", theme, memory.active ? "Archive" : "Restore", "table-action-icon")}</button>`,
    "</form>",
    `<form method="post" action="/admin/actions/memory-delete"${renderConfirmOnSubmit(MEMORY_DELETE_CONFIRMATION_MESSAGE)}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    `<input type="hidden" name="active" value="${escapeHtml(activeFilter)}">`,
    `<input type="hidden" name="q" value="${escapeHtml(searchQuery)}">`,
    `<input type="hidden" name="memoryTypeFilter" value="${escapeHtml(memoryTypeFilter)}">`,
    `<input type="hidden" name="domainFilter" value="${escapeHtml(domainFilter)}">`,
    `<input type="hidden" name="page" value="${escapeHtml(String(page))}">`,
    `<input type="hidden" name="sort" value="${escapeHtml(sortKey)}">`,
    `<input type="hidden" name="direction" value="${escapeHtml(sortDirection)}">`,
    `<input type="hidden" name="memoryId" value="${escapeHtml(memory.memoryId)}">`,
    `<button type="submit" class="icon-button" aria-label="Delete memory" title="Delete memory">${renderIconImage("delete", theme, "Delete", "table-action-icon")}</button>`,
    "</form>",
    "</div>",
    "</td>",
    "</tr>",
  ].join("")).join("");

  return [
    "<section class=\"lite-toolbar stack memory-toolbar-shell\">",
    "<div class=\"toolbar-row primary\">",
    "<div class=\"toolbar-group memory-toolbar-group memory-toolbar-group-primary\">",
    `<a class="toolbar-button" href="${escapeHtml(buildAdminLocation({
      path: "/admin/memory/library/new",
      theme,
      extra: {
        active: activeFilter,
        q: searchQuery,
        memoryType: memoryTypeFilter,
        domain: domainFilter,
        page: 1,
        sort: sortKey,
        direction: sortDirection,
      },
    }))}">Add New Memory</a>`,
    syncAvailable
      ? [
        "<form method=\"post\" action=\"/admin/actions/memory-sync\" style=\"margin:0\">",
        withThemeField(theme),
        `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
        `<input type="hidden" name="active" value="${escapeHtml(activeFilter)}">`,
        `<input type="hidden" name="q" value="${escapeHtml(searchQuery)}">`,
        `<input type="hidden" name="memoryTypeFilter" value="${escapeHtml(memoryTypeFilter)}">`,
        `<input type="hidden" name="domainFilter" value="${escapeHtml(domainFilter)}">`,
        `<input type="hidden" name="page" value="${escapeHtml(String(page))}">`,
        `<input type="hidden" name="sort" value="${escapeHtml(sortKey)}">`,
        `<input type="hidden" name="direction" value="${escapeHtml(sortDirection)}">`,
        "<button type=\"submit\" class=\"toolbar-button secondary\">Resync Memories</button>",
        "</form>",
      ].join("")
      : "",
    "</div>",
    "</div>",
    "<div class=\"form-spacer compact\"></div>",
    "<div class=\"toolbar-row filters\">",
    `<form method="get" action="${escapeHtml(currentPath)}" class="toolbar-group memory-toolbar-group memory-toolbar-group-filters">`,
    `<input type="hidden" name="theme" value="${escapeHtml(theme)}">`,
    `<input type="hidden" name="sort" value="${escapeHtml(sortKey)}">`,
    `<input type="hidden" name="direction" value="${escapeHtml(sortDirection)}">`,
    `<div class="toolbar-field search"><input id="memorySearch" name="q" type="search" value="${escapeHtml(searchQuery)}" placeholder="Search memories..."></div>`,
    `<div class="toolbar-field select"><select id="memoryTypeFilter" name="memoryType"><option value="">All Types</option>${renderOptions(MANUAL_MEMORY_TYPES, memoryTypeFilter)}</select></div>`,
    `<div class="toolbar-field select"><select id="domainFilter" name="domain"><option value="">All Categories</option>${renderOptions(categoryOptions, domainFilter)}</select></div>`,
    `<div class="memory-archive-toggle"><label for="archivedToggle">Archived</label><div class="switch-field"><label class="switch-control"><input id="archivedToggle" type="checkbox" name="active" value="archived"${activeFilter === "archived" ? " checked" : ""}><span></span></label></div></div>`,
    "<input type=\"hidden\" name=\"page\" value=\"1\">",
    "<button type=\"submit\" class=\"toolbar-button secondary\">Filter</button>",
    "</form>",
    "</div>",
    "<div class=\"form-spacer compact\"></div>",
    "</section>",
    "<section class=\"lite-panel flush\">",
    "<div class=\"memory-table-wrap\">",
    "<table class=\"memory-table memory-library-table\">",
    `<thead><tr><th>${renderSortableHeader("Title", "title")}</th><th>Content</th><th>${renderSortableHeader("Type", "memoryType")}</th><th>${renderSortableHeader("Category", "domain")}</th><th class="updated-col">${renderSortableHeader("Updated", "updatedAt")}</th><th class="actions-col">Actions</th></tr></thead>`,
    `<tbody>${memoryRows || "<tr><td colspan=\"6\" class=\"empty-state\">No durable memories found yet.</td></tr>"}</tbody>`,
    "</table>",
    "</div>",
    "</section>",
    "<section class=\"lite-toolbar\" style=\"border-bottom:none\">",
    "<div class=\"toolbar-row pagination\">",
    "<div class=\"toolbar-group\">",
    previousPage
      ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({
        path: currentPath,
        theme,
        extra: {
          active: activeFilter,
          q: searchQuery,
          memoryType: memoryTypeFilter,
          domain: domainFilter,
          page: previousPage,
          sort: sortKey,
          direction: sortDirection,
        },
      }))}">Previous</a>`
      : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Previous</span>",
    `<span class="meta">Page ${escapeHtml(String(page))} of ${escapeHtml(String(totalPages))}</span>`,
    nextPage
      ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({
        path: currentPath,
        theme,
        extra: {
          active: activeFilter,
          q: searchQuery,
          memoryType: memoryTypeFilter,
          domain: domainFilter,
          page: nextPage,
          sort: sortKey,
          direction: sortDirection,
        },
      }))}">Next</a>`
      : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Next</span>",
    "</div>",
    "</section>",
  ].join("");
}

function renderMemoryEditorPage({
  config,
  editingMemory = null,
  activeFilter = "active",
  page = 1,
  theme = "light",
  searchQuery = "",
  memoryTypeFilter = "",
  domainFilter = "",
  sortKey = "updatedAt",
  sortDirection = "desc",
  currentPath = "/admin/memory/library",
  helpers,
}) {
  const {
    escapeHtml,
    renderOptions,
    buildMemoryCategoryOptions,
    buildAdminLocation,
    withThemeField,
    MANUAL_MEMORY_TYPES,
    SUPPORTED_SENSITIVITY_LEVELS,
  } = helpers;
  const aiName = String(config?.chat?.promptBlocks?.personaName || "").trim() || "your AI";
  const isArchivedMemory = Boolean(editingMemory && editingMemory.active === false);
  const categoryOptions = buildMemoryCategoryOptions(editingMemory?.domain || "");
  const backLocation = buildAdminLocation({
    path: currentPath,
    theme,
    extra: {
      active: activeFilter,
      q: searchQuery,
      memoryType: memoryTypeFilter,
      domain: domainFilter,
      page,
      sort: sortKey,
      direction: sortDirection,
    },
  });

  return [
    "<section class=\"memory-section settings-form\">",
    `<div class="panel-header"><div><h2>${editingMemory ? "Edit Memory" : "Add a New Memory"}</h2><p>${editingMemory ? `Update a saved memory that ${escapeHtml(aiName)} can carry forward across conversations.` : `Create a saved memory that ${escapeHtml(aiName)} can carry forward across conversations.`}</p></div></div>`,
    "<form method=\"post\" action=\"/admin/actions/memory-save\" class=\"card\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    `<input type="hidden" name="page" value="${escapeHtml(String(page))}">`,
    `<input type="hidden" name="active" value="${escapeHtml(activeFilter)}">`,
    `<input type="hidden" name="q" value="${escapeHtml(searchQuery)}">`,
    `<input type="hidden" name="memoryTypeFilter" value="${escapeHtml(memoryTypeFilter)}">`,
    `<input type="hidden" name="domainFilter" value="${escapeHtml(domainFilter)}">`,
    `<input type="hidden" name="sort" value="${escapeHtml(sortKey)}">`,
    `<input type="hidden" name="direction" value="${escapeHtml(sortDirection)}">`,
    `<input type="hidden" name="restoreOnSave" value="${isArchivedMemory ? "1" : ""}">`,
    editingMemory ? `<input type="hidden" name="memoryId" value="${escapeHtml(editingMemory.memoryId)}">` : "",
    "<label for=\"memoryTitle\">Title</label>",
    `<input id="memoryTitle" name="title" type="text" required value="${escapeHtml(editingMemory?.title || "")}" placeholder="A short summary for this memory">`,
    "<label for=\"memoryContent\">Content</label>",
    `<textarea id="memoryContent" name="content" required placeholder="What should ${escapeHtml(aiName)} remember?">${escapeHtml(editingMemory?.content || "")}</textarea>`,
    "<div class=\"grid\">",
    `<div><label for="memoryType" title="Anchors = stable truths about your AI, Canon = current knowledge about you, Resolved = past context which still holds true, Roleplay = fictional places and scene continuity, Daily/Weekly = long-term memory.">Memory Type</label><select id="memoryType" name="memoryType">${renderOptions(MANUAL_MEMORY_TYPES, editingMemory?.memoryType || "canon")}</select></div>`,
    `<div><label for="memoryDomain">Category</label><select id="memoryDomain" name="domain">${renderOptions(categoryOptions, editingMemory?.domain || "general")}</select></div>`,
    `<div><label for="memorySensitivity">Sensitivity</label><select id="memorySensitivity" name="sensitivity">${renderOptions(SUPPORTED_SENSITIVITY_LEVELS, editingMemory?.sensitivity || "low")}</select></div>`,
    "</div>",
    "<p class=\"meta\" style=\"margin:.75rem 0 0\">Anchors: Stable truths about your AI. Canon: Current knowledge about you. Resolved: Past context which still holds true. Roleplay: Fictional places and scene continuity. Daily/Weekly: Long term memory.</p>",
    "<div class=\"toolbar\" style=\"margin-top:1rem\">",
    `<button type="submit">${isArchivedMemory ? "Restore Memory" : "Save Memory"}</button>`,
    `<a class="icon-button icon-button-wide" href="${escapeHtml(backLocation)}">Cancel</a>`,
    "</div>",
    "</form>",
    "</section>",
  ].join("");
}

module.exports = {
  renderMemoriesPage,
  renderMemoryEditorPage,
};
