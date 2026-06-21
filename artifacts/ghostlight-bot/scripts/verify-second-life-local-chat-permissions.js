/**
 * verify-second-life-local-chat-permissions.js
 *
 * Phase 26 verification — local-chat silence fix.
 *
 * Covers:
 *   1.  normalizeEventFromBody: direct=1 → directlyAddressed=true
 *   2.  normalizeEventFromBody: direct=0 → directlyAddressed=false
 *   3.  normalizeEventFromBody: direct="1" (string) → directlyAddressed=true
 *   4.  normalizeEventFromBody: is_direct_mention="true" → directlyAddressed=true
 *   5.  normalizeEventFromBody: trigger=name_mention → directlyAddressed=true
 *   6.  normalizeEventFromBody: trigger=private_666 → directlyAddressed=true
 *   7.  normalizeEventFromBody: direct_mention=1 → directlyAddressed=true
 *   8.  normalizeEventFromBody: mentioned=1 → directlyAddressed=true
 *   9.  normalizeEventFromBody: no direct field → directlyAddressed=undefined
 *   10. resolveAvatar: ownerAvatarUuid match → tier=owner (no relationship row)
 *   11. resolveAvatar: ownerAvatarUuid mismatch → tier=stranger
 *   12. resolveAvatar: known relationship row not downgraded by ownerAvatarUuid
 *   13. Social: known + directlyAddressed=true → reply
 *   14. Social: known + directlyAddressed=false → react_only, not_directly_addressed
 *   15. Social: stranger + directlyAddressed=true + enabled → reply
 *   16. Social: stranger + directlyAddressed=true + disabled → save_memory_only
 *   17. Social: stranger + directlyAddressed=false → react_only, not_directly_addressed
 *   18. Social: blocked → ignore, reason=blocked_or_banned
 *   19. Social: chat_permission=false → ignore, reason=chat_permission_denied
 *   20. Social: per-identity cooldown → ignore, reason=rate_limited
 *   21. Social: global rate limit → ignore, reason=rate_limited
 *   22. Adapter: commandName at top level of bang command result
 *   23. Adapter: empty model response → reason=model_empty_response
 *   24. Adapter: ownerAvatarUuid extracted from settings and passed to identity.resolve
 *   25. Adapter: SECOND_LIFE_DEBUG logs tier, directlyAddressed, action, reason
 */

"use strict";

const path = require("path");
const assert = require("assert");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function section(label) {
  console.log(`\n── ${label}`);
}

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗  ${label}: ${err.message}`);
    failed++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗  ${label}: ${err.message}`);
    failed++;
  }
}

(async () => {
  // ── Imports ─────────────────────────────────────────────────────────────────

  const { normalizeEventFromBody } = require(
    path.join(ROOT, "src/http/secondLifeApi"),
  );

  const { createIdentityResolver } = require(
    path.join(ROOT, "src/secondLife/slIdentityResolver"),
  );

  const { createSocialEngine } = require(
    path.join(ROOT, "src/secondLife/slSocialEngine"),
  );

  const adapterSrc = fs.readFileSync(
    path.join(ROOT, "src/channels/secondLifeAdapter.js"),
    "utf8",
  );

  // ── 1–9. normalizeEventFromBody directlyAddressed aliases ──────────────────
  section("1–9. normalizeEventFromBody directlyAddressed aliases");

  check("1. direct=1 → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ direct: 1 });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("2. direct=0 → directlyAddressed=false", () => {
    const e = normalizeEventFromBody({ direct: 0 });
    assert.strictEqual(e.directlyAddressed, false, `got ${e.directlyAddressed}`);
  });

  check("3. direct='1' (string) → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ direct: "1" });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("4. is_direct_mention='true' → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ is_direct_mention: "true" });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("5. trigger=name_mention → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ trigger: "name_mention" });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("6. trigger=private_666 → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ trigger: "private_666" });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("7. direct_mention=1 → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ direct_mention: 1 });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("8. mentioned=1 → directlyAddressed=true", () => {
    const e = normalizeEventFromBody({ mentioned: 1 });
    assert.strictEqual(e.directlyAddressed, true, `got ${e.directlyAddressed}`);
  });

  check("9. no direct field → directlyAddressed=undefined", () => {
    const e = normalizeEventFromBody({ message: "hello" });
    assert.strictEqual(e.directlyAddressed, undefined, `got ${e.directlyAddressed}`);
  });

  // ── 10–12. resolveAvatar ownerAvatarUuid upgrade ───────────────────────────
  section("10–12. resolveAvatar ownerAvatarUuid upgrade");

  await checkAsync("10. ownerAvatarUuid match → tier=owner (no relationship row)", async () => {
    const resolver = createIdentityResolver({ secondLife: null, config: null });
    const result = await resolver.resolveAvatar({
      companionId: "test",
      avatarUuid: "uuid-owner-1234",
      avatarName: "JC SnowFox",
      ownerAvatarUuid: "uuid-owner-1234",
    });
    assert.strictEqual(result.tier, "owner", `got tier=${result.tier}`);
    assert.strictEqual(result.isOwner, true, `isOwner=${result.isOwner}`);
  });

  await checkAsync("11. ownerAvatarUuid mismatch → tier=stranger", async () => {
    const resolver = createIdentityResolver({ secondLife: null, config: null });
    const result = await resolver.resolveAvatar({
      companionId: "test",
      avatarUuid: "uuid-someone-else",
      avatarName: "Random Person",
      ownerAvatarUuid: "uuid-owner-1234",
    });
    assert.strictEqual(result.tier, "stranger", `got tier=${result.tier}`);
  });

  await checkAsync("12. known relationship row not downgraded by ownerAvatarUuid", async () => {
    const fakeSecondLife = {
      getRelationshipByUuid: async () => ({
        id: 1,
        avatarUuid: "uuid-friend-5678",
        isFriend: true,
        isOwner: false,
        isBlocked: false,
        isFamily: false,
        isTrusted: false,
      }),
    };
    const resolver = createIdentityResolver({ secondLife: fakeSecondLife, config: null });
    const result = await resolver.resolveAvatar({
      companionId: "test",
      avatarUuid: "uuid-friend-5678",
      avatarName: "Good Friend",
      ownerAvatarUuid: "uuid-owner-1234",
    });
    assert.strictEqual(result.tier, "friend", `got tier=${result.tier}`);
  });

  // ── 13–21. Social engine local-chat decisions ──────────────────────────────
  section("13–21. Social engine local-chat decisions");

  const BASE_SETTINGS = {
    enabled: true,
    localChatEnabled: true,
    strangerRepliesEnabled: true,
    maxStrangerRepliesPer30Min: 0,
    maxLocalRepliesPer10Min: 0,
    quietHoursStart: null,
    quietHoursEnd: null,
  };

  const makeIdentity = (overrides) => ({
    tier: "known",
    replyPolicy: "always_allowed",
    permissions: { chat: true, follow: false, privateMemory: false },
    alwaysRespond: false,
    neverRespond: false,
    childSafeOnly: false,
    minSecondsBetweenReplies: 0,
    lastReplyAt: null,
    isOwner: false,
    ...overrides,
  });

  await checkAsync("13. known tier + directlyAddressed=true → action=reply", async () => {
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hey Nox!", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: BASE_SETTINGS,
        identity: makeIdentity({ tier: "known", replyPolicy: "allowed_if_mentioned" }),
        directlyAddressed: true,
      },
    });
    assert.strictEqual(result.action, "reply", `got action=${result.action}, reason=${result.reason}`);
  });

  await checkAsync("14. known tier + directlyAddressed=false → react_only, not_directly_addressed", async () => {
    // replyPolicy="" passes through early policy gates so the tier gate fires.
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "nice weather", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: BASE_SETTINGS,
        identity: makeIdentity({ tier: "known", replyPolicy: "" }),
        directlyAddressed: false,
      },
    });
    assert.strictEqual(result.action, "react_only", `got action=${result.action}`);
    assert.strictEqual(result.reason, "not_directly_addressed", `got reason=${result.reason}`);
  });

  await checkAsync("15. stranger + directlyAddressed=true + enabled → action=reply", async () => {
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "Nox! hey!", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: { ...BASE_SETTINGS, strangerRepliesEnabled: true },
        identity: makeIdentity({ tier: "stranger", replyPolicy: "" }),
        directlyAddressed: true,
      },
    });
    assert.strictEqual(result.action, "reply", `got action=${result.action}, reason=${result.reason}`);
  });

  await checkAsync("16. stranger + directlyAddressed=true + disabled → save_memory_only, strangers_disabled", async () => {
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "Nox! hey!", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: { ...BASE_SETTINGS, strangerRepliesEnabled: false },
        identity: makeIdentity({ tier: "stranger", replyPolicy: "" }),
        directlyAddressed: true,
      },
    });
    assert.strictEqual(result.action, "save_memory_only", `got action=${result.action}`);
    assert.strictEqual(result.reason, "strangers_disabled", `got reason=${result.reason}`);
  });

  await checkAsync("17. stranger + directlyAddressed=false → react_only, not_directly_addressed", async () => {
    // replyPolicy="" passes through early policy gates so the tier gate fires.
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "lol", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: { ...BASE_SETTINGS, strangerRepliesEnabled: true },
        identity: makeIdentity({ tier: "stranger", replyPolicy: "" }),
        directlyAddressed: false,
      },
    });
    assert.strictEqual(result.action, "react_only", `got action=${result.action}`);
    assert.strictEqual(result.reason, "not_directly_addressed", `got reason=${result.reason}`);
  });

  await checkAsync("18. blocked → ignore, reason=blocked_or_banned", async () => {
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hi", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: BASE_SETTINGS,
        identity: makeIdentity({ tier: "blocked", replyPolicy: "banned", permissions: { chat: false } }),
        directlyAddressed: true,
      },
    });
    assert.strictEqual(result.action, "ignore", `got action=${result.action}`);
    assert.strictEqual(result.reason, "blocked_or_banned", `got reason=${result.reason}`);
  });

  await checkAsync("19. chat_permission=false → ignore, reason=chat_permission_denied", async () => {
    const engine = createSocialEngine({ secondLife: null });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hi", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: BASE_SETTINGS,
        identity: makeIdentity({ tier: "known", replyPolicy: "always_allowed", permissions: { chat: false } }),
        directlyAddressed: true,
      },
    });
    assert.strictEqual(result.action, "ignore", `got action=${result.action}`);
    assert.strictEqual(result.reason, "chat_permission_denied", `got reason=${result.reason}`);
  });

  await checkAsync("20. per-identity cooldown → ignore, reason=rate_limited", async () => {
    const engine = createSocialEngine({ secondLife: null });
    const lastReplyAt = new Date(Date.now() - 30 * 1000); // 30s ago
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hi", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: BASE_SETTINGS,
        identity: makeIdentity({
          tier: "known",
          replyPolicy: "always_allowed",
          minSecondsBetweenReplies: 120,
          lastReplyAt,
          childSafeOnly: false,
        }),
        directlyAddressed: false,
      },
    });
    assert.strictEqual(result.action, "ignore", `got action=${result.action}`);
    assert.strictEqual(result.reason, "rate_limited", `got reason=${result.reason}`);
  });

  await checkAsync("21. global local rate limit → ignore, reason=rate_limited", async () => {
    const fakeSecondLife = {
      countRecentReplies: async () => 10,
    };
    const engine = createSocialEngine({ secondLife: fakeSecondLife });
    const result = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hi again", privacyLevel: "public" },
      context: {
        companionId: "test",
        settings: { ...BASE_SETTINGS, maxLocalRepliesPer10Min: 5 },
        identity: makeIdentity({ tier: "family", replyPolicy: "always_allowed" }),
        directlyAddressed: true,
      },
    });
    assert.strictEqual(result.action, "ignore", `got action=${result.action}`);
    assert.strictEqual(result.reason, "rate_limited", `got reason=${result.reason}`);
  });

  // ── 22–25. Adapter source checks ──────────────────────────────────────────
  section("22–25. Adapter source checks");

  check("22. commandName at top level of bang command result", () => {
    assert.ok(
      adapterSrc.includes("commandName: bangCmd.commandName"),
      "commandName: bangCmd.commandName not found in adapter source",
    );
  });

  check("23. empty model response → reason=model_empty_response", () => {
    assert.ok(
      adapterSrc.includes('"model_empty_response"'),
      '"model_empty_response" not found in adapter source',
    );
    assert.ok(
      !adapterSrc.includes('"no_reply_text"'),
      '"no_reply_text" still present — should be replaced',
    );
  });

  check("24. ownerAvatarUuid extracted from settings and passed to identity.resolve", () => {
    assert.ok(
      adapterSrc.includes("settings?.ownerAvatarUuid"),
      "settings?.ownerAvatarUuid extraction not found",
    );
    assert.ok(
      adapterSrc.includes("ownerAvatarUuid,"),
      "ownerAvatarUuid not passed to identity.resolve",
    );
  });

  check("25. SECOND_LIFE_DEBUG logs tier, directlyAddressed, action, reason", () => {
    assert.ok(
      adapterSrc.includes("tier: resolved.tier"),
      "tier: resolved.tier not found in debug block",
    );
    assert.ok(
      adapterSrc.includes("directlyAddressed,"),
      "directlyAddressed not found in debug block",
    );
    assert.ok(
      adapterSrc.includes("action: decision.action"),
      "action: decision.action not found in debug block",
    );
    assert.ok(
      adapterSrc.includes("reason: decision.reason"),
      "reason: decision.reason not found in debug block",
    );
  });

  // ── Results ────────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
