"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  NORDIC_DASHBOARD_ASSET_BASE,
  NORDIC_DASHBOARD_ASSETS,
  NORDIC_DASHBOARD_ICON_BASE,
  NORDIC_PENDING_MANUAL_ASSETS,
  NORDIC_ICON_FALLBACKS,
  isNordicDashboardEnabled,
  resolveNordicIcon,
} = require("./nordicDashboardAssets");

const {
  renderNordicHeroShell,
  renderNordicIcon,
  renderNordicJournalCard,
  renderNordicPanel,
  renderNordicPill,
  renderNordicStatCard,
  renderTravelChecklistItem,
} = require("./renderAdminPages/nordicDashboardComponents");

test("nordic dashboard assets are manifest-backed and feature-flagged off by default", () => {
  assert.equal(NORDIC_DASHBOARD_ASSET_BASE, "/assets/nordic-dashboard");
  assert.equal(NORDIC_DASHBOARD_ICON_BASE, "/assets/nordic-dashboard/icons");
  assert.equal(isNordicDashboardEnabled({}), false);
  assert.equal(isNordicDashboardEnabled({ NEXT_PUBLIC_NORDIC_DASHBOARD: "true" }), true);
  assert.equal(isNordicDashboardEnabled({ NORDIC_DASHBOARD_ENABLED: "1" }), true);

  const manifestPath = path.join(process.cwd(), "assets", "nordic-dashboard", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.basePath, NORDIC_DASHBOARD_ASSET_BASE);
  assert.equal(manifest.iconBasePath, NORDIC_DASHBOARD_ICON_BASE);

  assert.deepEqual(manifest.assets, {});
  assert.equal(
    NORDIC_PENDING_MANUAL_ASSETS.auroraVikingDashboardReference,
    manifest.pendingManualAssets.auroraVikingDashboardReference.expectedStaticUrl,
  );
  assert.match(manifest.pendingManualAssets.auroraVikingDashboardReference.usageNotes, /Pending manual upload/);
  assert.equal(manifest.pendingManualAssets.auroraVikingDashboardReference.decorative, true);
  assert.equal(NORDIC_DASHBOARD_ASSETS.manifest, `${NORDIC_DASHBOARD_ASSET_BASE}/manifest.json`);
});

test("nordic icon mapping resolves semantic names and missing icons gracefully", () => {
  assert.equal(resolveNordicIcon("journal").fallbackKind, NORDIC_ICON_FALLBACKS.journal);
  assert.equal(resolveNordicIcon("spotifySong").fallbackKind, "music");
  assert.equal(resolveNordicIcon("missing-icon-name").fallbackKind, NORDIC_ICON_FALLBACKS.settings);

  const renderedKnown = renderNordicIcon("journal", { alt: "Journal" });
  assert.match(renderedKnown, /class="nordic-icon"/);
  assert.match(renderedKnown, /aria-label="Journal"/);

  const renderedMissing = renderNordicIcon("missing-icon-name", { decorative: true });
  assert.match(renderedMissing, /nordic-icon/);
  assert.match(renderedMissing, /aria-hidden="true"/);
});

test("nordic server-rendered helpers escape text and avoid fake links", () => {
  const panel = renderNordicPanel({
    title: "<script>alert(1)</script>",
    body: "Fjord & aurora",
    actions: [{ label: "View all" }],
  });
  assert.doesNotMatch(panel, /<script>/);
  assert.match(panel, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(panel, /Fjord &amp; aurora/);
  assert.doesNotMatch(panel, /href="#"/);
  assert.match(panel, /<span class="nordic-pill">View all<\/span>/);

  const stat = renderNordicStatCard({ label: "Memory", value: "12", detail: "Live", icon: "memory" });
  assert.match(stat, /^<article class="nordic-stat-card">/);
  assert.doesNotMatch(stat, /href="#"/);

  const linkedStat = renderNordicStatCard({ label: "Memory", value: "12", href: "/admin/memory/library" });
  assert.match(linkedStat, /^<a class="nordic-stat-card" href="\/admin\/memory\/library">/);
});

test("nordic specialized helpers stay data-driven and accessible", () => {
  const hero = renderNordicHeroShell({ title: "Companion <Name>", subtitle: "Live status", actions: [{ label: "Open", href: "/admin" }] });
  assert.match(hero, /Companion &lt;Name&gt;/);
  assert.match(hero, /href="\/admin"/);
  assert.doesNotMatch(hero, /Dante/);

  const journal = renderNordicJournalCard({ title: "Journal & memory", excerpt: "No unsafe <html>", date: "Today" });
  assert.match(journal, /^<article class="nordic-journal-card">/);
  assert.match(journal, /No unsafe &lt;html&gt;/);

  const pill = renderNordicPill({ label: "Search", icon: "search" });
  assert.match(pill, /^<span class="nordic-pill">/);
  assert.doesNotMatch(pill, /href="#"/);

  const checklist = renderTravelChecklistItem({ label: "Pack", detail: "Warm layers", checked: true });
  assert.match(checklist, /is-complete/);
  assert.match(checklist, /aria-hidden="true"/);
});
