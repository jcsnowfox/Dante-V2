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
    ? `<button id="start" type="button" class="primary">Start call</button>`
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
  const callsEnabledJson = JSON.stringify(model.enabled);
  const companionIdJson = JSON.stringify(model.safeCompanionId);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${model.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; background: #0d1018; color: #f7efe5; }
    .wrap { max-width: 760px; margin: auto; padding: 18px; }
    .card, .call-dante-panel { background: #171b28; border: 1px solid #30364a; border-radius: 22px; padding: 18px; margin: 14px 0; }
    .row, .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    button, a, textarea { font: inherit; border-radius: 14px; padding: 12px; }
    button, .primary { background: #d7a86e; border: 0; color: #1a1208; font-weight: 800; text-decoration: none; }
    .secondary { background: #2b3144; color: #fff; text-decoration: none; }
    .danger { background: #8d2f35; color: #fff; }
    .status { font-size: 1.1rem; font-weight: 800; }
    .transcript { min-height: 180px; white-space: pre-wrap; }
    .ptt { width: 100%; font-size: 1.2rem; padding: 18px; }
    @media (max-width: 640px) { .wrap { padding: 12px; } .row button { flex: 1 1 44%; } }
  </style>
</head>
<body><main class="wrap">
${renderCallPanel({ companionId: model.safeCompanionId, companionName, enabled: model.enabled })}
<div class="card"><div>Status: <span id="status" class="status">idle</span></div><div id="error"></div><div id="diag"></div></div>
<div class="card row"><button id="end" class="danger">End call</button><button id="mute" class="secondary">Mute mic</button><button id="pause" class="secondary">Pause listening</button></div>
<div class="card"><div class="row"><button id="hands" class="secondary">Hands-free mode</button><button id="pttMode" class="secondary">Push-to-talk mode</button></div><button id="ptt" class="ptt">Hold / tap push-to-talk</button><textarea id="typed" rows="3" style="width:100%;box-sizing:border-box;margin-top:10px" placeholder="Typed fallback when speech recognition is unavailable"></textarea><button id="sendTyped">Send typed utterance</button></div>
<div class="card"><h2>Transcript</h2><div id="transcript" class="transcript"></div><button id="replay" class="secondary">Replay last Dante response</button></div>
<script>
const companionId=${companionIdJson}, callsEnabled=${callsEnabledJson};
let sessionId='', mode='push_to_talk', recog=null, paused=false, muted=false, lastAudio='', lastText='', silenceTimer=null;
const SR=window.SpeechRecognition||window.webkitSpeechRecognition, st=n=>document.getElementById('status').textContent=n, err=m=>document.getElementById('error').textContent=m||'', tr=s=>document.getElementById('transcript').textContent+=s+'\\n';
document.getElementById('diag').textContent='calls enabled='+callsEnabled+' | STT provider=browser | browser STT available='+Boolean(SR)+' | TTS provider=kokoro_web';
if(!callsEnabled) err('Calls are disabled on the server. Set CALLS_ENABLED=true to connect the dashboard call controls.');
else if(!SR) err('Hands-free speech recognition is not available in this browser. Use push-to-talk typed mode or configure Whisper.');
async function api(path, body){ const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}); return r.json(); }
function setupRecog(){ if(!SR) return null; const r=new SR(); r.lang='en-US'; r.continuous=true; r.interimResults=true; let final=''; r.onstart=()=>st(mode==='hands_free'?'listening':'recording'); r.onerror=e=>{err('Speech recognition error: '+e.error); st('error')}; r.onresult=e=>{ st('transcribing'); for(let i=e.resultIndex;i<e.results.length;i++){ const t=e.results[i][0].transcript; if(e.results[i].isFinal) final+=t+' '; } if(mode==='hands_free'){ clearTimeout(silenceTimer); silenceTimer=setTimeout(()=>{ const out=final.trim(); final=''; if(out) sendUtterance(out); }, 1200); }}; r.onend=()=>{ if(mode==='hands_free'&&!paused&&!muted) setTimeout(()=>r.start(),300); }; r.takeFinal=()=>{ const out=final.trim(); final=''; return out; }; return r; }
async function ensureSession(){ if(sessionId) return; const s=await api('/api/call/'+encodeURIComponent(companionId)+'/start',{}); sessionId=s.sessionId; }
async function sendUtterance(text){ if(!callsEnabled||!text) return; await ensureSession(); st('thinking'); tr('You: '+text); const out=await api('/api/call/'+encodeURIComponent(companionId)+'/message',{sessionId,text}); lastText=out.replyText||''; tr('Dante: '+lastText); if(out.audio?.ok){ lastAudio='data:'+out.audio.contentType+';base64,'+out.audio.audioBase64; const a=new Audio(lastAudio); st('speaking'); a.onended=()=>st(paused?'paused':'listening'); a.play(); } else { const u=new SpeechSynthesisUtterance(lastText); u.onend=()=>st(paused?'paused':'listening'); speechSynthesis.speak(u); } }
document.getElementById('start')?.addEventListener('click', async()=>{ await ensureSession(); st('idle'); });
document.getElementById('end').onclick=async()=>{ if(sessionId) await api('/api/call/'+encodeURIComponent(companionId)+'/end',{sessionId}); sessionId=''; st('idle'); if(recog)recog.stop(); };
document.getElementById('hands').onclick=()=>{ mode='hands_free'; if(!SR) return err('Hands-free speech recognition is not available in this browser. Use push-to-talk typed mode or configure Whisper.'); recog=setupRecog(); paused=false; recog.start(); };
document.getElementById('pttMode').onclick=()=>{ mode='push_to_talk'; if(recog)recog.stop(); st('idle'); };
document.getElementById('ptt').onclick=()=>{ if(SR){ recog=setupRecog(); recog.start(); setTimeout(()=>{try{recog.stop()}catch{}; sendUtterance(recog.takeFinal())}, 30000); } else document.getElementById('typed').focus(); };
document.getElementById('sendTyped').onclick=()=>sendUtterance(document.getElementById('typed').value.trim());
document.getElementById('pause').onclick=()=>{ paused=!paused; if(paused&&recog)recog.stop(); st(paused?'paused':'listening'); };
document.getElementById('mute').onclick=()=>{ muted=!muted; if(muted&&recog)recog.stop(); };
document.getElementById('replay').onclick=()=>{ if(lastAudio)new Audio(lastAudio).play(); else if(lastText)speechSynthesis.speak(new SpeechSynthesisUtterance(lastText)); };
</script></main></body></html>`;
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

  return withAdmin(async (_req, innerRes, innerContext) => {
    const companionId = normalizeCompanionId(api[1]);
    const action = api[2];
    const callsEnabled = readCallsEnabled(innerContext.config);

    if (action === "diagnostics") {
      return json(innerRes, 200, {
        callsEnabled,
        sttProvider: process.env.STT_PROVIDER || "browser",
        ttsProvider: process.env.TTS_PROVIDER || "kokoro_web",
        kokoroApiReachable: Boolean(process.env.KOKORO_API_URL),
        kokoroVoice: process.env.KOKORO_VOICE || "",
        lastTtsError: null,
        lastSttError: null,
      });
    }

    if (!callsEnabled) {
      return json(innerRes, 503, { error: "Calls are disabled. Set CALLS_ENABLED=true and redeploy." });
    }

    const body = await readJson(_req);
    if (action === "start") {
      const sessionId = randomUUID();
      sessions.set(sessionId, { companionId, turns: [], startedAt: new Date().toISOString() });
      return json(innerRes, 200, { sessionId });
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
      return json(innerRes, 200, { replyText, audio });
    }

    if (action === "end") {
      session.endedAt = new Date().toISOString();
      session.summary = session.turns.map((turn) => `User: ${turn.userTranscript} / Dante: ${turn.danteTextReply}`).join("\n").slice(0, 4000);
      sessions.set(body.sessionId, session);
      return json(innerRes, 200, { ok: true, summary: session.summary });
    }

    return json(innerRes, 404, { error: "Unknown call action." });
  })(req, res, context);
}

module.exports = {
  handleCallRoutes,
  readCallsEnabled,
  renderCallPage,
  renderCallPanel,
  sessions,
};
