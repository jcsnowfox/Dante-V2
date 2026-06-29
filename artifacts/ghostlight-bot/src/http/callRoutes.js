function readCallsEnabled(config = {}) {
  if (typeof config.calls?.enabled === "boolean") {
    return config.calls.enabled;
  }

  const raw = process.env.CALLS_ENABLED;
  if (raw === undefined) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function normalizeCompanionId(value) {
  return decodeURIComponent(String(value || ""))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCallPageModel({ companionId, companionName = "Dante", enabled }) {
  const safeCompanionId = escapeHtml(companionId);
  const safeCompanionName = escapeHtml(companionName);
  const title = enabled ? `Call ${safeCompanionName}` : "Calls disabled";
  const status = enabled
    ? "Voice calling is enabled for this companion."
    : "Voice calling is currently disabled. Set CALLS_ENABLED=true in Railway and redeploy to enable this page.";
  const action = enabled
    ? `<button type="button" class="primary" disabled>Call UI loading</button>`
    : `<a class="secondary" href="/admin">Back to dashboard</a>`;

  return { safeCompanionId, title, status, action, enabled };
}

function renderCallPanel({ companionId, companionName = "Dante", enabled, dashboard = false }) {
  const model = buildCallPageModel({ companionId, companionName, enabled });
  const dashboardAction = dashboard ? `<a class="secondary" href="/call/${model.safeCompanionId}">Open full-screen call route</a>` : "";

  return `<main class="call-dante-panel" data-call-page="${model.enabled ? "enabled" : "disabled"}" data-companion-id="${model.safeCompanionId}">
    <p class="eyebrow">Dante voice gateway</p>
    <h1>${model.title}</h1>
    <p>${model.status}</p>
    <p>Route diagnostic: <code>/call/${model.safeCompanionId}</code> is mounted and returning HTML.</p>
    <div class="actions">${model.action}${dashboardAction}<a class="secondary" href="/admin">Dashboard</a></div>
  </main>`;
}

function renderCallPage({ companionId, companionName = "Dante", enabled }) {
  const model = buildCallPageModel({ companionId, companionName, enabled });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${model.title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, system-ui, sans-serif; background: radial-gradient(circle at top, #27324f, #070912 70%); color: #f7f1e8; }
    main { width: min(92vw, 680px); padding: 2rem; border: 1px solid rgba(255,255,255,.18); border-radius: 24px; background: rgba(10,14,26,.82); box-shadow: 0 24px 80px rgba(0,0,0,.42); }
    .eyebrow { color: #c7a96b; text-transform: uppercase; letter-spacing: .16em; font-size: .8rem; }
    h1 { font-size: clamp(2.2rem, 8vw, 4.5rem); margin: .2rem 0 1rem; }
    p { line-height: 1.7; color: #ddd7ce; }
    .actions { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1.5rem; }
    a, button { border: 0; border-radius: 999px; padding: .85rem 1.2rem; font: inherit; text-decoration: none; }
    .primary { background: #c7a96b; color: #10131d; }
    .secondary { background: rgba(255,255,255,.12); color: #f7f1e8; }
    code { color: #f2cf83; }
  </style>
</head>
<body>
  ${renderCallPanel({ companionId, companionName, enabled })}
</body>
</html>`;
}

async function handleCallRoute({ req, res, url, context }) {
  if (req.method !== "GET") {
    return false;
  }

  const match = url.pathname.match(/^\/call\/([^/]+)\/?$/);
  if (!match) {
    return false;
  }

  const companionId = normalizeCompanionId(match[1]);
  if (!companionId) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(renderCallPage({ companionId: "unknown", enabled: false }));
    return true;
  }

  const configuredName = context?.config?.chat?.promptBlocks?.personaName || context?.config?.chat?.personaName || "Dante";
  const enabled = readCallsEnabled(context?.config);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(renderCallPage({ companionId, companionName: configuredName, enabled }));
  return true;
}

module.exports = {
  handleCallRoute,
  readCallsEnabled,
  renderCallPage,
  renderCallPanel,
};
