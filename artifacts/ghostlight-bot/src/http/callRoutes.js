const { randomUUID } = require("node:crypto");
const { generateVoiceAudio } = require("../audio/voiceAudio");

const sessions = new Map();

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

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function buildCallPageModel({ companionId, companionName = "Dante", enabled }) {
  const safeCompanionId = escapeHtml(normalizeCompanionId(companionId) || companionId || "dante");
  const safeCompanionName = escapeHtml(companionName);
  const callsEnabled = Boolean(enabled);
  const title = callsEnabled ? `Call ${safeCompanionName}` : "Calls disabled";
  const status = callsEnabled
    ? "Voice calling is enabled for this companion."
    : "Voice calling is currently disabled. Set CALLS_ENABLED=true in Railway and redeploy to enable this page.";
  const action = callsEnabled
    ? `<button id="call-start" type="button" class="primary">Start call</button>`
    : `<a class="secondary" href="/admin">Back to dashboard</a>`;

  return { safeCompanionId, safeCompanionName, title, status, action, enabled: callsEnabled };
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

function renderCallPage({ companionId, companionName = "Dante", enabled = readCallsEnabled() }) {
  const model = buildCallPageModel({ companionId, companionName, enabled });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${model.title}</title>
  <style>
    :root { color-scheme: dark; --gold:#d6b56d; --cyan:#39d7f0; --ink:#030712; --panel:#08111f; --line:rgba(214,181,109,.28); --muted:#b9c7d6; }
    body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; margin: 0; min-height: 100vh; background: radial-gradient(circle at 18% 10%, rgba(57,215,240,.16), transparent 28%), linear-gradient(145deg, #03040a, #0b0714 70%); color: #f7efe5; }
    .wrap { width: min(980px, calc(100vw - 28px)); margin: auto; padding: 22px 0 36px; }
    .card, .call-dante-panel { background: linear-gradient(145deg, rgba(3,7,18,.92), rgba(8,17,31,.78)); border: 1px solid var(--line); border-radius: 24px; padding: 18px; margin: 14px 0; box-shadow: 0 24px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08); }
    .eyebrow { margin: 0 0 6px; color: var(--gold); text-transform: uppercase; letter-spacing: .12em; font-size: .75rem; font-weight: 900; }
    h1 { font-family: Georgia, serif; font-size: clamp(2.4rem, 7vw, 5rem); line-height: .9; margin: 0 0 12px; }
    .row, .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    button, a, textarea { font: inherit; border-radius: 14px; padding: 12px 14px; }
    button, .primary { background: linear-gradient(135deg, var(--gold), #f6d99a); border: 0; color: #1a1208; font-weight: 900; text-decoration: none; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    .secondary { background: rgba(216,231,239,.08); border: 1px solid rgba(57,215,240,.28); color: #fff; text-decoration: none; }
    .secondary.is-active { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(214,181,109,.14) inset; }
    .danger { background: #8d2f35; color: #fff; }
    .status { color: var(--cyan); font-size: 1.1rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .call-error { margin-top: 10px; padding: 12px; border: 1px solid rgba(239,68,68,.45); border-radius: 14px; background: rgba(127,29,29,.25); color: #fecaca; }
    .call-diag { color: var(--muted); margin-top: 10px; font-size: .9rem; }
    .transcript { min-height: 220px; max-height: 420px; overflow:auto; white-space: pre-wrap; border: 1px solid rgba(214,181,109,.16); border-radius: 18px; padding: 10px; background: rgba(0,0,0,.18); }
    .call-turn { margin: 0 0 10px; padding: 10px 12px; border-radius: 14px; background: rgba(216,231,239,.07); }
    .call-turn--dante { border-left: 3px solid var(--gold); }
    .ptt { width: 100%; font-size: 1.15rem; padding: 18px; touch-action: manipulation; }
    textarea { width:100%; box-sizing:border-box; margin-top:10px; background:#050916; color:#fff; border:1px solid rgba(214,181,109,.28); }
    .spinner { display:inline-block; margin-left:8px; }
    @media (max-width: 640px) { .wrap { width: min(100% - 18px, 980px); } .row button { flex: 1 1 44%; } }
  </style>
</head>
<body><main class="wrap" data-call-client data-companion-id="${model.safeCompanionId}" data-calls-enabled="${model.enabled ? "true" : "false"}">
${renderCallPanel({ companionId: model.safeCompanionId, companionName, enabled: model.enabled })}
<div class="card"><div>Status: <span id="call-status" class="status">idle</span><span id="call-spinner" class="spinner" hidden>⏳</span></div><div id="call-error" class="call-error" hidden></div><div id="call-diagnostics" class="call-diag"></div></div>
<div class="card row"><button id="call-end" class="danger" type="button">End call</button><button id="call-mute" class="secondary" type="button">Mute mic</button><button id="call-pause" class="secondary" type="button">Pause listening</button></div>
<div class="card"><div class="row"><button id="call-hands-free" class="secondary" type="button">Hands-free mode</button><button id="call-ptt-mode" class="secondary" type="button">Push-to-talk mode</button></div><button id="call-ptt" class="ptt" type="button">Hold / tap push-to-talk</button><textarea id="call-typed" rows="3" placeholder="Typed fallback when speech recognition is unavailable"></textarea><button id="call-send-typed" type="button">Send typed utterance</button></div>
<div class="card"><h2>Transcript</h2><div id="call-transcript" class="transcript" aria-live="polite"></div><button id="call-replay" class="secondary" type="button" disabled>Replay last Dante response</button></div>
<script src="/assets/call-dante.js" defer></script></main></body></html>`;
}

async function handleCallRoutes({ req, res, url, context, withAdmin }) {
  const page = url.pathname.match(/^\/call\/([^/]+)\/?$/);
  if (req.method === "GET" && page) {
    const companionId = normalizeCompanionId(page[1]);
    const companionName = context?.config?.chat?.promptBlocks?.personaName || context?.config?.chat?.personaName || "Dante";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(renderCallPage({ companionId, companionName, enabled: readCallsEnabled(context?.config) }));
    return true;
  }

  const api = url.pathname.match(/^\/api\/call\/([^/]+)\/(start|message|end|diagnostics)$/);
  if (!api) {
    return false;
  }

  const innerRes = res;
  const innerContext = context || {};
  const _req = req;
  {
    const companionId = normalizeCompanionId(api[1]);
    const action = api[2];
    const callsEnabled = readCallsEnabled(innerContext.config || {});

    if (action === "diagnostics") {
      return json(innerRes, 200, {
        callsEnabled,
        sttProvider: process.env.STT_PROVIDER || "browser",
        ttsProvider: process.env.TTS_PROVIDER || "kokoro_web",
        ok: true,
        kokoroConfigured: Boolean(process.env.KOKORO_API_URL),
        browserSttExpected: true,
        kokoroApiReachable: Boolean(process.env.KOKORO_API_URL),
        kokoroVoice: process.env.KOKORO_VOICE || "",
        lastTtsError: null,
        lastSttError: null,
      });
    }

    if (!callsEnabled) {
      return json(innerRes, 503, { ok: false, error: "Calls are disabled. Set CALLS_ENABLED=true and redeploy." });
    }

    const body = await readJson(_req);
    if (action === "start") {
      const sessionId = randomUUID();
      sessions.set(sessionId, { companionId, turns: [], startedAt: new Date().toISOString() });
      return json(innerRes, 200, { ok: true, sessionId, status: "idle" });
    }

    const session = sessions.get(body.sessionId) || { companionId, turns: [] };
    if (action === "message") {
      const text = String(body.text || "");
      let replyText = "Call pipeline is not available yet.";

      if (innerContext.companion?.processCompanionEvent) {
        const result = await innerContext.companion.processCompanionEvent({
          companionId,
          channelType: "dashboard_call",
          eventType: "message",
          text,
          userId: "dashboard_call_user",
          channelId: "dashboard_call",
          metadata: { call: { mode: process.env.CALL_CONTEXT_MODE || "light" } },
        });
        replyText = result.outbound?.responseText || result.reply?.content || replyText;
      }

      const audio = await generateVoiceAudio({
        text: replyText,
        companionId,
        config: {
          ttsProvider: process.env.TTS_PROVIDER,
          kokoroApiUrl: process.env.KOKORO_API_URL,
          kokoroVoice: process.env.KOKORO_VOICE,
          kokoroFormat: process.env.KOKORO_FORMAT,
        },
        logger: innerContext.logger,
      });
      session.turns.push({ userTranscript: text, danteTextReply: replyText, audioStatus: audio.ok ? "ok" : "fallback", timestamp: new Date().toISOString() });
      sessions.set(body.sessionId, session);
      return json(innerRes, 200, { ok: true, userText: text, replyText, audio, audioMimeType: audio.contentType || audio.mimeType || null, usedTtsProvider: process.env.TTS_PROVIDER || "kokoro_web", fallbackUsed: !audio.ok });
    }

    if (action === "end") {
      session.endedAt = new Date().toISOString();
      session.summary = session.turns.map((turn) => `User: ${turn.userTranscript} / Dante: ${turn.danteTextReply}`).join("\n").slice(0, 4000);
      sessions.set(body.sessionId, session);
      return json(innerRes, 200, { ok: true, summary: session.summary });
    }

    return json(innerRes, 404, { error: "Unknown call action." });
  }
  return true;
}

module.exports = {
  handleCallRoutes,
  readCallsEnabled,
  renderCallPage,
  renderCallPanel,
  sessions,
};
