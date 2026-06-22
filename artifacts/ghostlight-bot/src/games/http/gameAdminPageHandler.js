const { renderGameAdminPage } = require("./renderGameAdminPage");

function parseChannelList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function handleGameAdminPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { gameSessionStore, gameRegistry, config } = innerContext;
  const gameSettings = innerContext.gameSettings || {};

  let activeSessions = [];
  let stats = {};

  if (gameSessionStore) {
    try {
      activeSessions = await gameSessionStore.listSessions({
        guildId: config?.discord?.guildId || "",
        status: "active",
        limit: 50,
      });

      const all = await gameSessionStore.listSessions({ guildId: config?.discord?.guildId || "", limit: 200 });
      stats = {
        totalCount: all.length,
        completedCount: all.filter((s) => s.status === "completed").length,
      };
    } catch {}
  }

  if (!gameRegistry) {
    innerRes.end("<p>Game registry not initialized.</p>");
    return;
  }

  const pageBody = renderGameAdminPage({ gameRegistry, gameSettings, activeSessions, stats });

  if (helpers?.renderAdminShell) {
    innerRes.end(helpers.renderAdminShell({
      currentSection: "games",
      theme,
      themeLinks,
      message: helpers.getMessage?.(url),
      error: helpers.getError?.(url),
      pageBody,
    }));
  } else {
    innerRes.end(pageBody);
  }
}

async function handleGameAdminActions({ req, body, innerContext, redirect, logger }) {
  const { gameSessionStore, settingsStore } = innerContext;

  if (req.url?.includes("/admin/games/settings")) {
    const newSettings = {
      gamesEnabled: body.gamesEnabled === "1",
      maxActiveSessions: body.maxActiveSessions ? Number(body.maxActiveSessions) : null,
      maxGameDurationMinutes: body.maxGameDurationMinutes ? Number(body.maxGameDurationMinutes) : null,
      allowCompanionInvites: body.allowCompanionInvites === "1",
      gameInviteCooldownMinutes: Number(body.gameInviteCooldownMinutes) || 60,
      allowedGameChannels: parseChannelList(body.allowedGameChannels),
      blockedGameChannels: parseChannelList(body.blockedGameChannels),
      adultPartyGamesEnabled: body.adultPartyGamesEnabled === "1",
      requireAdultPrivateChannel: body.requireAdultPrivateChannel === "1",
      allowSuggestivePrompts: body.allowSuggestivePrompts === "1",
      allowExplicitPrompts: body.allowExplicitPrompts === "1",
      allowCompanionAdultBanter: body.allowCompanionAdultBanter === "1",
      adultGameInviteCooldownMinutes: Number(body.adultGameInviteCooldownMinutes) || 180,
      allowedAdultGameChannels: parseChannelList(body.allowedAdultGameChannels),
      blockedAdultGameChannels: parseChannelList(body.blockedAdultGameChannels),
    };

    for (const key of Object.keys(body)) {
      if (key.startsWith("game_") && key.endsWith("_enabled")) {
        newSettings[key] = body[key] === "1";
      }
    }

    if (settingsStore) {
      await settingsStore.upsertSettings({ gameSettings: newSettings });
      innerContext.gameSettings = newSettings;
      if (innerContext.client?.appContext) {
        innerContext.client.appContext.gameSettings = newSettings;
      }
    }

    redirect("/admin/games?message=Game+settings+saved.");
    return;
  }

  if (req.url?.includes("/admin/games/reset")) {
    if (gameSessionStore) {
      const active = await gameSessionStore.listSessions({
        guildId: innerContext.config?.discord?.guildId || "",
        status: "active",
        limit: 100,
      });
      for (const session of active) {
        await gameSessionStore.cancelSession(session.id);
      }
    }
    redirect("/admin/games?message=All+active+sessions+cancelled.");
    return;
  }
}

module.exports = {
  handleGameAdminPageRequest,
  handleGameAdminActions,
};
