"use strict";

async function handleInnerLifePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;
  const { renderInnerLifePage } = require("../renderAdminPages/innerLifePage");
  const engine = innerContext.innerLife || null;

  const tab = url.pathname.split("/")[3] || "overview";
  const entryTypeFilter = url.searchParams.get("type") || "";
  const statusFilter = url.searchParams.get("status") || "";

  let settings = null;
  let entries = [];
  let companionId = "";
  let storeAvailable = false;

  if (engine) {
    try { companionId = engine.resolveCompanionId(); } catch { companionId = ""; }
    settings = engine.config || null;
    try { storeAvailable = engine.store?.available === true; } catch { storeAvailable = false; }
    if (storeAvailable) {
      try {
        entries = await engine.storeWrapper.list({
          entryType: entryTypeFilter,
          status: statusFilter || "active",
          limit: 50,
        });
      } catch { entries = []; }
    }
  }

  const msg = getMessage(url);
  const err = getError(url);

  innerRes.end(
    renderAdminShell({
      title: "Inner Life",
      section: "innerLife",
      theme,
      themeLinks,
      msg,
      err,
      helpers,
      pageBody: renderInnerLifePage({
        tab,
        settings,
        entries,
        entryTypeFilter,
        statusFilter,
        storeAvailable,
        companionId,
        theme,
        helpers,
        msg,
        err,
      }),
    }),
  );
}

module.exports = { handleInnerLifePageRequest };
