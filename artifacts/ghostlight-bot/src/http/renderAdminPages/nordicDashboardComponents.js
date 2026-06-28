"use strict";

const { renderIcon } = require("../iconLibrary");
const { resolveNordicIcon } = require("../nordicDashboardAssets");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classNames(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function attrs(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== "")
    .map(([key, value]) => value === true ? ` ${escapeHtml(key)}` : ` ${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join("");
}

function renderOptionalAction({ href = "", label = "", className = "nordic-pill", ariaLabel = "" } = {}) {
  const safeLabel = String(label || "").trim();
  const safeHref = String(href || "").trim();
  if (!safeLabel) return "";
  if (!safeHref) return `<span class="${escapeHtml(className)}">${escapeHtml(safeLabel)}</span>`;
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(safeHref)}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>${escapeHtml(safeLabel)}</a>`;
}

function renderNordicIcon(name, { alt = "", decorative = false, className = "", size = "" } = {}) {
  const icon = resolveNordicIcon(name);
  const classes = classNames("nordic-icon", className);
  const style = size ? `--nordic-icon-size:${escapeHtml(size)}` : "";
  if (icon.src) {
    const a11y = decorative || !alt
      ? ' aria-hidden="true"'
      : ` alt="${escapeHtml(alt)}"`;
    const hiddenAlt = decorative || !alt ? ' alt=""' : "";
    return `<img class="${escapeHtml(classes)}" src="${escapeHtml(icon.src)}"${hiddenAlt}${a11y}${style ? ` style="${style}"` : ""}>`;
  }
  return renderIcon(icon.fallbackKind, { className: classes, alt: decorative ? "" : alt });
}

function renderNordicPill({ label = "", tone = "", icon = "", href = "", ariaLabel = "" } = {}) {
  const content = [
    icon ? renderNordicIcon(icon, { decorative: true }) : "",
    `<span>${escapeHtml(label)}</span>`,
  ].join("");
  const className = classNames("nordic-pill", tone && `nordic-pill--${tone}`);
  if (!href) return `<span class="${escapeHtml(className)}">${content}</span>`;
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(href)}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>${content}</a>`;
}

function renderNordicDivider({ label = "", icon = "" } = {}) {
  return [
    "<div class=\"nordic-divider\" role=\"separator\">",
    icon ? renderNordicIcon(icon, { decorative: true }) : "",
    label ? `<span>${escapeHtml(label)}</span>` : "<span aria-hidden=\"true\"></span>",
    "</div>",
  ].join("");
}

function renderNordicPanel({ title = "", eyebrow = "", body = "", children = "", actions = [], icon = "", variant = "", wide = false, compact = false, id = "", headingLevel = 2 } = {}) {
  const h = Math.min(6, Math.max(2, Number(headingLevel) || 2));
  const panelClass = classNames("nordic-panel", variant && `nordic-panel--${variant}`, wide && "nordic-panel--wide", compact && "nordic-panel--compact");
  const renderedActions = actions.map((action) => renderOptionalAction({ ...action, className: classNames("nordic-pill", action.className) })).join("");
  const header = title || eyebrow || icon || renderedActions
    ? [
      "<header class=\"nordic-panel__header\">",
      icon ? `<span class="nordic-panel__icon">${renderNordicIcon(icon, { decorative: true })}</span>` : "",
      "<div class=\"nordic-panel__title-wrap\">",
      eyebrow ? `<p class="nordic-eyebrow">${escapeHtml(eyebrow)}</p>` : "",
      title ? `<h${h} class="nordic-panel__title">${escapeHtml(title)}</h${h}>` : "",
      "</div>",
      renderedActions ? `<div class="nordic-panel__actions">${renderedActions}</div>` : "",
      "</header>",
    ].join("")
    : "";
  return `<section class="${escapeHtml(panelClass)}"${attrs({ id })}>${header}${body ? `<p class="nordic-panel__body">${escapeHtml(body)}</p>` : ""}${children || ""}</section>`;
}

function renderNordicStatCard({ label = "", value = "", detail = "", icon = "", tone = "", href = "" } = {}) {
  const content = [
    icon ? `<span class="nordic-stat-card__icon">${renderNordicIcon(icon, { decorative: true })}</span>` : "",
    "<span class=\"nordic-stat-card__copy\">",
    label ? `<span class="nordic-stat-card__label">${escapeHtml(label)}</span>` : "",
    `<strong class="nordic-stat-card__value">${escapeHtml(value || "—")}</strong>`,
    detail ? `<span class="nordic-stat-card__detail">${escapeHtml(detail)}</span>` : "",
    "</span>",
  ].join("");
  const className = classNames("nordic-stat-card", tone && `nordic-stat-card--${tone}`);
  return href ? `<a class="${escapeHtml(className)}" href="${escapeHtml(href)}">${content}</a>` : `<article class="${escapeHtml(className)}">${content}</article>`;
}

function renderNordicHeroShell({ title = "", subtitle = "", eyebrow = "", children = "", actions = [], icon = "companion" } = {}) {
  const renderedActions = actions.map((action) => renderOptionalAction({ ...action, className: classNames("nordic-pill", action.className) })).join("");
  return renderNordicPanel({
    variant: "hero",
    children: [
      "<div class=\"nordic-hero\">",
      "<div class=\"nordic-hero__copy\">",
      eyebrow ? `<p class="nordic-eyebrow">${escapeHtml(eyebrow)}</p>` : "",
      title ? `<h1 class="nordic-hero__title">${escapeHtml(title)}</h1>` : "",
      subtitle ? `<p class="nordic-hero__subtitle">${escapeHtml(subtitle)}</p>` : "",
      renderedActions ? `<div class="nordic-hero__actions">${renderedActions}</div>` : "",
      "</div>",
      `<div class="nordic-hero__sigil" aria-hidden="true">${renderNordicIcon(icon, { decorative: true })}</div>`,
      "</div>",
      children,
    ].join(""),
  });
}

function renderNordicCarouselShell({ title = "", items = [], emptyText = "", ariaLabel = "Nordic carousel" } = {}) {
  const renderedItems = items.filter(Boolean).join("");
  return renderNordicPanel({
    title,
    variant: "wide",
    children: renderedItems
      ? `<div class="nordic-carousel" role="list" aria-label="${escapeHtml(ariaLabel)}">${renderedItems}</div>`
      : `<p class="nordic-empty">${escapeHtml(emptyText || "Nothing to show yet.")}</p>`,
  });
}

function renderNordicTimelineItem({ title = "", time = "", body = "", icon = "heartbeat", href = "" } = {}) {
  const content = [
    `<span class="nordic-timeline__icon">${renderNordicIcon(icon, { decorative: true })}</span>`,
    "<span class=\"nordic-timeline__copy\">",
    title ? `<strong>${escapeHtml(title)}</strong>` : "",
    time ? `<time>${escapeHtml(time)}</time>` : "",
    body ? `<span>${escapeHtml(body)}</span>` : "",
    "</span>",
  ].join("");
  return href ? `<a class="nordic-timeline__item" href="${escapeHtml(href)}">${content}</a>` : `<article class="nordic-timeline__item">${content}</article>`;
}

function renderNordicJournalCard({ title = "", excerpt = "", date = "", href = "", icon = "journal" } = {}) {
  const content = [
    `<span class="nordic-journal-card__icon">${renderNordicIcon(icon, { decorative: true })}</span>`,
    date ? `<time class="nordic-journal-card__date">${escapeHtml(date)}</time>` : "",
    title ? `<h3>${escapeHtml(title)}</h3>` : "",
    excerpt ? `<p>${escapeHtml(excerpt)}</p>` : "",
  ].join("");
  return href ? `<a class="nordic-journal-card" href="${escapeHtml(href)}">${content}</a>` : `<article class="nordic-journal-card">${content}</article>`;
}

function renderNordicRecipeCard({ title = "", description = "", meta = [], icon = "tools", href = "" } = {}) {
  const chips = meta.map((item) => renderNordicPill({ label: item })).join("");
  const content = `${renderNordicIcon(icon, { decorative: true })}${title ? `<h3>${escapeHtml(title)}</h3>` : ""}${description ? `<p>${escapeHtml(description)}</p>` : ""}${chips ? `<div class="nordic-recipe-card__meta">${chips}</div>` : ""}`;
  return href ? `<a class="nordic-recipe-card" href="${escapeHtml(href)}">${content}</a>` : `<article class="nordic-recipe-card">${content}</article>`;
}

function renderBattleRhythmDayCard({ day = "", status = "", items = [], href = "" } = {}) {
  const list = items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  const content = `${day ? `<h3>${escapeHtml(day)}</h3>` : ""}${status ? renderNordicPill({ label: status, tone: "cyan" }) : ""}${list}`;
  return href ? `<a class="battle-rhythm-card" href="${escapeHtml(href)}">${content}</a>` : `<article class="battle-rhythm-card">${content}</article>`;
}

function renderTravelSagaCard({ title = "", location = "", description = "", href = "", icon = "gallery" } = {}) {
  const content = `${renderNordicIcon(icon, { decorative: true })}${location ? `<p class="nordic-eyebrow">${escapeHtml(location)}</p>` : ""}${title ? `<h3>${escapeHtml(title)}</h3>` : ""}${description ? `<p>${escapeHtml(description)}</p>` : ""}`;
  return href ? `<a class="travel-saga-card" href="${escapeHtml(href)}">${content}</a>` : `<article class="travel-saga-card">${content}</article>`;
}

function renderTravelChecklistItem({ label = "", checked = false, detail = "" } = {}) {
  return `<div class="travel-checklist-item${checked ? " is-complete" : ""}"><span class="travel-checklist-item__mark" aria-hidden="true">${checked ? "✓" : ""}</span><span><strong>${escapeHtml(label)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span></div>`;
}

module.exports = {
  escapeHtml,
  renderNordicPanel,
  renderNordicStatCard,
  renderNordicHeroShell,
  renderNordicCarouselShell,
  renderNordicTimelineItem,
  renderNordicJournalCard,
  renderNordicRecipeCard,
  renderBattleRhythmDayCard,
  renderTravelSagaCard,
  renderTravelChecklistItem,
  renderNordicPill,
  renderNordicDivider,
  renderNordicIcon,
};
