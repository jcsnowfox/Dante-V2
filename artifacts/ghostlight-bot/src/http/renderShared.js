const adminStyles = require("./adminStyles");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTheme(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "dark" ? "dark" : "light";
}

function renderLayout({
  title,
  body,
  message = "",
  error = "",
  theme = "light",
  themeLinks = null,
  hideTitle = false,
  hideTopbar = false,
}) {
  const notice = message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const warning = error ? `<p class="notice error">${escapeHtml(error)}</p>` : "";
  const activeTheme = normalizeTheme(theme);
  const themeSwitcher = themeLinks
    ? [
      "<div class=\"theme-switcher\" aria-label=\"Theme toggle\">",
      `<a href="${escapeHtml(themeLinks.light)}"${activeTheme === "light" ? " aria-current=\"page\"" : ""}>Light</a>`,
      `<a href="${escapeHtml(themeLinks.dark)}"${activeTheme === "dark" ? " aria-current=\"page\"" : ""}>Dark</a>`,
      "</div>",
    ].join("")
    : "";
  const helpTooltipScript = [
    "<script>",
    "(()=>{",
    "const positionHelp=(help)=>{",
    "const rect=help.getBoundingClientRect();",
    "const tipWidth=Math.min(304,window.innerWidth-32);",
    "const center=rect.left+(rect.width/2);",
    "const leftEdge=center-(tipWidth/2);",
    "const rightEdge=center+(tipWidth/2);",
    "let offset=0;",
    "if(leftEdge<16){offset=16-leftEdge;}",
    "if(rightEdge>window.innerWidth-16){offset=(window.innerWidth-16)-rightEdge;}",
    "help.style.setProperty('--help-left',`calc(50% + ${offset}px)`);",
    "help.style.setProperty('--help-shift','-50%');",
    "};",
    "const closeHelp=()=>{document.querySelectorAll('.field-help.is-open').forEach((el)=>{el.classList.remove('is-open');el.setAttribute('aria-expanded','false');});};",
    "document.addEventListener('pointerover',(event)=>{const help=event.target.closest?.('.field-help');if(help){positionHelp(help);}});",
    "document.addEventListener('focusin',(event)=>{const help=event.target.closest?.('.field-help');if(help){positionHelp(help);}});",
    "document.addEventListener('click',(event)=>{",
    "const help=event.target.closest?.('.field-help');",
    "if(!help){closeHelp();return;}",
    "event.preventDefault();",
    "event.stopPropagation();",
    "const wasOpen=help.classList.contains('is-open');",
    "closeHelp();",
    "if(!wasOpen){positionHelp(help);help.classList.add('is-open');help.setAttribute('aria-expanded','true');}",
    "});",
    "window.addEventListener('resize',closeHelp);",
    "document.addEventListener('keydown',(event)=>{",
    "const help=event.target.closest?.('.field-help');",
    "if(event.key==='Escape'){closeHelp();}",
    "if(!help || (event.key!=='Enter' && event.key!==' ')){return;}",
    "event.preventDefault();",
    "help.click();",
    "});",
    "})();",
    "</script>",
  ].join("");

  return [
    "<!doctype html>",
    `<html lang="en" data-theme="${escapeHtml(activeTheme)}">`,
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<link rel=\"icon\" href=\"/assets/favicons/favicon.ico\" sizes=\"any\">",
    "<link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/assets/favicons/favicon-32x32.png\">",
    "<link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/assets/favicons/favicon-16x16.png\">",
    "<link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/assets/favicons/apple-touch-icon.png\">",
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    adminStyles,
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    hideTopbar
      ? ""
      : [
        "<div class=\"topbar\">",
        hideTitle ? "" : `<div class="title-block"><h1>${escapeHtml(title)}</h1></div>`,
        themeSwitcher,
        "</div>",
      ].join(""),
    notice,
    warning,
    body,
    "</main>",
    helpTooltipScript,
    "</body>",
    "</html>",
  ].join("");
}

function renderEntryPage({ productLabel = "Ghostlight", ready = false, theme = "light", renderIconImage }) {
  const activeTheme = normalizeTheme(theme);
  const adminHref = `/admin?theme=${encodeURIComponent(activeTheme)}`;
  const logo = renderIconImage("logo", activeTheme, `${productLabel} logo`, "entry-logo-image");

  const body = [
    "<section class=\"entry-shell\">",
    "<a class=\"entry-brand\" href=\"/admin\">",
    `<span class="entry-logo">${logo}</span>`,
    "</a>",
    `<h1 class="entry-title">${escapeHtml(productLabel)}</h1>`,
    "<p class=\"entry-copy\">Your AI lives in Discord. This is the admin space where you manage setup, memories, and the maintenance behind the scenes.</p>",
    "<div class=\"entry-actions\">",
    `<a class="button-link" href="${escapeHtml(adminHref)}">Open Admin</a>`,
    `<a class="button-link button-link-secondary" href="/health">${ready ? "System Status" : "Starting Up"}</a>`,
    "</div>",
    "</section>",
  ].join("");

  return renderLayout({
    title: productLabel,
    body,
    theme,
    hideTitle: true,
  });
}

module.exports = {
  renderLayout,
  renderEntryPage,
  escapeHtml,
  normalizeTheme,
};
