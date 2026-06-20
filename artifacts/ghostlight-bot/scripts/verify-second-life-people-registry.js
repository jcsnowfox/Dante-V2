#!/usr/bin/env node
/**
 * Second Life People & Objects Identity Registry (Phase 21) — Verification
 *
 * Proves every aspect of the Phase 21 upgrade without a real database:
 *   1.  Storage schema — new avatar columns + object_relationships table
 *   2.  Identity resolver — resolution order, tier, reply policies, object matching
 *   3.  Social engine — all reply policies, cooldown, alwaysRespond/neverRespond, child-safe
 *   4.  Event normalizer — LSL field aliases (speaker_key, companion_slug, etc.)
 *   5.  API endpoint — backwards compat of /event, companion_slug alias
 *   6.  Adapter — public identity context injection, child-safe enforcement, context_last_10
 *   7.  Nox import pack — JSON format, 12 avatars + Jezabelle object, companionId guard
 *   8.  Import action — companionId 'nox' guard
 *   9.  Admin UI — People & Objects panel, new fields, REPLY_POLICIES export
 *  10.  Page handler — fetches and passes objectRelationships
 *  11.  No hardcoded Nox-specific IDs in bridge logic
 *
 * Run from artifacts/ghostlight-bot:  node scripts/verify-second-life-people-registry.js
 */

const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}
function fail(label, err = "") {
  console.log(`  ✗  ${label}${err ? `: ${err}` : ""}`);
  failed++;
}
function section(title) {
  console.log(`\n── ${title}`);
}
function check(label, fn) {
  try {
    fn();
    pass(label);
  } catch (e) {
    fail(label, e.message);
  }
}
async function checkAsync(label, fn) {
  try {
    await fn();
    pass(label);
  } catch (e) {
    fail(label, e.message);
  }
}
function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

(async () => {
  // ── 1. Storage schema ──────────────────────────────────────────────────────
  section("1. Storage schema — new avatar columns & object_relationships table");

  check("Storage file exists", () => {
    const p = path.join(ROOT, "src/storage/secondLife/index.js");
    assert.ok(fs.existsSync(p), "file not found");
  });

  const storageSource = readFile("src/storage/secondLife/index.js");

  check("ALTER TABLE adds nickname column (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS nickname"), "missing nickname migration");
  });
  check("ALTER TABLE adds category column (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS category"), "missing category migration");
  });
  check("ALTER TABLE adds reply_policy column (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS reply_policy"), "missing reply_policy migration");
  });
  check("ALTER TABLE adds always_respond column (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS always_respond"), "missing always_respond migration");
  });
  check("ALTER TABLE adds never_respond column (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS never_respond"), "missing never_respond migration");
  });
  check("ALTER TABLE adds child_safe_only column (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS child_safe_only"), "missing child_safe_only migration");
  });
  check("ALTER TABLE adds public_identity_context_enabled (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS public_identity_context_enabled"), "missing public_identity_context_enabled migration");
  });
  check("ALTER TABLE adds min_seconds_between_replies (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS min_seconds_between_replies"), "missing min_seconds_between_replies migration");
  });
  check("ALTER TABLE adds last_reply_at (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS last_reply_at"), "missing last_reply_at migration");
  });
  check("ALTER TABLE adds first_seen_at (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS first_seen_at"), "missing first_seen_at migration");
  });
  check("ALTER TABLE adds last_seen_at (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS last_seen_at"), "missing last_seen_at migration");
  });
  check("ALTER TABLE adds message_count (idempotent)", () => {
    assert.ok(storageSource.includes("ADD COLUMN IF NOT EXISTS message_count"), "missing message_count migration");
  });
  check("second_life_object_relationships CREATE TABLE exists", () => {
    assert.ok(storageSource.includes("CREATE TABLE IF NOT EXISTS second_life_object_relationships"), "missing object_relationships table");
  });
  check("object_relationships has object_description_token column", () => {
    assert.ok(storageSource.includes("object_description_token"), "missing object_description_token");
  });
  check("object_relationships has child_safe_only column", () => {
    assert.ok(storageSource.includes("child_safe_only"), "missing child_safe_only in object table");
  });
  check("mapRelationshipRow returns replyPolicy", () => {
    assert.ok(storageSource.includes("replyPolicy:"), "mapRelationshipRow missing replyPolicy");
  });
  check("mapRelationshipRow returns childSafeOnly", () => {
    assert.ok(storageSource.includes("childSafeOnly:"), "mapRelationshipRow missing childSafeOnly");
  });
  check("mapRelationshipRow returns minSecondsBetweenReplies", () => {
    assert.ok(storageSource.includes("minSecondsBetweenReplies:"), "mapRelationshipRow missing minSecondsBetweenReplies");
  });
  check("getObjectRelationshipByDescriptionToken function exists", () => {
    assert.ok(storageSource.includes("getObjectRelationshipByDescriptionToken"), "missing getObjectRelationshipByDescriptionToken");
  });
  check("listObjectRelationships function exists", () => {
    assert.ok(storageSource.includes("listObjectRelationships"), "missing listObjectRelationships");
  });
  check("upsertObjectRelationship function exists", () => {
    assert.ok(storageSource.includes("upsertObjectRelationship"), "missing upsertObjectRelationship");
  });
  check("deleteObjectRelationship function exists", () => {
    assert.ok(storageSource.includes("deleteObjectRelationship"), "missing deleteObjectRelationship");
  });
  check("markRelationshipSeen function exists", () => {
    assert.ok(storageSource.includes("markRelationshipSeen"), "missing markRelationshipSeen");
  });
  check("recordRelationshipReply function exists", () => {
    assert.ok(storageSource.includes("recordRelationshipReply"), "missing recordRelationshipReply");
  });
  check("markObjectRelationshipSeen function exists", () => {
    assert.ok(storageSource.includes("markObjectRelationshipSeen"), "missing markObjectRelationshipSeen");
  });
  check("recordObjectRelationshipReply function exists", () => {
    assert.ok(storageSource.includes("recordObjectRelationshipReply"), "missing recordObjectRelationshipReply");
  });
  check("description token uses LIKE match (event desc contains token)", () => {
    assert.ok(
      storageSource.includes("LIKE '%' || object_description_token || '%'"),
      "description token matching should use LIKE '%' || token || '%'",
    );
  });

  // ── 2. Identity resolver ───────────────────────────────────────────────────
  section("2. Identity resolver — resolution order, tier, policies, object matching");

  const {
    createIdentityResolver,
    deriveTier,
    derivePermissions,
    normalizeReplyPolicy,
    VALID_REPLY_POLICIES,
  } = require(path.join(ROOT, "src/secondLife/slIdentityResolver.js"));

  check("createIdentityResolver is a function", () => {
    assert.strictEqual(typeof createIdentityResolver, "function");
  });
  check("deriveTier is a function", () => {
    assert.strictEqual(typeof deriveTier, "function");
  });
  check("derivePermissions is a function", () => {
    assert.strictEqual(typeof derivePermissions, "function");
  });
  check("normalizeReplyPolicy is a function", () => {
    assert.strictEqual(typeof normalizeReplyPolicy, "function");
  });
  check("VALID_REPLY_POLICIES contains all 5 values (Set or Array)", () => {
    const expected = ["always_allowed", "allowed_if_mentioned", "ambient_only", "ignore", "banned"];
    const has = VALID_REPLY_POLICIES instanceof Set
      ? (v) => VALID_REPLY_POLICIES.has(v)
      : (v) => VALID_REPLY_POLICIES.includes(v);
    for (const p of expected) {
      assert.ok(has(p), `missing policy: ${p}`);
    }
  });

  check("deriveTier: isOwner → owner", () => {
    assert.strictEqual(deriveTier({ isOwner: true }), "owner");
  });
  check("deriveTier: isBlocked wins over isFamily", () => {
    assert.strictEqual(deriveTier({ isBlocked: true, isFamily: true }), "blocked");
  });
  check("deriveTier: isFamily → family", () => {
    assert.strictEqual(deriveTier({ isFamily: true }), "family");
  });
  check("deriveTier: isFriend → friend", () => {
    assert.strictEqual(deriveTier({ isFriend: true }), "friend");
  });
  check("deriveTier: isTrusted → trusted", () => {
    assert.strictEqual(deriveTier({ isTrusted: true }), "trusted");
  });
  check("deriveTier: no flags → stranger", () => {
    assert.strictEqual(deriveTier({}), "stranger");
  });

  check("normalizeReplyPolicy: valid values pass through", () => {
    assert.strictEqual(normalizeReplyPolicy("always_allowed"), "always_allowed");
    assert.strictEqual(normalizeReplyPolicy("ambient_only"), "ambient_only");
  });
  check("normalizeReplyPolicy: unknown → allowed_if_mentioned fallback", () => {
    assert.strictEqual(normalizeReplyPolicy("garbage"), "allowed_if_mentioned");
  });
  check("normalizeReplyPolicy: 'banned' value passes through", () => {
    assert.strictEqual(normalizeReplyPolicy("banned"), "banned");
  });

  check("derivePermissions: owner gets all", () => {
    const perms = derivePermissions("owner", {});
    assert.ok(perms.chat && perms.follow && perms.privateMemory);
  });
  check("derivePermissions: blocked gets none", () => {
    const perms = derivePermissions("blocked", {});
    assert.ok(!perms.chat && !perms.follow && !perms.privateMemory);
  });
  check("derivePermissions: stranger gets no privateMemory", () => {
    const perms = derivePermissions("stranger", {});
    assert.ok(!perms.privateMemory);
  });
  check("derivePermissions: override chatPermission=false", () => {
    const perms = derivePermissions("family", { chatPermission: false });
    assert.ok(!perms.chat);
  });

  {
    const resolver = createIdentityResolver({
      secondLife: {
        getRelationshipByUuid: async ({ avatarUuid }) => {
          if (avatarUuid === "aaaa-owner") {
            return { id: 1, isOwner: true, avatarName: "JC", avatarUuid: "aaaa-owner", replyPolicy: "always_allowed" };
          }
          return null;
        },
        getObjectRelationshipByUuid: async () => null,
        getObjectRelationshipByDescriptionToken: async ({ objectDescription }) => {
          if (objectDescription && objectDescription.includes("token-xyz")) {
            return {
              id: 99,
              objectName: "Jezabelle",
              objectDescriptionToken: "token-xyz",
              childSafeOnly: true,
              replyPolicy: "ambient_only",
              minSecondsBetweenReplies: 180,
            };
          }
          return null;
        },
      },
    });

    await checkAsync("resolve: owner avatar by UUID", async () => {
      const result = await resolver.resolve({ companionId: "nox", avatarUuid: "aaaa-owner", avatarName: "JC" });
      assert.strictEqual(result.tier, "owner");
      assert.strictEqual(result.isOwner, true);
      assert.strictEqual(result.replyPolicy, "always_allowed");
    });

    await checkAsync("resolve: unknown avatar → stranger", async () => {
      const result = await resolver.resolve({ companionId: "nox", avatarUuid: "unknown-uuid", avatarName: "Stranger" });
      assert.strictEqual(result.tier, "stranger");
      assert.strictEqual(result.isStranger, true);
      assert.strictEqual(result.isKnown, false);
    });

    await checkAsync("resolve: object by description token", async () => {
      const result = await resolver.resolve({
        companionId: "nox",
        avatarUuid: "",
        objectDescription: "Owner: token-xyz / Belz baby",
        sourceType: "object",
      });
      assert.strictEqual(result.isObject, true);
      assert.strictEqual(result.childSafeOnly, true);
      assert.strictEqual(result.replyPolicy, "ambient_only");
      const name = result.name || result.objectName || result.rawRelationship?.objectName;
      assert.strictEqual(name, "Jezabelle");
    });

    await checkAsync("resolve: unknown object → ignore policy, isKnown false", async () => {
      const result = await resolver.resolve({
        companionId: "nox",
        sourceType: "object",
        objectUuid: "unknown-object",
        objectDescription: "some random object",
      });
      assert.strictEqual(result.isObject, true);
      assert.strictEqual(result.isKnown, false);
      assert.strictEqual(result.replyPolicy, "ignore");
    });

    await checkAsync("resolve: avatar path preferred over object when avatarUuid set and not sourceType=object", async () => {
      const result = await resolver.resolve({
        companionId: "nox",
        avatarUuid: "aaaa-owner",
        avatarName: "JC",
        sourceType: "avatar",
      });
      assert.strictEqual(result.tier, "owner");
      assert.ok(!result.isObject);
    });
  }

  // ── 3. Social engine ───────────────────────────────────────────────────────
  section("3. Social engine — reply policies, cooldown, flags, child-safe");

  const { createSocialEngine, withinQuietHours, isCooldownActive } = require(
    path.join(ROOT, "src/secondLife/slSocialEngine.js"),
  );

  check("isCooldownActive: no cooldown configured → false", () => {
    assert.strictEqual(isCooldownActive(0, new Date()), false);
  });
  check("isCooldownActive: elapsed > min → false (not on cooldown)", () => {
    const past = new Date(Date.now() - 300_000);
    assert.strictEqual(isCooldownActive(60, past), false);
  });
  check("isCooldownActive: elapsed < min → true (on cooldown)", () => {
    const recent = new Date(Date.now() - 5_000);
    assert.strictEqual(isCooldownActive(60, recent), true);
  });
  check("isCooldownActive: no lastReplyAt → false", () => {
    assert.strictEqual(isCooldownActive(60, null), false);
  });

  const enabledSettings = {
    enabled: true,
    localChatEnabled: true,
    strangerRepliesEnabled: true,
    maxStrangerRepliesPer30Min: 0,
    maxLocalRepliesPer10Min: 0,
  };

  const engine = createSocialEngine({});

  await checkAsync("social: bridge disabled → ignore", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hello", privacyLevel: "public" },
      context: { companionId: "nox", settings: { enabled: false } },
    });
    assert.strictEqual(r.action, "ignore");
    assert.strictEqual(r.reason, "bridge_disabled");
  });

  await checkAsync("social: banned identity → ignore", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hello", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        identity: { replyPolicy: "banned", tier: "known" },
      },
    });
    assert.strictEqual(r.action, "ignore");
    assert.strictEqual(r.reason, "banned");
  });

  await checkAsync("social: neverRespond flag → ignore", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hello", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        identity: { replyPolicy: "always_allowed", neverRespond: true, tier: "family" },
      },
    });
    assert.strictEqual(r.action, "ignore");
    assert.strictEqual(r.reason, "never_respond");
  });

  await checkAsync("social: owner always gets reply", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hi", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        identity: { replyPolicy: "always_allowed", tier: "owner" },
      },
    });
    assert.strictEqual(r.action, "reply");
    assert.strictEqual(r.reason, "owner");
  });

  await checkAsync("social: allowed_if_mentioned, not addressed → save_memory_only", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "talking to someone else", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: false,
        identity: { replyPolicy: "allowed_if_mentioned", tier: "family" },
      },
    });
    assert.strictEqual(r.action, "save_memory_only");
    assert.strictEqual(r.reason, "not_mentioned");
  });

  await checkAsync("social: always_allowed → reply even when not addressed", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "random chatter", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: false,
        identity: { replyPolicy: "always_allowed", tier: "family" },
      },
    });
    assert.strictEqual(r.action, "reply");
  });

  await checkAsync("social: ambient_only, not addressed → react_only", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "goo goo", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: false,
        identity: { replyPolicy: "ambient_only", tier: "known" },
      },
    });
    assert.strictEqual(r.action, "react_only");
    assert.strictEqual(r.reason, "ambient_only_not_addressed");
  });

  await checkAsync("social: ambient_only, directly addressed → reply", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "Nox, hi!", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: true,
        identity: { replyPolicy: "ambient_only", tier: "known" },
      },
    });
    assert.strictEqual(r.action, "reply");
  });

  await checkAsync("social: ignore policy → save_memory_only", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hello", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        identity: { replyPolicy: "ignore", tier: "known" },
      },
    });
    assert.strictEqual(r.action, "save_memory_only");
    assert.strictEqual(r.reason, "reply_policy_ignore");
  });

  await checkAsync("social: cooldown active, not addressed → ignore", async () => {
    const recentReply = new Date(Date.now() - 5_000);
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "hello again", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: false,
        identity: {
          replyPolicy: "always_allowed",
          tier: "family",
          minSecondsBetweenReplies: 180,
          lastReplyAt: recentReply,
        },
      },
    });
    assert.strictEqual(r.action, "ignore");
    assert.strictEqual(r.reason, "cooldown");
  });

  await checkAsync("social: cooldown active, childSafeOnly, addressed → still ignore (childSafe blocks breakthrough)", async () => {
    const recentReply = new Date(Date.now() - 5_000);
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "Nox!", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: true,
        identity: {
          replyPolicy: "ambient_only",
          tier: "known",
          minSecondsBetweenReplies: 180,
          lastReplyAt: recentReply,
          childSafeOnly: true,
        },
      },
    });
    assert.strictEqual(r.action, "ignore");
    assert.strictEqual(r.reason, "cooldown");
  });

  await checkAsync("social: alwaysRespond flag bypasses not_mentioned gate", async () => {
    const r = await engine.shouldReplyToLocalChat({
      event: { eventType: "local_chat", messageText: "chatter", privacyLevel: "public" },
      context: {
        companionId: "nox",
        settings: enabledSettings,
        directlyAddressed: false,
        identity: { replyPolicy: "allowed_if_mentioned", alwaysRespond: true, tier: "family" },
      },
    });
    assert.strictEqual(r.action, "reply");
  });

  check("interactionGuidance: owner → null (no restrictions)", () => {
    const guidance = engine.interactionGuidance({ tier: "owner", permissions: {}, identity: null });
    assert.strictEqual(guidance, null);
  });
  check("interactionGuidance: childSafeOnly → includes CHILD SAFETY block", () => {
    const guidance = engine.interactionGuidance({
      tier: "family",
      permissions: { privateMemory: true },
      identity: { childSafeOnly: true },
    });
    assert.ok(guidance && guidance.includes("CHILD SAFETY"), `expected child safety block, got: ${guidance}`);
  });
  check("interactionGuidance: stranger → includes 'not a close contact' guidance", () => {
    const guidance = engine.interactionGuidance({ tier: "stranger", permissions: {} });
    assert.ok(guidance && guidance.includes("not a close contact"), `missing stranger guidance: ${guidance}`);
  });
  check("interactionGuidance: no privateMemory permission → keep private info out", () => {
    const guidance = engine.interactionGuidance({ tier: "known", permissions: { privateMemory: false } });
    assert.ok(guidance && (guidance.includes("private memories") || guidance.includes("private")),
      "missing private memory guidance");
  });

  // ── 4. Event normalizer — LSL field aliases ────────────────────────────────
  section("4. Event normalizer — LSL field aliases");

  const apiSource = readFile("src/http/secondLifeApi.js");

  check("normalizeEventFromBody handles speaker_key → avatarUuid", () => {
    assert.ok(apiSource.includes("speaker_key"), "missing speaker_key alias");
  });
  check("normalizeEventFromBody handles speaker_name → avatarName", () => {
    assert.ok(apiSource.includes("speaker_name"), "missing speaker_name alias");
  });
  check("normalizeEventFromBody handles speaker_desc → objectDescription", () => {
    assert.ok(apiSource.includes("speaker_desc"), "missing speaker_desc alias");
  });
  check("normalizeEventFromBody handles object_key → objectUuid", () => {
    assert.ok(apiSource.includes("object_key"), "missing object_key alias");
  });
  check("normalizeEventFromBody handles object_name → objectName", () => {
    assert.ok(apiSource.includes("object_name"), "missing object_name alias");
  });
  check("normalizeEventFromBody handles source_type → sourceType", () => {
    assert.ok(apiSource.includes("source_type"), "missing source_type alias");
  });
  check("normalizeEventFromBody handles is_direct_mention → directlyAddressed", () => {
    assert.ok(apiSource.includes("is_direct_mention"), "missing is_direct_mention alias");
  });
  check("normalizeEventFromBody handles context_last_10", () => {
    assert.ok(apiSource.includes("context_last_10"), "missing context_last_10");
  });
  check("normalizeEventFromBody handles recentContext alias for context_last_10", () => {
    assert.ok(apiSource.includes("recentContext"), "missing recentContext alias");
  });
  check("companion_slug alias for companionId is handled", () => {
    assert.ok(apiSource.includes("companion_slug"), "missing companion_slug alias");
  });
  check("normalizeEventFromBody emits objectUuid field", () => {
    assert.ok(apiSource.includes("objectUuid,"), "normalizedEvent should include objectUuid");
  });
  check("normalizeEventFromBody emits objectDescription field", () => {
    assert.ok(apiSource.includes("objectDescription,"), "normalizedEvent should include objectDescription");
  });
  check("normalizeEventFromBody emits sourceType field", () => {
    assert.ok(apiSource.includes("sourceType,"), "normalizedEvent should include sourceType");
  });
  check("normalizeEventFromBody emits directlyAddressed field", () => {
    assert.ok(apiSource.includes("directlyAddressed,"), "normalizedEvent should include directlyAddressed");
  });
  check("normalizeEventFromBody emits contextLast10 field", () => {
    assert.ok(apiSource.includes("contextLast10,"), "normalizedEvent should include contextLast10");
  });

  // ── 5. API endpoint backwards compat ──────────────────────────────────────
  section("5. API endpoint — bridge prefix and /event compat");

  check("API_PREFIX is still /api/second-life", () => {
    assert.ok(apiSource.includes('API_PREFIX = "/api/second-life"'), "API prefix changed");
  });
  check("/event route still exists", () => {
    assert.ok(apiSource.includes('case "/event":'), "missing /event case");
  });
  check("/register route still exists", () => {
    assert.ok(apiSource.includes('case "/register":'), "missing /register case");
  });
  check("/heartbeat route still exists", () => {
    assert.ok(apiSource.includes('case "/heartbeat":'), "missing /heartbeat case");
  });
  check("/poll route still exists", () => {
    assert.ok(apiSource.includes('case "/poll":'), "missing /poll case");
  });
  check("/command-result route still exists", () => {
    assert.ok(apiSource.includes('case "/command-result":'), "missing /command-result case");
  });
  check("/avatar-scan route still exists", () => {
    assert.ok(apiSource.includes('case "/avatar-scan":'), "missing /avatar-scan case");
  });
  check("/location route still exists", () => {
    assert.ok(apiSource.includes('case "/location":'), "missing /location case");
  });

  // ── 6. Adapter ────────────────────────────────────────────────────────────
  section("6. Adapter — identity context injection, child-safe, context_last_10");

  const adapterSource = readFile("src/channels/secondLifeAdapter.js");

  check("buildPublicIdentityBlock function or concept exists in adapter", () => {
    assert.ok(
      adapterSource.includes("buildPublicIdentityBlock") || adapterSource.includes("publicIdentityBlock") || adapterSource.includes("publicIdentityContext"),
      "missing public identity block builder",
    );
  });
  check("publicIdentityContextEnabled gate exists in adapter", () => {
    assert.ok(adapterSource.includes("publicIdentityContextEnabled"), "missing publicIdentityContextEnabled gate");
  });
  check("contextLast10 injected into prompt sections", () => {
    assert.ok(adapterSource.includes("contextLast10") || adapterSource.includes("context_last_10"),
      "missing context_last_10 injection");
  });
  check("childSafeOnly referenced in adapter", () => {
    assert.ok(adapterSource.includes("childSafeOnly"), "missing childSafeOnly in adapter");
  });
  check("CHILD SAFETY or child-safe mode prompt text in adapter", () => {
    assert.ok(adapterSource.includes("CHILD SAFETY") || adapterSource.includes("child-safe mode"),
      "missing child-safety prompt text");
  });
  check("markRelationshipSeen or markObjectRelationshipSeen called in adapter", () => {
    assert.ok(
      adapterSource.includes("markRelationshipSeen") || adapterSource.includes("markObjectRelationshipSeen"),
      "missing markRelationshipSeen call",
    );
  });
  check("recordRelationshipReply or recordObjectRelationshipReply called in adapter", () => {
    assert.ok(
      adapterSource.includes("recordRelationshipReply") || adapterSource.includes("recordObjectRelationshipReply"),
      "missing recordRelationshipReply call",
    );
  });
  check("adapter passes objectDescription to resolve", () => {
    assert.ok(adapterSource.includes("objectDescription"), "adapter should pass objectDescription to resolve");
  });
  check("adapter passes sourceType to resolve", () => {
    assert.ok(adapterSource.includes("sourceType"), "adapter should pass sourceType to resolve");
  });
  check("adapter does NOT create new /api/secondlife/inbound endpoint", () => {
    assert.ok(!adapterSource.includes("/api/secondlife/inbound"), "adapter should not create new inbound endpoint");
  });

  // ── 7. Nox import pack ────────────────────────────────────────────────────
  section("7. Nox import pack — JSON structure, 12 avatars, Jezabelle object");

  const packPath = path.join(ROOT, "assets/second-life/nox-family-relationships.json");
  check("nox-family-relationships.json file exists", () => {
    assert.ok(fs.existsSync(packPath), "file not found");
  });

  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));

  check("pack.companionId is 'nox'", () => {
    assert.strictEqual(pack.companionId, "nox");
  });
  check("pack has description field", () => {
    assert.ok(typeof pack.description === "string" && pack.description.length > 0, "missing description");
  });
  check("pack has 12 avatar entries", () => {
    assert.strictEqual(pack.avatars.length, 12, `expected 12 avatars, got ${pack.avatars.length}`);
  });
  check("JC SnowFox is the owner with always_allowed policy", () => {
    const jc = pack.avatars.find((a) => a.avatarName === "JC SnowFox");
    assert.ok(jc, "JC SnowFox not found");
    assert.ok(jc.isOwner, "JC should be owner");
    assert.strictEqual(jc.replyPolicy, "always_allowed");
    assert.strictEqual(jc.alwaysRespond, true);
  });
  check("Belz is family with always_allowed", () => {
    const belz = pack.avatars.find((a) => a.avatarName === "Belzebat.darkmatter");
    assert.ok(belz, "Belz not found");
    assert.ok(belz.isFamily, "Belz should be family");
    assert.strictEqual(belz.replyPolicy, "always_allowed");
  });
  check("pack has at least 4 sister-category avatars", () => {
    const sisters = pack.avatars.filter((a) => a.category && a.category.includes("sister"));
    assert.ok(sisters.length >= 4, `expected >= 4 sisters, got ${sisters.length}`);
  });
  check("pack has at least 4 brother-category avatars", () => {
    const brothers = pack.avatars.filter((a) => a.category === "jc_brother");
    assert.ok(brothers.length >= 4, `expected >= 4 brothers, got ${brothers.length}`);
  });
  check("pack has 1 object entry (Jezabelle)", () => {
    assert.strictEqual(pack.objects.length, 1, `expected 1 object, got ${pack.objects.length}`);
  });
  check("Jezabelle is childSafeOnly with ambient_only and 180s cooldown", () => {
    const jez = pack.objects[0];
    assert.strictEqual(jez.objectName, "Jezabelle");
    assert.strictEqual(jez.childSafeOnly, true);
    assert.strictEqual(jez.replyPolicy, "ambient_only");
    assert.strictEqual(jez.minSecondsBetweenReplies, 180);
  });
  check("Jezabelle has a non-empty objectDescriptionToken", () => {
    const jez = pack.objects[0];
    assert.ok(jez.objectDescriptionToken && jez.objectDescriptionToken.length > 0, "missing objectDescriptionToken");
  });
  check("Jezabelle's token matches JC's avatarUuid", () => {
    const jc = pack.avatars.find((a) => a.isOwner);
    const jez = pack.objects[0];
    assert.strictEqual(jez.objectDescriptionToken, jc.avatarUuid, "Jezabelle token should match JC's UUID");
  });
  check("all pack avatars have replyPolicy set", () => {
    for (const a of pack.avatars) {
      assert.ok(typeof a.replyPolicy === "string" && a.replyPolicy.length, `avatar ${a.avatarName} missing replyPolicy`);
    }
  });
  check("all pack avatars have minSecondsBetweenReplies", () => {
    for (const a of pack.avatars) {
      assert.ok(typeof a.minSecondsBetweenReplies === "number", `avatar ${a.avatarName} missing minSecondsBetweenReplies`);
    }
  });
  check("no human avatars in pack have childSafeOnly=true", () => {
    const childSafeAvatars = pack.avatars.filter((a) => a.childSafeOnly);
    assert.strictEqual(childSafeAvatars.length, 0, `expected 0 child-safe avatars, got ${childSafeAvatars.length}`);
  });

  // ── 8. Import action ──────────────────────────────────────────────────────
  section("8. Import action — companionId 'nox' guard and new action paths");

  const actionsSource = readFile("src/http/actions/secondLifeActions.js");

  check("import-relationships action path is registered", () => {
    assert.ok(actionsSource.includes("second-life-import-relationships"), "missing import action path");
  });
  check("import action validates pack is 'nox'", () => {
    assert.ok(actionsSource.includes("nox"), "import action should reference 'nox' guard");
  });
  check("import action loads nox-family-relationships.json", () => {
    assert.ok(actionsSource.includes("nox-family-relationships.json"), "import action should load pack JSON");
  });
  check("object-relationship-save action path is registered", () => {
    assert.ok(actionsSource.includes("second-life-object-relationship-save"), "missing object-relationship-save action");
  });
  check("object-relationship-delete action path is registered", () => {
    assert.ok(actionsSource.includes("second-life-object-relationship-delete"), "missing object-relationship-delete action");
  });
  check("relationship-save passes replyPolicy", () => {
    assert.ok(actionsSource.includes("replyPolicy"), "relationship-save should pass replyPolicy");
  });
  check("relationship-save passes childSafeOnly", () => {
    assert.ok(actionsSource.includes("childSafeOnly"), "relationship-save should pass childSafeOnly");
  });
  check("relationship-save passes minSecondsBetweenReplies", () => {
    assert.ok(actionsSource.includes("minSecondsBetweenReplies"), "relationship-save should pass minSecondsBetweenReplies");
  });
  check("relationship-save passes alwaysRespond", () => {
    assert.ok(actionsSource.includes("alwaysRespond"), "relationship-save should pass alwaysRespond");
  });
  check("relationship-save passes publicIdentityContextEnabled", () => {
    assert.ok(actionsSource.includes("publicIdentityContextEnabled"), "relationship-save should pass publicIdentityContextEnabled");
  });
  check("relationship-save passes relationshipToUser", () => {
    assert.ok(actionsSource.includes("relationshipToUser"), "relationship-save should pass relationshipToUser");
  });
  check("relationship-save passes nickname", () => {
    assert.ok(actionsSource.includes("nickname"), "relationship-save should pass nickname");
  });

  // ── 9. Admin UI ───────────────────────────────────────────────────────────
  section("9. Admin UI — People & Objects panel, new fields, REPLY_POLICIES");

  const pageSource = readFile("src/http/renderAdminPages/secondLifePage.js");

  check("renderPeopleObjectsPanel function exists", () => {
    assert.ok(pageSource.includes("renderPeopleObjectsPanel"), "missing renderPeopleObjectsPanel");
  });
  check("REPLY_POLICIES constant defined", () => {
    assert.ok(pageSource.includes("REPLY_POLICIES"), "missing REPLY_POLICIES");
  });
  check("REPLY_POLICIES exported and has 5 entries", () => {
    const { REPLY_POLICIES: rp } = require(path.join(ROOT, "src/http/renderAdminPages/secondLifePage.js"));
    assert.ok(Array.isArray(rp) && rp.length === 5, `expected 5 reply policies, got ${rp?.length}`);
    assert.ok(rp.includes("always_allowed"), "missing always_allowed");
    assert.ok(rp.includes("banned"), "missing banned");
    assert.ok(rp.includes("ambient_only"), "missing ambient_only");
  });
  check("Panel renders 'People & Objects' heading", () => {
    assert.ok(
      pageSource.includes("People &amp; Objects") || pageSource.includes("People & Objects"),
      "panel heading not found",
    );
  });
  check("objectRelationships parameter in renderSecondLifePage", () => {
    assert.ok(pageSource.includes("objectRelationships = []"), "missing objectRelationships param");
  });
  check("renderPeopleObjectsPanel called in page template", () => {
    assert.ok(pageSource.includes("renderPeopleObjectsPanel("), "panel not called in template");
  });
  check("Add person form has replyPolicy select", () => {
    assert.ok(pageSource.includes('"replyPolicy"') || pageSource.includes("name=\"replyPolicy\""),
      "missing replyPolicy field in avatar form");
  });
  check("Add person form has nickname field", () => {
    assert.ok(pageSource.includes('"nickname"') || pageSource.includes("name=\"nickname\""),
      "missing nickname field in avatar form");
  });
  check("Add person form has minSecondsBetweenReplies", () => {
    assert.ok(pageSource.includes("minSecondsBetweenReplies"), "missing minSecondsBetweenReplies field");
  });
  check("Add person form has childSafeOnly checkbox", () => {
    assert.ok(pageSource.includes("childSafeOnly"), "missing childSafeOnly checkbox");
  });
  check("Add person form has alwaysRespond checkbox", () => {
    assert.ok(pageSource.includes("alwaysRespond"), "missing alwaysRespond checkbox");
  });
  check("Add person form has neverRespond checkbox", () => {
    assert.ok(pageSource.includes("neverRespond"), "missing neverRespond checkbox");
  });
  check("Add person form has publicIdentityContextEnabled checkbox", () => {
    assert.ok(pageSource.includes("publicIdentityContextEnabled"), "missing publicIdentityContextEnabled checkbox");
  });
  check("Add person form has localChatChatterEnabled checkbox", () => {
    assert.ok(pageSource.includes("localChatChatterEnabled"), "missing localChatChatterEnabled checkbox");
  });
  check("Add person form has relationshipToUser field", () => {
    assert.ok(pageSource.includes("relationshipToUser"), "missing relationshipToUser field");
  });
  check("Add person form has relationshipToCompanion field", () => {
    assert.ok(pageSource.includes("relationshipToCompanion"), "missing relationshipToCompanion field");
  });
  check("Object form has objectDescriptionToken field", () => {
    assert.ok(pageSource.includes("objectDescriptionToken"), "missing objectDescriptionToken in object form");
  });
  check("Object form posts to second-life-object-relationship-save", () => {
    assert.ok(pageSource.includes("second-life-object-relationship-save"), "missing object save action");
  });
  check("Object delete posts to second-life-object-relationship-delete", () => {
    assert.ok(pageSource.includes("second-life-object-relationship-delete"), "missing object delete action");
  });
  check("Import Nox Family Pack button present", () => {
    assert.ok(pageSource.includes("Import Nox Family Pack"), "missing import pack button");
  });
  check("Import form posts to second-life-import-relationships", () => {
    assert.ok(pageSource.includes("second-life-import-relationships"), "missing import form action");
  });
  check("Old renderRelationshipPanel function is gone (replaced by renderPeopleObjectsPanel)", () => {
    assert.ok(!pageSource.includes("function renderRelationshipPanel"), "old renderRelationshipPanel should be replaced");
  });

  // ── 10. Page handler ──────────────────────────────────────────────────────
  section("10. Page handler — fetches and passes objectRelationships");

  const handlerSource = readFile("src/http/adminPageHandlers/secondLifePageHandler.js");

  check("handler declares objectRelationships variable", () => {
    assert.ok(handlerSource.includes("objectRelationships"), "missing objectRelationships in handler");
  });
  check("handler calls store.listObjectRelationships", () => {
    assert.ok(handlerSource.includes("listObjectRelationships"), "handler should call listObjectRelationships");
  });
  check("handler passes objectRelationships to renderSecondLifePage", () => {
    const renderCallIdx = handlerSource.indexOf("renderSecondLifePage(");
    assert.ok(renderCallIdx !== -1, "renderSecondLifePage not called");
    const renderCallBlock = handlerSource.slice(renderCallIdx, renderCallIdx + 600);
    assert.ok(renderCallBlock.includes("objectRelationships"), "objectRelationships not passed to render");
  });

  // ── 11. No hardcoded Nox-specific content in bridge logic ─────────────────
  section("11. Nox-specific content is NOT hardcoded in bridge logic files");

  const bridgeFiles = [
    "src/secondLife/slIdentityResolver.js",
    "src/secondLife/slSocialEngine.js",
    "src/channels/secondLifeAdapter.js",
    "src/http/secondLifeApi.js",
    "src/storage/secondLife/index.js",
  ];

  const NOX_SPECIFIC = [
    "JC SnowFox",
    "Belzebat",
    "135b9d16",
    "jc_sister",
    "jc_brother",
    "Jezabelle",
    "Robbin24",
  ];

  for (const file of bridgeFiles) {
    for (const name of NOX_SPECIFIC) {
      check(`${path.basename(file)} does not contain '${name}'`, () => {
        const src = readFile(file);
        assert.ok(!src.includes(name), `Found hardcoded Nox content '${name}' in ${file}`);
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  Phase 21 — Second Life People & Objects Identity Registry`);
  console.log(`  ${passed} passed  ·  ${failed} failed`);
  console.log(`${"─".repeat(64)}`);
  if (failed === 0) console.log("  VERDICT: ✅ PASS\n");
  else console.log("  VERDICT: ❌ NO GO\n");

  process.exit(failed > 0 ? 1 : 0);
})();
