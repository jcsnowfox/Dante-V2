function renderGameAdminPage({ gameRegistry, gameSettings = {}, activeSessions = [], stats = {} }) {
  const allGames = gameRegistry ? gameRegistry.listGames() : [];
  const enabledIds = new Set(gameRegistry ? gameRegistry.listEnabledGames(gameSettings).map((g) => g.id) : []);

  const gameRows = allGames.map((game) => {
    const enabled = enabledIds.has(game.id);
    const tag = game.requiresAdultPartyGames ? " 🔞" : (game.isBeta ? " ⚠️ BETA" : "");
    return `
      <tr>
        <td><strong>${escHtml(game.displayName)}${tag}</strong><br><small>${escHtml(game.description)}</small></td>
        <td>${escHtml(game.category)}</td>
        <td>
          <label class="toggle">
            <input type="checkbox" name="game_${escHtml(game.id)}_enabled" value="1" ${enabled ? "checked" : ""}
              ${game.requiresAdultPartyGames && !gameSettings.adultPartyGamesEnabled ? "disabled title='Enable Adult Party Games first'" : ""}>
            <span class="toggle-label">${enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </td>
        <td><small>${escHtml(game.rulesText?.split("\n")[0] || "")}</small></td>
      </tr>`;
  }).join("");

  const sessionRows = activeSessions.map((s) => `
    <tr>
      <td><code>${escHtml(s.id)}</code></td>
      <td>${escHtml(s.gameType)}</td>
      <td>${escHtml(s.status)}</td>
      <td>${escHtml(s.channelId)}</td>
      <td><small>${new Date(s.updatedAt || s.startedAt).toLocaleString()}</small></td>
    </tr>`).join("");

  return `
    <div class="admin-section" id="games">
      <h2>🎮 Games</h2>
      <p>Interactive games the companion can play with users in Discord.</p>

      <form method="POST" action="/admin/games/settings">
        <fieldset>
          <legend>General Game Settings</legend>
          <div class="field-row">
            <label>
              <input type="checkbox" name="gamesEnabled" value="1" ${gameSettings.gamesEnabled !== false ? "checked" : ""}>
              Enable Games System
            </label>
          </div>
          <div class="field-row">
            <label>Max Active Sessions</label>
            <input type="number" name="maxActiveSessions" value="${escHtml(String(gameSettings.maxActiveSessions || ""))}""
              placeholder="Unlimited" min="1" max="100">
          </div>
          <div class="field-row">
            <label>Max Game Duration (minutes)</label>
            <input type="number" name="maxGameDurationMinutes" value="${escHtml(String(gameSettings.maxGameDurationMinutes || ""))}"
              placeholder="No limit" min="5" max="1440">
          </div>
          <div class="field-row">
            <label>
              <input type="checkbox" name="allowCompanionInvites" value="1" ${gameSettings.allowCompanionInvites ? "checked" : ""}>
              Allow companion to suggest games (autonomy)
            </label>
          </div>
          <div class="field-row">
            <label>Game Invite Cooldown (minutes)</label>
            <input type="number" name="gameInviteCooldownMinutes" value="${escHtml(String(gameSettings.gameInviteCooldownMinutes || 60))}" min="5" max="1440">
          </div>
          <div class="field-row">
            <label>Allowed Channels (comma-separated IDs, blank = all)</label>
            <input type="text" name="allowedGameChannels" value="${escHtml((gameSettings.allowedGameChannels || []).join(","))}" placeholder="All channels">
          </div>
          <div class="field-row">
            <label>Blocked Channels (comma-separated IDs)</label>
            <input type="text" name="blockedGameChannels" value="${escHtml((gameSettings.blockedGameChannels || []).join(","))}" placeholder="None">
          </div>
        </fieldset>

        <fieldset>
          <legend>🔞 Adult Party Games Pack</legend>
          <p class="warning"><strong>⚠️ Adult content is disabled by default.</strong> Only enable in appropriate private servers with proper age/consent setup.</p>
          <div class="field-row">
            <label>
              <input type="checkbox" name="adultPartyGamesEnabled" value="1" ${gameSettings.adultPartyGamesEnabled ? "checked" : ""}>
              Enable Adult Party Games
            </label>
          </div>
          <div class="field-row">
            <label>
              <input type="checkbox" name="requireAdultPrivateChannel" value="1" ${gameSettings.requireAdultPrivateChannel !== false ? "checked" : ""}>
              Require adult/private channel for adult games
            </label>
          </div>
          <div class="field-row">
            <label>
              <input type="checkbox" name="allowSuggestivePrompts" value="1" ${gameSettings.allowSuggestivePrompts !== false ? "checked" : ""}>
              Allow suggestive prompts (party-game level)
            </label>
          </div>
          <div class="field-row">
            <label>
              <input type="checkbox" name="allowExplicitPrompts" value="1" ${gameSettings.allowExplicitPrompts ? "checked" : ""}>
              Allow explicit prompts (requires adult private channel)
            </label>
          </div>
          <div class="field-row">
            <label>
              <input type="checkbox" name="allowCompanionAdultBanter" value="1" ${gameSettings.allowCompanionAdultBanter !== false ? "checked" : ""}>
              Allow companion adult banter during games
            </label>
          </div>
          <div class="field-row">
            <label>Adult Game Invite Cooldown (minutes)</label>
            <input type="number" name="adultGameInviteCooldownMinutes" value="${escHtml(String(gameSettings.adultGameInviteCooldownMinutes || 180))}" min="30" max="10080">
          </div>
          <div class="field-row">
            <label>Allowed Adult Game Channels (comma-separated IDs, blank = all adult-enabled channels)</label>
            <input type="text" name="allowedAdultGameChannels" value="${escHtml((gameSettings.allowedAdultGameChannels || []).join(","))}" placeholder="">
          </div>
          <div class="field-row">
            <label>Blocked Adult Game Channels (comma-separated IDs)</label>
            <input type="text" name="blockedAdultGameChannels" value="${escHtml((gameSettings.blockedAdultGameChannels || []).join(","))}" placeholder="None">
          </div>
        </fieldset>

        <fieldset>
          <legend>Individual Game Toggles</legend>
          <table class="data-table">
            <thead>
              <tr><th>Game</th><th>Category</th><th>Enabled</th><th>Description</th></tr>
            </thead>
            <tbody>
              ${gameRows || "<tr><td colspan='4'>No games registered.</td></tr>"}
            </tbody>
          </table>
        </fieldset>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save Game Settings</button>
        </div>
      </form>

      <section>
        <h3>Active Game Sessions (${activeSessions.length})</h3>
        ${activeSessions.length ? `
          <table class="data-table">
            <thead><tr><th>Session ID</th><th>Game</th><th>Status</th><th>Channel</th><th>Updated</th></tr></thead>
            <tbody>${sessionRows}</tbody>
          </table>
          <form method="POST" action="/admin/games/reset">
            <button type="submit" class="btn btn-danger" onclick="return confirm('Cancel all active game sessions?')">Reset All Active Games</button>
          </form>
        ` : "<p>No active game sessions.</p>"}
      </section>

      <section>
        <h3>Stats</h3>
        <p>Total completed sessions: <strong>${escHtml(String(stats.completedCount || 0))}</strong></p>
        <p>Total sessions ever: <strong>${escHtml(String(stats.totalCount || 0))}</strong></p>
      </section>
    </div>`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { renderGameAdminPage };
