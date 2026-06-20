const { escapeHtml } = require("../renderShared");

const LOGIN_SUBTITLE =
  "This is your admin space. Manage setup, memories, and companion systems behind the scenes.";
const LOGIN_FOOTER = "Your AI lives in Discord. This is your control room.";

const ICON_USER =
  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></svg>";
const ICON_LOCK =
  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/></svg>";
const ICON_EYE =
  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>";
const ICON_EYE_OFF =
  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M6.6 6.6A18.5 18.5 0 0 0 2 11s3.6 7 10 7a9.1 9.1 0 0 0 3.4-.66\"/><path d=\"M14.12 14.12A3 3 0 0 1 9.88 9.88\"/><path d=\"m2 2 20 20\"/></svg>";
const ICON_STATUS =
  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M22 12h-4l-3 9L9 3l-3 9H2\"/></svg>";

const ASSET_BASE = "/assets/ghostlight/login";

const LOGIN_STYLES = `
*{box-sizing:border-box;}
:root{
  --gl-ink:#05070D;--gl-deep:#0B1220;--gl-teal:#39D7F0;--gl-teal-bright:#66E6FF;
  --gl-violet:#6F3CCB;--gl-paper:#F5F7FB;--gl-muted:#A8B0C2;
}
html,body{height:100%;}
body.gl-login-body{
  margin:0;min-height:100vh;color:var(--gl-paper);
  font-family:'Inter','Manrope',system-ui,-apple-system,Segoe UI,sans-serif;
  background:var(--gl-ink);overflow-x:hidden;
  -webkit-font-smoothing:antialiased;
}
.gl-stage{position:fixed;inset:0;z-index:0;overflow:hidden;}
/* cinematic photographic backdrop: moonlit ocean arch + candlelit gothic chamber */
.gl-bg{
  position:absolute;inset:0;
  background:url('${ASSET_BASE}/login-bg.jpg') center/cover no-repeat;
  transform:scale(1.04);
}
.gl-bg-tint{
  position:absolute;inset:0;
  background:linear-gradient(90deg, rgba(5,7,13,.34), rgba(5,7,13,.10) 38%, rgba(5,7,13,.18) 62%, rgba(5,7,13,.48)),
    radial-gradient(120% 80% at 50% 30%, transparent 50%, rgba(5,7,13,.4) 100%);
}
.gl-fog{position:absolute;inset:-8%;z-index:1;pointer-events:none;
  background:url('${ASSET_BASE}/fog-overlay.png') center/cover no-repeat;
  opacity:.45;mix-blend-mode:screen;}
.gl-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:radial-gradient(120% 120% at 50% 38%, transparent 52%, rgba(0,0,0,.6) 100%);}

.gl-wrap{position:relative;z-index:3;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;}
.gl-card{
  position:relative;width:min(440px,100%);
  background:linear-gradient(180deg, rgba(11,18,32,.78), rgba(5,9,18,.7));
  border:1px solid rgba(125,220,255,.22);border-radius:24px;
  padding:34px 34px 26px;
  backdrop-filter:blur(24px) saturate(1.2);-webkit-backdrop-filter:blur(24px) saturate(1.2);
  box-shadow:0 0 0 1px rgba(255,255,255,.04), 0 30px 90px rgba(2,6,14,.78), 0 0 80px rgba(57,215,240,.20);
}
.gl-card::before{ /* soft outer glow halo behind the card */
  content:"";position:absolute;inset:-46px;z-index:-1;pointer-events:none;
  background:url('${ASSET_BASE}/card-glow.png') center/contain no-repeat;opacity:.65;
}
.gl-logo{display:flex;justify-content:center;margin-bottom:6px;}
.gl-logo img{height:104px;width:auto;mix-blend-mode:screen;
  filter:drop-shadow(0 8px 30px rgba(57,215,240,.5));}
.gl-title{font-family:'Cormorant Garamond','Playfair Display',Georgia,serif;
  font-weight:600;font-size:2.4rem;line-height:1.05;margin:2px 0 8px;text-align:center;
  color:#fff;letter-spacing:.5px;text-shadow:0 2px 30px rgba(102,230,255,.25);}
.gl-sub{margin:0 auto 24px;max-width:34ch;text-align:center;color:var(--gl-muted);font-size:.92rem;line-height:1.5;}
.gl-err{margin:0 0 18px;padding:11px 14px;border-radius:12px;font-size:.88rem;
  background:rgba(203,60,80,.16);border:1px solid rgba(255,120,140,.4);color:#ffd7dd;}
.gl-field{margin-bottom:16px;}
.gl-label{display:block;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--gl-muted);margin:0 0 7px 2px;}
.gl-input-wrap{position:relative;display:flex;align-items:center;}
.gl-input-wrap .gl-ic{position:absolute;left:13px;width:19px;height:19px;color:var(--gl-teal);opacity:.85;pointer-events:none;}
.gl-input-wrap .gl-ic svg{width:100%;height:100%;}
.gl-input{
  width:100%;padding:13px 14px 13px 42px;border-radius:13px;
  background:rgba(5,9,18,.66);border:1px solid rgba(120,200,230,.22);
  color:#fff;font-size:.98rem;font-family:inherit;transition:border-color .15s,box-shadow .15s;
}
.gl-input.has-toggle{padding-right:46px;}
.gl-input::placeholder{color:rgba(168,176,194,.55);}
.gl-input:focus-visible{outline:none;border-color:var(--gl-teal);box-shadow:0 0 0 3px rgba(57,215,240,.25);}
.gl-eye{position:absolute;right:8px;display:flex;align-items:center;justify-content:center;
  width:32px;height:32px;border:0;border-radius:9px;background:transparent;color:var(--gl-muted);cursor:pointer;}
.gl-eye:hover{color:var(--gl-teal-bright);}
.gl-eye:focus-visible{outline:2px solid var(--gl-teal);outline-offset:2px;color:var(--gl-teal-bright);}
.gl-eye svg{width:19px;height:19px;}
.gl-btn{width:100%;border:0;border-radius:13px;padding:14px 16px;font-size:1rem;font-weight:600;
  font-family:inherit;cursor:pointer;letter-spacing:.02em;transition:transform .12s,box-shadow .15s,filter .15s;}
.gl-primary{margin-top:6px;color:#04121a;
  background:linear-gradient(135deg,var(--gl-teal-bright),var(--gl-teal) 60%,#23b6d6);
  box-shadow:0 10px 30px rgba(57,215,240,.4), 0 0 0 1px rgba(102,230,255,.5) inset;}
.gl-primary:hover{filter:brightness(1.06);box-shadow:0 14px 40px rgba(57,215,240,.55),0 0 0 1px rgba(102,230,255,.6) inset;}
.gl-primary:active{transform:translateY(1px);}
.gl-secondary{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:12px;
  text-decoration:none;color:var(--gl-paper);
  background:rgba(111,60,203,.16);border:1px solid rgba(120,200,230,.22);}
.gl-secondary:hover{background:rgba(111,60,203,.28);border-color:rgba(102,230,255,.4);}
.gl-secondary svg{width:17px;height:17px;color:var(--gl-teal);}
.gl-forgot{margin:16px 0 4px;text-align:center;}
.gl-forgot summary{display:inline-flex;align-items:center;gap:6px;list-style:none;cursor:pointer;
  color:var(--gl-teal);font-size:.86rem;}
.gl-forgot summary::-webkit-details-marker{display:none;}
.gl-forgot summary:hover{color:var(--gl-teal-bright);}
.gl-forgot summary:focus-visible{outline:2px solid var(--gl-teal);outline-offset:3px;border-radius:6px;}
.gl-forgot p{margin:10px auto 0;max-width:32ch;color:var(--gl-muted);font-size:.82rem;line-height:1.5;}
.gl-forgot code{color:var(--gl-teal-bright);font-size:.8rem;}
.gl-foot{margin:22px 0 4px;text-align:center;color:rgba(168,176,194,.7);font-size:.78rem;
  border-top:1px solid rgba(120,200,230,.12);padding-top:16px;}
.gl-reflect{position:fixed;left:0;right:0;bottom:0;height:26vh;z-index:1;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(57,215,240,.06) 70%,rgba(111,60,203,.08));
  -webkit-mask:linear-gradient(180deg,transparent,#000);mask:linear-gradient(180deg,transparent,#000);}
@media (max-width:560px){
  .gl-bg{background-image:url('${ASSET_BASE}/login-bg-blur.jpg');transform:scale(1.08);}
  .gl-bg-tint{background:rgba(5,7,13,.58);}
  .gl-fog{opacity:.3;}
  .gl-card{padding:28px 22px 22px;}
  .gl-card::before{inset:-26px;}
  .gl-title{font-size:2.05rem;}
  .gl-logo img{height:84px;}
}
@media (prefers-reduced-motion:no-preference){
  .gl-fog{animation:gl-drift 28s ease-in-out infinite alternate;}
  @keyframes gl-drift{from{transform:translate3d(-2%,0,0);}to{transform:translate3d(3%,-2%,0);}}
}
`;

const EYE_TOGGLE_SCRIPT = [
  "<script>",
  "(()=>{var b=document.getElementById('gl-eye');if(!b)return;var i=document.getElementById('gl-password');",
  "var on=document.getElementById('gl-eye-on'),off=document.getElementById('gl-eye-off');",
  "b.addEventListener('click',function(){var s=i.type==='password';i.type=s?'text':'password';",
  "b.setAttribute('aria-pressed',String(s));b.setAttribute('aria-label',s?'Hide password':'Show password');",
  "on.style.display=s?'none':'';off.style.display=s?'':'none';i.focus();});",
  "})();",
  "</script>",
].join("");

function sanitizeNext(next) {
  const value = String(next || "");
  if (value.startsWith("/admin") && !value.startsWith("//") && !value.includes("://")) {
    return value;
  }
  return "/admin";
}

function renderLoginPage({ error = "", next = "/admin", username = "" } = {}) {
  const safeNext = sanitizeNext(next);
  const errorBlock = error
    ? `<div class="gl-err" role="alert">${escapeHtml(error)}</div>`
    : "";

  const body = [
    "<div class=\"gl-stage\" aria-hidden=\"true\">",
    "<div class=\"gl-bg\"></div>",
    "<div class=\"gl-bg-tint\"></div>",
    "<div class=\"gl-fog\"></div>",
    "<div class=\"gl-vignette\"></div>",
    "</div>",
    "<div class=\"gl-reflect\" aria-hidden=\"true\"></div>",
    "<div class=\"gl-wrap\">",
    "<div class=\"gl-card\">",
    `<div class="gl-logo"><img src="${ASSET_BASE}/logo-lockup.png" alt="Ghostlight — Admin Control Room" width="248" height="104"></div>`,
    "<h1 class=\"gl-title\">Welcome back</h1>",
    `<p class="gl-sub">${escapeHtml(LOGIN_SUBTITLE)}</p>`,
    errorBlock,
    `<form method="post" action="/admin/login" novalidate>`,
    `<input type="hidden" name="next" value="${escapeHtml(safeNext)}">`,
    "<div class=\"gl-field\">",
    "<label class=\"gl-label\" for=\"gl-username\">Username</label>",
    "<div class=\"gl-input-wrap\">",
    `<span class="gl-ic">${ICON_USER}</span>`,
    `<input class="gl-input" id="gl-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Your username" value="${escapeHtml(username)}" required autofocus>`,
    "</div>",
    "</div>",
    "<div class=\"gl-field\">",
    "<label class=\"gl-label\" for=\"gl-password\">Password</label>",
    "<div class=\"gl-input-wrap\">",
    `<span class="gl-ic">${ICON_LOCK}</span>`,
    `<input class="gl-input has-toggle" id="gl-password" name="password" type="password" autocomplete="current-password" placeholder="Your password" required>`,
    "<button type=\"button\" id=\"gl-eye\" class=\"gl-eye\" aria-pressed=\"false\" aria-label=\"Show password\">",
    `<span id="gl-eye-on">${ICON_EYE}</span><span id="gl-eye-off" style="display:none">${ICON_EYE_OFF}</span>`,
    "</button>",
    "</div>",
    "</div>",
    "<button type=\"submit\" class=\"gl-btn gl-primary\">Sign In</button>",
    `<a class="gl-btn gl-secondary" href="/health">${ICON_STATUS}<span>System Status</span></a>`,
    "</form>",
    "<details class=\"gl-forgot\">",
    "<summary>Forgot password?</summary>",
    "<p>Admin credentials are set on the server through the <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> environment variables. Update them in your hosting dashboard and restart to reset access.</p>",
    "</details>",
    `<p class="gl-foot">${escapeHtml(LOGIN_FOOTER)}</p>`,
    "</div>",
    "</div>",
    EYE_TOGGLE_SCRIPT,
  ].join("");

  return [
    "<!doctype html>",
    "<html lang=\"en\" data-theme=\"dark\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<meta name=\"color-scheme\" content=\"dark\">",
    "<link rel=\"icon\" href=\"/assets/favicons/favicon.ico\" sizes=\"any\">",
    "<title>Welcome back · Ghostlight</title>",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link href=\"https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap\" rel=\"stylesheet\">",
    "<style>",
    LOGIN_STYLES,
    "</style>",
    "</head>",
    "<body class=\"gl-login-body\">",
    body,
    "</body>",
    "</html>",
  ].join("");
}

module.exports = {
  renderLoginPage,
  sanitizeNext,
};
