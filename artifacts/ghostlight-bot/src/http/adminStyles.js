module.exports = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700&display=swap');
:root{color-scheme:light;--bg:#F2ECFF;--surface:#E6DAF8;--surface-2:#D4C6F0;--accent:#0E7A90;--accent-hover:#0A6578;--accent-secondary:#7040B8;--metallic:#7E6EA6;--text:#12082A;--text-secondary:#4A3068;--border:#BEB0D8;--success-bg:#E0F0EE;--success-border:#88B8B4;--error-bg:#F5E8F2;--error-border:#C09AB8;--table-hover:rgba(14,122,144,.05);--control-height:46px}
html[data-theme="dark"]{color-scheme:dark;--bg:#03040A;--surface:#080B14;--surface-2:#111827;--accent:#39D7F0;--accent-hover:#66E5FF;--accent-secondary:#8B5CF6;--metallic:#A9B0C3;--text:#F8FAFC;--text-secondary:#A9B0C3;--border:rgba(57,215,240,.14);--success-bg:#051A18;--success-border:#1A4E48;--error-bg:#1C0618;--error-border:#5A1E38;--table-hover:rgba(57,215,240,.05)}
body{font-family:'Inter',system-ui,sans-serif;background:radial-gradient(ellipse 70% 55% at top left,color-mix(in srgb,var(--accent-secondary) 18%,var(--bg)),transparent 65%),radial-gradient(ellipse 55% 65% at bottom right,color-mix(in srgb,var(--accent) 10%,var(--bg)),transparent 60%),var(--bg);color:var(--text);margin:0;padding:1.5rem;line-height:1.5;min-height:100vh}
main{max-width:1380px;margin:0 auto}
.topbar{display:flex;justify-content:flex-end;align-items:flex-start;gap:1rem;margin-bottom:1rem}
.title-block p{margin:.35rem 0 0;color:var(--text-secondary);max-width:60ch}
h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;letter-spacing:.01em;margin:0 0 .4rem;font-weight:600}
h1{font-size:clamp(2.8rem,5vw,4.3rem);line-height:.92}
h2{font-size:1.6rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}
.card{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 82%, transparent),color-mix(in srgb,var(--surface) 70%, transparent));border:1px solid color-mix(in srgb,var(--border) 58%, transparent);border-radius:0;padding:1rem 1.1rem}
.stack{display:grid;gap:1rem}
.section-title{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.section-title-inline{align-items:center}
.section-title-inline h3{margin-bottom:0}
.theme-switcher{display:inline-flex;gap:.2rem;padding:0}
.theme-switcher a{padding:.3rem .55rem;text-decoration:none;color:var(--text-secondary);font-size:.9rem;border-bottom:1px solid transparent}
.theme-switcher a[aria-current="page"]{color:var(--text);border-color:var(--text)}
label{display:block;font-weight:600;font-size:.92rem;margin:.6rem 0 .35rem;color:var(--text)}
input,textarea,select,button{font:inherit}
input,textarea,select{width:100%;box-sizing:border-box;padding:.78rem .85rem;border:1px solid color-mix(in srgb,var(--border) 72%, transparent);border-radius:3px;background:color-mix(in srgb,var(--surface) 50%, transparent);color:var(--text);transition:border-color .16s ease,background .16s ease;line-height:1.35;min-height:var(--control-height)}
select{appearance:auto;-webkit-appearance:menulist;-moz-appearance:menulist;padding-right:.85rem;background-image:none !important}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);background:color-mix(in srgb,var(--surface) 72%, transparent)}
input::placeholder,textarea::placeholder{color:var(--text-secondary)}
textarea{min-height:140px;resize:vertical}
button{background:var(--accent);color:white;border:none;border-radius:3px;padding:.7rem .95rem;cursor:pointer;transition:background .16s ease,border-color .16s ease}
button:hover{background:var(--accent-hover)}
button.secondary{background:color-mix(in srgb,var(--surface) 48%, transparent);color:var(--text);border:1px solid color-mix(in srgb,var(--border) 70%, transparent)}
button.warn{background:#A35157;border-color:#8B434B}
.meta{color:var(--text-secondary);font-size:.92rem}
.item-title{margin:0 0 .25rem}
.notice{padding:.8rem 1rem;border-radius:12px;margin-bottom:1rem;border:1px solid transparent}
.success{background:var(--success-bg);border-color:var(--success-border)}
.error{background:var(--error-bg);border-color:var(--error-border)}
.home-update-notice{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem;align-items:start;background:color-mix(in srgb,var(--accent) 8%, transparent);border-top:1px solid color-mix(in srgb,var(--accent) 32%, var(--border))}
.home-update-notice h3{margin-bottom:.2rem}
.home-update-notice .meta{max-width:72ch;margin:.1rem 0 0}
.home-update-notice .quick-links{margin-top:.75rem}
.home-update-notice-dismiss{align-self:start}
code{background:color-mix(in srgb,var(--surface-2) 74%, transparent);padding:.1rem .3rem;border-radius:0}
a{color:var(--accent)}
.pill{display:inline-flex;align-items:center;gap:.35rem;padding:.65rem .9rem;color:var(--text-secondary);border:1px solid color-mix(in srgb,var(--border) 70%, transparent);border-radius:3px;font-size:.86rem;text-decoration:none;background:color-mix(in srgb,var(--surface) 52%, transparent)}
.badge{display:inline-flex;align-items:center;padding:.2rem .46rem;border-radius:6px;border:1px solid color-mix(in srgb,var(--border) 72%, transparent);background:color-mix(in srgb,var(--surface-2) 64%, transparent);color:var(--text-secondary);font-size:.74rem;line-height:1.2}
.badge[hidden]{display:none!important}
.badge.type{background:color-mix(in srgb,var(--accent) 20%, var(--surface-2));color:var(--text)}
.badge.domain{background:color-mix(in srgb,var(--accent-secondary) 18%, var(--surface-2));color:var(--text)}
.badge.sensitivity{background:color-mix(in srgb,var(--metallic) 18%, var(--surface-2));color:var(--text)}
.badge.importance{background:color-mix(in srgb,var(--surface) 18%, var(--surface-2));color:var(--text)}
.badge.action-health-warning{background:color-mix(in srgb,var(--error-bg) 82%, var(--surface-2));border-color:var(--error-border);color:var(--text)}
.button-link{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;padding:.7rem .95rem;border:none;border-radius:3px;background:var(--accent);color:white;text-decoration:none;transition:background .16s ease,border-color .16s ease}
.button-link:hover{background:var(--accent-hover);color:white}
.button-link-secondary{background:color-mix(in srgb,var(--surface) 52%, transparent);color:var(--text);border:1px solid color-mix(in srgb,var(--border) 70%, transparent)}
.button-link-secondary:hover{background:color-mix(in srgb,var(--surface) 68%, transparent);color:var(--text)}
.gallery-thumbnail-state{display:flex;padding:0;border-radius:3px;background:color-mix(in srgb,var(--surface) 52%, transparent);color:var(--text-secondary);border:1px solid color-mix(in srgb,var(--border) 70%, transparent);text-decoration:none;overflow:hidden}
.gallery-thumbnail-state:hover{background:color-mix(in srgb,var(--surface) 68%, transparent);color:var(--text)}
.toolbar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.copy-block + .toolbar{margin-top:.75rem}
.inline-form{margin:0}
.copy-block + .inline-form{margin-top:.75rem}
.sort-link{color:inherit;text-decoration:none}
.section-offset{margin-top:1rem}
.toolbar-bottom-gap{margin-bottom:1rem}
.subgrid{display:grid;grid-template-columns:2fr 1fr;gap:1rem}
.list-plain{margin:.65rem 0 0;padding-left:1.1rem;color:var(--text-secondary)}
.list-plain li{margin:.3rem 0}
.hero-card{padding:0}
.hero-card p{margin:.25rem 0 0;color:var(--text-secondary)}
.entry-shell{min-height:calc(100vh - 6rem);display:grid;place-items:center;text-align:center;gap:1rem;padding:2rem 1rem}
.entry-shell > *{margin:0}
.entry-brand{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:var(--text)}
.entry-logo{display:inline-flex;align-items:center;justify-content:center;width:4.75rem;height:4.75rem}
.entry-logo-image{display:block;width:100%;height:100%;object-fit:contain}
.entry-title{font-size:clamp(3rem,6vw,4.75rem);line-height:.92}
.entry-copy{max-width:38rem;color:var(--text-secondary);font-size:1.02rem}
.entry-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.75rem}
.admin-shell{display:flex;flex-direction:column;min-width:0}
.lite-shell{background:transparent;min-height:calc(100vh - 3rem);min-width:0}
.admin-topbar{background:color-mix(in srgb,var(--bg) 80%,var(--surface));border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent);margin:-1.5rem -1.5rem 0}
.topbar-inner{max-width:calc(1380px + 3rem);margin:0 auto;display:flex;flex-direction:column;padding:0 1.5rem}
.topbar-row{display:flex;align-items:center;width:100%}
.topbar-row--top{gap:.5rem;padding:.4rem 0 .25rem}
.topbar-row--nav{padding-bottom:.25rem}
.topbar-brand{display:flex;align-items:center;gap:.55rem;text-decoration:none;color:var(--text);flex-none;margin-right:.6rem}
.topbar-logo-wrap{width:2rem;height:2rem;display:inline-flex;align-items:center;justify-content:center;flex:none}
.topbar-logo-img{display:block;width:100%;height:100%;object-fit:contain}
.topbar-brand-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.38rem;line-height:1;white-space:nowrap;letter-spacing:.01em}
.topbar-nav{display:flex;align-items:center;flex-wrap:wrap;gap:.08rem;width:100%}
.topbar-nav a{display:inline-flex;align-items:center;gap:.36rem;padding:.38rem .6rem;color:var(--text-secondary);text-decoration:none;font-size:.86rem;font-weight:500;border-radius:3px;white-space:nowrap;transition:background .16s ease,color .16s ease;flex-none}
.topbar-nav a:hover{color:var(--text);background:color-mix(in srgb,var(--surface) 58%,transparent)}
.topbar-nav a[aria-current="page"]{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface))}
.topbar-nav-child{border-left:2px solid color-mix(in srgb,var(--accent) 28%,transparent);margin-left:.15rem;padding-left:.55rem!important;font-size:.8rem!important;opacity:.88}
.topbar-nav-child .topbar-nav-title{font-size:.8rem}
.topbar-nav-child[aria-current="page"]{opacity:1}
.topbar-nav-icon{width:.8rem;height:.8rem;display:inline-flex;align-items:center;justify-content:center;flex:none;opacity:.72;color:inherit}
.topbar-nav-icon img,.topbar-nav-icon svg{display:block;width:100%;height:100%}
.topbar-nav-title{font-size:.86rem}
.topbar-end{display:flex;align-items:center;gap:.75rem;flex-none;padding-left:.5rem;margin-left:auto}
.topbar-mobile{display:none}
.topbar-mobile::before{content:"";display:none}
.topbar-mobile-summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1.5rem;cursor:pointer;list-style:none;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent)}
.topbar-mobile-summary::-webkit-details-marker{display:none}
.topbar-mobile-trigger{display:inline-flex;align-items:center;justify-content:center;padding:.4rem .7rem;border:1px solid color-mix(in srgb,var(--border) 70%,transparent);border-radius:999px;background:color-mix(in srgb,var(--surface) 88%,transparent);color:var(--text-secondary);font-size:.88rem;font-weight:600}
.topbar-mobile-panel{padding:.4rem 1rem .85rem;display:flex;flex-direction:column;gap:.1rem}
.topbar-mobile-panel .topbar-nav{flex-direction:column;align-items:stretch}
.topbar-mobile-panel .topbar-nav a{padding:.6rem .7rem}
@media(max-width:900px){.topbar-row--nav{display:none}.topbar-mobile{display:block}}
.admin-main{min-width:0}
.lite-main{background:transparent;border:none;border-left:none;border-radius:0;overflow:visible;min-width:0;max-height:none;overflow-y:visible;padding:1.5rem 1.5rem .65rem;min-height:calc(100vh - 3.5rem)}
.lite-main > *{width:100%;max-width:1120px;margin:0 auto;box-sizing:border-box}
.lite-panel{background:transparent;border:none;border-radius:0;padding:1.2rem 1.6rem}
.lite-panel.flush{padding:0 1.4rem 1rem}
.panel-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem}
.copy-block h2{margin-bottom:.2rem}
.copy-block p{margin:.2rem 0 0;color:var(--text-secondary)}
.page-frame{padding-top:0}
.page-frame + .page-frame{border-top:1px solid color-mix(in srgb,var(--border) 68%, transparent);padding-top:1rem}
.page-frame.no-divider{border-top:none !important}
.page-frame-tight{padding-bottom:.2rem}
.subnav-frame{padding-bottom:.7rem}
.subnav-frame + .page-frame.no-divider,
.subnav-frame + .proactive-shell.flat{border-top:1px solid color-mix(in srgb,var(--border) 68%, transparent) !important;padding-top:1rem}
.admin-tab-panel{padding-top:1rem}
.page-head{padding:.2rem 0 0}
.page-head p{margin:.15rem 0 0;color:var(--text-secondary);max-width:68ch}
.page-head p:empty{display:none}
.eyebrow{margin:0 0 .25rem;font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);font-weight:700}
.page-subnav{display:flex;flex-wrap:wrap;gap:.55rem}
.page-subnav a{display:inline-flex;align-items:center;justify-content:center;padding:.55rem .85rem;color:var(--text-secondary);text-decoration:none;font-size:.92rem;border:1px solid transparent;border-radius:3px;background:transparent}
.page-subnav a[aria-current="page"]{color:var(--text);border-color:color-mix(in srgb,var(--border) 72%, transparent);background:color-mix(in srgb,var(--surface) 52%, transparent)}
.checkbox-row{display:flex;align-items:center;gap:.65rem;font-weight:600;margin:.4rem 0}
.checkbox-row input[type="checkbox"]{width:auto;flex:none;margin:0}
.image-toggle-row{margin-top:.1rem;margin-bottom:.35rem}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}
.stat-card{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 86%, transparent),color-mix(in srgb,var(--surface) 72%, transparent));border:1px solid color-mix(in srgb,var(--border) 58%, transparent);border-radius:3px;padding:1rem}
.stat-label{margin:0 0 .25rem;color:var(--text-secondary);font-size:.84rem;text-transform:uppercase;letter-spacing:.08em}
.stat-value{display:block;font-size:1.2rem;line-height:1.1}
.stat-note{margin:.35rem 0 0;color:var(--text-secondary);font-size:.92rem}
.home-dashboard-grid{display:grid;grid-template-columns:minmax(16rem,.8fr) minmax(0,1.45fr);gap:1.4rem;align-items:start}
.home-dashboard-panel{display:grid;gap:.75rem}
.home-decision-grid{display:grid;grid-template-columns:1fr;gap:.85rem}
.home-decision-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.85rem;align-items:start;padding:.4rem 0;text-decoration:none;color:var(--text);border-bottom:1px solid color-mix(in srgb,var(--border) 45%, transparent)}
.home-decision-card:last-child{border-bottom:none}
.home-decision-card.is-muted{opacity:.88}
.home-decision-icon{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:999px;background:color-mix(in srgb,var(--surface) 76%, transparent);border:1px solid color-mix(in srgb,var(--border) 58%, transparent);color:var(--text)}
.home-decision-icon-image{display:block;width:1.05rem;height:1.05rem;opacity:.95}
.home-decision-copy{min-width:0}
.home-decision-time{margin:.45rem 0 0;color:var(--text-secondary);font-size:.8rem}
.home-decision-why{margin:0;color:var(--text);font-size:.94rem;line-height:1.55}

/* ── Home page inner life feed ─────────────────────────────────── */
.home-il-section{margin-top:.9rem;padding-top:.75rem;border-top:1px solid color-mix(in srgb,var(--border) 45%, transparent)}
.home-il-bottom-section .home-il-section{margin-top:0;padding-top:0;border-top:none}
.home-il-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.65rem}
.home-il-entry-list{display:grid;gap:.6rem}
.home-il-entry-card{display:grid;gap:.35rem;padding:.65rem .75rem;border-radius:8px;border:1px solid color-mix(in srgb,var(--border) 55%, transparent);background:color-mix(in srgb,var(--surface) 70%, transparent)}
.home-il-entry-top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.home-il-entry-content{margin:0;font-size:.88rem;line-height:1.55;color:var(--text)}
.home-il-entry-time{margin-left:auto;color:var(--text-secondary);font-size:.78rem;white-space:nowrap}
.home-il-type-badge{background:color-mix(in srgb,var(--accent-secondary) 12%, var(--surface));border:1px solid color-mix(in srgb,var(--accent-secondary) 30%, transparent);color:var(--text)}
.home-il-status-badge{font-size:.73rem}
.home-il-status-active{opacity:.7}
.home-il-status-used_in_prelude{color:var(--accent);opacity:.85}

/* ── Inner life entries page — rich cards ──────────────────────── */
.il-entries-grid{display:grid;gap:1rem;margin-top:.5rem}
.il-entry-card{display:grid;gap:.55rem;padding:1.1rem 1.25rem;border-radius:10px;border:1px solid color-mix(in srgb,var(--border) 60%, transparent);background:color-mix(in srgb,var(--surface) 78%, transparent)}
.il-entry-card--warning{border-color:color-mix(in srgb,var(--error-border) 60%, transparent)}
.il-entry-card--used{opacity:.78}
.il-entry-card-header{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.il-entry-type-badge{background:color-mix(in srgb,var(--accent-secondary) 12%, var(--surface));border:1px solid color-mix(in srgb,var(--accent-secondary) 28%, transparent);color:var(--text)}
.il-entry-status-badge{font-size:.76rem}
.il-entry-status-used{color:var(--accent)}
.il-entry-time{margin-left:auto;color:var(--text-secondary);font-size:.8rem;white-space:nowrap}
.il-entry-content{margin:0;font-size:.93rem;line-height:1.65;color:var(--text);white-space:pre-wrap;word-break:break-word}
.il-entry-content--empty{color:var(--text-secondary);font-style:italic}
.il-entry-type-desc{margin:0;font-size:.8rem;color:var(--text-secondary);font-style:italic;padding-top:.1rem;border-top:1px solid color-mix(in srgb,var(--border) 35%, transparent)}
.il-entry-actions{display:flex;gap:.5rem;align-items:center;padding-top:.25rem}

.home-setup-list{display:grid;grid-template-columns:1fr;gap:.85rem}
.home-setup-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.8rem;align-items:center}
.home-status-icon{display:grid;place-items:center;width:2.45rem;height:2.45rem;border-radius:999px;background:color-mix(in srgb,var(--surface) 78%, transparent);border:1px solid color-mix(in srgb,var(--border) 58%, transparent);color:var(--text)}
.home-status-icon-image{display:block;width:1.1rem;height:1.1rem}
.home-setup-value{margin:0;color:var(--text);font-size:.95rem;line-height:1.45;font-weight:500}
.home-feature-row{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding-top:.25rem}
.home-feature-pill{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:999px;border:1px solid color-mix(in srgb,var(--border) 58%, transparent);background:color-mix(in srgb,var(--surface) 78%, transparent);color:var(--text)}
.home-feature-pill.is-active{background:color-mix(in srgb,var(--accent) 16%, var(--surface) 84%);border-color:color-mix(in srgb,var(--accent) 32%, var(--border) 68%)}
.home-feature-pill.is-inactive{opacity:.52}
.home-feature-icon-image{display:block;width:1rem;height:1rem}
.home-image-stream-section{overflow:hidden}
.home-image-stream-wrap{position:relative;overflow:hidden;padding:.18rem 0}
.home-image-stream-wrap::before,.home-image-stream-wrap::after{content:"";position:absolute;top:0;bottom:0;width:4.5rem;z-index:2;pointer-events:none}
.home-image-stream-wrap::before{left:0;background:linear-gradient(90deg,var(--bg),transparent)}
.home-image-stream-wrap::after{right:0;background:linear-gradient(270deg,var(--bg),transparent)}
.home-image-stream-track{display:flex;align-items:flex-start;gap:.35rem;width:max-content;animation:home-image-film-drift 80s linear infinite}
.home-image-tile{--home-image-height:146px;--home-image-aspect:1;display:block;flex:none;width:calc(var(--home-image-height) * var(--home-image-aspect));height:var(--home-image-height);overflow:hidden;text-decoration:none;color:var(--text);border-radius:3px;background:color-mix(in srgb,var(--surface) 65%, transparent);box-shadow:0 16px 28px color-mix(in srgb,var(--bg) 35%, transparent)}
.home-image-tile img{display:block;width:100%;height:100%;max-width:none;object-fit:cover}
.home-journal-stream-section{overflow:hidden}
.home-journal-stream-wrap{position:relative;overflow:hidden;padding:.15rem 0 .25rem}
.home-journal-stream-wrap::before,.home-journal-stream-wrap::after{content:"";position:absolute;top:0;bottom:0;width:4.5rem;z-index:2;pointer-events:none}
.home-journal-stream-wrap::before{left:0;background:linear-gradient(90deg,var(--bg),transparent)}
.home-journal-stream-wrap::after{right:0;background:linear-gradient(270deg,var(--bg),transparent)}
.home-journal-stream-track{display:flex;align-items:stretch;gap:1rem;width:max-content;animation:home-image-drift 110s linear infinite}
.home-journal-tile{display:grid;gap:.55rem;flex:none;width:240px;padding:1rem 1rem 1.1rem;border:1px solid color-mix(in srgb,var(--border) 60%, transparent);border-radius:3px;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 88%, transparent),color-mix(in srgb,var(--surface) 74%, transparent));text-decoration:none;color:var(--text)}
.home-journal-date{margin:0;color:var(--text-secondary);font-size:.84rem}
.home-journal-excerpt{margin:0;color:var(--text);font-size:.94rem;line-height:1.65}
.home-journal-excerpt h2,.home-journal-excerpt h3,.home-journal-excerpt h4{font-size:1rem;line-height:1.35}
@keyframes home-image-drift{from{transform:translateX(0)}to{transform:translateX(calc(-50% - .5rem))}}
@keyframes home-image-film-drift{from{transform:translateX(0)}to{transform:translateX(calc(-50% - .175rem))}}
.page-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.quick-links{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.75rem}
.quick-links-offset{margin-top:.85rem}
.quick-actions-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.memory-page-shell{padding-top:.9rem}
.memory-section{display:grid;gap:1rem}
.memory-card{padding:1rem 1.1rem}
.memory-form-card{width:100%}
.memory-surface-plain{width:100%;padding:0;background:transparent;border:none}
.memory-toolbar-shell{padding:0 1.6rem}
.memory-toolbar-group{width:100%}
.memory-toolbar-group-primary{padding-top:.3rem}
.memory-toolbar-group-filters{padding-bottom:.2rem}
.memory-archive-toggle{display:flex;align-items:center;gap:.7rem}
.memory-archive-toggle label{margin:0}
.form-spacer{height:.6rem}
.form-spacer.compact{height:.2rem}
.memory-import-form{display:grid;gap:.2rem}
.memory-radio-group{border:none;padding:0;margin:0}
.memory-radio-group legend{font-weight:600;font-size:.92rem;margin-bottom:.45rem;color:var(--text)}
.memory-radio-option{display:flex;align-items:center;gap:.55rem;margin:0 0 .2rem;color:var(--text);font-weight:500}
.memory-radio-option input{width:auto;min-height:auto;height:auto;margin:0}
.memory-channel-section{display:grid;gap:.55rem;margin-top:.05rem}
.memory-channel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.memory-channel-label{margin:.6rem 0 0}
.memory-channel-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.memory-channel-actions .toolbar-button{min-height:2.35rem;padding:.48rem .72rem;font-size:.9rem}
.memory-channel-picker{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.55rem;max-height:26rem;overflow:auto;padding:.2rem}
.memory-choice-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.6rem;align-items:center;margin:0;padding:.62rem .7rem;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 58%, transparent);cursor:pointer;transition:background .16s ease,border-color .16s ease,opacity .16s ease}
.memory-choice-row:hover{border-color:color-mix(in srgb,var(--accent) 46%, var(--border));background:color-mix(in srgb,var(--surface) 72%, transparent)}
.memory-choice-toggle{position:absolute;opacity:0;pointer-events:none;width:1px!important;height:1px!important;min-height:0!important;padding:0!important;margin:0!important}
.memory-choice-check{display:grid;place-items:center;width:1.05rem;height:1.05rem;border:1px solid color-mix(in srgb,var(--border) 78%, transparent);border-radius:4px;background:color-mix(in srgb,var(--surface) 68%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--surface) 36%, transparent);transition:background .16s ease,border-color .16s ease}
.memory-choice-check::after{content:"";width:.45rem;height:.45rem;border-radius:2px;background:transparent;transition:background .16s ease}
.memory-choice-toggle:focus-visible + .memory-choice-check{outline:2px solid color-mix(in srgb,var(--accent) 72%, transparent);outline-offset:2px}
.memory-choice-toggle:checked + .memory-choice-check{border-color:color-mix(in srgb,var(--accent) 58%, var(--border));background:color-mix(in srgb,var(--accent) 18%, var(--surface))}
.memory-choice-toggle:checked + .memory-choice-check::after{background:var(--accent)}
.memory-channel-option span{display:block;min-width:0}
.memory-channel-option strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-size:.94rem}
.memory-field-block{display:grid;gap:.2rem}
.memory-field-block.is-hidden{display:none}
.memory-date-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.generated-memory-editor{display:grid;gap:.45rem}
.generated-memory-editor textarea{min-height:9.5rem}
.generated-memory-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;align-items:end}
.generated-memory-comparison-grid{display:grid;grid-template-columns:1fr;gap:1rem;align-items:start}
.generated-memory-comparison-panel{display:grid;gap:.55rem;min-width:0}
.generated-memory-comparison-panel > h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;letter-spacing:0}
.generated-memory-current-card{display:grid;gap:.55rem;min-width:0;padding:.85rem .9rem;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 56%, transparent)}
.generated-memory-current-card h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;line-height:1.35;letter-spacing:0}
.generated-memory-current-card p{margin:0;color:var(--text-secondary);line-height:1.62;white-space:pre-wrap}
.generated-memory-actions{margin-top:.95rem}
.generated-memory-reason{display:grid;gap:.35rem;margin:1rem 0 1.05rem;padding:.85rem .95rem;border-left:3px solid color-mix(in srgb,var(--accent) 56%, var(--border));background:color-mix(in srgb,var(--surface) 54%, transparent)}
.generated-memory-reason p{margin:0;color:var(--text);line-height:1.6;font-style:italic}
.generated-memory-reason span{justify-self:end;color:var(--text-secondary);font-size:.9rem}
.generated-memory-activity{display:grid;gap:.35rem;margin:1rem 0;padding:.75rem .85rem;border:1px solid color-mix(in srgb,var(--border) 58%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 42%, transparent)}
.generated-memory-activity h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;letter-spacing:0}
.generated-memory-activity p{margin:0;color:var(--text-secondary);line-height:1.55}
.generated-memory-activity span{padding:0 .18rem;color:color-mix(in srgb,var(--text-secondary) 70%, transparent)}
.generated-memory-split-list{display:grid;gap:.85rem;margin-top:1rem}
.generated-memory-split-list > h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;letter-spacing:0}
.generated-memory-split-card{display:grid;gap:.55rem;min-width:0;padding:.85rem .9rem;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 42%, transparent)}
.generated-memory-split-card h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;line-height:1.35;letter-spacing:0}
.generated-memory-queue-bar{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;padding:.7rem .8rem;border:1px solid color-mix(in srgb,var(--border) 58%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 48%, transparent)}
.generated-memory-queue-bar span{color:var(--text-secondary);font-weight:650}
.existing-similar-memories{display:grid;gap:.65rem;margin-top:1.2rem;padding-top:1rem;border-top:1px solid color-mix(in srgb,var(--border) 58%, transparent)}
.existing-similar-memories h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;letter-spacing:0}
.related-memory-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:.65rem}
.related-memory-card{display:grid;gap:.5rem;min-width:0;padding:.75rem .8rem;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 62%, transparent)}
.related-memory-card-topline{display:grid;gap:.35rem;min-width:0}
.related-memory-card h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:.95rem;font-weight:750;letter-spacing:0;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.related-memory-card p{margin:0;color:var(--text-secondary);font-size:.88rem;line-height:1.55;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.meta-label{font-size:.82rem;color:var(--text-secondary);font-weight:500}
.file-picker-row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.file-picker-input{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}
.file-picker-button{cursor:pointer;margin:0;align-self:center}
.file-picker-label{color:var(--text-secondary);font-size:.92rem}
.memory-review-summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:100%;flex-wrap:wrap}
.memory-review-shell .memory-toolbar-group-filters{width:auto;flex:0 1 auto}
.memory-review-shell .toolbar-field.select{width:auto}
.memory-review-shell .toolbar-field.select select{width:auto;min-width:9rem;max-width:100%}
.review-action-link{min-width:4.75rem}
.memory-review-card-section{padding:1rem 1.6rem 0}
.review-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr));gap:.85rem;align-items:stretch}
.review-card{display:grid;grid-template-rows:auto auto minmax(4.2rem,1fr) auto;gap:.62rem;min-width:0;padding:.9rem .95rem;border:1px solid color-mix(in srgb,var(--border) 66%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 74%, transparent);box-shadow:0 10px 24px color-mix(in srgb,#000 9%, transparent);color:inherit;text-decoration:none;transition:background .16s ease,border-color .16s ease,transform .16s ease}
.review-card:hover,.review-card:focus-visible{border-color:color-mix(in srgb,var(--accent) 42%, var(--border));background:color-mix(in srgb,var(--surface) 88%, transparent);transform:translateY(-1px);outline:none}
.review-card-topline{display:flex;align-items:center;justify-content:space-between;gap:.7rem;min-width:0}
.review-card-action{flex:0 0 auto}
.review-card-date{color:var(--text-secondary);font-size:.82rem;white-space:nowrap}
.review-card-title{margin:0;min-width:0;font-family:'Inter',system-ui,sans-serif;font-size:1.02rem;font-weight:750;line-height:1.35;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.review-card:hover .review-card-title,.review-card:focus-visible .review-card-title{text-decoration:underline}
.review-card-note{margin:0;color:var(--text-secondary);font-size:.94rem;line-height:1.58;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.review-card-footer{display:grid;gap:.72rem;align-self:end}
.review-card-tags{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;min-width:0}
.review-card-empty{margin:0}
.gallery-filter-grid{display:grid;grid-template-columns:var(--gallery-filter-columns);gap:var(--gallery-filter-gap,1rem);align-items:end}
.gallery-round-action{display:inline-grid;place-items:center;padding:0;line-height:1;color:var(--text-secondary);text-decoration:none}
.gallery-round-action:hover{background:color-mix(in srgb,var(--surface) 88%, transparent);color:var(--text)}
.gallery-round-action.is-active{color:#C45A6B;background:color-mix(in srgb,#C45A6B 18%, var(--surface));border-color:color-mix(in srgb,#C45A6B 42%, var(--border))}
.gallery-round-action-delete:hover{color:#A35157;border-color:color-mix(in srgb,#A35157 42%, var(--border))}
/* Music playlist gallery */
.music-playlist-grid{align-items:start}
.music-playlist-filter-grid,.music-track-filter-grid{--gallery-filter-columns:minmax(16rem,1.2fr) minmax(13rem,.9fr) auto;--gallery-filter-gap:.8rem}
.music-playlist-card{grid-template-rows:auto auto auto auto auto auto}
.music-playlist-cover{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;width:100%;overflow:hidden;border:1px solid color-mix(in srgb,var(--border) 66%, transparent);border-radius:6px;background:color-mix(in srgb,var(--surface) 62%, transparent);color:var(--text-secondary);text-decoration:none}
.music-playlist-cover img{display:block;width:100%;height:100%;object-fit:cover}
.music-playlist-cover.is-empty span{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}
.music-playlist-card .review-card-title a{color:inherit;text-decoration:none}
.music-playlist-card .review-card-title a:hover{text-decoration:underline}
.music-playlist-card-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:start}
.music-playlist-card-heading .review-card-title{margin:0}
.music-playlist-card-actions{display:flex;align-items:center;gap:.35rem;margin-left:auto}
.music-playlist-card-actions form{margin:0}
.music-playlist-favorite-pill,.music-playlist-delete-pill{width:2rem;height:2rem}
.music-playlist-heart,.music-playlist-icon{display:grid;place-items:center;width:1rem;height:1rem;line-height:1;color:var(--text)}
.music-playlist-icon img,.music-playlist-icon svg{display:block;width:1rem;height:1rem}
.music-playlist-badges{min-height:1.8rem}
.music-playlist-profile-form{display:grid;gap:.55rem}
.music-playlist-profile-form textarea{min-height:4.4rem;resize:vertical}
.music-playlist-sync-form{display:none}
.music-playlist-card-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}
.switch-row.compact{display:flex;align-items:center;gap:.5rem;margin:0;color:var(--text-secondary);font-size:.9rem;font-weight:650}
.switch-row.compact input{width:auto}
/* Music track table */
.music-gallery-table{table-layout:fixed}
.music-gallery-table th:nth-child(1){width:28%}
.music-gallery-table th:nth-child(2){width:22%}
.music-gallery-table th:nth-child(3){width:14%}
.music-gallery-table th:nth-child(4){width:36%}
.music-gallery-table textarea{width:100%;min-height:var(--control-height);height:var(--control-height);resize:vertical}
.music-gallery-table select,.music-gallery-table input[type="text"]{width:100%;min-width:0}
.music-track-summary-row{cursor:pointer}
.music-track-summary-row:hover,.music-track-summary-row:focus-visible,.music-track-summary-row.is-open{background:color-mix(in srgb,var(--surface) 56%, transparent);outline:none}
.music-track-toggle{display:flex;align-items:center;gap:.5rem;width:100%;padding:0;border:none;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}
.music-track-toggle-icon{display:inline-grid;place-items:center;flex:0 0 auto;width:1.35rem;height:1.35rem;border:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-radius:999px;color:var(--text-secondary);font-size:.92rem;font-weight:750;line-height:1}
.music-track-summary-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:750}
.music-note-excerpt{margin:0;color:var(--text-secondary);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.music-track-detail-row td{padding:0;border-top:none;background:color-mix(in srgb,var(--surface) 42%, transparent)}
/* Music track drawer */
.music-track-drawer{display:grid;gap:1rem;padding:1rem 1.1rem 1.15rem}
.music-track-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;min-width:0}
.music-track-drawer-head h3{margin:0;min-width:0;font-family:'Inter',system-ui,sans-serif;font-size:1rem;font-weight:750;letter-spacing:0;line-height:1.4}
.music-track-drawer-head h3 a{color:inherit;text-decoration:none}
.music-track-drawer-head h3 a:hover{text-decoration:underline}
.music-track-drawer-head h3 span{display:block;color:var(--text-secondary);font-size:.9rem;font-weight:550}
.music-track-editor-form{display:grid;grid-template-columns:minmax(8rem,.7fr) minmax(16rem,1.6fr) minmax(10rem,1fr) minmax(10rem,1fr) auto auto;gap:.85rem;align-items:end;margin:0}
.music-track-editor-field{display:grid;gap:.35rem;min-width:0}
.music-track-editor-field label{margin:0;color:var(--text-secondary);font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;font-weight:650}
.music-track-editor-save,.music-track-editor-delete{display:flex;align-items:center;align-self:end;min-height:var(--control-height)}
.music-track-editor-delete{justify-content:center}
.music-track-delete-form{display:none}
.music-track-ai-comments{display:grid;gap:.35rem;min-width:0}
.music-track-ai-comments h4{margin:0;color:var(--text-secondary);font-family:'Inter',system-ui,sans-serif;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.music-ai-note-excerpt{margin:.42rem 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media (max-width: 1080px){.music-track-editor-form{grid-template-columns:1fr}.music-track-drawer-head{display:grid}}
.curator-control-shell{gap:1.15rem}
.curator-control-section{display:grid;gap:.85rem;padding:0 0 1.15rem;border-bottom:1px solid color-mix(in srgb,var(--border) 68%, transparent)}
.curator-control-section:last-of-type{border-bottom:none;padding-bottom:.4rem}
.curator-control-section h3{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:1.04rem;font-weight:750;letter-spacing:0}
.curator-automation-form{display:grid;gap:.9rem}
.curator-settings-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:.55rem}
.curator-toggle-stack{display:grid;gap:.22rem}
.curator-setting-row{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin:0}
.curator-setting-row .meta{flex:1 1 18rem}
.curator-field-block{display:grid;gap:.45rem;margin-top:.25rem}
.curator-field-header{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap}
.curator-disabled-setting{margin:0}
.curator-disabled-setting .switch-control{opacity:.58}
.curator-inline-label{margin:0;color:var(--text);font-weight:600}
.curator-switch-row .switch-field{min-height:2.45rem}
.curator-timing-row{display:grid;grid-template-columns:minmax(8.5rem,11rem) minmax(10rem,13rem);gap:.75rem;align-items:center}
.curator-timing-row input,.curator-timing-row select{min-width:0}
.curator-save-row{display:flex;justify-content:flex-start}
.curator-save-row .toolbar-button,.curator-maintenance-form > .toolbar-button{justify-self:start;width:auto;min-width:13rem}
.curator-maintenance-form{display:grid;gap:.85rem;align-items:start}
.curator-section-copy{margin:-.35rem 0 .1rem}
.curator-maintenance-options{display:grid;gap:.18rem}
.curator-maintenance-options .memory-choice-row{max-width:28rem}
.curator-submit-status{margin:-.2rem 0 0;color:var(--text-secondary)}
.memory-map-page{gap:1rem}
.memory-map-shell{display:grid;grid-template-columns:1fr;gap:1rem;align-items:start}
.memory-map-visual-card,.memory-map-toolbar,.memory-map-key-strip,.memory-map-main-grid{width:100%;max-width:100%;margin:0;box-sizing:border-box}
.memory-map-canvas-card,.memory-map-detail-card{padding:1rem 1.1rem}
.memory-map-top-note{margin:.45rem 0 0;text-align:center;color:var(--text-secondary)}
.memory-map-key-strip{display:grid;gap:.1rem;place-items:center;padding:.8rem 0 .1rem}
.memory-map-toolbar .memory-toolbar-group{align-items:center;min-width:0}
.memory-map-toolbar .toolbar-row.filters{justify-content:center}
.memory-map-toolbar .toolbar-group{gap:.72rem;min-width:0}
.memory-map-toolbar .toolbar-field.search{flex:1 1 15rem;max-width:22rem;min-width:0}
.memory-map-toolbar .toolbar-field.select{flex:0 1 10.75rem;min-width:9rem}
.memory-map-toolbar .toolbar-button{flex:0 0 auto;align-self:end;white-space:nowrap;min-width:7.4rem}
.memory-map-filter-field label{margin:0 0 .28rem;color:var(--text-secondary);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.memory-map-main-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,24rem);gap:1rem;align-items:stretch}
.memory-map-canvas-wrap{position:relative;min-height:32rem;border:1px solid color-mix(in srgb,var(--border) 72%, transparent);border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 98%, #f9fbfe 2%),color-mix(in srgb,var(--surface-2) 94%, #e7edf5 6%));overflow:hidden}
html[data-theme="dark"] .memory-map-canvas-wrap{border-color:#364154;background:#12161D}
.memory-map-svg{position:relative;z-index:1;display:block;width:100%;height:32rem;cursor:grab;touch-action:none}
.memory-map-svg [data-memory-map-lines]{mix-blend-mode:normal}
.memory-map-svg [data-node-id]{transition:opacity .22s ease,transform .22s ease}
.memory-map-tooltip{position:absolute;z-index:4;display:grid;gap:.18rem;max-width:16rem;padding:.58rem .72rem;border-radius:12px;background:color-mix(in srgb,var(--bg) 86%, #020617 14%);color:var(--text);font-size:.84rem;line-height:1.45;border:1px solid color-mix(in srgb,var(--border) 70%, transparent);pointer-events:none}
.memory-map-tooltip[hidden]{display:none!important}
.memory-map-tooltip strong{font-family:'Inter',system-ui,sans-serif;font-size:.88rem;font-weight:650}
.memory-map-tooltip span{color:inherit;opacity:.88}
.memory-map-mobile-selection{display:none;align-items:start;justify-content:space-between;gap:.75rem;padding:.8rem .95rem 0}
.memory-map-mobile-selection-label{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);font-weight:700}
.memory-map-mobile-selection strong{display:block;font-size:.98rem;line-height:1.4;color:var(--text)}
.memory-map-mobile-selection[data-state="empty"] strong{color:var(--text-secondary);font-weight:500}
.memory-map-legend{display:flex;align-items:center;justify-content:center;gap:.55rem .9rem;flex-wrap:wrap;padding:0 .95rem;color:var(--text-secondary);font-size:.82rem}
.memory-map-legend-item{display:inline-flex;align-items:center;gap:.34rem;white-space:nowrap}
.memory-map-legend-dot{width:.52rem;height:.52rem;border-radius:999px;background:var(--memory-map-legend-color);box-shadow:0 0 10px color-mix(in srgb,var(--memory-map-legend-color) 42%, transparent)}
.memory-map-inline-stats{display:flex;align-items:center;justify-content:center;gap:.36rem;flex-wrap:wrap;padding:.4rem .95rem 0;color:var(--text-secondary);font-size:.82rem}
.memory-map-inline-stats > span{display:inline-flex;align-items:baseline;gap:.28rem;white-space:nowrap}
.memory-map-inline-stats > span:not(:last-child)::after{content:"•";margin-left:.36rem;color:color-mix(in srgb,var(--text-secondary) 55%, transparent)}
.memory-map-inline-stats strong{color:var(--text);font-size:.9rem}
.memory-map-detail-card{display:grid;gap:.85rem;align-content:start}
.memory-map-detail-card h3{margin:0}
.memory-map-detail-empty{display:grid;gap:.5rem}
.memory-map-detail-empty[hidden],.memory-map-detail-content[hidden]{display:none!important}
.memory-map-detail-empty p{margin:0}
.memory-map-detail-empty-title{color:var(--text);font-weight:700}
.memory-map-reference-title{margin:.9rem 0 .2rem;color:var(--text-secondary);font-family:'Inter',system-ui,sans-serif;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase}
.memory-map-reference-grid{display:flex;flex-wrap:wrap;gap:.42rem}
.memory-map-reference-card{display:inline-flex;align-items:baseline;gap:.32rem;padding:.38rem .52rem;border:1px solid color-mix(in srgb,var(--border) 58%, transparent);border-radius:3px;background:color-mix(in srgb,var(--surface-2) 24%, transparent)}
.memory-map-reference-card span{color:var(--text-secondary);font-size:.74rem;font-weight:700}
.memory-map-reference-card strong{color:var(--text);font-size:.88rem;line-height:1.1}
.memory-map-detail-meta{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.35rem .8rem;margin:0}
.memory-map-detail-meta dt{margin:0;color:var(--text-secondary);font-size:.84rem}
.memory-map-detail-meta dd{margin:0;color:var(--text);overflow-wrap:anywhere}
.memory-map-detail-excerpt{margin:0;max-width:58ch;color:var(--text);line-height:1.72}
.memory-map-detail-link{width:100%}
.memory-map-empty-state{display:grid;gap:.55rem;place-items:start;padding:1rem 0}
.memory-map-empty-state h3{margin:0}
.schedule-feature-grid{display:grid;grid-template-columns:minmax(14rem,.8fr) minmax(0,1.2fr);gap:1.25rem;align-items:start;margin-bottom:1rem}
.schedule-feature-fields{display:grid;gap:.75rem}
.schedule-inline-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}
.schedule-inline-fields-triple{grid-template-columns:repeat(3,minmax(0,1fr))}
.schedule-inline-fields-quad{grid-template-columns:repeat(4,minmax(0,1fr))}
.admin-inline-fields{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem;align-items:end}
.schedule-meta-cell{display:grid;gap:.1rem}
.schedule-meta-cell strong{font-size:.95rem;font-weight:600}
.schedule-meta-cell span{color:var(--text-secondary);font-size:.88rem}
.schedule-inline-actions{display:flex;align-items:flex-end;gap:1rem;flex-wrap:wrap}
.music-import-row .music-import-source{width:min(100%,24rem);flex:1 1 24rem}
.feature-toggle-pill{position:relative;display:inline-grid;place-items:center;width:2.65rem;height:2.65rem;border-radius:999px;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);background:color-mix(in srgb,var(--surface) 74%, transparent);cursor:pointer;transition:background .16s ease,border-color .16s ease,opacity .16s ease;color:var(--text)}
.feature-toggle-pill input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
.feature-toggle-pill:hover{border-color:color-mix(in srgb,var(--accent) 40%, var(--border) 60%);background:color-mix(in srgb,var(--surface) 88%, transparent)}
.feature-toggle-pill.is-active,.feature-toggle-pill:has(input:checked){background:color-mix(in srgb,var(--accent) 18%, var(--surface) 82%);border-color:color-mix(in srgb,var(--accent) 38%, var(--border) 62%)}
.feature-toggle-pill-icon{display:grid;place-items:center;width:1rem;height:1rem;color:var(--text)}
.feature-toggle-pill-icon img,.feature-toggle-pill-icon svg{display:block;width:100%;height:100%}
.feature-toggle-pill-label{display:none}
.channel-mode-assignment-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:.5rem .75rem;margin-top:.8rem}
.channel-mode-assignment-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(10rem,14rem);gap:.65rem;align-items:center;padding:.45rem .55rem;border:1px solid color-mix(in srgb,var(--border) 58%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 68%, transparent)}
.channel-mode-assignment-label{display:flex;align-items:center;gap:.45rem;min-width:0}
.channel-mode-assignment-label strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.92rem}
.channel-mode-assignment-label .badge{flex:0 0 auto}
.channel-mode-assignment-control{display:grid;gap:.15rem;min-width:0}
.channel-mode-assignment-control select{width:100%;min-height:2.2rem;height:2.2rem;padding-block:.28rem}
.channel-mode-save-status:empty{display:none}
.mode-editor-heading{margin-bottom:.65rem}
.mode-editor-row > td{padding:.9rem .7rem 1rem}
.mode-inline-editor{display:grid;gap:.75rem;min-width:0;max-width:100%;box-sizing:border-box}
.mode-inline-editor form{display:grid;gap:.75rem;min-width:0;max-width:100%}
.mode-inline-editor input,.mode-inline-editor select,.mode-inline-editor textarea{min-width:0}
.mode-editor-fields{grid-template-columns:repeat(3,minmax(0,1fr))}
.field-label-with-help{display:inline-flex;align-items:center;gap:.45rem;width:max-content;max-width:100%;position:relative}
.field-help{position:relative;display:inline-flex;align-items:center;justify-content:center;width:1.1rem;height:1.1rem;border:1px solid color-mix(in srgb,var(--border) 72%, transparent);border-radius:999px;color:var(--text-secondary);font-family:Inter,system-ui,sans-serif;font-size:.72rem;font-weight:750;line-height:1;cursor:help;background:color-mix(in srgb,var(--surface) 78%, transparent)}
.field-help > span{display:block;line-height:1;transform:translateX(.02em)}
.field-help:hover,.field-help:focus-visible{color:var(--text);border-color:color-mix(in srgb,var(--accent) 48%, var(--border) 52%);background:color-mix(in srgb,var(--accent) 14%, var(--surface) 86%);outline:none}
.field-help::after{content:attr(data-help);position:absolute;left:var(--help-left,50%);bottom:calc(100% + .55rem);z-index:80;width:max-content;max-width:min(19rem,calc(100vw - 2rem));padding:.55rem .68rem;border:1px solid color-mix(in srgb,var(--border) 72%, transparent);border-radius:6px;background:color-mix(in srgb,var(--bg) 88%, #020617 12%);box-shadow:0 12px 28px rgba(0,0,0,.2);color:var(--text);font-size:.78rem;font-weight:500;line-height:1.4;text-transform:none;letter-spacing:0;text-align:left;white-space:normal;transform:translate(var(--help-shift,-50%),.25rem);opacity:0;pointer-events:none;transition:opacity .14s ease,transform .14s ease}
.field-help:hover::after,.field-help:focus-visible::after,.field-help.is-open::after{opacity:1;transform:translate(var(--help-shift,-50%),0)}
.backup-action-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;align-items:start;margin:0 0 1.35rem}
.backup-action-row .file-picker-row{display:grid;grid-template-columns:1fr;gap:.35rem;align-items:start;min-width:0}
.backup-action-row .file-picker-button,.backup-action-row .toolbar-button{width:100%;min-width:0}
.backup-action-row .file-picker-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cleanup-filter-row{display:grid;grid-template-columns:minmax(10rem,1fr) minmax(10rem,1fr) minmax(8rem,.92fr) auto auto;gap:.75rem;align-items:end;margin:0 0 1rem}
.cleanup-filter-row .toolbar-button,.cleanup-filter-row input,.cleanup-filter-row select{min-height:var(--control-height);height:var(--control-height)}
.prune-action-row{display:grid;grid-template-columns:max-content minmax(8rem,12rem) max-content;gap:.75rem;align-items:center;margin:0}
.prune-action-row label{margin:0}
.prune-action-row .toolbar-button,.prune-action-row select{min-height:var(--control-height);height:var(--control-height)}
.user-id-settings-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:1rem;align-items:end}
.user-presence-toggle{align-self:end;margin:0 0 .35rem;white-space:nowrap}
.mode-memory-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,.56fr);gap:1rem;align-items:end;margin:.1rem 0 .9rem}
.mode-memory-grid > div{display:grid;gap:.35rem}
.mode-memory-pill{width:auto;min-width:5.4rem;height:auto;min-height:2.15rem;padding:.42rem .72rem;text-align:center;font-size:.84rem;font-weight:600}
.mode-memory-pill span{display:block;width:100%;line-height:1.2;text-align:center}
.sensitivity-scale{display:inline-grid;grid-template-columns:repeat(3,minmax(5.4rem,1fr));gap:.24rem;padding:.2rem;border:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-radius:999px;background:color-mix(in srgb,var(--surface) 64%, transparent);max-width:100%}
.sensitivity-scale input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
.sensitivity-scale label{display:grid;place-items:center;margin:0;min-height:2.15rem;padding:.42rem .72rem;border-radius:999px;color:var(--text-secondary);font-size:.84rem;font-weight:650;text-align:center;cursor:pointer;transition:background .16s ease,color .16s ease}
.sensitivity-scale label:hover{color:var(--text);background:color-mix(in srgb,var(--surface) 88%, transparent)}
.sensitivity-scale.sensitivity-low label[for$="-low"],
.sensitivity-scale.sensitivity-medium label[for$="-low"],
.sensitivity-scale.sensitivity-medium label[for$="-medium"],
.sensitivity-scale.sensitivity-high label[for$="-low"],
.sensitivity-scale.sensitivity-high label[for$="-medium"],
.sensitivity-scale.sensitivity-high label[for$="-high"]{color:var(--text);background:color-mix(in srgb,var(--accent) 18%, var(--surface) 82%)}
.sensitivity-scale.sensitivity-low label[for$="-low"],
.sensitivity-scale.sensitivity-medium label[for$="-medium"],
.sensitivity-scale.sensitivity-high label[for$="-high"]{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 42%, var(--border) 58%)}
.tool-icon-row{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap}
.tool-icon-badge{display:grid;place-items:center;width:1.9rem;height:1.9rem;border-radius:999px;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);background:color-mix(in srgb,var(--surface) 74%, transparent);color:var(--text)}
.tool-icon-badge img,.tool-icon-badge svg{display:block;width:.9rem;height:.9rem}
.schedule-status-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.schedule-status-actions{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.schedule-status-toggle{display:flex;align-items:center;gap:.75rem}
.proactive-pack-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.proactive-pack-form{display:grid;gap:.35rem}
.proactive-pack-inline-row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.proactive-pack-inline-form{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin:0}
.proactive-pack-inline-form input[type="file"]{width:auto;max-width:min(100%,22rem)}
.proactive-pack-import-form{flex:1 1 22rem}
.proactive-pack-block input[type="checkbox"]{width:auto;min-height:auto}
.proactive-filter-row{margin:0 0 1rem;padding:.1rem 0 .35rem;align-items:end;justify-content:space-between;gap:.9rem}
.proactive-filter-row .toolbar-group{gap:.75rem}
.proactive-filter-row .toolbar-field.select{width:auto;min-width:8.5rem;max-width:none}
.proactive-filter-row .toolbar-field.select select{min-width:8.5rem}
.proactive-filter-row .toolbar-field label{margin:.15rem 0 .3rem;color:var(--text-secondary);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.proactive-filter-row .toolbar-button,
.proactive-filter-row button.secondary{min-width:6.9rem}
.proactive-pack-block{display:grid;gap:.75rem}
.proactive-pack-block > div:first-child{display:grid;gap:.15rem}
.proactive-pack-block > div:first-child p{margin:0}
.proactive-pack-toolbar-row{padding-top:.15rem;align-items:center;justify-content:flex-start;gap:.9rem 1rem}
.proactive-pack-toolbar-row .proactive-pack-inline-form{flex:0 1 auto}
.proactive-pack-toolbar-row .proactive-pack-import-form{flex:1 1 26rem}
.proactive-pack-toolbar-row .file-picker-row{min-height:46px}
.proactive-pack-toolbar-row .file-picker-button{min-width:7.4rem}
.proactive-pack-toolbar-row .file-picker-label{min-width:10rem;max-width:18rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.action-select-cell{width:1%;white-space:nowrap}
.action-select-cell input[type="checkbox"]{appearance:none;-webkit-appearance:none;display:inline-grid;place-content:center;width:1.1rem;min-width:1.1rem;height:1.1rem;min-height:1.1rem;padding:0;margin:0;border:1px solid color-mix(in srgb,var(--border) 76%, transparent);border-radius:4px;background:color-mix(in srgb,var(--surface) 64%, transparent);cursor:pointer;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease}
.action-select-cell input[type="checkbox"]::before{content:"";width:.62rem;height:.62rem;background:white;clip-path:polygon(14% 52%,0 66%,38% 100%,100% 18%,86% 4%,37% 63%);transform:scale(0);transition:transform .14s ease}
.action-select-cell input[type="checkbox"]:hover{border-color:color-mix(in srgb,var(--accent) 44%, var(--border) 56%);background:color-mix(in srgb,var(--surface) 80%, transparent)}
.action-select-cell input[type="checkbox"]:checked{background:var(--accent);border-color:var(--accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 16%, transparent)}
.action-select-cell input[type="checkbox"]:checked::before{transform:scale(1)}
.action-select-cell input[type="checkbox"]:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 28%, transparent)}
.image-settings-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.2fr) auto;gap:1rem;align-items:end}
.image-settings-row-balanced{grid-template-columns:repeat(3,minmax(0,1fr))}
.image-settings-row-balanced .image-settings-save{grid-column:1 / -1;justify-self:start}
.audio-settings-model-row{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:1rem}
.audio-settings-voice-row{grid-template-columns:minmax(0,2fr) auto}
.audio-advanced-settings{margin-top:1rem}
.audio-advanced-settings-panel{display:grid;gap:.85rem;padding:.85rem 0 0}
.audio-advanced-settings-panel[hidden]{display:none!important}
.audio-settings-v3-tags-row{display:grid;gap:.35rem}
.audio-settings-v3-tags-row[hidden]{display:none!important}
.audio-voice-settings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;align-items:end}
.audio-voice-slider{display:grid;gap:.45rem}
.audio-voice-slider label{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:0;color:var(--text-secondary);font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.audio-voice-slider label strong{color:var(--text);font-size:.86rem;letter-spacing:0;text-transform:none}
.audio-voice-slider input[type="range"]{width:100%;min-height:2rem;accent-color:var(--accent)}
.audio-speaker-boost-toggle{justify-content:flex-start;margin:.1rem 0 0}
.image-settings-toggle{margin:.1rem 0 .35rem}
.image-settings-save{display:grid;gap:.35rem;align-self:end}
.image-settings-save label{visibility:hidden;margin-bottom:.35rem}
.image-settings-save button{white-space:nowrap}
.audio-gallery-save-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem 1rem;margin:.2rem 0 .8rem}
.admin-inline-fields .image-settings-save{justify-self:start}
.schedule-control-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;align-items:end}
.schedule-submit-row{justify-content:flex-start;margin:0}
.form-divider{height:1px;background:var(--border);margin:1.2rem 0}
.settings-form textarea{min-height:120px}
.settings-form form.stack:has(.image-settings-toggle),
.settings-form form.stack:has(.gallery-filter-grid){gap:.7rem}
.settings-form .toolbar{margin-top:1rem}
.companion-hero{display:flex;align-items:center;gap:1.5rem;background:linear-gradient(135deg,color-mix(in srgb,var(--accent-secondary) 16%,var(--surface)),color-mix(in srgb,var(--accent) 10%,var(--surface)));border:1px solid color-mix(in srgb,var(--accent-secondary) 26%,var(--border) 52%);border-radius:14px;padding:1.4rem 1.5rem;margin-bottom:.8rem}
.companion-hero-avatar-col{display:flex;flex-direction:column;align-items:center;gap:.5rem;flex-shrink:0}
.companion-hero-avatar{width:112px;height:112px;border-radius:50%;overflow:hidden;background:color-mix(in srgb,var(--accent-secondary) 26%,var(--surface-2));border:2.5px solid color-mix(in srgb,var(--accent-secondary) 38%,var(--border) 40%);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.12);flex-shrink:0}
.companion-hero-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}
.companion-hero-avatar-placeholder{display:flex;align-items:center;justify-content:center;color:color-mix(in srgb,var(--accent-secondary) 65%,var(--text-secondary))}
.companion-hero-file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.companion-hero-upload-form{position:relative;display:flex;flex-direction:column;align-items:center;gap:.35rem;width:100%}
.companion-hero-change-btn{background:color-mix(in srgb,var(--surface) 62%,transparent);border:1px solid color-mix(in srgb,var(--border) 68%,transparent);color:var(--text-secondary);font-size:.8rem;font-weight:500;padding:.35rem .72rem;cursor:pointer;width:100%;text-align:center;border-radius:4px;transition:background .15s ease,color .15s ease}
.companion-hero-change-btn:hover{background:color-mix(in srgb,var(--surface) 82%,transparent);color:var(--text)}
.companion-hero-remove-form{width:100%}
.companion-hero-remove-btn{background:transparent;border:none;color:var(--text-secondary);font-size:.76rem;padding:.2rem 0;cursor:pointer;width:100%;text-align:center;opacity:.6;text-decoration:underline;text-underline-offset:2px}
.companion-hero-remove-btn:hover{opacity:1;background:transparent}
.companion-hero-info-col{flex:1;min-width:0}
.companion-hero-name{font-size:1.55rem;font-weight:700;color:var(--text);line-height:1.15;margin-bottom:.3rem;word-break:break-word}
.companion-hero-hint{font-size:.85rem;color:var(--text-secondary);line-height:1.45}
.companion-names{background:color-mix(in srgb,var(--accent-secondary) 9%,var(--surface) 72%);border:1px solid color-mix(in srgb,var(--accent-secondary) 24%,var(--border) 58%);border-radius:10px;padding:1.25rem 1.4rem 1.3rem;margin-bottom:.4rem}
.companion-names-eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--accent-secondary);margin-bottom:.75rem;opacity:.85}
.companion-names .identity-grid{margin-top:0}
.companion-textarea-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.1rem}
.companion-field-card{background:color-mix(in srgb,var(--surface) 62%,transparent);border:1px solid color-mix(in srgb,var(--border) 55%,transparent);border-radius:8px;padding:1rem 1.1rem 1.15rem;display:flex;flex-direction:column;gap:.4rem}
.companion-field-card .field-label-row{margin-bottom:0}
.companion-field-card textarea{flex:1;min-height:140px}
.behaviour-tab-intro{margin:0 0 .8rem;max-width:58rem}
.custom-reaction-emoji-picker{display:grid;gap:.7rem;margin-top:.75rem}
.custom-reaction-emoji-count{margin:0}
.custom-reaction-emoji-grid{display:grid;gap:.55rem}
.custom-reaction-emoji-row{display:grid;grid-template-columns:minmax(12rem,.8fr) minmax(15rem,1fr);gap:.75rem;align-items:center;padding:.55rem .65rem;border:1px solid color-mix(in srgb,var(--border) 62%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 58%, transparent);transition:background .16s ease,border-color .16s ease,opacity .16s ease}
.custom-reaction-emoji-row.is-selected{border-color:color-mix(in srgb,var(--accent) 52%, var(--border));background:color-mix(in srgb,var(--accent) 10%, var(--surface))}
.custom-reaction-emoji-row.is-missing{opacity:.72}
.custom-reaction-emoji-choice{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:.55rem;align-items:center;margin:0;min-width:0}
.custom-reaction-emoji-toggle{position:absolute;opacity:0;pointer-events:none;width:1px!important;height:1px!important;min-height:0!important;padding:0!important;margin:0!important}
.custom-reaction-emoji-check{display:grid;place-items:center;width:1.05rem;height:1.05rem;border:1px solid color-mix(in srgb,var(--border) 78%, transparent);border-radius:4px;background:color-mix(in srgb,var(--surface) 68%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--surface) 36%, transparent);transition:background .16s ease,border-color .16s ease}
.custom-reaction-emoji-check::after{content:"";width:.45rem;height:.45rem;border-radius:2px;background:transparent;transition:background .16s ease}
.custom-reaction-emoji-choice:hover .custom-reaction-emoji-check{border-color:color-mix(in srgb,var(--accent) 46%, var(--border))}
.custom-reaction-emoji-toggle:focus-visible + .custom-reaction-emoji-check{outline:2px solid color-mix(in srgb,var(--accent) 72%, transparent);outline-offset:2px}
.custom-reaction-emoji-toggle:checked + .custom-reaction-emoji-check{border-color:color-mix(in srgb,var(--accent) 58%, var(--border));background:color-mix(in srgb,var(--accent) 18%, var(--surface))}
.custom-reaction-emoji-toggle:checked + .custom-reaction-emoji-check::after{background:var(--accent)}
.custom-reaction-emoji-toggle:disabled + .custom-reaction-emoji-check{opacity:.45}
.custom-reaction-emoji-choice strong{display:block;overflow-wrap:anywhere}
.custom-reaction-emoji-choice small{display:block;color:var(--muted);font-size:.78rem;margin-top:.1rem}
.custom-reaction-emoji-preview{width:1.85rem;height:1.85rem;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--surface-2) 78%, transparent);font-weight:700;color:var(--muted)}
.custom-reaction-emoji-preview img{width:1.5rem;height:1.5rem;object-fit:contain}
.custom-reaction-emoji-mood{display:block;margin:0}
.custom-reaction-emoji-mood input{min-height:2.35rem;padding:.55rem .7rem}
.command-save-row{margin-top:1rem}
.model-table-wrap{border:none;border-radius:0;overflow:auto;background:transparent}
.model-table{width:100%;border-collapse:collapse;min-width:720px;table-layout:fixed}
.model-table th,.model-table td{padding:.82rem .7rem;border-top:1px solid var(--border);vertical-align:top}
.model-table thead th{border-top:none;text-align:left;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;background:color-mix(in srgb,var(--surface) 96%, var(--surface-2))}
.model-table td.notes{color:var(--text-secondary);font-size:.92rem}
.model-table td.table-detail-cell,.memory-table td.table-detail-cell{line-height:1.58;overflow-wrap:break-word;word-break:normal}
.heartbeat-history-table th:nth-child(1),
.heartbeat-history-table td:nth-child(1){width:3.4rem}
.heartbeat-history-table th:nth-child(2),
.heartbeat-history-table td:nth-child(2){width:9.5rem;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
.heartbeat-history-table th:nth-child(3),
.heartbeat-history-table td:nth-child(3){width:7.5rem;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
.heartbeat-history-table th:nth-child(4),
.heartbeat-history-table td:nth-child(4){width:auto;white-space:normal}
.heartbeat-actions-table td:nth-child(4){overflow-wrap:anywhere;word-break:break-word}
.heartbeat-actions-table th:nth-child(5),
.heartbeat-actions-table th:nth-child(6),
.heartbeat-actions-table th:nth-child(7),
.heartbeat-actions-table td:nth-child(5),
.heartbeat-actions-table td:nth-child(6),
.heartbeat-actions-table td:nth-child(7){white-space:nowrap}
.target-meta{display:block;margin-top:.2rem;font-size:.82rem}
.toolbar-button{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;padding:.7rem .95rem;border:none;border-radius:3px;background:var(--accent);color:white;text-decoration:none;box-sizing:border-box;min-height:var(--control-height);line-height:1.35;font-size:1rem;font-weight:600;text-align:center}
.toolbar-button.secondary{background:color-mix(in srgb,var(--surface) 52%, transparent);color:var(--text);border:1px solid color-mix(in srgb,var(--border) 70%, transparent)}
.toolbar-button.danger{background:#A35157;color:white;border:1px solid color-mix(in srgb,#A35157 75%, var(--border))}
.toolbar-button[aria-disabled="true"],.toolbar-button.is-disabled,button.toolbar-button:disabled{opacity:.7;cursor:default;background:transparent;color:var(--text-secondary)}
.toolbar-button.is-loading::before{content:"";width:.9em;height:.9em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:button-spin .8s linear infinite}
@keyframes button-spin{to{transform:rotate(360deg)}}
.toolbar-group{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center}
.toolbar-field{flex:none}
.toolbar-field.search{flex:1 1 24rem;min-width:16rem;max-width:28rem}
.toolbar-field.search input{width:100%}
.toolbar-field.select{width:10rem}
.toolbar-field.select select{width:100%}
.lite-toolbar .grow{flex:1 1 220px}
.lite-toolbar .push{margin-left:auto}
.toolbar-row{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center;justify-content:space-between}
.toolbar-row.primary{justify-content:flex-start}
.toolbar-row.filters{flex-wrap:nowrap;align-items:center}
.toolbar-row.filters .toolbar-group{flex-wrap:nowrap;flex:1 1 auto}
.toolbar-row.filters .toolbar-group label{white-space:nowrap}
.toolbar-row.pagination{justify-content:center;width:100%}
.toolbar-row.pagination .toolbar-group{display:grid;grid-template-columns:minmax(5.5rem,auto) auto minmax(5.5rem,auto);gap:.65rem;align-items:center;justify-content:center}
.inline-control-row{display:flex;flex-wrap:wrap;gap:1rem;align-items:end;justify-content:space-between}
.inline-control-row.compact{margin-top:.15rem}
.inline-control-row .toolbar-field.select{flex:1 1 14rem;max-width:16rem}
.memory-table-wrap{border:none;border-radius:0;overflow:auto;background:transparent}
.lite-main .memory-table-wrap{border:none;border-radius:0;background:transparent}
.memory-table{width:100%;border-collapse:collapse;min-width:980px}
.memory-table thead th{position:sticky;top:0;background:color-mix(in srgb,var(--surface) 96%, var(--surface-2));z-index:1;text-align:left;padding:.76rem .7rem;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)}
.memory-table tbody td{padding:.76rem .7rem;border-top:1px solid var(--border);vertical-align:top}
.memory-table th.updated-col,.memory-table td.updated-col{width:8.5rem;white-space:nowrap}
.memory-table th.actions-col,.memory-table td.actions-col{width:6rem}
.memory-table tbody tr:hover{background:var(--table-hover)}
.memory-title{font-weight:600;color:var(--text);margin:0 0 .18rem;font-size:.96rem}
.memory-title-link{color:inherit;text-decoration:none}
.memory-title-link:hover{text-decoration:underline;text-underline-offset:.12em}
.memory-content{max-width:420px;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.memory-chip-row{display:flex;flex-wrap:wrap;gap:.4rem}
.row-actions{display:flex;gap:.35rem;justify-content:flex-end}
.row-actions form{margin:0}
.icon-image{display:inline-block;width:1em;height:1em;vertical-align:middle}
.table-action-icon{display:block;width:1rem;height:1rem}
.icon-button{display:inline-flex;align-items:center;justify-content:center;width:1.9rem;height:1.9rem;padding:0;border-radius:0;background:transparent;color:var(--text-secondary);border:none;text-decoration:none}
.icon-button-wide{width:auto;padding:0 .8rem}
.icon-button:hover{background:color-mix(in srgb,var(--surface) 55%, transparent);color:var(--text)}
.icon-button img,.icon-button svg{display:block;width:1rem;height:1rem}
.image-favorite-button{width:2.2rem;height:2.2rem;border-radius:999px;background:color-mix(in srgb,var(--bg) 80%, transparent);border:1px solid color-mix(in srgb,var(--border) 70%, transparent);backdrop-filter:blur(6px);font-size:1rem;line-height:1;color:var(--text-secondary);box-shadow:0 6px 18px color-mix(in srgb,var(--bg) 45%, transparent)}
.image-favorite-form{position:absolute;right:.85rem;bottom:.85rem;z-index:2}
.image-favorite-button:hover{background:color-mix(in srgb,var(--surface) 88%, transparent);color:var(--text)}
.image-favorite-button.is-active{color:#C45A6B;background:color-mix(in srgb,#C45A6B 18%, var(--surface));border-color:color-mix(in srgb,#C45A6B 42%, var(--border))}
.image-gallery-filter-grid{--gallery-filter-columns:minmax(15rem,1.15fr) minmax(17rem,1.35fr)}
.gallery-tag-field{display:grid;gap:.35rem;min-width:0}
.gallery-tag-field label,.gallery-filter-action label{margin-bottom:.35rem}
.gallery-filter-action{display:grid;gap:.35rem;align-self:auto}
.gallery-filter-action label{visibility:hidden}
.gallery-filter-action .toolbar-button{min-width:7rem}
.gallery-filter-actions{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.filter-options-source{display:none}
.image-gallery-favorite-toggle{margin:0 0 0 auto}
[data-selected-filter-pills]{display:flex;flex-wrap:wrap;gap:.45rem;min-height:0;margin-top:.75rem}
[data-selected-filter-pills]:empty{display:none;margin-top:0}
.image-gallery-selected-action[hidden],.audio-gallery-selected-action[hidden]{display:none}
.image-gallery-feed{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.45rem;grid-auto-rows:1px;grid-auto-flow:row;align-items:start;line-height:0}
.image-gallery-item{position:relative;display:block;width:100%;line-height:0;grid-row-end:span 32}
.image-gallery-item.is-selected .image-gallery-tile{outline:3px solid color-mix(in srgb,var(--accent) 78%, white);outline-offset:-3px}
.image-gallery-tile{display:block;width:100%;box-sizing:border-box;overflow:hidden;border:none;border-radius:0;background:color-mix(in srgb,var(--surface) 58%, transparent);color:var(--text-secondary);text-decoration:none;line-height:1.35}
.image-gallery-tile:hover{background:color-mix(in srgb,var(--surface) 76%, transparent)}
.image-gallery-tile img{display:block;width:100%;height:auto;max-width:100%}
.image-gallery-tile.has-ratio:not(.is-failed):not(.is-unavailable) img{height:100%;object-fit:cover}
.image-gallery-tile.is-failed,.image-gallery-tile.is-unavailable{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.65rem;min-height:150px;padding:1rem;text-align:center}
.image-gallery-tile.is-failed img{width:3rem;height:3rem;object-fit:contain;opacity:.82}
.image-gallery-tile-actions{position:absolute;top:.45rem;right:.45rem;z-index:2;display:flex;gap:.35rem;align-items:center}
.image-gallery-tile-actions form{margin:0}
.image-gallery-favorite-pill,.image-gallery-details-pill{width:2.25rem;height:2.25rem;background:color-mix(in srgb,var(--surface) 74%, transparent);backdrop-filter:blur(8px);box-shadow:0 8px 18px color-mix(in srgb,var(--bg) 30%, transparent);font-size:1rem}
.image-gallery-details-pill{font-weight:700;font-style:italic}
.image-gallery-select-input{position:absolute;opacity:0;inline-size:1px;block-size:1px;pointer-events:none}
.image-gallery-select-input:focus-visible + .image-gallery-tile{outline:2px solid var(--accent);outline-offset:2px}
.split-panel{display:grid;grid-template-columns:1.1fr 1.4fr;gap:1rem}
.lite-main .split-panel{gap:0;padding:1rem 1.4rem}
.lite-main .split-panel > .card:first-child{border-right:1px solid var(--border);padding-right:1rem}
.lite-main .split-panel > .card:last-child{padding-left:1rem}
.lite-main .split-panel > .card{border:none;border-radius:0;background:transparent;padding-top:0;padding-bottom:0}
.empty-state{padding:1.4rem;color:var(--text-secondary)}
.image-detail-failed-state{display:flex;flex-direction:column;gap:.75rem;width:100%;aspect-ratio:1/1;margin-bottom:1rem;align-items:center;justify-content:center;text-align:center;border:1px solid var(--border)}
.image-detail-failed-state img{width:3.4rem;height:3.4rem;object-fit:contain;opacity:.82}
.image-detail-preview{display:block;width:100%;height:auto;border:1px solid var(--border);margin-bottom:1rem}
.image-detail-empty{border:1px solid var(--border);margin-bottom:1rem}
.audio-player{display:block;width:100%;accent-color:var(--accent);color-scheme:light;margin:.2rem 0 .85rem;border-radius:4px;background:color-mix(in srgb,var(--accent) 12%, var(--surface))}
.audio-player::-webkit-media-controls-panel{background:color-mix(in srgb,var(--accent) 12%, var(--surface))}
.audio-player::-webkit-media-controls-play-button,.audio-player::-webkit-media-controls-mute-button{filter:saturate(1.15)}
html[data-theme="dark"] .audio-player{color-scheme:dark}
.audio-detail-page{padding-top:1rem;padding-bottom:1rem}
.audio-detail-stack{display:grid;gap:.85rem}
.audio-detail-stack .audio-player{margin:.1rem 0 0}
.audio-detail-tags-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,1.2fr);gap:1rem;align-items:end}
.audio-detail-tags-row h3,.audio-detail-copy-block h3,.audio-detail-stack > h3{margin:0 0 .35rem}
.audio-detail-tags-form{display:grid;grid-template-columns:auto minmax(12rem,1fr) auto;gap:.6rem;align-items:end;margin:0}
.audio-detail-tags-form label{margin:0 0 .35rem}
.audio-detail-copy-block{display:grid;gap:.85rem}
.audio-detail-copy-block .meta{margin:0;white-space:pre-wrap}
.audio-detail-metadata{display:flex;flex-wrap:wrap;gap:.38rem 1.1rem;color:var(--text-secondary)}
.audio-detail-metadata span{display:inline-block}
.audio-gallery-list{display:grid;gap:0;border-top:1px solid var(--border)}
.audio-gallery-filter-grid{--gallery-filter-columns:minmax(15rem,1.35fr) minmax(12rem,.8fr)}
.audio-gallery-row{display:grid;grid-template-columns:1.6rem minmax(0,1.45fr) minmax(9rem,.65fr) minmax(16rem,1fr) 2.25rem 2.25rem;gap:1rem;align-items:center;padding:1rem 0;border-bottom:1px solid var(--border)}
.audio-gallery-row.is-selected{background:color-mix(in srgb,var(--accent) 8%, transparent);box-shadow:inset 3px 0 0 color-mix(in srgb,var(--accent) 78%, white)}
.audio-gallery-select-cell{display:flex;justify-content:center}
.audio-gallery-select-input{inline-size:1rem;block-size:1rem;accent-color:var(--accent)}
.audio-gallery-title-cell{min-width:0}
.audio-gallery-title-cell .item-title{margin-bottom:.2rem}
.audio-gallery-title-cell .meta{margin:.16rem 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.audio-gallery-player-wrap{display:flex;align-items:center;gap:.55rem;min-width:0}
.audio-gallery-player-wrap form{margin:0;flex:0 0 auto}
.audio-gallery-player-cell .audio-player{margin:0;min-width:0}
.audio-gallery-action-cell{display:flex;justify-content:center}
.audio-gallery-action-cell form{margin:0}
.audio-favorite-button,.audio-delete-button,.music-track-delete-button{width:2rem;height:2rem;border-radius:999px;background:color-mix(in srgb,var(--surface) 52%, transparent);border:1px solid color-mix(in srgb,var(--border) 70%, transparent);font-size:.96rem}
.audio-favorite-button:hover,.audio-delete-button:hover,.music-track-delete-button:hover{background:color-mix(in srgb,var(--surface) 72%, transparent)}
.audio-gallery-tags-cell .memory-chip-row{gap:.32rem}
.gallery-preview-frame{display:flex;align-items:center;justify-content:center;width:100%;height:220px;margin-bottom:.85rem;overflow:hidden;border:1px solid var(--border);background:color-mix(in srgb,var(--surface) 65%, transparent)}
.gallery-preview-frame img{display:block;max-width:100%;max-height:100%;width:auto;height:auto}
.gallery-preview-frame.is-failed{flex-direction:column;gap:.75rem;color:var(--text-secondary);text-align:center}
.gallery-preview-frame.is-failed img{width:3.2rem;height:3.2rem;object-fit:contain;opacity:.82}
.gallery-preview-frame.is-unavailable{color:var(--text-secondary);text-align:center}
.image-error-copy{overflow-wrap:anywhere;word-break:break-word}
.proactive-shell{display:grid;gap:0;padding:1rem 1.4rem;min-width:0}
.proactive-shell.flat{padding:1rem 1.4rem 0;background:transparent;border:none;border-radius:0}
.proactive-shell .panel-header{padding:0 0 1rem}
.proactive-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0}
.proactive-list{display:grid;gap:.75rem}
.proactive-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.85rem;align-items:start;padding:.9rem 0;border-top:1px solid var(--border)}
.proactive-row:first-child{border-top:none;padding-top:0}
.proactive-meta{display:flex;flex-wrap:wrap;gap:.45rem;margin:.3rem 0 .4rem}
.proactive-error-detail{margin-top:.75rem;color:var(--text)}
.proactive-row .toolbar{justify-content:flex-end}
.proactive-form textarea{min-height:110px}
.proactive-form .grid{align-items:start}
.proactive-form form{padding-bottom:1rem}
.proactive-grid > .settings-block{border:none;border-radius:0;background:transparent;padding:0}
.proactive-grid > .settings-block:first-child{padding:0 1rem 0 0;border-right:1px solid var(--border);min-width:0}
.proactive-grid > .settings-block:last-child{padding:0 0 0 1rem;min-width:0}
.proactive-grid .memory-table-wrap{border:none;border-radius:0;background:transparent}
.proactive-grid .memory-table{width:100%;min-width:0}
.proactive-grid .memory-table thead th{position:static}
.segmented-control{display:inline-flex;gap:.35rem;padding:0;border:none;border-radius:0;background:transparent}
.segmented-control input{position:absolute;opacity:0;pointer-events:none}
.segmented-control label{padding:.5rem .7rem;text-decoration:none;color:var(--text-secondary);font-size:.9rem;cursor:pointer;border:1px solid transparent;border-radius:3px;background:transparent}
.segmented-control input:checked + label{color:var(--text);border-color:color-mix(in srgb,var(--border) 72%, transparent);background:color-mix(in srgb,var(--surface) 52%, transparent)}
.proactive-inline-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem;align-items:end}
.proactive-bottom{display:grid;gap:1rem;margin-top:1rem}
.proactive-bottom-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem;align-items:end}
.proactive-bottom-row.actions{align-items:center}
.proactive-bottom-row.actions .toolbar{justify-content:flex-end;margin-top:0}
.switch-field{display:flex;align-items:center;gap:.65rem;min-height:36px}
.journal-feed{display:grid;gap:1rem}
.journal-card{padding:1.1rem 1.2rem}
.journal-date{margin:0 0 .65rem;color:var(--text-secondary);font-size:.92rem}
.journal-excerpt{margin:0;color:var(--text);line-height:1.7}
.journal-preview-prose > *{margin:.35rem 0}
.journal-preview-prose > *:first-child{margin-top:0}
.journal-preview-prose > *:last-child{margin-bottom:0}
.journal-preview-prose h2,.journal-preview-prose h3,.journal-preview-prose h4{font-size:1.02rem;line-height:1.35}
.journal-preview-prose ul,.journal-preview-prose ol{margin:.45rem 0;padding-left:1.15rem}
.journal-preview-prose li{margin:.18rem 0}
.journal-preview-prose blockquote{margin:.45rem 0;padding:.02rem 0 .02rem .75rem}
.journal-preview-prose code{font-size:.9em}
.journal-preview-prose a{color:inherit;text-underline-offset:.18em}
.journal-entry-full{max-width:860px}
.journal-prose{color:var(--text);line-height:1.75}
.journal-prose > *:first-child{margin-top:0}
.journal-prose > *:last-child{margin-bottom:0}
.journal-prose p{margin:.85rem 0}
.journal-prose ul,.journal-prose ol{margin:.85rem 0;padding-left:1.2rem}
.journal-prose li{margin:.3rem 0}
.journal-prose h2,.journal-prose h3,.journal-prose h4{margin:1.2rem 0 .5rem}
.journal-prose blockquote{margin:1rem 0;padding:.05rem 0 .05rem 1rem;border-left:3px solid color-mix(in srgb,var(--accent) 48%, var(--border));color:var(--text-secondary)}
.journal-prose code{padding:.08rem .28rem;border:1px solid color-mix(in srgb,var(--border) 70%, transparent);border-radius:3px;background:color-mix(in srgb,var(--surface-2) 70%, transparent);font-size:.92em}
.journal-prose a{color:var(--accent);text-underline-offset:.18em}
.switch-control{position:relative;display:inline-flex;width:48px;height:28px;flex:0 0 auto}
.switch-control input{position:absolute;inset:0;opacity:0;cursor:pointer}
.switch-control > span{position:absolute;inset:0;display:block;border:1px solid var(--border);border-radius:999px;background:color-mix(in srgb,var(--surface) 88%, transparent);transition:background .18s ease,border-color .18s ease}
.switch-control > span::after{content:"";position:absolute;top:50%;left:3px;width:20px;height:20px;border-radius:999px;background:var(--metallic);transform:translateY(-50%);transition:transform .18s ease, background .18s ease}
.switch-control input:checked + span{background:color-mix(in srgb,var(--accent) 18%, var(--surface) 82%);border-color:color-mix(in srgb,var(--accent) 42%, var(--border) 58%)}
.switch-control input:checked + span::after{transform:translate(20px,-50%);background:var(--accent)}
.switch-label{font-size:.95rem;line-height:1.32;color:var(--text);overflow-wrap:anywhere}
@media (max-width: 1180px){
  .image-gallery-filter-grid,
  .audio-gallery-filter-grid,
  .music-playlist-filter-grid,
  .music-track-filter-grid{grid-template-columns:minmax(14rem,1fr) minmax(15rem,1fr)}
  .gallery-filter-action{grid-column:1 / -1;justify-self:start}
}
@media (max-width: 1080px){
  .admin-shell{grid-template-columns:1fr}
  .admin-sidebar{position:static}
  .lite-shell .admin-sidebar{position:sticky;top:0;min-height:auto;border-right:none;border-bottom:1px solid color-mix(in srgb,var(--border) 68%, transparent);background:color-mix(in srgb,var(--bg) 88%, var(--surface));backdrop-filter:blur(14px);z-index:20}
  .lite-shell .sidebar-desktop{display:none}
  .lite-shell .sidebar-mobile{display:block;position:relative}
  .lite-shell .sidebar-mobile[open]::before{display:block;position:fixed;inset:4.6rem 0 0;background:rgba(10,16,24,.18);backdrop-filter:blur(2px);z-index:0}
  .lite-shell .sidebar-mobile-toggle{position:relative;z-index:2}
  .lite-shell .sidebar-mobile-panel{position:absolute;top:100%;left:0;right:0;padding:.45rem 0 1rem;border-top:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-bottom:1px solid color-mix(in srgb,var(--border) 68%, transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 98%, transparent),color-mix(in srgb,var(--surface) 90%, var(--surface-2)));box-shadow:0 18px 34px rgba(0,0,0,.12);max-height:min(calc(100vh - 4.6rem),38rem);overflow:auto;z-index:1}
  .lite-shell .sidebar-mobile .sidebar-nav{padding:.75rem 1rem .35rem}
  .lite-shell .sidebar-mobile .sidebar-nav a{padding:.85rem .1rem;border-bottom:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-radius:0}
  .lite-shell .sidebar-mobile .sidebar-nav a:last-child{border-bottom:none}
  .lite-shell .sidebar-mobile .sidebar-footer{padding:.55rem 1rem 1rem;border-top:none}
  .lite-main{position:relative;z-index:1;max-height:none;overflow:visible;min-height:0}
  .lite-main > *,
  .lite-panel,
  .page-frame,
  .toolbar-row,
  .toolbar-row form,
  .toolbar-group,
  .toolbar-field,
  .settings-form,
  .settings-form form,
  .copy-block,
  .memory-section,
  .memory-toolbar-group,
  .memory-toolbar-shell,
  .memory-surface-plain,
  .proactive-shell,
  .proactive-grid > .settings-block{min-width:0;max-width:100%;box-sizing:border-box}
  .companion-hero{flex-direction:column;text-align:center}
  .companion-hero-info-col{text-align:center}
  .companion-hero-name{font-size:1.25rem}
  .subgrid,
  .split-panel,
  .identity-grid,
  .companion-textarea-grid,
  .page-grid,
  .memory-date-row,
  .schedule-feature-grid,
  .schedule-inline-fields,
  .schedule-inline-fields-triple,
  .schedule-control-row,
  .image-settings-row,
  .admin-inline-fields,
  .proactive-pack-grid,
  .audio-voice-settings-grid,
  .custom-reaction-emoji-row,
  .generated-memory-meta-grid,
  .generated-memory-comparison-grid{grid-template-columns:1fr}
  .memory-table{min-width:760px}
  .quick-actions-row{align-items:flex-start}
  .memory-toolbar-shell{padding:0 1rem}
  .file-picker-row{align-items:flex-start}
  .schedule-inline-actions{align-items:stretch}
  .schedule-submit-row{margin-left:0}
  .image-settings-save label{display:none}
  .proactive-pack-inline-row,
  .proactive-pack-inline-form{align-items:stretch}
  .proactive-pack-inline-form{width:100%}
  .proactive-pack-inline-form input[type="file"]{width:100%;max-width:none}
  .proactive-filter-row{align-items:stretch}
  .proactive-filter-row .toolbar-group{width:100%;flex-wrap:wrap}
  .proactive-filter-row .toolbar-field.select{width:100%;min-width:0}
  .proactive-filter-row .toolbar-field.select select{min-width:0}
  .proactive-pack-toolbar-row .proactive-pack-inline-form,
  .proactive-pack-toolbar-row .proactive-pack-import-form{width:100%;flex:1 1 100%}
  .proactive-pack-toolbar-row .file-picker-label{max-width:none}
  .lite-main .split-panel{padding:1rem}
  .lite-main .split-panel > .card:first-child{border-right:none;border-bottom:1px solid var(--border);padding-right:0;padding-bottom:1rem}
  .lite-main .split-panel > .card:last-child{padding-left:0;padding-top:1rem}
  .home-dashboard-grid,
  .home-decision-grid,
  .channel-mode-assignment-row,
  .mode-editor-fields,
  .mode-memory-grid,
  .memory-map-main-grid,
  .backup-action-row,
  .cleanup-filter-row,
  .prune-action-row,
  .user-id-settings-row,
  .home-update-notice{grid-template-columns:1fr}
  .prune-action-row label{margin:.6rem 0 .35rem}
  .user-presence-toggle{justify-self:start;margin:.25rem 0 .75rem;white-space:normal}
  .home-update-notice-dismiss{justify-self:start}
  .proactive-shell,
  .proactive-shell.flat{padding:1rem}
  .proactive-grid{grid-template-columns:1fr}
  .proactive-grid > .settings-block:first-child{padding:0 0 1rem;border-right:none;border-bottom:1px solid var(--border)}
  .proactive-grid > .settings-block:last-child{padding:1rem 0 0}
  .proactive-inline-row,
  .proactive-bottom-row,
  .proactive-row{grid-template-columns:1fr}
  .proactive-row .toolbar,
  .proactive-bottom-row.actions .toolbar{justify-content:flex-start}
}
@media (max-width: 980px){
  .toolbar-row.filters,
  .toolbar-row.filters .toolbar-group{flex-wrap:wrap}
  .memory-map-toolbar .memory-toolbar-group-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
  .memory-map-toolbar .toolbar-field.search,
  .memory-map-toolbar .toolbar-button{grid-column:1 / -1}
  .memory-map-toolbar .toolbar-field.search,
  .memory-map-toolbar .toolbar-field.select,
  .memory-map-toolbar .toolbar-button{width:100%;max-width:none;min-width:0}
  .memory-map-canvas-wrap,
  .memory-map-svg{min-height:24rem;height:24rem}
}
@media (max-width: 860px){
  body{padding:1rem}
  .toolbar{align-items:stretch}
  .lite-panel,
  .lite-toolbar,
  .proactive-shell,
  .proactive-shell.flat{padding-left:1rem;padding-right:1rem}
  .memory-table-wrap,
  .model-table-wrap{overflow:visible}
  .memory-table,
  .model-table{min-width:100%;table-layout:fixed}
  .memory-table thead,
  .model-table thead{display:none}
  .memory-table,
  .model-table,
  .memory-table tbody,
  .model-table tbody{display:block}
  .memory-table tbody,
  .model-table tbody{display:grid;gap:.9rem}
  .memory-table tbody tr,
  .model-table tbody tr{display:grid;gap:.7rem;padding:1rem;border:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-radius:3px;background:color-mix(in srgb,var(--surface) 82%, transparent)}
  .memory-table tbody td,
  .model-table tbody td{display:grid;grid-template-columns:minmax(5.75rem,7rem) minmax(0,1fr);gap:.75rem;align-items:start;padding:0;border-top:none;min-width:0}
  .memory-table tbody td::before,
  .model-table tbody td::before{content:attr(data-label);font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);font-weight:600}
  .memory-table tbody td.table-detail-cell,
  .model-table tbody td.table-detail-cell{grid-template-columns:1fr;gap:.32rem}
  .memory-table tbody td.empty-state,
  .model-table tbody td.empty-state{display:block;padding:1rem}
  .memory-table tbody td.empty-state::before,
  .model-table tbody td.empty-state::before{content:none}
  .model-table tbody tr.mode-editor-row[hidden]{display:none!important}
  .model-table tbody tr.mode-editor-row{display:block;padding:0;border:none;background:transparent}
  .model-table tbody tr.mode-editor-row td{display:block;padding:0;min-width:0}
  .model-table tbody tr.mode-editor-row td::before{content:none}
  .mode-inline-editor{padding:.9rem;border:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 78%, transparent);overflow:hidden}
  .mode-inline-editor .toolbar{align-items:stretch}
  .mode-inline-editor .toolbar > *{width:100%;justify-content:center}
  .mode-memory-pill{min-width:0;flex:1 1 7rem}
  .sensitivity-scale{display:grid;grid-template-columns:1fr;align-self:stretch;border-radius:8px;width:100%;box-sizing:border-box}
  .sensitivity-scale label{border-radius:6px}
  .memory-table th.updated-col,
  .memory-table td.updated-col,
  .memory-table th.actions-col,
  .memory-table td.actions-col{width:auto;white-space:normal}
  .memory-table tbody td.actions-col{grid-template-columns:1fr}
  .memory-table tbody td.actions-col::before{margin-bottom:.1rem}
  .memory-table tbody td.actions-col .row-actions{justify-content:flex-start;flex-wrap:wrap}
  .heartbeat-history-table colgroup{display:none}
  .heartbeat-history-table th,
  .heartbeat-history-table td{width:auto!important}
  .heartbeat-history-table tbody td:first-child{grid-template-columns:1fr}
  .model-table .notes,
  .memory-content{max-width:none}
  .toolbar-field.search,
  .toolbar-field.select{width:100%;max-width:none;min-width:0}
  .image-gallery-filter-grid,
  .audio-gallery-filter-grid,
  .music-playlist-filter-grid,
  .music-track-filter-grid{grid-template-columns:1fr}
  .gallery-filter-grid{gap:.55rem}
  .settings-form form.stack:has(.image-settings-toggle),
  .settings-form form.stack:has(.gallery-filter-grid){gap:.55rem}
  .gallery-filter-grid label{margin:.15rem 0 .25rem}
  .gallery-filter-action{gap:0}
  .gallery-filter-action label{display:none}
  .gallery-filter-action .toolbar-button{width:100%}
  .gallery-filter-actions{gap:.55rem}
  [data-selected-filter-pills]{gap:.35rem;margin-top:.45rem}
  [data-selected-filter-pills] .toolbar-button{min-height:2.35rem;padding:.48rem .68rem;font-size:.9rem}
  .gallery-filter-action{grid-column:auto}
  .gallery-filter-actions{align-items:flex-start}
  .audio-gallery-save-grid{grid-template-columns:1fr}
  .image-gallery-favorite-toggle{margin-left:0}
  .audio-detail-tags-row,
  .audio-detail-tags-form{grid-template-columns:1fr}
  .audio-gallery-list{border-top:none;gap:.85rem}
  .audio-gallery-row{grid-template-columns:auto minmax(0,1fr) auto auto;grid-template-areas:"select title title title" "tags tags tags tags" "player player favorite delete";gap:.65rem .55rem;padding:1rem;border:1px solid color-mix(in srgb,var(--border) 68%, transparent);background:color-mix(in srgb,var(--surface) 70%, transparent)}
  .audio-gallery-row.is-selected{background:color-mix(in srgb,var(--accent) 8%, var(--surface))}
  .audio-gallery-select-cell{grid-area:select;align-self:start;padding-top:.2rem}
  .audio-gallery-title-cell{grid-area:title}
  .audio-gallery-tags-cell{grid-area:tags}
  .audio-gallery-player-cell{grid-area:player;min-width:0;align-self:center}
  .audio-gallery-favorite-cell{grid-area:favorite}
  .audio-gallery-delete-cell{grid-area:delete}
  .audio-gallery-action-cell{justify-content:center;align-self:center}
  .audio-gallery-player-wrap{align-items:center}
  .audio-gallery-player-cell .audio-player{width:100%}
  .memory-map-mobile-selection{display:flex}
  .memory-map-main-grid{gap:.85rem}
  .memory-map-reference-grid{gap:.38rem}
  .music-gallery-table tbody tr[hidden]{display:none!important}
  .music-gallery-table tbody{gap:.55rem}
  .music-gallery-table tbody tr.music-track-summary-row{gap:.42rem;padding:.78rem .85rem;border-radius:6px;background:color-mix(in srgb,var(--surface) 66%, transparent)}
  .music-gallery-table tbody tr.music-track-summary-row td{display:block;padding:0}
  .music-gallery-table tbody tr.music-track-summary-row td::before{content:none}
  .music-gallery-table tbody tr.music-track-summary-row td:not(.music-track-title-cell){padding-left:1.85rem;color:var(--text-secondary);font-size:.9rem}
  .music-gallery-table tbody tr.music-track-summary-row td[data-label="Reaction"]{display:none}
  .music-gallery-table tbody tr.music-track-summary-row .music-note-excerpt{font-size:.88rem;-webkit-line-clamp:1}
  .music-gallery-table tbody tr.music-track-detail-row{padding:0;border:none;background:transparent}
  .music-gallery-table tbody tr.music-track-detail-row > td{display:block;padding:0}
  .music-gallery-table tbody tr.music-track-detail-row > td::before{content:none}
  .music-track-drawer{gap:.85rem;padding:.95rem;border:1px solid color-mix(in srgb,var(--border) 68%, transparent);border-radius:8px;background:color-mix(in srgb,var(--surface) 78%, transparent)}
  .music-track-drawer-head{gap:.55rem}
  .music-track-drawer-head h3{font-size:1rem}
  .music-track-drawer-head .memory-chip-row{gap:.35rem}
  .music-track-editor-form{grid-template-columns:1fr auto;gap:.58rem;align-items:end}
  .music-track-editor-field{grid-column:1 / -1}
  .music-track-editor-field label{display:none}
  .music-track-editor-save{grid-column:1}
  .music-track-editor-delete{grid-column:2;justify-self:end}
  .music-track-editor-save .toolbar-button{width:100%}
  .music-track-ai-comments h4{display:none}
  .music-track-ai-comments{gap:.15rem}
  .music-ai-note-excerpt{margin:.1rem 0 0}
  .memory-library-table tbody tr{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"title title" "content content" "type category" "updated actions";gap:.56rem;padding:.9rem .95rem;border-radius:8px;background:color-mix(in srgb,var(--surface) 74%, transparent);box-shadow:0 10px 24px color-mix(in srgb,#000 9%, transparent)}
  .memory-library-table tbody td{display:block;grid-template-columns:none;gap:0}
  .memory-library-table tbody td::before{content:none}
  .memory-library-table tbody td:nth-child(1){grid-area:title}
  .memory-library-table tbody td:nth-child(2){grid-area:content}
  .memory-library-table tbody td:nth-child(3){grid-area:type}
  .memory-library-table tbody td:nth-child(4){grid-area:category;justify-self:start}
  .memory-library-table tbody td:nth-child(5){grid-area:updated;align-self:center;color:var(--text-secondary);font-size:.84rem}
  .memory-library-table tbody td:nth-child(5)::before{content:"Last updated ";font-size:inherit;letter-spacing:0;text-transform:none;color:var(--text-secondary);font-weight:500}
  .memory-library-table tbody td:nth-child(6){grid-area:actions;align-self:center;justify-self:end}
  .memory-library-table tbody td.actions-col .row-actions{justify-content:flex-end;flex-wrap:nowrap}
  .memory-library-table .memory-title{margin:0;font-size:1.02rem;font-weight:750;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .memory-library-table .memory-content{max-width:none;font-size:.94rem;line-height:1.5;-webkit-line-clamp:3}
  .memory-library-table .memory-chip-row{gap:.35rem}
  .memory-library-table tbody td.empty-state{grid-column:1 / -1}
  .memory-library-table tbody td.empty-state::before{content:none}
  .image-gallery-feed{grid-template-columns:1fr;gap:.55rem}
  .image-gallery-favorite-form{top:.35rem;right:.35rem}
  .home-image-tile{--home-image-height:118px}
  .gallery-preview-frame{height:180px}
  .home-image-stream-wrap,
  .home-journal-stream-wrap{overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}
  .home-image-stream-wrap::before,
  .home-image-stream-wrap::after,
  .home-journal-stream-wrap::before,
  .home-journal-stream-wrap::after{display:none}
  .home-image-stream-track,
  .home-journal-stream-track{width:max-content;animation:none;padding-bottom:.2rem}
  .home-journal-tile{width:220px}
}
@media (max-width: 640px){
  .page-subnav{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;gap:.35rem;padding-bottom:.25rem;scrollbar-width:thin}
  .page-subnav a{flex:0 0 auto;padding:.5rem .72rem;white-space:nowrap}
  .memory-review-shell .toolbar-row.filters{display:grid;grid-template-columns:1fr;gap:.55rem;align-items:stretch;overflow:visible}
  .memory-review-shell .toolbar-row.filters .memory-toolbar-group-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem;width:100%;flex:1 1 auto}
  .memory-review-shell .toolbar-field.select,
  .memory-review-shell .toolbar-field.select select{width:100%;min-width:0;max-width:none}
  .memory-review-shell .memory-toolbar-group-filters .toolbar-button{grid-column:1 / -1}
  .memory-review-shell .toolbar-row.filters > .toolbar-button{width:100%;justify-content:center;white-space:nowrap}
}
@media (max-width: 520px){
  .memory-map-toolbar .memory-toolbar-group-filters{grid-template-columns:1fr}
  .memory-map-inline-stats{justify-content:flex-start}
  .memory-map-inline-stats > span:not(:last-child)::after{display:none}
  .memory-map-inline-stats > span{flex:1 1 40%}
}
@media (prefers-reduced-motion: reduce){
  .home-image-stream-track,
  .home-journal-stream-track{animation:none}
}

/* ── Memory Curator Dashboard ────────────────────────── */
.mc-scope{position:relative}
.mc-layout{display:grid;grid-template-columns:1fr 300px;gap:1.25rem;align-items:start}
.mc-main{display:grid;gap:1rem;min-width:0}
.mc-aside{display:grid;gap:1rem;min-width:0;position:sticky;top:1rem}
.mc-card{background:color-mix(in srgb,var(--surface) 52%,transparent);border:1px solid color-mix(in srgb,var(--border) 55%,transparent);border-radius:8px;padding:1.2rem 1.3rem}
.mc-card-header{display:flex;align-items:center;gap:.6rem;margin-bottom:.85rem}
.mc-card-icon{width:1.3rem;height:1.3rem;display:inline-flex;align-items:center;justify-content:center;flex:none;opacity:.75}
.mc-card-icon img{display:block;width:100%;height:100%;object-fit:contain}
.mc-card-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.15rem;font-weight:600;margin:0;letter-spacing:.01em;line-height:1.1}
.mc-card-hint{margin:.15rem 0 .75rem}
.mc-hero-card{padding:1.3rem 1.4rem}
.mc-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.9rem}
.mc-hero-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.75rem;font-weight:600;letter-spacing:.01em;margin:0 0 .2rem;line-height:1.1}
.mc-hero-subtitle{color:var(--text-secondary);font-size:.91rem;margin:0}
.mc-status-pill{display:inline-flex;align-items:center;gap:.42rem;padding:.35rem .78rem;border-radius:999px;font-size:.79rem;font-weight:500;white-space:nowrap;flex:none}
.mc-status-active{background:color-mix(in srgb,var(--success-bg) 80%,var(--surface));border:1px solid var(--success-border);color:var(--text-secondary)}
.mc-status-inactive{background:color-mix(in srgb,var(--surface-2) 55%,transparent);border:1px solid color-mix(in srgb,var(--border) 65%,transparent);color:var(--text-secondary)}
.mc-status-dot{width:.45rem;height:.45rem;border-radius:50%;flex:none}
.mc-status-active .mc-status-dot{background:var(--success-border)}
.mc-status-inactive .mc-status-dot{background:var(--text-secondary);opacity:.55}
.mc-hero-meta{display:flex;flex-wrap:wrap;gap:.6rem 1.75rem}
.mc-hero-stat{display:flex;flex-direction:column;gap:.1rem}
.mc-hero-stat-label{font-size:.71rem;color:var(--text-secondary);font-weight:500;text-transform:uppercase;letter-spacing:.07em}
.mc-hero-stat-value{font-size:.92rem;font-weight:600;color:var(--text)}
.mc-toggle-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem}
.mc-toggle-card{display:flex;align-items:flex-start;gap:.85rem;padding:.95rem 1rem;background:color-mix(in srgb,var(--surface-2) 28%,transparent);border:1px solid color-mix(in srgb,var(--border) 45%,transparent);border-radius:6px;cursor:pointer;transition:border-color .16s ease,background .16s ease}
.mc-toggle-card:has(input:checked){background:color-mix(in srgb,var(--accent) 7%,var(--surface));border-color:color-mix(in srgb,var(--accent) 35%,var(--border))}
.mc-toggle-switch{flex:none;padding-top:.1rem}
.mc-toggle-body{flex:1;min-width:0}
.mc-toggle-name{font-weight:600;font-size:.88rem;color:var(--text);margin:0 0 .18rem;line-height:1.3}
.mc-toggle-desc{font-size:.8rem;color:var(--text-secondary);margin:0;line-height:1.4}
.mc-rhythm-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:.35rem}
.mc-channel-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.75rem;flex-wrap:wrap}
.mc-channel-actions{display:flex;gap:.4rem;flex:none}
.mc-channel-actions .toolbar-button{padding:.35rem .7rem;font-size:.82rem;min-height:auto}
.mc-heartbeat-list{display:grid;gap:0;margin:0;padding:0}
.mc-hb-row{display:grid;grid-template-columns:1fr auto;gap:.5rem;align-items:baseline;padding:.42rem 0;border-bottom:1px solid color-mix(in srgb,var(--border) 32%,transparent)}
.mc-hb-row:last-child{border-bottom:none}
.mc-hb-label{font-size:.8rem;color:var(--text-secondary);font-weight:500}
.mc-hb-value{font-size:.83rem;font-weight:600;color:var(--text);text-align:right}
.mc-tool-list{display:grid;gap:.55rem}
.mc-tool-card{display:flex;align-items:center;gap:.8rem;padding:.75rem .85rem;background:color-mix(in srgb,var(--surface-2) 22%,transparent);border:1px solid color-mix(in srgb,var(--border) 38%,transparent);border-radius:6px}
.mc-tool-info{flex:1;min-width:0}
.mc-tool-name{font-weight:600;font-size:.86rem;color:var(--text);margin:0 0 .05rem;line-height:1.3}
.mc-tool-desc{font-size:.77rem;color:var(--text-secondary);margin:0;line-height:1.35}
.mc-tool-btn{flex:none;padding:.38rem .7rem;font-size:.81rem;min-height:auto;white-space:nowrap}
.mc-save-bar{position:sticky;bottom:0;left:0;right:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 1.2rem;margin-top:.5rem;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid color-mix(in srgb,var(--border) 55%,transparent);border-radius:6px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);opacity:0;pointer-events:none;transform:translateY(6px);transition:opacity .22s ease,transform .22s ease}
.mc-save-bar.is-visible{opacity:1;pointer-events:all;transform:translateY(0)}
.mc-save-bar-label{font-size:.87rem;color:var(--text-secondary);font-weight:500}
.mc-save-bar-btn{min-height:auto;padding:.62rem 1.1rem;font-size:.88rem}
@media(max-width:900px){
  .mc-layout{grid-template-columns:1fr}
  .mc-aside{position:static}
}
@media(max-width:540px){
  .mc-toggle-grid{grid-template-columns:1fr}
  .mc-rhythm-row{grid-template-columns:1fr}
  .mc-channel-head{flex-direction:column;align-items:flex-start}
}

/* ── Full-bleed overrides for GFL + GRS pages inside .lite-main ─────── */
.lite-main > .gfl-page,
.lite-main > .grs-page {
  max-width: none;
  width: calc(100% + 3rem);
  margin-left: -1.5rem;
  margin-right: -1.5rem;
  margin-top: -1.5rem;
  box-sizing: border-box;
}

/* ── Ghostlight Relational State Design System (grs-*) ──────────────── */
:root{--grs-page-bg:#f6f0ff;--grs-card:rgba(255,255,255,.76);--grs-card-strong:rgba(255,255,255,.9);--grs-line:rgba(124,58,237,.18);--grs-line-strong:rgba(124,58,237,.32);--grs-text:#1f0f55;--grs-muted:#5d4b8a;--grs-purple:#6d28d9;--grs-purple-2:#8b5cf6;--grs-purple-soft:#ede7ff;--grs-green:#22c55e;--grs-warning:#b45309;--grs-shadow:0 18px 54px rgba(55,28,122,.11);--grs-shadow-soft:0 10px 30px rgba(55,28,122,.075);--grs-radius-xl:24px;--grs-radius-lg:18px;--grs-radius-md:14px}.grs-page{min-height:100vh;background:radial-gradient(circle at 12% 8%,rgba(216,202,255,.5),transparent 30%),radial-gradient(circle at 90% 14%,rgba(233,213,255,.36),transparent 30%),var(--grs-page-bg);color:var(--grs-text)}.grs-shell{width:min(1480px,calc(100vw - 54px));margin:0 auto;padding:30px 0 112px}.grs-hero{display:grid;grid-template-columns:300px minmax(0,1fr) 390px;gap:22px;align-items:stretch;margin-bottom:22px}.grs-hero-art{min-height:210px;border-radius:var(--grs-radius-xl);border:1px solid var(--grs-line);background-image:url('/assets/ghostlight/relational-state/relational-hero-orb.svg');background-size:cover;background-position:center;box-shadow:var(--grs-shadow-soft);overflow:hidden}.grs-hero-text{display:grid;align-content:center;padding:22px 8px}.grs-title{margin:0 0 12px;font-size:clamp(2rem,3vw,3.05rem);line-height:1;letter-spacing:-.04em;font-family:Georgia,'Times New Roman',serif}.grs-subtitle{margin:0;color:var(--grs-muted);font-size:1.02rem;line-height:1.55;max-width:800px}.grs-card,.grs-save-bar{border:1px solid var(--grs-line);background:var(--grs-card);border-radius:var(--grs-radius-xl);box-shadow:var(--grs-shadow-soft);backdrop-filter:blur(18px)}.grs-about-card{padding:24px}.grs-about-title,.grs-side-title{margin:0 0 16px;display:flex;gap:12px;align-items:center;font-size:1.25rem;font-weight:900}.grs-about-title img,.grs-side-title img{width:30px;height:30px}.grs-bullet-list{list-style:none;display:grid;gap:14px;padding:0;margin:18px 0 0}.grs-bullet-list li{display:grid;grid-template-columns:18px 1fr;gap:10px;color:var(--grs-muted);line-height:1.42}.grs-bullet-list li::before{content:"";width:9px;height:9px;border-radius:999px;background:#a78bfa;box-shadow:0 0 0 4px rgba(167,139,250,.18);margin-top:6px}.grs-status-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:22px}.grs-status-card{padding:22px;display:grid;grid-template-columns:54px 1fr;gap:16px;align-items:center}.grs-icon-bubble{width:54px;height:54px;display:inline-grid;place-items:center;border-radius:18px;border:1px solid rgba(139,92,246,.18);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(237,231,255,.86));box-shadow:0 10px 30px rgba(109,40,217,.12);flex:none}.grs-icon-bubble img{width:31px;height:31px}.grs-status-title{margin:0 0 6px;font-weight:900}.grs-copy{margin:0;color:var(--grs-muted);line-height:1.45}.grs-badge{display:inline-flex;align-items:center;gap:8px;min-height:26px;padding:0 10px;border-radius:999px;background:rgba(34,197,94,.12);color:#166534;border:1px solid rgba(34,197,94,.22);font-weight:800;font-size:.76rem}.grs-dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--grs-green);box-shadow:0 0 0 4px rgba(34,197,94,.14)}.grs-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:24px;align-items:start}.grs-left{display:grid;gap:18px}.grs-right{position:sticky;top:86px;display:grid;gap:18px}.grs-panel{padding:24px}.grs-section-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.grs-section-title{margin:0 0 6px;font-size:1.25rem;font-weight:900}.grs-link-button{border:0;background:transparent;color:var(--grs-purple);font-weight:800;cursor:pointer}.grs-control-list{overflow:hidden;border-radius:var(--grs-radius-lg);border:1px solid var(--grs-line);background:rgba(255,255,255,.5)}.grs-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(124,58,237,.11)}.grs-row:last-child{border-bottom:0}.grs-row-highlight{background:linear-gradient(135deg,rgba(237,231,255,.78),rgba(255,255,255,.62))}.grs-row-icon{width:31px;height:31px;border-radius:999px;display:inline-grid;place-items:center;background:rgba(237,231,255,.8);border:1px solid rgba(124,58,237,.12)}.grs-row-icon img{width:19px;height:19px}.grs-row-title{margin:0 0 3px;font-weight:900}.grs-row-desc{margin:0;color:var(--grs-muted);font-size:.91rem;line-height:1.35}.grs-toggle{inline-size:46px;block-size:26px;appearance:none;border:1px solid rgba(124,58,237,.25);border-radius:999px;background:#c4c1d4;position:relative;cursor:pointer;transition:.2s ease}.grs-toggle::before{content:"";position:absolute;inline-size:20px;block-size:20px;border-radius:50%;top:2px;left:3px;background:white;box-shadow:0 2px 8px rgba(55,28,122,.22);transition:.2s ease}.grs-toggle:checked{background:linear-gradient(135deg,var(--grs-purple),var(--grs-purple-2))}.grs-toggle:checked::before{transform:translateX(19px)}.grs-toggle:focus-visible{outline:2px solid var(--grs-purple);outline-offset:2px}.grs-toggle-wrap{display:inline-flex;align-items:center;cursor:pointer}.grs-select{min-height:48px;width:min(330px,100%);border:1px solid var(--grs-line-strong);background:rgba(255,255,255,.68);color:var(--grs-text);border-radius:var(--grs-radius-md);padding:0 14px;font:inherit;font-weight:800}.grs-side-card{padding:24px}.grs-preset-list{display:grid;gap:12px;margin-top:18px}.grs-preset-button{display:grid;grid-template-columns:48px 1fr;gap:14px;align-items:center;min-height:78px;text-align:left;border:1px solid var(--grs-line);background:rgba(255,255,255,.55);border-radius:var(--grs-radius-lg);padding:14px;color:var(--grs-text);cursor:pointer;font:inherit;transition:border-color .15s,box-shadow .15s}.grs-preset-button:hover{border-color:var(--grs-line-strong);box-shadow:0 12px 30px rgba(109,40,217,.09)}.grs-safety-art{width:min(260px,100%);margin:24px auto 0;display:block;opacity:.92}.grs-save-bar{position:sticky;bottom:18px;z-index:30;margin-top:24px;padding:16px 18px;display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;background:rgba(255,255,255,.9);box-shadow:var(--grs-shadow);transition:background .2s}.grs-save-icon{width:54px;height:54px;border-radius:16px;padding:10px;background:var(--grs-purple-soft);box-sizing:border-box}.grs-button{border:1px solid var(--grs-line-strong);background:rgba(255,255,255,.66);color:var(--grs-text);border-radius:12px;min-height:44px;padding:0 18px;font-weight:900;cursor:pointer;font-size:inherit;font-family:inherit;transition:border-color .15s}.grs-button:hover:not(:disabled){border-color:var(--grs-purple);box-shadow:0 6px 18px rgba(109,40,217,.1)}.grs-button:disabled{opacity:.45;cursor:not-allowed}.grs-button-primary{border:0;color:#fff;background:linear-gradient(135deg,var(--grs-purple),#351064);box-shadow:0 16px 34px rgba(109,40,217,.22)}.grs-button-primary:hover:not(:disabled){box-shadow:0 20px 40px rgba(109,40,217,.3)}.grs-group-label{padding:8px 18px 6px;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:var(--grs-muted);font-weight:700;background:rgba(237,231,255,.4);border-bottom:1px solid rgba(124,58,237,.08)}.grs-data-table{width:100%;border-collapse:collapse;font-size:.9rem}.grs-data-table th{text-align:left;padding:10px 14px;color:var(--grs-muted);font-size:.82rem;letter-spacing:.04em;border-bottom:2px solid var(--grs-line)}.grs-data-table td{padding:10px 14px;border-bottom:1px solid rgba(124,58,237,.09);vertical-align:top}.grs-data-table tr:last-child td{border-bottom:0}.grs-table-empty{color:var(--grs-muted);text-align:center;padding:20px!important}
/* GRS dark mode */
.grs-page[data-theme="dark"]{--grs-page-bg:#130d2a;--grs-card:rgba(36,24,64,.86);--grs-line:rgba(139,92,246,.22);--grs-line-strong:rgba(139,92,246,.38);--grs-text:#e4d9ff;--grs-muted:#9b7fc4;--grs-purple-soft:rgba(109,40,217,.22)}
.grs-page[data-theme="dark"] .grs-control-list{background:rgba(30,18,58,.55)}
.grs-page[data-theme="dark"] .grs-row-highlight{background:linear-gradient(135deg,rgba(55,28,100,.7),rgba(36,24,64,.5))}
.grs-page[data-theme="dark"] .grs-preset-button{background:rgba(30,18,58,.5)}
.grs-page[data-theme="dark"] .grs-toggle{background:#4a3876}
.grs-page[data-theme="dark"] .grs-save-bar{background:rgba(26,16,50,.96)}
.grs-page[data-theme="dark"] .grs-select,.grs-page[data-theme="dark"] input[type=number],.grs-page[data-theme="dark"] input[type=text]{background:rgba(36,24,64,.6)!important;color:var(--grs-text)!important}
@media(max-width:1180px){.grs-hero,.grs-main-grid{grid-template-columns:1fr}.grs-right{position:static}.grs-status-grid{grid-template-columns:1fr}}
@media(max-width:760px){.grs-shell{width:min(calc(100vw - 28px),720px);padding-top:18px}.grs-row{grid-template-columns:42px 1fr}.grs-save-bar{grid-template-columns:auto 1fr}.grs-toggle{justify-self:start}}

/* ── Ghostlight Feedback & Learning Design System (gfl-*) ───────────── */
:root{--gfl-page-bg:#f5efff;--gfl-card:rgba(255,255,255,.74);--gfl-line:rgba(124,58,237,.18);--gfl-line-strong:rgba(124,58,237,.32);--gfl-text:#1f0f55;--gfl-muted:#5d4b8a;--gfl-purple:#6d28d9;--gfl-purple-2:#8b5cf6;--gfl-purple-soft:#ede7ff;--gfl-green:#22c55e;--gfl-warning:#b45309;--gfl-shadow:0 18px 54px rgba(55,28,122,.11);--gfl-shadow-soft:0 10px 30px rgba(55,28,122,.075);--gfl-radius-xl:24px;--gfl-radius-lg:18px;--gfl-radius-md:14px}.gfl-page{min-height:100vh;background:radial-gradient(circle at 12% 8%,rgba(216,202,255,.48),transparent 28%),radial-gradient(circle at 90% 14%,rgba(233,213,255,.38),transparent 30%),var(--gfl-page-bg);color:var(--gfl-text)}.gfl-shell{width:min(1480px,calc(100vw - 54px));margin:0 auto;padding:34px 0 110px}.gfl-top{display:grid;grid-template-columns:1fr 520px;gap:24px;align-items:stretch;margin-bottom:24px}.gfl-title{margin:0 0 10px;font-size:clamp(2rem,3vw,3rem);line-height:1;letter-spacing:-.04em;font-family:Georgia,'Times New Roman',serif}.gfl-subtitle{max-width:760px;margin:0;color:var(--gfl-muted);font-size:1.02rem;line-height:1.55}.gfl-card,.gfl-status-card,.gfl-save-bar{border:1px solid var(--gfl-line);background:var(--gfl-card);border-radius:var(--gfl-radius-xl);box-shadow:var(--gfl-shadow-soft);backdrop-filter:blur(18px)}.gfl-status-card{display:flex;gap:18px;align-items:center;padding:24px}.gfl-status-card img{width:72px;height:72px;border-radius:999px;background:var(--gfl-purple-soft)}.gfl-badge{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0 12px;border-radius:999px;background:rgba(34,197,94,.12);color:#166534;border:1px solid rgba(34,197,94,.22);font-weight:800;font-size:.78rem}.gfl-badge-warning{background:rgba(180,83,9,.1);color:var(--gfl-warning);border-color:rgba(180,83,9,.2)}.gfl-dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--gfl-green);box-shadow:0 0 0 4px rgba(34,197,94,.14)}.gfl-engine-card{padding:24px;display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;margin-bottom:24px}.gfl-icon{width:64px;height:64px;display:inline-grid;place-items:center;border-radius:999px;border:1px solid rgba(139,92,246,.18);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(237,231,255,.86));box-shadow:0 10px 30px rgba(109,40,217,.12)}.gfl-icon img{width:34px;height:34px}.gfl-grid{display:grid;grid-template-columns:minmax(0,1fr) 430px;gap:24px;align-items:start}.gfl-left{display:grid;gap:18px}.gfl-right{position:sticky;top:86px;display:grid;gap:18px}.gfl-panel{padding:24px}.gfl-section-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.gfl-section-title{margin:0 0 6px;font-size:1.25rem;font-weight:900}.gfl-copy{margin:0;color:var(--gfl-muted);line-height:1.5}.gfl-link-button{border:0;background:transparent;color:var(--gfl-purple);font-weight:800;cursor:pointer}.gfl-group{overflow:hidden;border-radius:var(--gfl-radius-lg);border:1px solid var(--gfl-line);background:rgba(255,255,255,.48);margin-bottom:16px}.gfl-group-header{min-height:76px;display:grid;grid-template-columns:48px 1fr auto auto;gap:14px;align-items:center;padding:16px 18px;background:linear-gradient(135deg,rgba(237,231,255,.82),rgba(255,255,255,.66));border-bottom:1px solid var(--gfl-line)}.gfl-group-icon{width:38px;height:38px;border-radius:14px;display:inline-grid;place-items:center;background:rgba(255,255,255,.72);border:1px solid var(--gfl-line)}.gfl-group-icon img{width:23px;height:23px}.gfl-count{display:inline-grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:#f3ecff;color:var(--gfl-purple);border:1px solid rgba(124,58,237,.22);font-size:.8rem;font-weight:900}.gfl-row{display:grid;grid-template-columns:42px 1fr auto;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(124,58,237,.11)}.gfl-row:last-child{border-bottom:0}.gfl-row .gfl-row-icon{width:30px;height:30px;border-radius:999px;display:inline-grid;place-items:center;background:rgba(237,231,255,.8);color:var(--gfl-purple);font-weight:900}.gfl-row-title{margin:0 0 4px;font-weight:900}.gfl-row-desc{margin:0;color:var(--gfl-muted);font-size:.9rem;line-height:1.35}.gfl-toggle{inline-size:46px;block-size:26px;appearance:none;border:1px solid rgba(124,58,237,.25);border-radius:999px;background:#c4c1d4;position:relative;cursor:pointer;transition:.2s ease}.gfl-toggle::before{content:"";position:absolute;inline-size:20px;block-size:20px;border-radius:50%;top:2px;left:3px;background:white;box-shadow:0 2px 8px rgba(55,28,122,.22);transition:.2s ease}.gfl-toggle:checked{background:linear-gradient(135deg,var(--gfl-purple),var(--gfl-purple-2))}.gfl-toggle:checked::before{transform:translateX(19px)}.gfl-toggle:focus-visible{outline:2px solid var(--gfl-purple);outline-offset:2px}.gfl-toggle-wrap{display:inline-flex;align-items:center;cursor:pointer}.gfl-side-card{padding:24px}.gfl-side-title{margin:0 0 16px;display:flex;gap:12px;align-items:center;font-size:1.1rem;font-weight:900}.gfl-side-title img{width:28px;height:28px;flex-shrink:0}.gfl-bullet-list{display:grid;gap:14px;padding:0;margin:18px 0 0;list-style:none}.gfl-bullet-list li{display:grid;grid-template-columns:18px 1fr;gap:10px;color:var(--gfl-muted);line-height:1.42}.gfl-bullet-list li::before{content:"";width:9px;height:9px;border-radius:999px;background:#a78bfa;box-shadow:0 0 0 4px rgba(167,139,250,.18);margin-top:6px}.gfl-shield-art{width:min(140px,100%);margin:24px auto 0;display:block;opacity:.8}.gfl-action-list{display:grid;gap:12px}.gfl-action{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:center;min-height:72px;text-align:left;border:1px solid var(--gfl-line);background:rgba(255,255,255,.55);border-radius:var(--gfl-radius-lg);padding:14px;color:var(--gfl-text);cursor:pointer;transition:border-color .15s,box-shadow .15s;font-size:inherit;font-family:inherit}.gfl-action:hover{border-color:var(--gfl-line-strong);box-shadow:0 12px 30px rgba(109,40,217,.09)}.gfl-action img{width:32px;height:32px}.gfl-button{border:1px solid var(--gfl-line-strong);background:rgba(255,255,255,.66);color:var(--gfl-text);border-radius:12px;min-height:44px;padding:0 18px;font-weight:900;cursor:pointer;font-size:inherit;font-family:inherit;transition:border-color .15s,box-shadow .15s}.gfl-button:hover:not(:disabled){border-color:var(--gfl-purple);box-shadow:0 6px 18px rgba(109,40,217,.1)}.gfl-button:disabled{opacity:.45;cursor:not-allowed}.gfl-button-primary{border:0;color:#fff;background:linear-gradient(135deg,var(--gfl-purple),#351064);box-shadow:0 16px 34px rgba(109,40,217,.22)}.gfl-button-primary:hover:not(:disabled){box-shadow:0 20px 40px rgba(109,40,217,.3)}.gfl-save-bar{position:sticky;bottom:18px;z-index:30;margin-top:24px;padding:16px 18px;display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;background:rgba(255,255,255,.9);box-shadow:var(--gfl-shadow);transition:background .2s}.gfl-save-icon{width:54px;height:54px;border-radius:16px;padding:10px;background:var(--gfl-purple-soft);box-sizing:border-box}.gfl-inline-actions{display:flex;gap:6px;flex-wrap:wrap}.gfl-data-table{width:100%;border-collapse:collapse;font-size:.9rem}.gfl-data-table th{text-align:left;padding:10px 14px;color:var(--gfl-muted);font-size:.82rem;letter-spacing:.04em;border-bottom:2px solid var(--gfl-line)}.gfl-data-table td{padding:10px 14px;border-bottom:1px solid rgba(124,58,237,.09);vertical-align:top}.gfl-data-table tr:last-child td{border-bottom:0}.gfl-table-empty{color:var(--gfl-muted);text-align:center;padding:20px!important}
/* GFL dark mode */
.gfl-page[data-theme="dark"]{--gfl-page-bg:#130d2a;--gfl-card:rgba(36,24,64,.86);--gfl-line:rgba(139,92,246,.22);--gfl-line-strong:rgba(139,92,246,.38);--gfl-text:#e4d9ff;--gfl-muted:#9b7fc4;--gfl-purple-soft:rgba(109,40,217,.22)}
.gfl-page[data-theme="dark"] .gfl-group{background:rgba(30,18,58,.55)}
.gfl-page[data-theme="dark"] .gfl-group-header{background:linear-gradient(135deg,rgba(55,28,100,.7),rgba(36,24,64,.5))}
.gfl-page[data-theme="dark"] .gfl-action{background:rgba(30,18,58,.5)}
.gfl-page[data-theme="dark"] .gfl-toggle{background:#4a3876}
.gfl-page[data-theme="dark"] .gfl-save-bar{background:rgba(26,16,50,.96)}
.gfl-page[data-theme="dark"] input[type=number]{background:rgba(36,24,64,.6)!important;color:var(--gfl-text)!important}
.gfl-page[data-theme="dark"] select,.gfl-page[data-theme="dark"] input[type=text]{background:rgba(36,24,64,.6)!important;color:var(--gfl-text)!important}
@media(max-width:1180px){.gfl-top,.gfl-grid{grid-template-columns:1fr}.gfl-right{position:static}}
@media(max-width:760px){.gfl-shell{width:calc(100vw - 28px);padding-top:18px}.gfl-engine-card{grid-template-columns:1fr}.gfl-group-header{grid-template-columns:44px 1fr auto}.gfl-row{grid-template-columns:36px 1fr auto;gap:10px}.gfl-save-bar{grid-template-columns:auto 1fr;grid-template-rows:auto auto}.gfl-save-bar button{grid-column:span 1}}

/* ── Ghostlight Heartbeat Settings Design System (ghb-*) ───────────── */
.ghb-settings-tab{padding:4px 0 8px}
.ghb-hero{display:grid;grid-template-columns:220px minmax(0,1fr) 360px;gap:20px;align-items:stretch;margin-bottom:20px}
.ghb-hero-art{min-height:200px;border-radius:22px;border:1px solid rgba(124,58,237,.18);background-image:url('/assets/ghostlight/heartbeat/heartbeat-hero-orb.svg');background-size:cover;background-position:center;box-shadow:0 10px 30px rgba(55,28,122,.08);overflow:hidden}
.ghb-hero-text{display:grid;align-content:center;padding:18px 8px}
.ghb-title{margin:0 0 12px;font-size:clamp(1.8rem,2.8vw,2.8rem);line-height:1;letter-spacing:-.04em;font-family:Georgia,'Times New Roman',serif}
.ghb-subtitle{margin:0;color:#5d4b8a;font-size:1rem;line-height:1.56;max-width:760px}
.ghb-card{border:1px solid rgba(124,58,237,.18);background:rgba(255,255,255,.76);border-radius:22px;box-shadow:0 10px 30px rgba(55,28,122,.075);backdrop-filter:blur(18px)}
.ghb-save-bar{border:1px solid rgba(124,58,237,.18);background:rgba(255,255,255,.76);border-radius:22px;box-shadow:0 10px 30px rgba(55,28,122,.075);backdrop-filter:blur(18px)}
.ghb-side-card{padding:22px}
.ghb-side-title{margin:0 0 14px;display:flex;gap:12px;align-items:center;font-size:1.15rem;font-weight:900;color:#1f0f55}
.ghb-side-title img,.ghb-side-title svg{width:28px;height:28px;flex-shrink:0}
.ghb-copy{margin:0;color:#5d4b8a;line-height:1.48}
.ghb-bullet-list{list-style:none;display:grid;gap:12px;padding:0;margin:18px 0 0}
.ghb-bullet-list li{display:flex;gap:10px;color:#5d4b8a;line-height:1.42}
.ghb-bullet-list li::before{content:'✓';min-width:20px;height:20px;border-radius:999px;display:inline-grid;place-items:center;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;font-size:10px;flex-shrink:0;margin-top:1px}
.ghb-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:start}
.ghb-left{display:grid;gap:16px}
.ghb-right{position:sticky;top:86px;display:grid;gap:16px}
.ghb-setting-card{padding:22px}
.ghb-setting-head{display:grid;grid-template-columns:54px 1fr auto;gap:16px;align-items:start;margin-bottom:16px}
.ghb-icon-bubble{width:50px;height:50px;display:inline-grid;place-items:center;border-radius:16px;border:1px solid rgba(139,92,246,.18);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(237,231,255,.86));box-shadow:0 8px 24px rgba(109,40,217,.1);flex:none}
.ghb-icon-bubble img{width:28px;height:28px}
.ghb-section-title{margin:0 0 6px;font-size:1.15rem;font-weight:900;color:#1f0f55}
.ghb-select{min-height:44px;min-width:220px;border:1px solid rgba(124,58,237,.32);background:rgba(255,255,255,.70);color:#1f0f55;border-radius:12px;padding:0 12px;font:inherit;font-weight:800}
.ghb-info-strip{margin-top:14px;border:1px solid rgba(124,58,237,.18);background:linear-gradient(135deg,rgba(237,231,255,.7),rgba(255,255,255,.55));color:#6d28d9;border-radius:12px;padding:12px 15px;font-weight:700;font-size:.9rem}
.ghb-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ghb-field-card{border:1px solid rgba(124,58,237,.18);background:rgba(255,255,255,.52);border-radius:16px;padding:16px}
.ghb-label{display:block;margin:0 0 7px;font-weight:900;color:#1f0f55}
.ghb-help{margin:0 0 10px;color:#5d4b8a;font-size:.9rem;line-height:1.36}
.ghb-input-wrap{display:grid;grid-template-columns:1fr auto;align-items:center;border:1px solid rgba(124,58,237,.32);background:rgba(255,255,255,.72);border-radius:12px;overflow:hidden}
.ghb-input-wrap input{border:0;background:transparent;min-height:44px;padding:0 12px;font:inherit;font-weight:800;color:#1f0f55;width:100%;min-width:0}
.ghb-input-suffix{padding:0 12px;color:#5d4b8a;font-weight:900;white-space:nowrap}
.ghb-time-input{width:100%;min-height:44px;box-sizing:border-box;border:1px solid rgba(124,58,237,.32);background:rgba(255,255,255,.72);color:#1f0f55;border-radius:12px;padding:0 12px;font:inherit;font-weight:800}
.ghb-toggle-row{display:flex;align-items:center;gap:10px;font-weight:800;cursor:pointer;color:#1f0f55;white-space:nowrap;user-select:none}
.ghb-toggle{inline-size:44px;block-size:24px;appearance:none;border:1px solid rgba(124,58,237,.25);border-radius:999px;background:#c4c1d4;position:relative;cursor:pointer;transition:.2s ease;flex-shrink:0}
.ghb-toggle::before{content:'';position:absolute;inline-size:18px;block-size:18px;border-radius:50%;top:2px;left:3px;background:white;box-shadow:0 2px 8px rgba(55,28,122,.22);transition:.2s ease}
.ghb-toggle:checked{background:linear-gradient(135deg,#6d28d9,#8b5cf6)}
.ghb-toggle:checked::before{transform:translateX(19px)}
.ghb-toggle:focus-visible{outline:2px solid #6d28d9;outline-offset:2px}
.ghb-preview-box{border:1px solid rgba(124,58,237,.18);background:linear-gradient(135deg,rgba(237,231,255,.72),rgba(255,255,255,.55));border-radius:16px;padding:16px;margin-top:16px;display:grid;gap:14px}
.ghb-preview-row{display:grid;grid-template-columns:44px 1fr;gap:12px;align-items:center}
.ghb-preview-row img{width:36px;height:36px;padding:6px;border-radius:12px;background:rgba(255,255,255,.70);box-sizing:border-box}
.ghb-button{border:1px solid rgba(124,58,237,.32);background:rgba(255,255,255,.66);color:#1f0f55;border-radius:12px;min-height:42px;padding:0 16px;font-weight:900;cursor:pointer;font-size:inherit;font-family:inherit}
.ghb-button-primary{border:0;color:#fff;background:linear-gradient(135deg,#6d28d9,#351064);box-shadow:0 14px 30px rgba(109,40,217,.22)}
.ghb-button-full{width:100%;min-height:44px}
.ghb-save-bar{position:sticky;bottom:16px;z-index:30;margin-top:16px;padding:14px 16px;display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;background:rgba(255,255,255,.92);box-shadow:0 18px 54px rgba(55,28,122,.11)}
.ghb-save-icon{width:48px;height:48px;border-radius:14px;padding:9px;background:#ede7ff;box-sizing:border-box;flex-shrink:0}
@media(max-width:1180px){.ghb-hero,.ghb-main-grid{grid-template-columns:1fr}.ghb-right{position:static}}
@media(max-width:760px){.ghb-setting-head,.ghb-field-grid,.ghb-save-bar{grid-template-columns:1fr}.ghb-toggle-row{justify-content:flex-start}.ghb-select{min-width:0;width:100%}.ghb-hero-art{min-height:140px}}
:root{--gha-page-bg:#f6f0ff;--gha-card:rgba(255,255,255,.76);--gha-line:rgba(124,58,237,.18);--gha-line-strong:rgba(124,58,237,.32);--gha-text:#1f0f55;--gha-muted:#5d4b8a;--gha-purple:#6d28d9;--gha-purple-2:#8b5cf6;--gha-purple-soft:#ede7ff;--gha-shadow:0 18px 54px rgba(55,28,122,.11);--gha-shadow-soft:0 10px 30px rgba(55,28,122,.075);--gha-radius-xl:24px;--gha-radius-lg:18px;--gha-radius-md:14px}
.gha-page{min-height:100vh;background:radial-gradient(circle at 12% 8%,rgba(216,202,255,.5),transparent 30%),radial-gradient(circle at 90% 14%,rgba(233,213,255,.36),transparent 30%),var(--gha-page-bg);color:var(--gha-text)}
.gha-shell{width:100%;max-width:1500px;margin:0 auto;padding:30px 0 112px;box-sizing:border-box}
.gha-card,.gha-save-bar{border:1px solid var(--gha-line);background:var(--gha-card);border-radius:var(--gha-radius-xl);box-shadow:var(--gha-shadow-soft);backdrop-filter:blur(18px)}
.gha-hero{display:grid;grid-template-columns:220px minmax(0,1fr) 350px;gap:24px;align-items:stretch;margin-bottom:22px}
.gha-hero-art{min-height:210px;border-radius:var(--gha-radius-xl);border:1px solid var(--gha-line);background-image:url('/assets/ghostlight/heartbeat-actions/heartbeat-actions-hero-orb.svg');background-size:cover;background-position:center;box-shadow:var(--gha-shadow-soft)}
.gha-hero-text{display:grid;align-content:center;padding:22px 8px}
.gha-title{margin:0 0 12px;font-size:clamp(2rem,3vw,3.05rem);line-height:1;letter-spacing:-0.04em;font-family:Georgia,'Times New Roman',serif}
.gha-subtitle{margin:0;color:var(--gha-muted);font-size:1.02rem;line-height:1.58;max-width:820px}
.gha-side-card,.gha-panel{padding:24px}
.gha-side-title,.gha-section-title{margin:0 0 12px;display:flex;gap:12px;align-items:center;font-size:1.25rem;font-weight:900}
.gha-side-title img,.gha-section-title img{width:30px;height:30px}
.gha-copy{margin:0;color:var(--gha-muted);line-height:1.48}
.gha-bullet-list{list-style:none;display:grid;gap:14px;padding:0;margin:18px 0 0}
.gha-bullet-list li{display:grid;grid-template-columns:22px 1fr;gap:10px;color:var(--gha-muted);line-height:1.42}
.gha-bullet-list li::before{content:'•';width:18px;height:18px;border-radius:999px;display:grid;place-items:center;background:rgba(237,231,255,.85);color:var(--gha-purple);font-size:16px;margin-top:2px}
.gha-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:24px;align-items:start}
.gha-left{display:grid;gap:18px}
.gha-right{position:sticky;top:86px;display:grid;gap:18px}
.gha-field-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:18px}
.gha-field-card{display:grid;gap:8px}
.gha-label{display:block;margin:0;font-weight:900}
.gha-help{margin:0;color:var(--gha-muted);font-size:.92rem;line-height:1.36}
.gha-input,.gha-select,.gha-textarea{width:100%;min-height:48px;box-sizing:border-box;border:1px solid var(--gha-line-strong);background:rgba(255,255,255,.72);color:var(--gha-text);border-radius:var(--gha-radius-md);padding:0 14px;font:inherit;font-weight:800}
.gha-textarea{min-height:82px;padding:12px 14px;resize:vertical;font-weight:600}
.gha-inline-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}
.gha-toggle-row{display:flex;align-items:center;gap:12px;font-weight:800}
.gha-toggle{inline-size:46px;block-size:26px;appearance:none;border:1px solid rgba(124,58,237,.25);border-radius:999px;background:#c4c1d4;position:relative;cursor:pointer;transition:.2s ease}
.gha-toggle::before{content:'';position:absolute;inline-size:20px;block-size:20px;border-radius:50%;top:2px;left:3px;background:white;box-shadow:0 2px 8px rgba(55,28,122,.22);transition:.2s ease}
.gha-toggle:checked{background:linear-gradient(135deg,var(--gha-purple),var(--gha-purple-2))}
.gha-toggle:checked::before{transform:translateX(19px)}
.gha-segment{display:inline-flex;border:1px solid var(--gha-line-strong);border-radius:12px;overflow:hidden;background:rgba(255,255,255,.6)}
.gha-segment-label{min-width:64px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--gha-muted);font-weight:900;cursor:pointer;padding:0 12px}
.gha-segment-label.active{background:linear-gradient(135deg,var(--gha-purple),#4f1bc4);color:#fff}
.gha-card-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:14px}
.gha-table-top{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:12px}
.gha-button-group{display:flex;gap:12px}
.gha-button{border:1px solid var(--gha-line-strong);background:rgba(255,255,255,.66);color:var(--gha-text);border-radius:12px;min-height:44px;padding:0 18px;font-weight:900;cursor:pointer;font:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.gha-button-primary{border:0;color:#fff;background:linear-gradient(135deg,var(--gha-purple),#351064);box-shadow:0 16px 34px rgba(109,40,217,.22)}
.gha-table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:16px;border:1px solid var(--gha-line)}
.gha-table th,.gha-table td{padding:14px 12px;text-align:left;font-size:.9rem}
.gha-table thead th{background:rgba(231,222,255,.75);color:var(--gha-muted);font-weight:900}
.gha-table tbody td{background:rgba(255,255,255,.42);border-top:1px solid rgba(124,58,237,.11)}
.gha-empty{border:1px dashed var(--gha-line-strong);border-radius:18px;padding:28px;display:grid;place-items:center;text-align:center;margin-top:12px;background:linear-gradient(135deg,rgba(237,231,255,.45),rgba(255,255,255,.42))}
.gha-empty img{width:74px;height:74px;margin-bottom:12px}
.gha-note{color:var(--gha-muted);font-size:.92rem;margin-top:12px}
.gha-save-bar{position:sticky;bottom:18px;z-index:30;margin-top:18px;padding:16px 18px;display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;background:rgba(255,255,255,.9);box-shadow:var(--gha-shadow)}
.gha-save-icon{width:54px;height:54px;border-radius:16px;padding:10px;background:var(--gha-purple-soft);box-sizing:border-box}
.gha-highlight-list{display:grid;gap:14px;margin-top:12px}
.gha-highlight-item{display:grid;grid-template-columns:52px 1fr;gap:14px;align-items:start;padding:14px;border-radius:16px;background:linear-gradient(135deg,rgba(237,231,255,.72),rgba(255,255,255,.55))}
.gha-highlight-item img{width:40px;height:40px;padding:8px;border-radius:14px;background:rgba(255,255,255,.68)}
@media(max-width:1180px){.gha-hero,.gha-main-grid{grid-template-columns:1fr}.gha-right{position:static}}
@media(max-width:900px){.gha-field-grid,.gha-inline-grid,.gha-save-bar{grid-template-columns:1fr}.gha-table-top{flex-direction:column;align-items:flex-start}}

/* ═══════════════════════════════════════════════════════════════════
   GHOSTLIGHT CINEMATIC COMMAND CENTER — SIDEBAR LAYOUT
   Fixed left sidebar (240px) · teal/violet gothic glass · dark navy
═══════════════════════════════════════════════════════════════════ */

/* Dark mode body & main resets — allow full-bleed sidebar grid */
html[data-theme="dark"] body {
  padding: 0;
  background:
    radial-gradient(ellipse 80% 60% at 0% 0%, rgba(57,215,240,.07), transparent 55%),
    radial-gradient(ellipse 60% 70% at 100% 100%, rgba(139,92,246,.08), transparent 60%),
    #03040A;
}
html[data-theme="dark"] main {
  max-width: none;
  margin: 0;
  padding: 0;
}

/* ── App shell grid ────────────────────────────────────────────── */
.gl-app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

/* ── Sidebar ───────────────────────────────────────────────────── */
.gl-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 100;
}
html[data-theme="dark"] .gl-sidebar {
  background: linear-gradient(180deg, rgba(8,11,20,.97) 0%, rgba(3,4,10,.98) 100%);
  border-right: 1px solid rgba(57,215,240,.13);
  box-shadow: 2px 0 40px rgba(0,0,0,.55), 1px 0 0 rgba(57,215,240,.06);
}
html[data-theme="light"] .gl-sidebar {
  background: #fff;
  border-right: 1px solid #e2e8f0;
  box-shadow: 2px 0 12px rgba(0,0,0,.07);
}
.gl-sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(57,215,240,.18) transparent;
}

/* Brand */
.gl-sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
  text-decoration: none;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(57,215,240,.10);
  margin-bottom: 10px;
}
.gl-sidebar-brand img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.gl-sidebar-brand-name {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 600;
  font-size: 1.15rem;
  letter-spacing: .02em;
  white-space: nowrap;
}
html[data-theme="dark"] .gl-sidebar-brand-name {
  background: linear-gradient(90deg, #F8FAFC 0%, #A9B0C3 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
html[data-theme="light"] .gl-sidebar-brand-name {
  color: #1e293b;
}

/* Nav groups */
.gl-sidebar-nav {
  flex: 1;
  padding: 4px 10px;
}
.gl-nav-group {
  margin-bottom: 2px;
}
.gl-nav-group-label {
  display: block;
  padding: 10px 8px 4px;
  font-size: .67rem;
  font-weight: 600;
  letter-spacing: .10em;
  text-transform: uppercase;
}
html[data-theme="dark"] .gl-nav-group-label { color: rgba(57,215,240,.45); }
html[data-theme="light"] .gl-nav-group-label { color: #94a3b8; }
.gl-nav-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: 8px;
  text-decoration: none;
  font-size: .855rem;
  font-weight: 500;
  transition: background .12s, color .12s, box-shadow .12s;
  margin-bottom: 1px;
}
html[data-theme="dark"] .gl-nav-link { color: #A9B0C3; }
html[data-theme="light"] .gl-nav-link { color: #475569; }
html[data-theme="dark"] .gl-nav-link:hover {
  color: #F8FAFC;
  background: rgba(57,215,240,.07);
}
html[data-theme="light"] .gl-nav-link:hover {
  color: #0f172a;
  background: rgba(57,215,240,.08);
}
html[data-theme="dark"] .gl-nav-link[aria-current="page"] {
  color: #39D7F0;
  background: rgba(57,215,240,.10);
  box-shadow: inset 3px 0 0 #39D7F0, 0 0 20px rgba(57,215,240,.10);
  text-shadow: 0 0 16px rgba(57,215,240,.35);
}
html[data-theme="light"] .gl-nav-link[aria-current="page"] {
  color: #0e7a90;
  background: rgba(57,215,240,.12);
  box-shadow: inset 3px 0 0 #0e7a90;
}
.gl-nav-icon { width: 16px; height: 16px; flex-shrink: 0; display: flex; align-items: center; }
.gl-nav-icon-img { display: block; width: 16px; height: 16px; }
.gl-nav-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Sidebar footer */
.gl-sidebar-footer {
  flex-shrink: 0;
  padding: 12px 10px;
  border-top: 1px solid rgba(57,215,240,.10);
}
html[data-theme="dark"] .gl-sidebar-theme { border-color: rgba(57,215,240,.18); }

/* ── Content area ──────────────────────────────────────────────── */
.gl-app-content {
  min-width: 0;
  overflow-x: hidden;
}
html[data-theme="dark"] .gl-app-content {
  background:
    radial-gradient(ellipse 70% 50% at 100% 0%, rgba(139,92,246,.06), transparent 60%),
    transparent;
}

/* ── Mobile nav (hidden on desktop) ────────────────────────────── */
.gl-mobile-nav { display: none; }

@media (max-width: 860px) {
  .gl-app-shell {
    grid-template-columns: 1fr;
  }
  .gl-sidebar { display: none; }
  .gl-mobile-nav { display: block; }

  html[data-theme="dark"] .gl-mobile-nav {
    background: rgba(8,11,20,.97);
    border-bottom: 1px solid rgba(57,215,240,.13);
  }
  html[data-theme="light"] .gl-mobile-nav {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
  }
  .gl-mobile-nav-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    cursor: pointer;
    list-style: none;
  }
  .gl-mobile-nav-summary::-webkit-details-marker { display: none; }
  .gl-mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 600;
    font-size: 1.1rem;
  }
  html[data-theme="dark"] .gl-mobile-brand { color: #F8FAFC; }
  html[data-theme="light"] .gl-mobile-brand { color: #1e293b; }
  .gl-mobile-logo { width: 28px; height: 28px; object-fit: contain; }
  .gl-mobile-trigger {
    font-size: 1.4rem;
    line-height: 1;
  }
  html[data-theme="dark"] .gl-mobile-trigger { color: #A9B0C3; }
  html[data-theme="light"] .gl-mobile-trigger { color: #64748b; }
  .gl-mobile-panel {
    padding: 8px 10px 16px;
    border-top: 1px solid rgba(57,215,240,.10);
  }
  .gl-mobile-panel .theme-switcher { margin-top: 12px; padding: 0 8px; }
}

/* ── Dark mode — headings ───────────────────────────────────────── */
html[data-theme="dark"] h1 {
  text-shadow: 0 2px 44px rgba(57,215,240,.18), 0 0 80px rgba(139,92,246,.12);
}
html[data-theme="dark"] h2 {
  text-shadow: 0 1px 28px rgba(57,215,240,.12);
}
html[data-theme="dark"] h3 {
  text-shadow: 0 1px 18px rgba(57,215,240,.08);
}
html[data-theme="dark"] .mc-hero-title,
html[data-theme="dark"] .mc-card-title {
  text-shadow: 0 2px 36px rgba(57,215,240,.15);
}

/* ── Dark mode — cards ──────────────────────────────────────────── */
html[data-theme="dark"] .card {
  background: linear-gradient(160deg, rgba(8,11,20,.88) 0%, rgba(3,4,10,.80) 100%);
  border: 1px solid rgba(57,215,240,.10);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 4px 30px rgba(0,0,0,.50), 0 0 0 1px rgba(139,92,246,.05) inset;
}
html[data-theme="dark"] .stat-card {
  background: linear-gradient(160deg, rgba(8,11,20,.90) 0%, rgba(3,4,10,.82) 100%);
  border: 1px solid rgba(57,215,240,.10);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 22px rgba(0,0,0,.45);
}
html[data-theme="dark"] .review-card {
  background: linear-gradient(180deg, rgba(8,11,20,.85) 0%, rgba(3,4,10,.78) 100%);
  border-color: rgba(57,215,240,.10);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
html[data-theme="dark"] .review-card:hover,
html[data-theme="dark"] .review-card:focus-visible {
  border-color: rgba(57,215,240,.28);
  box-shadow: 0 8px 32px rgba(57,215,240,.08), 0 18px 52px rgba(0,0,0,.46);
}
html[data-theme="dark"] .journal-card {
  background: linear-gradient(160deg, rgba(8,11,20,.82) 0%, rgba(3,4,10,.75) 100%);
  border: 1px solid rgba(57,215,240,.09);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
html[data-theme="dark"] .mc-card {
  background: rgba(8,11,20,.85);
  border-color: rgba(57,215,240,.10);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
html[data-theme="dark"] .companion-hero {
  background: linear-gradient(135deg, rgba(139,92,246,.12) 0%, rgba(57,215,240,.06) 100%);
  border-color: rgba(139,92,246,.28);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 4px 34px rgba(139,92,246,.12), 0 0 70px rgba(57,215,240,.05);
}

/* ── Dark mode — buttons ────────────────────────────────────────── */
html[data-theme="dark"] .toolbar-button:not(.secondary):not(.danger):not([aria-disabled="true"]):not(.is-disabled):not(:disabled) {
  background: linear-gradient(135deg, #2EC7E0 0%, #1AAFC8 60%, #0E92A8 100%);
  box-shadow: 0 6px 24px rgba(57,215,240,.25), 0 0 0 1px rgba(102,230,255,.16) inset;
  text-shadow: 0 1px 4px rgba(0,0,0,.24);
}
html[data-theme="dark"] .toolbar-button:not(.secondary):not(.danger):not([aria-disabled="true"]):not(.is-disabled):not(:disabled):hover {
  background: linear-gradient(135deg, #66E5FF 0%, #39D7F0 60%, #2EC7E0 100%);
  box-shadow: 0 10px 34px rgba(57,215,240,.38), 0 0 0 1px rgba(102,230,255,.22) inset;
}
html[data-theme="dark"] .button-link:not(.button-link-secondary) {
  background: linear-gradient(135deg, #2EC7E0 0%, #1AAFC8 60%);
  box-shadow: 0 6px 24px rgba(57,215,240,.25);
}
html[data-theme="dark"] .button-link:not(.button-link-secondary):hover {
  background: linear-gradient(135deg, #66E5FF 0%, #39D7F0 60%);
  box-shadow: 0 10px 34px rgba(57,215,240,.38);
  color: #03040A;
}

/* ── Dark mode — inputs ─────────────────────────────────────────── */
html[data-theme="dark"] input:focus,
html[data-theme="dark"] textarea:focus,
html[data-theme="dark"] select:focus {
  border-color: rgba(57,215,240,.55);
  box-shadow: 0 0 0 3px rgba(57,215,240,.12), 0 0 18px rgba(57,215,240,.08);
  background: rgba(8,11,20,.82);
}
html[data-theme="dark"] .switch-control input:checked + span {
  background: rgba(57,215,240,.14);
  border-color: rgba(57,215,240,.42);
  box-shadow: 0 0 14px rgba(57,215,240,.20);
}

/* ── Dark mode — notices ────────────────────────────────────────── */
html[data-theme="dark"] .notice.success {
  background: rgba(5,26,24,.86);
  border-color: rgba(26,78,72,.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 0 28px rgba(57,215,240,.06);
}
html[data-theme="dark"] .notice.error {
  background: rgba(28,6,24,.86);
  border-color: rgba(90,30,56,.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ── Dark mode — subnav ─────────────────────────────────────────── */
html[data-theme="dark"] .page-subnav a[aria-current="page"] {
  background: rgba(8,11,20,.85);
  border-color: rgba(57,215,240,.22);
  box-shadow: 0 0 14px rgba(139,92,246,.10);
}

/* ── Dark mode — tables ─────────────────────────────────────────── */
html[data-theme="dark"] .memory-table thead th,
html[data-theme="dark"] .model-table thead th {
  background: rgba(8,11,20,.95);
  border-bottom-color: rgba(57,215,240,.14);
}

/* ── Dark mode — MC save bar ────────────────────────────────────── */
html[data-theme="dark"] .mc-save-bar {
  background: rgba(3,4,10,.93);
  border-color: rgba(57,215,240,.14);
  box-shadow: 0 0 0 1px rgba(57,215,240,.06) inset, 0 -8px 34px rgba(0,0,0,.55);
}

/* ── Dark mode — stream edge fades ─────────────────────────────── */
html[data-theme="dark"] .home-image-stream-wrap::before,
html[data-theme="dark"] .home-journal-stream-wrap::before {
  background: linear-gradient(90deg, #03040A, transparent);
}
html[data-theme="dark"] .home-image-stream-wrap::after,
html[data-theme="dark"] .home-journal-stream-wrap::after {
  background: linear-gradient(270deg, #03040A, transparent);
}
html[data-theme="dark"] .home-decision-card {
  border-bottom-color: rgba(57,215,240,.12);
}

/* ── Dark mode — inner life entry cards ──────────────────────────── */
html[data-theme="dark"] .home-il-section {
  border-top-color: rgba(57,215,240,.10);
}
html[data-theme="dark"] .home-il-entry-card {
  background: linear-gradient(160deg, rgba(8,11,20,.88), rgba(3,4,10,.80));
  border-color: rgba(57,215,240,.10);
}
html[data-theme="dark"] .home-il-type-badge {
  background: rgba(139,92,246,.10);
  border-color: rgba(139,92,246,.25);
  color: #c4b5fd;
}
html[data-theme="dark"] .home-il-status-used_in_prelude {
  color: #39D7F0;
  opacity: 1;
}
html[data-theme="dark"] .il-entry-card {
  background: linear-gradient(160deg, rgba(8,11,20,.90), rgba(3,4,10,.82));
  border-color: rgba(57,215,240,.10);
  box-shadow: 0 2px 16px rgba(0,0,0,.35);
}
html[data-theme="dark"] .il-entry-card--warning {
  border-color: rgba(239,68,68,.22);
  background: linear-gradient(160deg, rgba(20,6,6,.88), rgba(10,3,3,.80));
}
html[data-theme="dark"] .il-entry-type-badge {
  background: rgba(139,92,246,.10);
  border-color: rgba(139,92,246,.25);
  color: #c4b5fd;
}
html[data-theme="dark"] .il-entry-status-used {
  color: #39D7F0;
}
html[data-theme="dark"] .il-entry-type-desc {
  border-top-color: rgba(57,215,240,.08);
  color: rgba(169,176,195,.65);
}

/* ── Dark mode — code blocks ────────────────────────────────────── */
html[data-theme="dark"] code {
  background: rgba(8,11,20,.85);
  border: 1px solid rgba(57,215,240,.12);
}
`;


