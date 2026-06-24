"use strict";

async function handleContinuityPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;
  const { renderContinuityPage } = require("../renderAdminPages/continuityPage");
  const engine = innerContext.continuity || null;

  const tab = url.pathname.split("/")[3] || "overview";
  const typeFilter = url.searchParams.get("type") || "";
  const statusFilter = url.searchParams.get("status") || "";

  let settings = null;
  let items = [];
  let storeAvailable = false;
  let emotionalBeats = [];

  if (engine) {
    settings = engine.config || null;
    try { storeAvailable = engine.store?.available === true; } catch { storeAvailable = false; }
    if (storeAvailable) {
      try {
        items = await engine.storeWrapper.list({
          type: typeFilter,
          status: statusFilter || (tab === "overview" ? "" : "open"),
          limit: 100,
        });
      } catch { items = []; }
    }
  }

  if (innerContext.emotionalBeatStore?.listBeats) {
    try {
      emotionalBeats = await innerContext.emotionalBeatStore.listBeats({
        user_scope: innerContext.config?.memory?.userScope || "user",
        companion_id: innerContext.config?.memory?.companionId || "Dante",
        limit: 100,
      });
    } catch { emotionalBeats = []; }
  }

  const msg = getMessage(url);
  const err = getError(url);

  innerRes.end(
    renderAdminShell({
      title: "Continuity",
      section: "continuity",
      theme,
      themeLinks,
      msg,
      err,
      helpers,
      pageBody: renderContinuityPage({
        tab,
        items,
        emotionalBeats,
        settings,
        typeFilter,
        statusFilter,
        storeAvailable,
        theme,
        helpers,
        msg,
        err,
      }),
    }),
  );
}

module.exports = { handleContinuityPageRequest };
