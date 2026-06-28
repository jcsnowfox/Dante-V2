"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { LOW_CARB_NORDIC_RECIPE_SEEDS, renderHomePage } = require("./renderAdminPages/topLevelPages");
const { resolveNordicIcon } = require("./nordicDashboardAssets");
const { renderShell } = require("./renderAdminPages/shared");

const helpers = {
  escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
  buildAdminLocation({ path, extra }) {
    const params = new URLSearchParams(extra || {});
    return params.toString() ? `${path}?${params}` : path;
  },
  renderIconImage(kind) {
    return `<span data-icon="${kind}"></span>`;
  },
  withThemeField() {
    return "";
  },
  renderLayout({ body }) {
    return body;
  },
};

function render(stats = {}) {
  return renderHomePage({
    theme: "dark",
    helpers,
    stats: {
      timezone: "UTC",
      companion: { name: "Dante <Wolf>", avatarUrl: "", profile: "Fjord & command. Second sentence stays. Third sentence stays. Fourth sentence must not render as the dominant body." },
      statuses: [
        { label: "Chat model", value: "gpt-test", icon: "companion", path: "/admin/companion", extra: { companionTab: "models" } },
        { label: "Daily thread", value: "Off", icon: "automation", path: "/admin/schedules/daily-thread" },
        { label: "Heartbeat", value: "normal", icon: "heartbeat", path: "/admin/heartbeat/timing" },
      ],
      featureStates: [{ label: "Images", icon: "gallery", active: true, path: "/admin/tools/images" }],
      recentDecisions: [
        { label: "<Check>", status: "fired", executorType: "send_message", at: "2026-06-28T10:00:00Z", why: "Used <live> heartbeat" },
      ],
      recentImages: [
        { imageId: "img-1", previewUrl: "/admin/media/live-generated-thumb.webp", altText: "Live <gallery>", tagline: "Saved by Dante", aspectRatio: "4:5" },
      ],
      recentJournals: [
        { entryId: "journal-1", title: "Dream <entry>", content: "Safe <journal> text", createdAt: "2026-06-28T09:00:00Z" },
      ],
      ...stats,
    },
  });
}

test("home dashboard renders cinematic Nordic layout without fake links", () => {
  const html = render();
  assert.match(html, /data-dashboard="nordic-home"/);
  assert.match(html, /nordic-home-wide/);
  assert.match(html, /Companion command center/);
  assert.match(html, /Current Setup/);
  assert.match(html, /Recent Actions/);
  assert.match(html, /Gallery/);
  assert.match(html, /Nordic Low-Carb Recipes/);
  assert.match(html, /Battle Rhythm Training/);
  assert.match(html, /Travel Saga/);
  assert.match(html, /Travel Checklist/);
  assert.match(html, /Dante Concierge Planning Brief/);
  assert.match(html, /Journal Entries/);
  assert.doesNotMatch(html, /href="#"/);
  assert.match(html, /Online/);
  assert.match(html, /Fjord &amp; command\.\s+Second sentence stays\.\s+Third sentence stays\./);
  assert.doesNotMatch(html, /Fourth sentence must not render/);
});

test("gallery renders only supplied live media URLs and empty state when absent", () => {
  const html = render();
  assert.match(html, /\/admin\/media\/live-generated-thumb\.webp/);
  assert.match(html, /class="nordic-gallery-img" src="\/admin\/media\/live-generated-thumb\.webp"/);
  assert.match(html, /class="nordic-gallery-media-bg" src="\/admin\/media\/live-generated-thumb\.webp"/);
  assert.doesNotMatch(html, /09-user-reference-battle-meal-plans/);
  assert.doesNotMatch(html, /approved-dashboard-layout-reference/);
  const gallerySection = html.match(/<section class="nordic-panel nordic-home-gallery"[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(gallerySection, /class="nordic-gallery-img" src="\/assets\/nordic-dashboard/);
  assert.doesNotMatch(html, /user-dante-gallery-example/);
  assert.doesNotMatch(gallerySection, /<span>Saved by Dante<\/span>/);
  assert.match(gallerySection, /nordic-gallery-caption/);

  const empty = render({ recentImages: [] });
  assert.match(empty, /No gallery images yet\./);
  assert.doesNotMatch(empty, /nordic-dashboard\/09-user-reference-battle-meal-plans/);
});


test("gallery media area keeps prompt text below images and uses matching live preview URLs", () => {
  const longPrompt = "A".repeat(120);
  const html = render({
    recentImages: [{ imageId: "img-2", previewUrl: "/admin/media/live-two.webp", altText: longPrompt, tagline: longPrompt, aspectRatio: "1:1" }],
  });
  const card = html.match(/<a class="nordic-home-gallery-tile nordic-gallery-card"[\s\S]*?<\/a>/)?.[0] || "";
  const media = card.match(/<span class="nordic-gallery-media">[\s\S]*?<\/span>/)?.[0] || "";
  const caption = card.match(/<span class="nordic-gallery-caption">[\s\S]*?<\/span>/)?.[0] || "";
  assert.doesNotMatch(media, /A{20}/);
  assert.match(media, /class="nordic-gallery-media-bg" src="\/admin\/media\/live-two\.webp"/);
  assert.match(media, /class="nordic-gallery-img" src="\/admin\/media\/live-two\.webp"/);
  assert.doesNotMatch(media, /\/assets\/nordic-dashboard/);
  assert.ok(caption.includes("…"));
  assert.ok(caption.length < 260);
});

test("recipe cards are real external low-carb links", () => {
  const html = render();
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /https:\/\//);
  assert.match(html, /carbs \/ serving/);
  for (const recipe of LOW_CARB_NORDIC_RECIPE_SEEDS) {
    assert.ok(recipe.sourceUrl, `${recipe.id} sourceUrl`);
    assert.ok(recipe.carbsPerServing < 40, `${recipe.id} carbs`);
  }
});

test("home dashboard root exposes actual cinematic asset urls", () => {
  const html = render();
  assert.match(html, /aurora-fjord-dashboard-bg\.png/);
  assert.match(html, /moonlit-coastal-fortress\.png/);
  assert.match(html, /panel-frame-wide\.svg/);
  assert.match(html, /panel-frame-hero\.svg/);
  assert.match(html, /rune-strip\.svg/);
});

test("battle rhythm schedule matches the corrected weekly plan", () => {
  const html = render();
  const expected = [
    ["Monday", "Strength", "Carnivore"],
    ["Tuesday", "Recovery", "Carnivore"],
    ["Wednesday", "Cardio", "Controlled carb / torch day"],
    ["Thursday", "Recovery / reset", "Carnivore"],
    ["Friday", "Endurance", "Carnivore"],
    ["Saturday", "Active recovery / torch/refuel support", "Controlled carb / torch day"],
    ["Sunday", "Full reset / flexible day", "Flexible / Irish fry-up / reset"],
  ];
  assert.equal((html.match(/class="battle-rhythm-card"/g) || []).length, 7);
  for (const row of expected) {
    for (const value of row) assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("journal and recent action cards escape unsafe text", () => {
  const html = render();
  assert.match(html, /Dante &lt;Wolf&gt;/);
  assert.match(html, /&lt;Check&gt;/);
  assert.match(html, /Used &lt;live&gt; heartbeat/);
  assert.match(html, /Dream &lt;entry&gt;/);
  assert.match(html, /Safe &amp;lt;journal&amp;gt; text|Safe &lt;journal&gt; text/);
  assert.doesNotMatch(html, /<script>/);
});


test("home dashboard links route to real admin paths and UI-only modules do not fake actions", () => {
  const html = render();
  const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.match(href, /^(?:\/admin(?:\/|\?|$)|https:\/\/)/);
    assert.doesNotMatch(href, /\?.*\?/);
  }
  assert.doesNotMatch(html, /View all/i);
  assert.doesNotMatch(html, /Plan Adventure/i);
  assert.doesNotMatch(html, /Ask Concierge/i);
  assert.match(html, /Dante Concierge Planning Brief/);
  assert.match(html, /Planning Brief|Preview/);
  assert.match(html, /No live web search/);
  assert.doesNotMatch(html, /live web search is connected/i);
  assert.doesNotMatch(html, /UI-only recipe cards/);
  assert.match(html, /Real low-carb recipe links/);
  assert.match(html, /Checklist shell/);
});

test("uploaded icons resolve through nordic dashboard alias and sidebar nav remains separate", () => {
  assert.match(resolveNordicIcon("journal").src, /^\/assets\/nordic-dashboard\/01-icons\/transparent-128\//);
  const shell = renderShell({
    currentSection: "home",
    pageBody: "<main>Body</main>",
    theme: "dark",
    themeLinks: { light: "/admin?theme=light", dark: "/admin?theme=dark" },
    config: {},
    helpers,
  });
  assert.match(shell, /gl-nav-link/);
  assert.match(shell, /Gallery/);
  assert.match(shell, /<main>Body<\/main>/);
});
