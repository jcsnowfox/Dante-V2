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

function renderCallPage({ companionId, companionName = "Dante", enabled }) {
  const safeCompanionId = escapeHtml(companionId);
  const safeCompanionName = escapeHtml(companionName);
  const title = enabled ? `Call ${safeCompanionName}` : "Calls disabled";
  const status = enabled
    ? "Voice calling is enabled for this companion."
    : "Voice calling is currently disabled. Set CALLS_ENABLED=true in Railway and redeploy to enable this page.";
  const action = enabled
    ? `<button type="button" class="primary" disabled>Call UI loading</button>`
    : `<a class="secondary" href="/admin">Back to dashboard</a>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
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
  <main data-call-page="${enabled ? "enabled" : "disabled"}" data-companion-id="${safeCompanionId}">
    <p class="eyebrow">Dante voice gateway</p>
    <h1>${title}</h1>
    <p>${status}</p>
    <p>Route diagnostic: <code>/call/${safeCompanionId}</code> is mounted and returning HTML.</p>
    <div class="actions">${action}<a class="secondary" href="/admin">Dashboard</a></div>
  </main>
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
};
const { randomUUID } = require('node:crypto');
const { generateVoiceAudio } = require('../audio/voiceAudio');

const sessions = new Map();
function boolEnv(name, fallback=false){ const v=process.env[name]; return v==null||v===''?fallback:['1','true','yes','on'].includes(String(v).toLowerCase()); }
function json(res, status, payload){ res.writeHead(status,{ 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(payload)); }
async function readJson(req){ let b=''; for await (const c of req) b+=c; return b?JSON.parse(b):{}; }
function renderCallPage({ companionId }) {
  const callsEnabled = boolEnv('CALLS_ENABLED', true);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Call ${companionId}</title><style>
body{font-family:system-ui;margin:0;background:#0d1018;color:#f7efe5}.wrap{max-width:760px;margin:auto;padding:18px}.card{background:#171b28;border:1px solid #30364a;border-radius:22px;padding:18px;margin:14px 0}.row{display:flex;gap:10px;flex-wrap:wrap}button,input,textarea{font:inherit;border-radius:14px;padding:12px}button{background:#d7a86e;border:0;color:#1a1208;font-weight:800}button.secondary{background:#2b3144;color:#fff}button.danger{background:#8d2f35;color:#fff}.status{font-size:1.1rem;font-weight:800}.transcript{min-height:180px;white-space:pre-wrap}.ptt{width:100%;font-size:1.2rem;padding:18px}@media(max-width:640px){.wrap{padding:12px}.row button{flex:1 1 44%}}</style></head><body><main class="wrap">
<h1>Call ${companionId}</h1><div class="card"><div>Status: <span id="status" class="status">idle</span></div><div id="error"></div><div id="diag"></div></div>
<div class="card row"><button id="start">Start call</button><button id="end" class="danger">End call</button><button id="mute" class="secondary">Mute mic</button><button id="pause" class="secondary">Pause listening</button></div>
<div class="card"><div class="row"><button id="hands" class="secondary">Hands-free mode</button><button id="pttMode" class="secondary">Push-to-talk mode</button></div><button id="ptt" class="ptt">Hold / tap push-to-talk</button><textarea id="typed" rows="3" style="width:100%;box-sizing:border-box;margin-top:10px" placeholder="Typed fallback when speech recognition is unavailable"></textarea><button id="sendTyped">Send typed utterance</button></div>
<div class="card"><h2>Transcript</h2><div id="transcript" class="transcript"></div><button id="replay" class="secondary">Replay last Dante response</button></div>
<script>
const companionId=${JSON.stringify(companionId)}, callsEnabled=${JSON.stringify(callsEnabled)};
let sessionId='', mode='push_to_talk', recog=null, listening=false, paused=false, muted=false, lastAudio='', lastText='', silenceTimer=null;
const SR=window.SpeechRecognition||window.webkitSpeechRecognition, st=n=>document.getElementById('status').textContent=n, err=m=>document.getElementById('error').textContent=m||'', tr=(s)=>document.getElementById('transcript').textContent+=s+'\n';
document.getElementById('diag').textContent='calls enabled='+callsEnabled+' | STT provider=browser | browser STT available='+Boolean(SR)+' | TTS provider=kokoro_web | Kokoro voice='+(window.KOKORO_VOICE||'configured on server');
if(!SR) err('Hands-free speech recognition is not available in this browser. Use push-to-talk typed mode or configure Whisper.');
async function api(path, body){ const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}); return r.json(); }
function setupRecog(){ if(!SR) return null; const r=new SR(); r.lang='en-US'; r.continuous=true; r.interimResults=true; let final=''; r.onstart=()=>{listening=true; st(mode==='hands_free'?'listening':'recording')}; r.onerror=e=>{err('Speech recognition error: '+e.error); st('error')}; r.onresult=e=>{ st('transcribing'); for(let i=e.resultIndex;i<e.results.length;i++){ const t=e.results[i][0].transcript; if(e.results[i].isFinal) final+=t+' '; } if(mode==='hands_free'){ clearTimeout(silenceTimer); silenceTimer=setTimeout(()=>{ const out=final.trim(); final=''; if(out) sendUtterance(out); }, Number(${JSON.stringify(process.env.HANDS_FREE_SILENCE_MS||1200)})); }}; r.onend=()=>{listening=false; if(mode==='hands_free'&&!paused&&!muted) setTimeout(()=>r.start(),300);}; r.takeFinal=()=>{const out=final.trim(); final=''; return out}; return r; }
async function sendUtterance(text){ if(!text) return; st('thinking'); tr('You: '+text); const t0=performance.now(); const out=await api('/api/call/'+encodeURIComponent(companionId)+'/message',{sessionId,text}); lastText=out.replyText||''; tr('Dante: '+lastText); if(out.audio?.ok){ lastAudio='data:'+out.audio.contentType+';base64,'+out.audio.audioBase64; const a=new Audio(lastAudio); st('speaking'); a.onended=()=>{st(paused?'paused':'listening'); if(mode==='hands_free'&&recog&&!paused&&!muted) try{recog.start()}catch{}}; a.play(); } else { console.warn('Kokoro failed', out.audio?.error); st('speaking'); const u=new SpeechSynthesisUtterance(lastText); u.onend=()=>st(paused?'paused':'listening'); speechSynthesis.speak(u); } }
document.getElementById('start').onclick=async()=>{ const s=await api('/api/call/'+encodeURIComponent(companionId)+'/start',{}); sessionId=s.sessionId; st('idle'); };
document.getElementById('end').onclick=async()=>{ await api('/api/call/'+encodeURIComponent(companionId)+'/end',{sessionId}); st('idle'); if(recog)recog.stop(); };
document.getElementById('hands').onclick=()=>{ mode='hands_free'; if(!SR) return err('Hands-free speech recognition is not available in this browser. Use push-to-talk typed mode or configure Whisper.'); recog=setupRecog(); paused=false; recog.start(); };
document.getElementById('pttMode').onclick=()=>{ mode='push_to_talk'; if(recog)recog.stop(); st('idle'); };
document.getElementById('ptt').onclick=()=>{ if(SR){ recog=setupRecog(); recog.start(); setTimeout(()=>{try{recog.stop()}catch{}; sendUtterance(recog.takeFinal())}, Math.min(30000, Number(${JSON.stringify(process.env.CALL_MAX_UTTERANCE_SECONDS||30)})*1000)); } else document.getElementById('typed').focus(); };
document.getElementById('sendTyped').onclick=()=>sendUtterance(document.getElementById('typed').value.trim());
document.getElementById('pause').onclick=()=>{paused=!paused; if(paused&&recog)recog.stop(); st(paused?'paused':'listening')}; document.getElementById('mute').onclick=()=>{muted=!muted; if(muted&&recog)recog.stop();}; document.getElementById('replay').onclick=()=>{ if(lastAudio)new Audio(lastAudio).play(); else if(lastText)speechSynthesis.speak(new SpeechSynthesisUtterance(lastText)); };
</script></main></body></html>`;
}
async function handleCallRoutes({ req, res, url, context, withAdmin }) {
  const page = url.pathname.match(/^\/call\/([^/]+)$/);
  if (req.method==='GET' && page) return withAdmin(async(_req, innerRes)=>{ innerRes.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); innerRes.end(renderCallPage({ companionId: decodeURIComponent(page[1]) })); })(req,res,context);
  const api = url.pathname.match(/^\/api\/call\/([^/]+)\/(start|message|end|diagnostics)$/);
  if (!api) return false;
  return withAdmin(async(_req, innerRes, innerContext)=>{
    const companionId=decodeURIComponent(api[1]), action=api[2];
    if(action==='diagnostics') return json(innerRes,200,{callsEnabled:boolEnv('CALLS_ENABLED',true),sttProvider:process.env.STT_PROVIDER||'browser',ttsProvider:process.env.TTS_PROVIDER||'kokoro_web',kokoroApiReachable:Boolean(process.env.KOKORO_API_URL),kokoroVoice:process.env.KOKORO_VOICE||'',lastTtsError:null,lastSttError:null});
    const body=await readJson(_req);
    if(action==='start'){ const sessionId=randomUUID(); sessions.set(sessionId,{companionId,turns:[],startedAt:new Date().toISOString()}); return json(innerRes,200,{sessionId}); }
    const session=sessions.get(body.sessionId)||{companionId,turns:[]};
    if(action==='message'){
      const text=String(body.text||'');
      const fakeMessage={id:randomUUID(),content:text,author:{id:'dashboard_call_user',bot:false},channelId:'dashboard_call',channel:{id:'dashboard_call',name:'dashboard_call'},createdTimestamp:Date.now()};
      let replyText='';
      if(innerContext.companion?.processCompanionEvent){ const result=await innerContext.companion.processCompanionEvent({ companionId, channelType:'dashboard_call', eventType:'message', text, userId:'dashboard_call_user', channelId:'dashboard_call', metadata:{dashboardCall:{message:fakeMessage,wasMentioned:true}, call:{mode:process.env.CALL_CONTEXT_MODE||'light'}}}); replyText=result.outbound?.responseText||result.reply?.content||''; }
      else replyText='Call pipeline is not available yet.';
      const audio=await generateVoiceAudio({text:replyText, companionId, config:{ttsProvider:process.env.TTS_PROVIDER,kokoroApiUrl:process.env.KOKORO_API_URL,kokoroVoice:process.env.KOKORO_VOICE,kokoroFormat:process.env.KOKORO_FORMAT}, logger:innerContext.logger});
      session.turns.push({userTranscript:text,danteTextReply:replyText,audioStatus:audio.ok?'ok':'fallback',timestamp:new Date().toISOString()}); sessions.set(body.sessionId,session);
      return json(innerRes,200,{replyText,audio});
    }
    if(action==='end'){ session.endedAt=new Date().toISOString(); session.summary=session.turns.map(t=>'User: '+t.userTranscript+' / Dante: '+t.danteTextReply).join('\n').slice(0,4000); sessions.set(body.sessionId,session); return json(innerRes,200,{ok:true,summary:session.summary}); }
  })(req,res,context);
}
module.exports={ handleCallRoutes, renderCallPage, sessions };
