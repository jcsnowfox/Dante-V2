#!/usr/bin/env node
/**
 * Second Life Bridge (Stage 1) — Verification
 *
 * Proves the Phase 1/2/4 foundation without a real database:
 *   1. The shared prompt assembler builds persona from config.chat.promptBlocks
 *      (the admin Companion tab) — identical for Discord and Second Life.
 *   2. The companion event contract + processCompanionEvent normalize shapes
 *      and keep Discord behaviour identical (delegates to chatPipeline.run).
 *   3. The shared persona builder bakes in no customer-specific content.
 *   4. Prompt Profiles are fully removed from the admin UI + codebase.
 *
 * Run from artifacts/ghostlight-bot:  node scripts/verify-second-life-bridge.js
 */

const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  \u2713  ${label}`);
  passed++;
}
function fail(label, err = "") {
  console.log(`  \u2717  ${label}${err ? `: ${err}` : ""}`);
  failed++;
}
function section(title) {
  console.log(`\n\u2500\u2500 ${title}`);
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
function fileHas(rel, needle) {
  try {
    return readFile(rel).includes(needle);
  } catch {
    return false;
  }
}

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
console.log("\u2551  SECOND LIFE BRIDGE \u2014 VERIFY     \u2551");
console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

const {
  assembleCompanionPrompt,
} = require(path.join(ROOT, "src/companion/assembleCompanionPrompt.js"));
const {
  resolveCompanionId,
} = require(path.join(ROOT, "src/companion/resolveCompanionId.js"));
const {
  normalizeInboundEvent,
  normalizeOutboundResult,
  normalizeChannelType,
} = require(path.join(ROOT, "src/companion/companionEvent.js"));
const {
  createCompanionEventProcessor,
} = require(path.join(ROOT, "src/companion/processCompanionEvent.js"));

// Personality is the single source of truth in config.chat.promptBlocks (the
// admin Companion tab), shared identically by Discord and Second Life.
const SAMPLE_CONFIG = {
  chat: {
    promptBlocks: {
      personaName: "Aria",
      userName: "Sam",
      personaProfile: "PERSONA_DETAILS_MARKER",
      companionPurpose: "PURPOSE_MARKER",
      toneGuidelines: "TONE_MARKER",
      userProfile: "USER_DETAILS_MARKER",
      boundaryRules: "BOUNDARY_MARKER",
    },
  },
};

(async () => {
  // ─── 1. Prompt assembler (one shared builder, no per-channel fork) ─────────
  section("1. Prompt assembler (one shared builder, Discord + Second Life)");

  check("persona comes from config.chat.promptBlocks (single source of truth)", () => {
    const out = assembleCompanionPrompt({ config: SAMPLE_CONFIG, channelType: "discord" });
    assert(out.includes("PERSONA_DETAILS_MARKER"), "persona details missing");
    assert(out.includes("PURPOSE_MARKER"), "companion purpose missing");
    assert(out.includes("TONE_MARKER"), "tone guidance missing");
    assert(out.includes("USER_DETAILS_MARKER"), "user details missing");
    assert(out.includes("BOUNDARY_MARKER"), "boundary rules missing");
  });

  check("persona header uses config names (not hardcoded)", () => {
    const out = assembleCompanionPrompt({ config: SAMPLE_CONFIG, channelType: "discord" });
    assert(out.includes("Aria") && out.includes("Sam"), "persona/user names not threaded from config");
  });

  check("Discord and Second Life build the EXACT same persona (shared Companion tab)", () => {
    const discordOut = assembleCompanionPrompt({ config: SAMPLE_CONFIG, channelType: "discord" });
    const slOut = assembleCompanionPrompt({ config: SAMPLE_CONFIG, channelType: "second_life" });
    assert(discordOut === slOut, "Discord and Second Life personas diverge — they must share the Companion tab");
    assert(slOut.includes("PERSONA_DETAILS_MARKER"), "Second Life dropped the shared persona");
  });

  check("assembler ignores any legacy profile/overlay argument (no SL fork)", () => {
    const legacy = {
      secondLifeBehaviorPrompt: "SL_BEHAVIOR_MARKER",
      secondLifeLocalChatPrompt: "SL_LOCALCHAT_MARKER",
      coreIdentityPrompt: "CORE_IDENTITY_MARKER",
    };
    const out = assembleCompanionPrompt({ config: SAMPLE_CONFIG, profile: legacy, channelType: "second_life" });
    assert(!out.includes("SL_BEHAVIOR_MARKER"), "legacy SL behaviour overlay still applied");
    assert(!out.includes("SL_LOCALCHAT_MARKER"), "legacy SL local-chat overlay still applied");
    assert(!out.includes("CORE_IDENTITY_MARKER"), "legacy profile field leaked into the persona");
  });

  // ─── 2. Companion event contract + processCompanionEvent ──────────────────
  section("2. Shared brain entry point normalizes + delegates");

  check("normalizeInboundEvent applies safe generic defaults", () => {
    const ev = normalizeInboundEvent({});
    assert(ev.channelType === "discord", "default channel should be discord");
    assert(ev.privacyLevel === "public", "default privacy should be public");
    assert(ev.eventType === "message", "default event type should be message");
    assert(typeof ev.metadata === "object", "metadata should be an object");
  });

  check("unknown channel type falls back to default", () => {
    assert(normalizeChannelType("martian") === "discord", "unknown channel not defaulted");
    assert(normalizeChannelType("second_life") === "second_life", "second_life not recognized");
  });

  check("normalizeOutboundResult inherits ids from inbound", () => {
    const inbound = normalizeInboundEvent({ companionId: "aria", channelType: "second_life", privacyLevel: "private" });
    const out = normalizeOutboundResult({ responseText: "hi" }, inbound);
    assert(out.companionId === "aria", "companionId not inherited");
    assert(out.channelType === "second_life", "channelType not inherited");
    assert(out.privacyLevel === "private", "privacyLevel not inherited");
    assert(Array.isArray(out.actionCommands) && Array.isArray(out.memoryWrites), "list fields not normalized");
  });

  await (async () => {
    let receivedRunArgs = null;
    const fakePipeline = {
      run: async (args) => {
        receivedRunArgs = args;
        return { content: "pipeline reply", files: ["f1"] };
      },
    };
    const { processCompanionEvent } = createCompanionEventProcessor({ chatPipeline: fakePipeline, logger: mockLogger });
    const fakeMessage = { id: "1", content: "hello", author: { id: "u1", username: "sam" } };

    try {
      const result = await processCompanionEvent({
        channelType: "discord",
        externalUserId: "u1",
        messageText: "hello",
        metadata: { discord: { message: fakeMessage, mode: "chat", wasMentioned: true } },
      });
      assert(receivedRunArgs && receivedRunArgs.message === fakeMessage, "raw message not passed to pipeline.run");
      assert(receivedRunArgs.mode === "chat" && receivedRunArgs.wasMentioned === true, "mode/wasMentioned not passed through");
      assert(result.reply && result.reply.files && result.reply.files[0] === "f1", "reply not passed through untouched");
      assert(result.outbound.responseText === "pipeline reply", "outbound responseText not normalized");
      pass("processCompanionEvent (discord) returns pipeline reply untouched");
    } catch (e) {
      fail("processCompanionEvent (discord) returns pipeline reply untouched", e.message);
    }

    try {
      await processCompanionEvent({ channelType: "second_life", messageText: "x" });
      fail("processCompanionEvent rejects un-adapted channels", "did not throw");
    } catch {
      pass("processCompanionEvent rejects un-adapted channels (Stage 1 = Discord only)");
    }
  })();

  // ─── 3. No customer-specific data in the shared persona builder ───────────
  section("3. Shared persona builder bakes in nothing customer-specific");

  check("assembler default persona is generic (no customer terms)", () => {
    const out = assembleCompanionPrompt({ config: {}, channelType: "discord" }).toLowerCase();
    const forbidden = ["aria", "cadence", "second life region", "uuid"];
    for (const term of forbidden) {
      assert(!out.includes(term), `assembler output contains forbidden term "${term}"`);
    }
  });

  check("resolveCompanionId derives from persona name, never hardcoded", () => {
    assert(resolveCompanionId({ chat: { promptBlocks: { personaName: "My Companion" } } }) === "my_companion", "id not derived from persona name");
    assert(resolveCompanionId({}) === "companion", "fallback id incorrect");
  });

  // ─── 4. Prompt Profiles fully removed from the admin UI ───────────────────
  section("4. Prompt Profiles removed (Discord + Second Life share the Companion tab)");
  {
    if (!fileHas("src/http/renderAdminPages/shared.js", "/admin/prompt-profiles")) pass("nav link removed");
    else fail("nav link still present");

    if (!fileHas("src/http/adminPageHandlers/shared.js", "/admin/prompt-profiles")) pass("route state mapping removed");
    else fail("route state mapping still present");

    if (!fileHas("src/http/createHealthServer.js", "/admin/prompt-profiles")) pass("GET route de-allowlisted");
    else fail("GET route still allowlisted");

    if (!fileHas("src/http/adminPageHandlers.js", "handlePromptProfilesPageRequest")) pass("page handler dispatch removed");
    else fail("page handler still dispatched");

    if (!fileHas("src/http/createHealthServer.js", "handlePromptProfilesActions")) pass("actions unregistered");
    else fail("actions still registered");

    const removedFiles = [
      "src/http/actions/promptProfilesActions.js",
      "src/http/adminPageHandlers/promptProfilesPageHandler.js",
      "src/http/renderAdminPages/promptProfilesPage.js",
      "src/storage/promptProfiles/index.js",
      "src/companion/promptProfileService.js",
    ];
    const stillThere = removedFiles.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
    if (stillThere.length === 0) pass("all prompt-profile modules deleted");
    else fail(`prompt-profile modules still exist: ${stillThere.join(", ")}`);
  }

  // ─── 5. Companion tab is the shared source for both channels ──────────────
  section("5. Companion tab drives Discord + Second Life identically");
  check("assembled persona is identical for both channels and carries Companion fields", () => {
    const discord = assembleCompanionPrompt({ config: SAMPLE_CONFIG, channelType: "discord" });
    const secondLife = assembleCompanionPrompt({ config: SAMPLE_CONFIG, channelType: "second_life" });
    assert(discord === secondLife, "Discord and Second Life personas diverge");
    assert(discord.includes("PERSONA_DETAILS_MARKER"), "Companion persona details missing");
    assert(discord.includes("BOUNDARY_MARKER"), "Companion boundary rules missing");
  });

  // ─── 6. Second Life data model wiring ─────────────────────────────────────
  section("6. Second Life data model");
  {
    if (fileHas("src/index.js", "createSecondLifeStore") && fileHas("src/index.js", "secondLife.init"))
      pass("index.js constructs + inits the Second Life store");
    else fail("index.js missing Second Life store construct/init");

    if (fileHas("src/storage/secondLife/index.js", "CREATE TABLE IF NOT EXISTS")) pass("SL store creates tables inline");
    else fail("SL store missing inline table creation");
  }

  // ─── 7. Stage 2 — shared brain handles the second_life path ───────────────
  section("7. Stage 2 second_life path runs the shared brain");
  await (async () => {
    const fakePipeline = { run: async () => ({ content: "discord only" }) };
    const fakeGenerator = {
      generateReply: async ({ event, contextSections, privacyLevel }) => {
        assert(Array.isArray(contextSections), "contextSections not forwarded to generator");
        assert(privacyLevel != null, "privacyLevel not forwarded to generator");
        assert(event && event.channelType === "second_life", "generator did not receive the SL event");
        return { text: "SL_GENERATED_REPLY" };
      },
    };
    const { processCompanionEvent } = createCompanionEventProcessor({
      chatPipeline: fakePipeline,
      logger: mockLogger,
      secondLifeReplyGenerator: fakeGenerator,
    });

    try {
      const result = await processCompanionEvent({
        channelType: "second_life",
        companionId: "aria",
        externalUserId: "uuid-1",
        messageText: "hello in-world",
        metadata: { secondLife: { contextSections: [{ label: "World", content: "Region X" }] } },
      });
      assert(result.outbound.responseText === "SL_GENERATED_REPLY", "SL reply not normalized into outbound");
      assert(result.outbound.channelType === "second_life", "outbound channelType not second_life");
      assert(result.reply && result.reply.content === "SL_GENERATED_REPLY", "SL reply payload missing");
      pass("processCompanionEvent (second_life) produces a normalized reply via the generator");
    } catch (e) {
      fail("processCompanionEvent (second_life) produces a normalized reply via the generator", e.message);
    }
  })();

  check("the SL reply generator + adapter modules load (no DB needed)", () => {
    const { createSecondLifeReplyGenerator } = require(path.join(ROOT, "src/companion/secondLifeReplyGenerator.js"));
    const { createSecondLifeAdapter } = require(path.join(ROOT, "src/channels/secondLifeAdapter.js"));
    const generator = createSecondLifeReplyGenerator({ config: {}, logger: mockLogger, promptProfiles: null, tools: null });
    assert(typeof generator.generateReply === "function", "generator missing generateReply");
    const stubCompanion = { processCompanionEvent: async () => ({ outbound: { responseText: "" }, reply: null }) };
    const adapter = createSecondLifeAdapter({ secondLife: { available: false }, companion: stubCompanion, config: {}, logger: mockLogger });
    assert(typeof adapter.handleEvent === "function", "adapter missing handleEvent");
  });

  // ─── 8. Phase 5 — authenticated bridge API wiring ─────────────────────────
  section("8. Phase 5 bridge API endpoints");
  {
    const apiRel = "src/http/secondLifeApi.js";
    const endpoints = [
      "/register", "/heartbeat", "/event", "/poll",
      "/command-result", "/avatar-scan", "/object-scan", "/location", "/status/",
    ];
    let allEndpoints = true;
    for (const ep of endpoints) {
      if (!fileHas(apiRel, ep)) allEndpoints = false;
    }
    if (allEndpoints) pass("all 9 bridge endpoints are present");
    else fail("one or more bridge endpoints missing");

    if (fileHas(apiRel, "verifySharedSecret")) pass("endpoints authenticate via the shared secret");
    else fail("shared-secret auth missing from the API");

    if (fileHas("src/http/createHealthServer.js", "handleSecondLifeApiRequest")) pass("API wired into the health server");
    else fail("API not wired into the health server");

    // The API dispatch must run BEFORE the 404 fall-through.
    const health = readFile("src/http/createHealthServer.js");
    const apiIdx = health.indexOf("handleSecondLifeApiRequest({");
    const notFoundIdx = health.indexOf("res.end(\"Not found.\")");
    if (apiIdx !== -1 && notFoundIdx !== -1 && apiIdx < notFoundIdx) pass("API dispatch precedes the 404 fall-through");
    else fail("API dispatch not positioned before the 404");
  }

  // ─── 9. Phase 3 — Second Life admin dashboard wiring ──────────────────────
  section("9. Phase 3 admin dashboard wiring");
  {
    if (fileHas("src/http/renderAdminPages/shared.js", "/admin/second-life")) pass("nav link added");
    else fail("nav link missing");

    if (fileHas("src/http/adminPageHandlers/shared.js", "secondLife")) pass("route state mapping added");
    else fail("route state mapping missing");

    if (fileHas("src/http/createHealthServer.js", "/admin/second-life")) pass("GET route allowlisted");
    else fail("GET route not allowlisted");

    if (fileHas("src/http/adminPageHandlers.js", "handleSecondLifePageRequest")) pass("page handler dispatched");
    else fail("page handler not dispatched");

    if (fileHas("src/http/createHealthServer.js", "handleSecondLifeActions")) pass("actions registered");
    else fail("actions not registered");

    if (fileHas("src/http/actions/secondLifeActions.js", "second-life-save")) pass("save action present");
    else fail("save action missing");
  }

  check("renderSecondLifePage produces a settings form + status panels", () => {
    const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
    const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
    const html = helpers.renderSecondLifePage({
      companionId: "aria",
      storeAvailable: true,
      settings: { enabled: true, agentName: "Agent", hasSharedSecret: true, localChatEnabled: true },
      status: {
        available: true,
        worldState: { currentRegion: "Region X", nearbyAvatars: [], nearbyObjects: [], lastHeartbeatAt: null },
        queue: { pending: 0, claimed: 0, completed: 0, failed: 0 },
        recentActions: [],
        recentErrors: [],
      },
      summary: { available: true, relationships: 0, outfits: 0, landmarks: 0, objects: 0, commands: 0, schedule: 0 },
      theme: "light",
    });
    assert(html.includes("second-life-save"), "save form action missing");
    assert(html.includes("Shared Secret"), "shared secret field missing");
    assert(html.includes("Bridge Status"), "status panel missing");
    assert(html.includes("sharedSecret"), "shared secret input missing");
  });

  check("renderSecondLifePage renders read-only with no DB configured", () => {
    const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
    const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
    const html = helpers.renderSecondLifePage({
      companionId: "aria",
      storeAvailable: false,
      settings: null,
      status: null,
      summary: null,
      theme: "light",
    });
    assert(html.includes("read-only"), "read-only warning missing when no DB");
    assert(html.includes("disabled"), "inputs not disabled when no DB");
  });

  // ─── 10. Stage 3 Phase 7 — identity resolver tiers + permissions ──────────
  section("10. Stage 3 Phase 7 — identity resolver");
  {
    const {
      createIdentityResolver,
      deriveTier,
      derivePermissions,
      TIER_ORDER,
    } = require(path.join(ROOT, "src/secondLife/slIdentityResolver.js"));

    check("deriveTier precedence: blocked > owner > family > friend > trusted > known > stranger", () => {
      assert(deriveTier(null) === "stranger", "null should be stranger");
      assert(deriveTier({ id: "1", isBlocked: true, isOwner: true }) === "blocked", "blocked must win over owner");
      assert(deriveTier({ id: "1", isOwner: true }) === "owner", "owner not derived");
      assert(deriveTier({ id: "1", isFamily: true }) === "family", "family not derived");
      assert(deriveTier({ id: "1", isFriend: true }) === "friend", "friend not derived");
      assert(deriveTier({ id: "1", isTrusted: true }) === "trusted", "trusted not derived");
      assert(deriveTier({ id: "1", relationshipType: "known" }) === "known", "known not derived");
      assert(deriveTier({ id: "1", relationshipType: "stranger" }) === "stranger", "explicit stranger not derived");
      assert(Array.isArray(TIER_ORDER) && TIER_ORDER[0] === "blocked", "TIER_ORDER not exported correctly");
    });

    check("derivePermissions: owner full; stranger never gets follow/private memory", () => {
      const owner = derivePermissions("owner", { id: "1", isOwner: true });
      assert(owner.chat && owner.follow && owner.privateMemory, "owner should have full permissions");
      const stranger = derivePermissions("stranger", { followPermission: true, privateMemoryPermission: true });
      assert(stranger.follow === false && stranger.privateMemory === false, "stranger must not get follow/private memory");
      const blocked = derivePermissions("blocked", { id: "1", isBlocked: true });
      assert(!blocked.chat && !blocked.follow && !blocked.privateMemory, "blocked should have no permissions");
    });

    await (async () => {
      const fakeStore = {
        getRelationshipByUuid: async ({ avatarUuid }) => (avatarUuid === "owner-uuid"
          ? { id: "1", avatarUuid, avatarName: "Stored", isOwner: true, chatPermission: true }
          : null),
      };
      const resolver = createIdentityResolver({ secondLife: fakeStore, logger: mockLogger });
      try {
        const owner = await resolver.resolve({ companionId: "aria", avatarUuid: "owner-uuid", avatarName: "Weak" });
        assert(owner.tier === "owner" && owner.isOwner === true, "owner not resolved");
        assert(owner.avatarName === "Stored", "stored name should win over weak event name");
        const stranger = await resolver.resolve({ companionId: "aria", avatarUuid: "x", avatarName: "Nobody" });
        assert(stranger.tier === "stranger" && stranger.isStranger === true && stranger.isKnown === false, "stranger fallback wrong");
        pass("resolve() returns owner for stored owner and stranger for unknown UUID");
      } catch (e) {
        fail("resolve() returns owner for stored owner and stranger for unknown UUID", e.message);
      }
    })();

    await checkAsync("identity resolver degrades safely with no store", async () => {
      const resolver = createIdentityResolver({ secondLife: null, logger: mockLogger });
      const r = await resolver.resolve({ companionId: "aria", avatarUuid: "z" });
      assert(r.tier === "stranger", "no-store resolve should be stranger");
    });
  }

  // ─── 11. Stage 3 Phase 8 — social engine decisions ────────────────────────
  section("11. Stage 3 Phase 8 — social engine");
  await (async () => {
    const { createSocialEngine, withinQuietHours } = require(path.join(ROOT, "src/secondLife/slSocialEngine.js"));
    const engine = createSocialEngine({ secondLife: null, logger: mockLogger });
    const baseSettings = { enabled: true, localChatEnabled: true, strangerRepliesEnabled: true };

    const tryCase = async (label, event, context, expectedAction) => {
      try {
        const out = await engine.shouldReplyToLocalChat({ event, context });
        assert(out.action === expectedAction, `expected ${expectedAction}, got ${out.action} (${out.reason})`);
        pass(label);
      } catch (e) {
        fail(label, e.message);
      }
    };

    await tryCase(
      "bridge disabled => ignore",
      { eventType: "local_chat", messageText: "hi" },
      { settings: { enabled: false }, tier: "friend", permissions: { chat: true } },
      "ignore",
    );
    await tryCase(
      "blocked tier => ignore",
      { eventType: "local_chat", messageText: "hi" },
      { settings: baseSettings, tier: "blocked", permissions: { chat: false } },
      "ignore",
    );
    await tryCase(
      "owner always replies",
      { eventType: "local_chat", messageText: "hey" },
      { settings: baseSettings, tier: "owner", permissions: { chat: true } },
      "reply",
    );
    await tryCase(
      "private conversation not addressed => ignore",
      { eventType: "local_chat", messageText: "secret", privacyLevel: "private" },
      { settings: baseSettings, tier: "friend", permissions: { chat: true }, directlyAddressed: false },
      "ignore",
    );
    await tryCase(
      "stranger not addressed => react_only",
      { eventType: "local_chat", messageText: "hello room" },
      { settings: baseSettings, tier: "stranger", permissions: { chat: true }, directlyAddressed: false },
      "react_only",
    );
    await tryCase(
      "friend addressed => reply",
      { eventType: "local_chat", messageText: "hi there" },
      { settings: baseSettings, tier: "friend", permissions: { chat: true }, directlyAddressed: true },
      "reply",
    );
    await tryCase(
      "quiet hours (away activity) => save_memory_only",
      { eventType: "local_chat", messageText: "you up?" },
      { settings: baseSettings, tier: "friend", permissions: { chat: true }, directlyAddressed: false, currentActivity: "sleeping" },
      "save_memory_only",
    );

    check("withinQuietHours handles wrap past midnight", () => {
      const at = (h, m) => new Date(Date.UTC(2026, 0, 1, h, m));
      assert(withinQuietHours("22:00", "07:00", at(23, 0)) === true, "23:00 should be inside 22-07 window");
      assert(withinQuietHours("22:00", "07:00", at(12, 0)) === false, "12:00 should be outside 22-07 window");
    });

    check("interactionGuidance warns about strangers and private memory", () => {
      const g = engine.interactionGuidance({ tier: "stranger", permissions: { privateMemory: false } });
      assert(g && /flirt/i.test(g) && /private memories/i.test(g), "stranger guidance missing");
      assert(engine.interactionGuidance({ tier: "owner", permissions: { privateMemory: true } }) === null, "owner should have no guidance");
    });
  })();

  // ─── 12. Stage 3 Phase 9 — command registry ───────────────────────────────
  section("12. Stage 3 Phase 9 — command registry");
  await (async () => {
    const {
      createCommandRegistry,
      DEFAULT_COMMANDS,
      parseTrigger,
    } = require(path.join(ROOT, "src/secondLife/slCommandRegistry.js"));

    check("DEFAULT_COMMANDS is a non-empty, name-free generic set", () => {
      assert(Array.isArray(DEFAULT_COMMANDS) && DEFAULT_COMMANDS.length >= 15, "expected a substantial default set");
      const blob = JSON.stringify(DEFAULT_COMMANDS).toLowerCase();
      for (const term of ["ghostlight", "aria", "cadence"]) {
        assert(!blob.includes(term), `defaults contain forbidden term "${term}"`);
      }
      for (const c of DEFAULT_COMMANDS) {
        assert(c.commandTrigger.startsWith("!"), `trigger ${c.commandTrigger} should start with !`);
        assert(typeof c.commandType === "string" && c.commandType, "command type missing");
      }
    });

    check("parseTrigger extracts a leading command token only", () => {
      assert(parseTrigger("!dance please") === "!dance", "did not extract leading trigger");
      assert(parseTrigger("hello !dance") === "", "should not extract a non-leading trigger");
      assert(parseTrigger("just chatting") === "", "non-command text should yield empty");
    });

    await (async () => {
      const registry = createCommandRegistry({ secondLife: null, logger: mockLogger });
      try {
        const ownerOnly = await registry.resolveCommand({ companionId: "aria", trigger: "!follow", relationship: { tier: "owner", isOwner: true } });
        assert(ownerOnly.command && ownerOnly.allowed === true, "owner should run owner-only command");
        const strangerDenied = await registry.resolveCommand({ companionId: "aria", trigger: "!follow", relationship: { tier: "stranger" } });
        assert(strangerDenied.command && strangerDenied.allowed === false && strangerDenied.reason === "owner_only", "stranger should be denied owner-only command");
        const blockedDenied = await registry.resolveCommand({ companionId: "aria", trigger: "!dance", relationship: { tier: "blocked" } });
        assert(blockedDenied.allowed === false && blockedDenied.reason === "blocked", "blocked tier should be denied");
        const unknown = await registry.resolveCommand({ companionId: "aria", trigger: "!nope", relationship: { tier: "owner", isOwner: true } });
        assert(unknown.command === null && unknown.allowed === false && unknown.reason === "unknown", "unknown trigger should resolve to unknown");
        pass("resolveCommand enforces owner-only, blocked, and unknown rules from defaults");
      } catch (e) {
        fail("resolveCommand enforces owner-only, blocked, and unknown rules from defaults", e.message);
      }
    })();

    await checkAsync("listForCopy falls back to defaults with no DB", async () => {
      const registry = createCommandRegistry({ secondLife: null, logger: mockLogger });
      const block = await registry.listForCopy({ companionId: "aria" });
      assert(typeof block === "string" && block.includes("!follow"), "copy block should include default triggers");
    });
  })();

  // ─── 13. Stage 3 — storage accessors + adapter delegation ─────────────────
  section("13. Stage 3 — storage accessors + adapter wiring");
  {
    const slStore = "src/storage/secondLife/index.js";
    const accessors = [
      "upsertRelationship", "deleteRelationship", "listRelationships",
      "listCommandDefinitions", "getCommandDefinitionByTrigger",
      "upsertCommandDefinition", "deleteCommandDefinition", "seedDefaultCommands",
    ];
    let allAccessors = true;
    for (const a of accessors) {
      if (!fileHas(slStore, a)) allAccessors = false;
    }
    if (allAccessors) pass("store exports relationship + command accessors");
    else fail("store missing one or more Stage 3 accessors");

    if (fileHas("src/channels/secondLifeAdapter.js", "createIdentityResolver")
      && fileHas("src/channels/secondLifeAdapter.js", "createSocialEngine")
      && fileHas("src/channels/secondLifeAdapter.js", "createCommandRegistry"))
      pass("adapter delegates to identity/social/command modules");
    else fail("adapter does not delegate to Stage 3 modules");

    if (fileHas("src/channels/secondLifeAdapter.js", "tryHandleCommand")) pass("adapter handles commands before the social path");
    else fail("adapter missing command handling");

    if (fileHas("src/index.js", "secondLifeCommandRegistry") && fileHas("src/index.js", "seedCommands"))
      pass("boot builds the registry and seeds defaults on init");
    else fail("boot wiring for the command registry missing");
  }

  // ─── 14. Stage 3 admin UI — relationship + command panels ─────────────────
  section("14. Stage 3 admin UI panels + actions");
  {
    const actions = "src/http/actions/secondLifeActions.js";
    const actionPaths = [
      "second-life-relationship-save", "second-life-relationship-delete",
      "second-life-command-save", "second-life-command-delete",
      "second-life-command-toggle", "second-life-command-seed", "second-life-command-test",
    ];
    let allActions = true;
    for (const a of actionPaths) {
      if (!fileHas(actions, a)) allActions = false;
    }
    if (allActions) pass("relationship + command CRUD/test actions present");
    else fail("one or more Stage 3 actions missing");
  }

  check("renderSecondLifePage renders relationship + command panels", () => {
    const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
    const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
    const html = helpers.renderSecondLifePage({
      companionId: "aria",
      storeAvailable: true,
      settings: { enabled: true, agentName: "Agent", hasSharedSecret: true, localChatEnabled: true },
      status: {
        available: true,
        worldState: { currentRegion: "Region X", nearbyAvatars: [], nearbyObjects: [], lastHeartbeatAt: null },
        queue: { pending: 0, claimed: 0, completed: 0, failed: 0 },
        recentActions: [],
        recentErrors: [],
      },
      summary: { available: true, relationships: 1, outfits: 0, landmarks: 0, objects: 0, commands: 1, schedule: 0 },
      relationships: [{ avatarUuid: "u-1", avatarName: "Known One", relationshipType: "trusted", isTrusted: true, chatPermission: true }],
      commands: [{ commandTrigger: "!follow", commandType: "movement", description: "Follow", enabled: true, requiresOwnerPermission: true, allowedRelationships: [] }],
      copyBlock: "!follow — Follow the requester.",
      theme: "light",
    });
    assert(html.includes("second-life-relationship-save"), "relationship form missing");
    assert(html.includes("second-life-command-save"), "command form missing");
    assert(html.includes("Command Registry"), "command panel heading missing");
    assert(html.includes("Known One"), "relationship row not rendered");
    assert(html.includes("!follow"), "command row not rendered");
    assert(html.includes("second-life-command-test"), "command test form missing");
  });

  // ─── 15. No prompt-profile threading left in the brain ────────────────────
  section("15. Brain builds persona from the Companion tab only (no profile threading)");
  {
    check("chat pipeline + SL reply generator no longer load a prompt profile", () => {
      assert(!fileHas("src/chat/createChatPipeline.js", "getActiveProfile"), "chat pipeline still loads an active prompt profile");
      assert(!fileHas("src/companion/secondLifeReplyGenerator.js", "getActiveProfile"), "SL reply generator still loads an active prompt profile");
      assert(!fileHas("src/chat/createChatPipeline.js", "promptProfiles"), "chat pipeline still depends on promptProfiles");
      assert(!fileHas("src/companion/secondLifeReplyGenerator.js", "promptProfiles"), "SL reply generator still depends on promptProfiles");
    });

    check("prompt builder no longer threads a profile/overlay", () => {
      assert(!fileHas("src/companion/assembleCompanionPrompt.js", "secondLifeBehaviorPrompt"), "assembler still references SL overlay fields");
      assert(!fileHas("src/chat/prompt/buildSystemPrompt.js", "promptProfile"), "buildSystemPrompt still threads promptProfile");
      assert(!fileHas("src/chat/pipeline/callModel.js", "promptProfile"), "callModel still threads promptProfile");
      assert(!fileHas("src/chat/pipeline/buildChatRequest.js", "promptProfile"), "buildChatRequest still threads promptProfile");
    });
  }

  // ─── 16. Stage 4 Phase 10 — outfit manager ───────────────────────────────
  section("16. Stage 4 Phase 10 — outfit manager (defaults + resolution)");
  {
    const { createOutfitManager } = require(path.join(ROOT, "src/secondLife/slOutfitManager.js"));

    check("DEFAULT_OUTFITS are generic and name-free (empty outfitName)", () => {
      const mgr = createOutfitManager({ secondLife: null, logger: mockLogger });
      assert(Array.isArray(mgr.DEFAULT_OUTFITS) && mgr.DEFAULT_OUTFITS.length > 0, "no default outfits");
      for (const o of mgr.DEFAULT_OUTFITS) {
        assert(o.trigger && typeof o.trigger === "string", "default outfit missing trigger");
        assert((o.outfitName || "") === "", `outfit ${o.trigger} hardcodes an in-world name`);
      }
    });

    check("no 'cadence' anywhere in the outfit manager", () => {
      assert(!/cadence/i.test(readFile("src/secondLife/slOutfitManager.js")), "found 'cadence'");
    });

    await checkAsync("resolveOutfit answers from defaults with no DB and gates owner-only", async () => {
      const mgr = createOutfitManager({ secondLife: null, logger: mockLogger });
      const someTrigger = mgr.DEFAULT_OUTFITS[0].trigger;
      const res = await mgr.resolveOutfit({ companionId: "c", trigger: someTrigger, relationship: { isOwner: true } });
      assert(res.outfit, "default outfit not resolved with no DB");
      const unknown = await mgr.resolveOutfit({ companionId: "c", trigger: "definitely-not-real", relationship: { isOwner: true } });
      assert(!unknown.allowed, "unknown trigger should not be allowed");
    });

    await checkAsync("chooseForContext picks a default by context with no DB", async () => {
      const mgr = createOutfitManager({ secondLife: null, logger: mockLogger });
      const chosen = await mgr.chooseForContext({ companionId: "c", context: "formal" });
      assert(chosen && chosen.trigger, "no outfit chosen for context");
    });
  }

  // ─── 17. Stage 4 Phase 11 — landmark manager ──────────────────────────────
  section("17. Stage 4 Phase 11 — landmark manager (gating, no defaults, no fake visits)");
  {
    const { createLandmarkManager } = require(path.join(ROOT, "src/secondLife/slLandmarkManager.js"));

    await checkAsync("empty with no DB (no region-specific defaults)", async () => {
      const mgr = createLandmarkManager({ secondLife: null, logger: mockLogger });
      const home = await mgr.getHome({ companionId: "c" });
      assert(home == null, "getHome should be empty with no DB");
      const pick = await mgr.chooseForAutonomy({ companionId: "c", relationship: { isOwner: true } });
      assert(pick == null, "chooseForAutonomy should be empty with no DB");
    });

    await checkAsync("private landmark requires permission; owner always allowed", async () => {
      const priv = {
        trigger: "den", name: "Den", region: "Region Y", coordinates: { x: 1 },
        enabled: true, isPrivate: true, allowedRelationships: ["trusted"], tags: [], favoriteScore: 0,
      };
      const fakeStore = {
        async getLandmarkByTrigger() { return priv; },
        async listLandmarks() { return [priv]; },
      };
      const mgr = createLandmarkManager({ secondLife: fakeStore, logger: mockLogger });
      const stranger = await mgr.resolveLandmark({ companionId: "c", trigger: "den", relationship: { tier: "stranger" } });
      assert(!stranger.allowed, "private landmark leaked to stranger");
      const owner = await mgr.resolveLandmark({ companionId: "c", trigger: "den", relationship: { isOwner: true } });
      assert(owner.allowed, "owner denied a private landmark");
    });

    await checkAsync("chooseForAutonomy never returns a landmark with no region (no fake visit)", async () => {
      const noRegion = { trigger: "ghost", name: "Ghost", region: "", coordinates: {}, enabled: true, isPrivate: false, allowedRelationships: [], tags: [], favoriteScore: 99 };
      const fakeStore = { async listLandmarks() { return [noRegion]; } };
      const mgr = createLandmarkManager({ secondLife: fakeStore, logger: mockLogger });
      const pick = await mgr.chooseForAutonomy({ companionId: "c", relationship: { isOwner: true } });
      assert(pick == null, "autonomy returned a region-less landmark");
    });
  }

  // ─── 18. Stage 4 Phase 12 — movement + object engines ─────────────────────
  section("18. Stage 4 Phase 12 — movement + object intent parsing");
  {
    const { createMovementEngine } = require(path.join(ROOT, "src/secondLife/slMovementEngine.js"));
    const { createObjectInteractionEngine } = require(path.join(ROOT, "src/secondLife/slObjectInteractionEngine.js"));

    check("movement engine parses common natural-language intents", () => {
      const eng = createMovementEngine({ secondLife: null, logger: mockLogger });
      assert(eng.matchIntent("follow me please"), "did not parse 'follow me'");
      assert(eng.matchIntent("stop following me"), "did not parse 'stop following'");
      assert(eng.matchIntent("go home"), "did not parse 'go home'");
      assert(eng.matchIntent("this is just normal chatter") == null, "false-positive movement match");
    });

    check("object engine parses use intents and extracts target name", () => {
      const eng = createObjectInteractionEngine({ secondLife: null, logger: mockLogger });
      const sit = eng.matchIntent("sit on the couch");
      assert(sit && sit.action === "sit", "did not parse 'sit on'");
      assert(/couch/.test(sit.targetName), "did not extract target name");
      assert(eng.matchIntent("dance with me"), "did not parse 'dance'");
    });

    await checkAsync("object resolution asks ONE clarification on multi-match", async () => {
      const a = { objectUuid: "o-1", objectName: "red couch", useType: "seat", objectType: "seat", roomLabel: "lounge", region: "R", enabled: true };
      const b = { objectUuid: "o-2", objectName: "blue couch", useType: "seat", objectType: "seat", roomLabel: "study", region: "R", enabled: true };
      const fakeStore = { async findObjects() { return [a, b]; } };
      const eng = createObjectInteractionEngine({ secondLife: fakeStore, logger: mockLogger });
      const res = await eng.resolveObject({ companionId: "c", targetName: "couch", useType: "seat" });
      assert(res.status === "needs_clarification", `expected clarification, got ${res.status}`);
      assert(Array.isArray(res.options) && res.options.length >= 2, "clarification should list options");
    });

    await checkAsync("object resolution returns not_found with no DB", async () => {
      const eng = createObjectInteractionEngine({ secondLife: null, logger: mockLogger });
      const res = await eng.resolveObject({ companionId: "c", targetName: "anything", useType: "" });
      assert(res.status === "not_found", "no-DB resolution should be not_found");
    });
  }

  // ─── 19. Stage 4 — adapter NL world-action wiring + boot ───────────────────
  section("19. Stage 4 — adapter NL world-action interception + boot wiring");
  {
    const adapterFile = "src/channels/secondLifeAdapter.js";
    if (fileHas(adapterFile, "tryHandleWorldAction") && fileHas(adapterFile, "WORLD_ACTION_TIERS"))
      pass("adapter intercepts NL world actions after commands");
    else fail("adapter missing world-action interception");

    if (fileHas(adapterFile, "createOutfitManager") && fileHas(adapterFile, "createLandmarkManager")
      && fileHas(adapterFile, "createMovementEngine") && fileHas(adapterFile, "createObjectInteractionEngine"))
      pass("adapter constructs/injects the Stage 4 engines");
    else fail("adapter does not wire the Stage 4 engines");

    if (fileHas(adapterFile, "needs_clarification") && fileHas(adapterFile, "say_local"))
      pass("adapter enqueues one clarification on ambiguous object match");
    else fail("adapter missing clarification path");

    const boot = "src/index.js";
    if (fileHas(boot, "createOutfitManager") && fileHas(boot, "createLandmarkManager")
      && fileHas(boot, "createMovementEngine") && fileHas(boot, "createObjectInteractionEngine"))
      pass("boot constructs all Stage 4 engines");
    else fail("boot missing Stage 4 engine construction");

    if (fileHas(boot, "outfitManager:") && fileHas(boot, "movementEngine:"))
      pass("boot injects the engines into the adapter");
    else fail("boot does not inject engines into the adapter");

    if (fileHas(boot, "seedOutfits"))
      pass("boot seeds default outfits on init (guarded)");
    else fail("boot missing outfit seeding step");

    {
      const bootSrc = readFile(boot);
      const engines = [
        "secondLifeOutfitManager", "secondLifeLandmarkManager",
        "secondLifeMovementEngine", "secondLifeObjectInteractionEngine",
      ];
      const exposedTwice = engines.every((e) => {
        const re = new RegExp(`(^|[^\\w])${e}(,|\\s*$)`, "gm");
        return (bootSrc.match(re) || []).length >= 2;
      });
      if (exposedTwice) pass("boot exposes all Stage 4 engines on appContext + client.appContext");
      else fail("Stage 4 engines not exposed on both context objects");
    }
  }

  // ─── 20. Stage 4 admin UI — outfit/landmark/object panels + actions ───────
  section("20. Stage 4 admin UI panels + actions");
  {
    const actions = "src/http/actions/secondLifeActions.js";
    const actionPaths = [
      "second-life-outfit-save", "second-life-outfit-delete",
      "second-life-outfit-toggle", "second-life-outfit-seed",
      "second-life-landmark-save", "second-life-landmark-delete",
      "second-life-object-delete",
    ];
    let allActions = true;
    for (const a of actionPaths) {
      if (!fileHas(actions, a)) allActions = false;
    }
    if (allActions) pass("outfit/landmark/object CRUD actions present");
    else fail("one or more Stage 4 actions missing");

    const handler = "src/http/adminPageHandlers/secondLifePageHandler.js";
    if (fileHas(handler, "listOutfits") && fileHas(handler, "listLandmarks") && fileHas(handler, "listObjects"))
      pass("page handler loads outfits/landmarks/objects");
    else fail("page handler does not load Stage 4 registries");

    check("renderSecondLifePage renders outfit/landmark/object panels", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: true,
        settings: { enabled: true, agentName: "Agent", hasSharedSecret: true },
        status: {
          available: true,
          worldState: { currentRegion: "Region X", nearbyAvatars: [], nearbyObjects: [], lastHeartbeatAt: null },
          queue: { pending: 0, claimed: 0, completed: 0, failed: 0 },
          recentActions: [],
          recentErrors: [],
        },
        summary: { available: true, relationships: 0, outfits: 1, landmarks: 1, objects: 1, commands: 0, schedule: 0 },
        relationships: [],
        commands: [],
        outfits: [{ trigger: "formal", outfitName: "", description: "Formal wear", contextTags: ["formal"], requiresOwnerPermission: false, isDefault: true, enabled: true }],
        landmarks: [{ trigger: "beach", name: "Beach", region: "Region Z", isHome: false, isPrivate: true, allowedRelationships: ["trusted"], enabled: true }],
        objects: [{ objectUuid: "o-1", objectName: "Couch", useType: "seat", objectType: "seat", region: "Region Z", roomLabel: "lounge", allowedActions: ["sit"], requiresOwnerPermission: false, enabled: true }],
        copyBlock: "",
        theme: "light",
      });
      assert(html.includes("second-life-outfit-save"), "outfit form missing");
      assert(html.includes("second-life-landmark-save"), "landmark form missing");
      assert(html.includes("second-life-object-delete"), "object delete form missing");
      assert(html.includes(">Outfits<"), "outfit panel heading missing");
      assert(html.includes(">Landmarks<"), "landmark panel heading missing");
      assert(html.includes(">Objects<"), "object panel heading missing");
      assert(html.includes("formal"), "outfit row not rendered");
      assert(html.includes("Beach"), "landmark row not rendered");
      assert(html.includes("Couch"), "object row not rendered");
    });
  }

  // ─── 21. Stage 5 Phase 15 — daily schedule engine + storage ──────────────
  section("21. Stage 5 Phase 15 — daily schedule engine (defaults, no-DB)");
  {
    const { createDailyScheduleEngine, DEFAULT_SCHEDULE } = require(path.join(ROOT, "src/lifeEngine/dailyScheduleEngine.js"));

    check("DEFAULT_SCHEDULE is generic, name-free and covers the day", () => {
      assert(Array.isArray(DEFAULT_SCHEDULE) && DEFAULT_SCHEDULE.length === 4, "expected 4 default windows");
      const types = DEFAULT_SCHEDULE.map((e) => e.activityType);
      for (const t of ["morning", "afternoon", "evening", "night"]) {
        assert(types.includes(t), `default schedule missing ${t} window`);
      }
      const blob = JSON.stringify(DEFAULT_SCHEDULE).toLowerCase();
      for (const term of ["ghostlight", "aria", "cadence"]) {
        assert(!blob.includes(term), `defaults contain forbidden term "${term}"`);
      }
      for (const e of DEFAULT_SCHEDULE) {
        assert((e.dayOfWeek || "") === "", "default windows should apply every day (blank dayOfWeek)");
      }
    });

    await checkAsync("resolveCurrentActivity falls back to defaults with no DB", async () => {
      const eng = createDailyScheduleEngine({ secondLife: null, logger: mockLogger });
      const at = (h) => new Date(2026, 0, 1, h, 0, 0);
      const morning = await eng.resolveCurrentActivity({ companionId: "c", now: at(8) });
      assert(morning && morning.activityType === "morning", "08:00 should resolve to the morning window");
      const night = await eng.resolveCurrentActivity({ companionId: "c", now: at(2) });
      assert(night && night.activityType === "night", "02:00 should resolve to the night window (wraps midnight)");
    });

    await checkAsync("seedDefaults is a no-op (0) with no store", async () => {
      const eng = createDailyScheduleEngine({ secondLife: null, logger: mockLogger });
      const n = await eng.seedDefaults({ companionId: "c" });
      assert(n === 0, "seedDefaults should return 0 with no store");
    });

    await checkAsync("storage upsertScheduleEntry UPDATES the existing row when an id is supplied", async () => {
      const rowsById = new Map();
      let nextId = 1;
      const fakePool = {
        async query(sql, params) {
          const text = String(sql);
          if (/update\s+companion_daily_schedule/i.test(text)) {
            const id = params[1];
            const existing = rowsById.get(String(id));
            if (!existing) return { rows: [] };
            const updated = { ...existing, activity_type: params[5] };
            rowsById.set(String(id), updated);
            return { rows: [updated] };
          }
          if (/insert\s+into\s+companion_daily_schedule/i.test(text)) {
            const id = String(nextId++);
            const row = { id, companion_id: params[0], activity_type: params[4] };
            rowsById.set(id, row);
            return { rows: [row] };
          }
          return { rows: [] };
        },
      };
      // Stub createPostgresPool so the store treats fakePool as a live DB.
      const poolModPath = require.resolve(path.join(ROOT, "src/storage/postgres/createPostgresPool.js"));
      const storeModPath = require.resolve(path.join(ROOT, "src/storage/secondLife/index.js"));
      const origPoolMod = require.cache[poolModPath];
      require.cache[poolModPath] = {
        id: poolModPath,
        filename: poolModPath,
        loaded: true,
        exports: { createPostgresPool: () => fakePool },
      };
      delete require.cache[storeModPath];
      try {
        const { createSecondLifeStore } = require(storeModPath);
        const store = createSecondLifeStore({ config: {}, logger: mockLogger });
        const inserted = await store.upsertScheduleEntry({ companionId: "c", activityType: "morning", timeWindowStart: "06:00", timeWindowEnd: "12:00" });
        assert(inserted && inserted.id, "insert path should return a new row with an id");
        const beforeCount = rowsById.size;
        await store.upsertScheduleEntry({ companionId: "c", id: inserted.id, activityType: "evening", timeWindowStart: "06:00", timeWindowEnd: "12:00" });
        assert(rowsById.size === beforeCount, "supplying an id must UPDATE, not insert a second row");
        assert(rowsById.get(String(inserted.id)).activity_type === "evening", "update did not persist the new value");
      } finally {
        if (origPoolMod) require.cache[poolModPath] = origPoolMod;
        else delete require.cache[poolModPath];
        delete require.cache[storeModPath];
      }
    });
  }

  // ─── 22. Stage 5 Phase 16 — discovery engine (real visits only) ──────────
  section("22. Stage 5 Phase 16 — discovery engine (never fakes)");
  {
    const { createDiscoveryEngine } = require(path.join(ROOT, "src/lifeEngine/discoveryEngine.js"));

    await checkAsync("recordVisit refuses to record a place with no real identity", async () => {
      let upserts = 0;
      const fakeStore = { async upsertDiscovery(row) { upserts++; return row; } };
      const eng = createDiscoveryEngine({ secondLife: fakeStore, logger: mockLogger });
      const empty = await eng.recordVisit({ companionId: "c", name: "", region: "" });
      assert(empty === null, "recordVisit should reject an empty (un-visited) place");
      assert(upserts === 0, "recordVisit must not write a discovery with no place key");
      const real = await eng.recordVisit({ companionId: "c", name: "Quiet Cove", region: "Region X", source: "visited" });
      assert(real && upserts === 1, "recordVisit should persist a genuinely visited place");
    });

    await checkAsync("recordVisit clamps source to visited|registered|imported", async () => {
      let saved = null;
      const fakeStore = { async upsertDiscovery(row) { saved = row; return row; } };
      const eng = createDiscoveryEngine({ secondLife: fakeStore, logger: mockLogger });
      await eng.recordVisit({ companionId: "c", name: "Place", region: "R", source: "invented" });
      assert(saved && saved.source === "visited", "unknown source should fall back to visited, never an invented label");
    });

    await checkAsync("discovery curation no-ops safely with no store", async () => {
      const eng = createDiscoveryEngine({ secondLife: null, logger: mockLogger });
      assert((await eng.recordVisit({ companionId: "c", name: "X", region: "Y" })) === null, "no-store recordVisit should be null");
      assert((await eng.bookmark({ companionId: "c", placeKey: "x", bookmarked: true })) === null, "no-store bookmark should be null");
      const recent = await eng.listRecent({ companionId: "c" });
      assert(Array.isArray(recent) && recent.length === 0, "no-store listRecent should be empty");
    });
  }

  // ─── 23. Stage 5 Phase 14 — life-engine state + orchestrator gating ──────
  section("23. Stage 5 Phase 14 — emotional state + orchestrator (disabled by default)");
  {
    const { deriveState, STATES } = require(path.join(ROOT, "src/lifeEngine/emotionalStateEngine.js"));
    const { createLifeEngine } = require(path.join(ROOT, "src/lifeEngine/index.js"));

    check("deriveState returns a known behavioral state with influence flags", () => {
      const { state, influences } = deriveState({ timeOfDay: "morning", ownerPresent: true, scheduleActivityType: "morning", nearbyCount: 0 });
      assert(STATES.includes(state), `derived state ${state} not in the known behavioral set`);
      for (const flag of ["shouldTalk", "shouldJournal", "shouldInviteOwner", "prefersQuiet", "wanderBias"]) {
        assert(flag in influences, `influences missing ${flag}`);
      }
      const tired = deriveState({ timeOfDay: "night", ownerPresent: false, scheduleActivityType: "night", nearbyCount: 0 });
      assert(STATES.includes(tired.state), "night state not in known set");
    });

    check("behavioral states are not fake human emotions", () => {
      const forbidden = ["happy", "sad", "angry", "love", "depressed", "anxious", "jealous"];
      for (const f of forbidden) {
        assert(!STATES.includes(f), `STATES leaks fake emotion "${f}"`);
      }
    });

    await checkAsync("orchestrator tick is a no-op while disabled (default)", async () => {
      const engine = createLifeEngine({ secondLife: null, config: {}, logger: mockLogger });
      assert(engine.isEnabled() === false, "life engine must be disabled by default");
      const res = await engine.tick({ companionId: "c" });
      assert(res.ran === false && res.reason === "disabled", "disabled tick should not run");
    });

    await checkAsync("orchestrator assess is well-formed and safe with no DB", async () => {
      const engine = createLifeEngine({ secondLife: null, config: { secondLife: { lifeEngine: { enabled: true } } }, logger: mockLogger });
      const a = await engine.assess({ companionId: "c" });
      assert(a && typeof a === "object" && "state" in a && "activity" in a, "assess should return a well-formed snapshot");
      assert(STATES.includes(a.state), "assess produced an unknown state");
    });
  }

  // ─── 24. Stage 5 — config defaults + runtime toggles ─────────────────────
  section("24. Stage 5 — life-engine config defaults + runtime toggles");
  {
    if (fileHas("src/config/env.js", "lifeEngine")) pass("env.js defines the secondLife.lifeEngine config block");
    else fail("env.js missing the lifeEngine config block");

    if (fileHas("src/config/runtimeSettings.js", "secondLife.lifeEngine.enabled")
      && fileHas("src/config/runtimeSettings.js", "secondLife.lifeEngine.autonomyLevel"))
      pass("runtime settings whitelist the life-engine toggles");
    else fail("life-engine runtime settings not whitelisted");
  }

  // ─── 25. Stage 5 — boot wiring + admin UI panels/actions ─────────────────
  section("25. Stage 5 — boot wiring + admin schedule/discovery/life-engine UI");
  {
    const boot = "src/index.js";
    if (fileHas(boot, "createLifeEngine")) pass("boot constructs the life-engine orchestrator");
    else fail("boot missing life-engine construction");

    if (fileHas(boot, "secondLifeLifeEngine")) pass("boot exposes the life engine on context");
    else fail("life engine not exposed on context");

    if (fileHas(boot, "seedSchedule")) pass("boot seeds the default schedule (guarded)");
    else fail("boot missing schedule seeding step");

    const actions = "src/http/actions/secondLifeActions.js";
    const actionPaths = [
      "second-life-life-engine-toggle",
      "second-life-schedule-save", "second-life-schedule-delete", "second-life-schedule-seed",
      "second-life-discovery-bookmark", "second-life-discovery-rate",
      "second-life-discovery-favorite", "second-life-discovery-delete",
    ];
    let allActions = true;
    for (const a of actionPaths) {
      if (!fileHas(actions, a)) allActions = false;
    }
    if (allActions) pass("life-engine/schedule/discovery actions present");
    else fail("one or more Stage 5 actions missing");

    const handler = "src/http/adminPageHandlers/secondLifePageHandler.js";
    if (fileHas(handler, "listSchedule") && fileHas(handler, "listDiscoveries"))
      pass("page handler loads schedule + discoveries");
    else fail("page handler does not load schedule/discoveries");

    const slStore = "src/storage/secondLife/index.js";
    const storeAccessors = [
      "listSchedule", "getScheduleEntry", "upsertScheduleEntry", "deleteScheduleEntry", "seedDefaultSchedule",
      "listDiscoveries", "getDiscovery", "upsertDiscovery",
      "setDiscoveryBookmark", "setDiscoveryRating", "setDiscoveryFavorite", "deleteDiscovery",
    ];
    let allStore = true;
    for (const a of storeAccessors) {
      if (!fileHas(slStore, a)) allStore = false;
    }
    if (allStore) pass("store exports schedule + discovery accessors");
    else fail("store missing one or more Stage 5 accessors");

    if (fileHas(slStore, "second_life_discoveries")) pass("store creates the second_life_discoveries table");
    else fail("store missing the second_life_discoveries table");

    check("renderSecondLifePage renders life-engine + schedule + discovery panels", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: true,
        settings: { enabled: true, agentName: "Agent", hasSharedSecret: true },
        status: {
          available: true,
          worldState: { currentRegion: "Region X", nearbyAvatars: [], nearbyObjects: [], lastHeartbeatAt: null },
          queue: { pending: 0, claimed: 0, completed: 0, failed: 0 },
          recentActions: [],
          recentErrors: [],
        },
        summary: { available: true, relationships: 0, outfits: 0, landmarks: 0, objects: 0, commands: 0, schedule: 1 },
        relationships: [],
        commands: [],
        outfits: [],
        landmarks: [],
        objects: [],
        schedule: [{ id: "s-1", dayOfWeek: "", timeWindowStart: "06:00", timeWindowEnd: "12:00", activityType: "morning", activityLabel: "Wake up", autonomyLevel: "medium", requiresOwnerPresent: false, enabled: true }],
        discoveries: [{ placeKey: "quiet-cove|region-x", name: "Quiet Cove", region: "Region X", source: "visited", visitCount: 2, rating: 4, bookmarked: true, isFavorite: false, shared: false }],
        lifeEngineEnabled: false,
        lifeEngineAutonomy: "medium",
        copyBlock: "",
        theme: "light",
      });
      assert(html.includes("second-life-life-engine-toggle"), "life-engine toggle form missing");
      assert(html.includes("second-life-schedule-save"), "schedule form missing");
      assert(html.includes("second-life-schedule-seed"), "schedule seed form missing");
      assert(html.includes("second-life-discovery-favorite"), "discovery favorite form missing");
      assert(html.includes("Companion Life Engine"), "life-engine panel heading missing");
      assert(html.includes("Daily Schedule"), "schedule panel heading missing");
      assert(html.includes("editScheduleId=s-1"), "schedule rows must expose an Edit affordance (editScheduleId link)");
      assert(html.includes("Discoveries"), "discovery panel heading missing");
      assert(html.includes("Quiet Cove"), "discovery row not rendered");
    });

    check("renderSecondLifePage prefills the schedule form and switches to Update when editing", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const editingEntry = { id: "s-1", dayOfWeek: "", timeWindowStart: "06:00", timeWindowEnd: "12:00", activityType: "morning", activityLabel: "Wake up", autonomyLevel: "high", requiresOwnerPresent: true, enabled: true };
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: true,
        settings: {},
        status: null,
        summary: null,
        schedule: [editingEntry],
        discoveries: [],
        scheduleEditing: editingEntry,
        lifeEngineEnabled: false,
        lifeEngineAutonomy: "medium",
        theme: "light",
      });
      assert(html.includes("Update schedule entry"), "edit mode must render an Update button");
      assert(/name="id"\s+value="s-1"/.test(html), "edit mode must carry a hidden id field so the save action UPDATES");
      assert(html.includes('value="Wake up"'), "edit mode must prefill the activity label");
    });

    check("renderSecondLifePage still renders Stage 5 panels read-only with no DB", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: false,
        settings: null,
        status: null,
        summary: null,
        schedule: [],
        discoveries: [],
        lifeEngineEnabled: false,
        lifeEngineAutonomy: "medium",
        theme: "light",
      });
      assert(html.includes("Companion Life Engine"), "life-engine panel missing with no DB");
      assert(html.includes("Daily Schedule"), "schedule panel missing with no DB");
    });
  }

  // ─── 26. Stage 6 — shared experiences + goals + initiative ────────────────
  section("26. Stage 6 — shared experiences (P17) + goals (P19) + initiative (P18)");
  {
    const slStore = "src/storage/secondLife/index.js";
    const stage6Accessors = [
      "listSharedExperiences", "upsertSharedExperience", "deleteSharedExperience",
      "listGoals", "getGoal", "upsertGoal", "deleteGoal", "incrementGoalProgress",
      "recordInitiative", "listInitiatives", "countInitiativesSince",
    ];
    let allStage6Store = true;
    for (const a of stage6Accessors) {
      if (!fileHas(slStore, a)) allStage6Store = false;
    }
    if (allStage6Store) pass("store exports shared-experience + goal + initiative accessors");
    else fail("store missing one or more Stage 6 accessors");

    const stage6Tables = ["second_life_shared_experiences", "second_life_goals", "second_life_initiatives"];
    let allTables = true;
    for (const t of stage6Tables) {
      if (!fileHas(slStore, t)) allTables = false;
    }
    if (allTables) pass("store creates the Stage 6 tables");
    else fail("store missing one or more Stage 6 tables");

    // ── Engines load + degrade safely with no DB ───────────────────────────
    await checkAsync("sharedExperienceEngine loads + degrades safely with no DB", async () => {
      const { createSharedExperienceEngine, EXPERIENCE_TYPES } = require(path.join(ROOT, "src/lifeEngine/sharedExperienceEngine.js"));
      assert(Array.isArray(EXPERIENCE_TYPES) && EXPERIENCE_TYPES.length > 0, "EXPERIENCE_TYPES missing");
      const eng = createSharedExperienceEngine({ secondLife: null, config: {}, logger: null });
      const list = await eng.list({ companionId: "aria" });
      assert(Array.isArray(list), "list should return an array with no DB");
      await eng.recordExperience({ companionId: "aria", experienceType: "moment", title: "t", body: "b" });
    });

    await checkAsync("goalEngine recordProgress requires real evidence (never fabricates)", async () => {
      const { createGoalEngine, GOAL_TYPES } = require(path.join(ROOT, "src/lifeEngine/goalEngine.js"));
      assert(Array.isArray(GOAL_TYPES) && GOAL_TYPES.length > 0, "GOAL_TYPES missing");
      const eng = createGoalEngine({ secondLife: null, config: {}, logger: null });
      const noEvidence = await eng.recordProgress({ companionId: "aria", goalType: "custom", amount: 1, evidence: null });
      assert(Array.isArray(noEvidence) && noEvidence.length === 0, "progress must be skipped with no evidence");
      const zeroAmount = await eng.recordProgress({ companionId: "aria", goalType: "custom", amount: 0, evidence: { from: "real-event" } });
      assert(Array.isArray(zeroAmount) && zeroAmount.length === 0, "progress must be skipped with non-positive amount");
    });

    await checkAsync("initiativeEngine is disabled-by-default and logs WHY when suppressed", async () => {
      const { createInitiativeEngine, isQuietHour, INITIATIVE_TYPES } = require(path.join(ROOT, "src/lifeEngine/initiativeEngine.js"));
      assert(Array.isArray(INITIATIVE_TYPES) && INITIATIVE_TYPES.length > 0, "INITIATIVE_TYPES missing");
      // Quiet-hours window that wraps midnight (22 → 7).
      assert(isQuietHour(23, 22, 7) === true && isQuietHour(2, 22, 7) === true, "overnight quiet window not detected");
      assert(isQuietHour(12, 22, 7) === false, "midday wrongly flagged as quiet hours");
      const eng = createInitiativeEngine({ secondLife: null, config: {}, logger: null });
      const off = await eng.propose({ companionId: "aria" });
      assert(off && off.proposal === null && off.reason === "disabled", "initiative must be disabled by default and report why");

      // Recorded reasons must capture every suppression path (logged WHY).
      const initEng = "src/lifeEngine/initiativeEngine.js";
      for (const reason of ["privacy", "owner_busy", "quiet_hours", "daily_cap"]) {
        if (!fileHas(initEng, reason)) fail(`initiative engine missing suppression reason: ${reason}`);
      }
    });

    // ── Orchestrator gating (default-off, no-DB safe) ──────────────────────
    const orch = "src/lifeEngine/index.js";
    if (fileHas(orch, "createInitiativeEngine") && fileHas(orch, "createGoalEngine") && fileHas(orch, "createSharedExperienceEngine"))
      pass("orchestrator constructs all Stage 6 engines");
    else fail("orchestrator missing one or more Stage 6 engine constructions");

    // ── Runtime/env toggles ────────────────────────────────────────────────
    const env = "src/config/env.js";
    if (fileHas(env, "quietHoursStart") && fileHas(env, "cooldownMinutes") && fileHas(env, "maxPerDay"))
      pass("env exposes initiative settings");
    else fail("env missing initiative settings");

    const runtime = "src/config/runtimeSettings.js";
    if (fileHas(runtime, "secondLife.lifeEngine.initiative.enabled"))
      pass("runtime whitelists initiative settings");
    else fail("runtime missing initiative whitelist entries");

    // ── Admin actions present ──────────────────────────────────────────────
    const actions = "src/http/actions/secondLifeActions.js";
    const stage6Actions = [
      "second-life-experience-save", "second-life-experience-delete",
      "second-life-goal-save", "second-life-goal-delete",
      "second-life-initiative-save",
    ];
    let allStage6Actions = true;
    for (const a of stage6Actions) {
      if (!fileHas(actions, a)) allStage6Actions = false;
    }
    if (allStage6Actions) pass("shared-experience/goal/initiative actions present");
    else fail("one or more Stage 6 actions missing");

    // ── Page handler loads + passes Stage 6 state ──────────────────────────
    const handler = "src/http/adminPageHandlers/secondLifePageHandler.js";
    if (fileHas(handler, "listSharedExperiences") && fileHas(handler, "listGoals") && fileHas(handler, "listInitiatives"))
      pass("page handler loads shared experiences + goals + initiatives");
    else fail("page handler does not load Stage 6 state");

    // ── Render: panels + edit reachability ─────────────────────────────────
    check("renderSecondLifePage renders Stage 6 panels (experiences/goals/initiative)", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: true,
        settings: { enabled: true, agentName: "Agent", hasSharedSecret: true },
        status: null,
        summary: null,
        schedule: [],
        discoveries: [],
        sharedExperiences: [{ id: "x-1", experienceType: "milestone", title: "First dance", body: "On the pier", isMilestone: true }],
        goals: [{ id: "g-1", goalType: "custom", label: "Visit 10 places", targetValue: 10, currentValue: 3, unit: "places", status: "active" }],
        initiatives: [{ id: "i-1", initiativeType: "note", reason: "Suppressed: disabled.", status: "suppressed" }],
        initiativeSettings: { enabled: false, maxPerDay: 3, cooldownMinutes: 120, quietHoursStart: 22, quietHoursEnd: 7 },
        lifeEngineEnabled: false,
        lifeEngineAutonomy: "medium",
        theme: "light",
      });
      assert(html.includes("Shared Experiences"), "shared experiences panel missing");
      assert(html.includes("Long-Term Goals"), "goals panel missing");
      assert(html.includes("Initiative"), "initiative panel missing");
      assert(html.includes("First dance"), "shared experience row not rendered");
      assert(html.includes("Visit 10 places"), "goal row not rendered");
      assert(html.includes("editExperienceId=x-1"), "experiences must expose an Edit affordance");
      assert(html.includes("editGoalId=g-1"), "goals must expose an Edit affordance");
    });

    check("renderSecondLifePage prefills + switches to Update when editing a goal", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const editingGoal = { id: "g-1", goalType: "custom", label: "Visit 10 places", targetValue: 10, currentValue: 3, unit: "places", status: "active" };
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: true,
        settings: {},
        status: null,
        summary: null,
        schedule: [],
        discoveries: [],
        goals: [editingGoal],
        goalEditing: editingGoal,
        initiativeSettings: { enabled: false, maxPerDay: 3, cooldownMinutes: 120, quietHoursStart: 22, quietHoursEnd: 7 },
        lifeEngineEnabled: false,
        lifeEngineAutonomy: "medium",
        theme: "light",
      });
      assert(/name="id"\s+value="g-1"/.test(html), "edit mode must carry a hidden id so the save action UPDATES");
      assert(html.includes('value="Visit 10 places"'), "edit mode must prefill the goal label");
    });

    check("renderSecondLifePage still renders Stage 6 panels read-only with no DB", () => {
      const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
      const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
      const html = helpers.renderSecondLifePage({
        companionId: "aria",
        storeAvailable: false,
        settings: null,
        status: null,
        summary: null,
        schedule: [],
        discoveries: [],
        sharedExperiences: [],
        goals: [],
        initiatives: [],
        initiativeSettings: { enabled: false, maxPerDay: 3, cooldownMinutes: 120, quietHoursStart: 22, quietHoursEnd: 7 },
        lifeEngineEnabled: false,
        lifeEngineAutonomy: "medium",
        theme: "light",
      });
      assert(html.includes("Shared Experiences"), "shared experiences panel missing with no DB");
      assert(html.includes("Long-Term Goals"), "goals panel missing with no DB");
      assert(html.includes("Initiative"), "initiative panel missing with no DB");
    });
  }

  // ─── 27. Discord Adult Private Mode (restored, channel-bound) ─────────────
  section("27. Discord Adult Private Mode restored (separate from prompt profiles)");
  {
    const runtime = "src/config/runtimeSettings.js";
    const adultKeys = [
      "chat.adultPrivateMode.enabled",
      "chat.adultPrivateMode.channelId",
      "chat.adultPrivateMode.model",
      "chat.adultPrivateMode.systemPrompt",
      "chat.adultPrivateMode.safeword",
    ];
    let allAdultKeys = true;
    for (const k of adultKeys) {
      if (!fileHas(runtime, k)) allAdultKeys = false;
    }
    if (allAdultKeys) pass("runtimeSettings defines the adultPrivateMode setting keys");
    else fail("runtimeSettings missing one or more adultPrivateMode keys");

    if (fileHas("src/http/adminSettingsParsers.js", "parseAdultPrivateModeSettingsFields"))
      pass("admin settings parser handles adultPrivateMode fields");
    else fail("adultPrivateMode settings parser missing");

    if (fileHas("src/http/renderAdminPages/topLevelPages.js", "renderAdultPrivateModeTab")
      && fileHas("src/http/renderAdminPages/topLevelPages.js", "private-mode"))
      pass("admin UI renders the Adult Private Mode tab");
    else fail("Adult Private Mode admin tab missing");

    if (fileHas("src/chat/createChatPipeline.js", "adultPrivateMode"))
      pass("chat pipeline applies the adultPrivateMode overrides");
    else fail("chat pipeline missing adultPrivateMode handling");

    if (fileHas("src/bot/events/messageCreate.js", "adult private mode"))
      pass("message handler wires the channel toggle command");
    else fail("adultPrivateMode channel toggle command missing");
  }

  // ─── 28. Prompt Profiles fully removed from nav + codebase ────────────────
  section("28. Prompt Profiles fully removed");
  {
    const nav = readFile("src/http/renderAdminPages/shared.js");
    if (nav.indexOf("/admin/prompt-profiles") === -1) pass("Prompt Profiles nav entry removed");
    else fail("Prompt Profiles nav entry still present");

    if (!fs.existsSync(path.join(ROOT, "src/companion/promptProfileService.js"))) pass("prompt profile service deleted");
    else fail("prompt profile service still exists");

    if (fileHas("src/companion/resolveCompanionId.js", "resolveCompanionId")) pass("resolveCompanionId relocated to its own neutral module");
    else fail("resolveCompanionId module missing");

    if (!fileHas("src/http/renderAdminPages/secondLifePage.js", "Prompt Profiles")) pass("Second Life admin page copy no longer mentions Prompt Profiles");
    else fail("Second Life admin page still references Prompt Profiles in user-facing copy");
  }

  // ─── 29. Phase 20 — Privacy & Safety + emergency commands ─────────────────
  section("29. Phase 20 — Privacy & Safety + emergency commands");
  await (async () => {
    const {
      createCommandRegistry,
      DEFAULT_COMMANDS,
    } = require(path.join(ROOT, "src/secondLife/slCommandRegistry.js"));

    // (a) the six owner-gated emergency commands exist + are tagged emergency.
    check("DEFAULT_COMMANDS includes the six owner-gated emergency commands", () => {
      const emergencyTriggers = ["!stop", "!returnhome", "!sleep", "!quiet", "!localoff", "!autonomyoff"];
      for (const t of emergencyTriggers) {
        const cmd = DEFAULT_COMMANDS.find((c) => c.commandTrigger === t);
        assert(cmd, `missing emergency command ${t}`);
        assert(cmd.requiresOwnerPermission === true, `${t} must be owner-gated`);
        assert(cmd.payload && cmd.payload.emergency === true, `${t} must be tagged emergency`);
      }
    });

    await checkAsync("emergency commands resolve allowed for owner, denied for stranger", async () => {
      const registry = createCommandRegistry({ secondLife: null, logger: mockLogger });
      for (const t of ["!stop", "!returnhome"]) {
        const owner = await registry.resolveCommand({ companionId: "x", trigger: t, relationship: { tier: "owner", isOwner: true } });
        assert(owner.command && owner.allowed === true, `${t} should be allowed for owner`);
        const stranger = await registry.resolveCommand({ companionId: "x", trigger: t, relationship: { tier: "stranger" } });
        assert(stranger.allowed === false && stranger.reason === "owner_only", `${t} should be denied for stranger`);
      }
    });

    // (a2) the remaining owner controls (stranger replies, clear queue, block) are
    // exposed as owner-gated commands and routed through applySafetyControl.
    check("DEFAULT_COMMANDS expose owner-gated stranger/clear-queue/block controls", () => {
      const controls = {
        "!strangersoff": "strangers_off",
        "!strangerson": "strangers_on",
        "!clearqueue": "clear_queue",
        "!block": "block_avatar",
      };
      for (const [trigger, action] of Object.entries(controls)) {
        const cmd = DEFAULT_COMMANDS.find((c) => c.commandTrigger === trigger);
        assert(cmd, `missing owner control ${trigger}`);
        assert(cmd.requiresOwnerPermission === true, `${trigger} must be owner-gated`);
        assert(cmd.payload && cmd.payload.action === action, `${trigger} must map to action ${action}`);
      }
    });

    await checkAsync("owner controls resolve allowed for owner, denied for stranger", async () => {
      const registry = createCommandRegistry({ secondLife: null, logger: mockLogger });
      for (const t of ["!strangersoff", "!clearqueue", "!block"]) {
        const owner = await registry.resolveCommand({ companionId: "x", trigger: t, relationship: { tier: "owner", isOwner: true } });
        assert(owner.command && owner.allowed === true, `${t} should be allowed for owner`);
        const stranger = await registry.resolveCommand({ companionId: "x", trigger: t, relationship: { tier: "stranger" } });
        assert(stranger.allowed === false && stranger.reason === "owner_only", `${t} should be denied for stranger`);
      }
    });

    check("adapter routes stranger/clear-queue/block controls through applySafetyControl", () => {
      const adapter = "src/channels/secondLifeAdapter.js";
      for (const needle of ["strangers_off", "strangers_on", "clear_queue", "block_avatar", "strangerRepliesEnabled", "blockAvatar"]) {
        assert(fileHas(adapter, needle), `adapter missing "${needle}"`);
      }
    });

    // helper: build the SL store against a controllable pool (null = no DB).
    const poolModPath = require.resolve(path.join(ROOT, "src/storage/postgres/createPostgresPool.js"));
    const storeModPath = require.resolve(path.join(ROOT, "src/storage/secondLife/index.js"));
    async function withStore(pool, fn) {
      const origPoolMod = require.cache[poolModPath];
      require.cache[poolModPath] = {
        id: poolModPath, filename: poolModPath, loaded: true,
        exports: { createPostgresPool: () => pool },
      };
      delete require.cache[storeModPath];
      try {
        const { createSecondLifeStore } = require(storeModPath);
        const store = createSecondLifeStore({ config: {}, logger: mockLogger });
        await fn(store);
      } finally {
        if (origPoolMod) require.cache[poolModPath] = origPoolMod;
        else delete require.cache[poolModPath];
        delete require.cache[storeModPath];
      }
    }

    // (b) the new safety accessors exist + degrade to a safe no-op with no DB.
    await checkAsync("clearCommandQueue / setAutonomyPaused / blockAvatar are no-ops with no DB", async () => {
      await withStore(null, async (store) => {
        assert(typeof store.clearCommandQueue === "function", "clearCommandQueue missing");
        assert(typeof store.setAutonomyPaused === "function", "setAutonomyPaused missing");
        assert(typeof store.blockAvatar === "function", "blockAvatar missing");
        assert((await store.clearCommandQueue({ companionId: "x" })) === 0, "clearCommandQueue should return 0 with no DB");
        assert((await store.setAutonomyPaused({ companionId: "x", paused: true })) === null, "setAutonomyPaused should no-op with no DB");
        assert((await store.blockAvatar({ companionId: "x", avatarUuid: "u" })) === null, "blockAvatar should no-op with no DB");
      });
    });

    // (c) emergency stop = pause autonomy AND clear the pending command queue.
    await checkAsync("emergency stop pauses autonomy AND clears the pending command queue", async () => {
      const seen = { pausedTo: null, clearedPending: false };
      const fakePool = {
        async query(sql, params) {
          const text = String(sql);
          if (/update\s+second_life_bridge_settings/i.test(text) && /autonomy_paused/i.test(text)) {
            seen.pausedTo = params[1];
            return { rows: [{ id: 1, companion_id: params[0], autonomy_paused: params[1] }] };
          }
          if (/delete\s+from\s+second_life_command_queue/i.test(text)) {
            seen.clearedPending = true;
            return { rowCount: 3, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        },
      };
      await withStore(fakePool, async (store) => {
        const paused = await store.setAutonomyPaused({ companionId: "x", paused: true });
        const cleared = await store.clearCommandQueue({ companionId: "x" });
        assert(seen.pausedTo === true, "setAutonomyPaused must set autonomy_paused = true");
        assert(paused && paused.autonomyPaused === true, "setAutonomyPaused should return the paused row");
        assert(seen.clearedPending === true, "clearCommandQueue must clear the pending queue");
        assert(cleared === 3, "clearCommandQueue should report the number cleared");
      });
    });

    // (d) blockAvatar upserts a blocked relationship (is_blocked + revoked chat).
    await checkAsync("blockAvatar upserts a blocked relationship and revokes chat", async () => {
      let captured = null;
      const fakePool = {
        async query(sql, params) {
          const text = String(sql);
          if (/insert\s+into\s+second_life_avatar_relationships/i.test(text)) {
            captured = { sql: text, params };
            return { rows: [{ id: 1, companion_id: params[0], avatar_uuid: params[1], is_blocked: params[3], chat_permission: params[4] }] };
          }
          return { rowCount: 0, rows: [] };
        },
      };
      await withStore(fakePool, async (store) => {
        const rel = await store.blockAvatar({ companionId: "x", avatarUuid: "u-123", blocked: true });
        assert(captured && /on\s+conflict/i.test(captured.sql), "blockAvatar must upsert via ON CONFLICT");
        assert(captured.params[3] === true, "blockAvatar must set is_blocked = true");
        assert(captured.params[4] === false, "blockAvatar must revoke chat_permission when blocking");
        assert(rel && rel.isBlocked === true && rel.chatPermission === false, "returned relationship should be blocked");
      });
    });

    // (e) privacy guard: the reply generator drops private context sections and
    // forces the public privacy level for public local chat.
    await checkAsync("reply generator drops private sections + forces public level for public chat", async () => {
      const callModelPath = require.resolve(path.join(ROOT, "src/chat/pipeline/callModel.js"));
      const genPath = require.resolve(path.join(ROOT, "src/companion/secondLifeReplyGenerator.js"));
      const origCallModel = require.cache[callModelPath];
      let captured = null;
      require.cache[callModelPath] = {
        id: callModelPath, filename: callModelPath, loaded: true,
        exports: { callModel: async (args) => { captured = args; return { text: "ok" }; } },
      };
      delete require.cache[genPath];
      try {
        const { createSecondLifeReplyGenerator } = require(genPath);
        const generator = createSecondLifeReplyGenerator({ config: {}, logger: mockLogger });
        const sections = [
          { label: "Second Life Speaker", content: "OWNER SECRET", private: true },
          { label: "Privacy Guard", content: "public chat" },
        ];
        await generator.generateReply({
          event: { messageText: "hi" },
          contextSections: sections,
          privacyLevel: "adult",
          publicChat: true,
        });
        assert(captured, "callModel should have been invoked");
        const labels = (captured.contextSections || []).map((s) => s.label);
        assert(!labels.includes("Second Life Speaker"), "private section must be dropped for public chat");
        assert(labels.includes("Privacy Guard"), "non-private sections must be retained");
        assert(captured.privacyLevel === "public", "public chat must force the public privacy level");
      } finally {
        if (origCallModel) require.cache[callModelPath] = origCallModel;
        else delete require.cache[callModelPath];
        delete require.cache[genPath];
      }
    });

    // (f) adapter + social wiring is present (privacy guard + safety controls).
    check("adapter + social engine wire the Phase 20 privacy & safety controls", () => {
      const adapter = "src/channels/secondLifeAdapter.js";
      for (const needle of ["isPublicSpeaker", "applySafetyControl", "emergency_stop", "clearCommandQueue", "setAutonomyPaused", "Privacy Guard", "publicChat"]) {
        assert(fileHas(adapter, needle), `adapter missing "${needle}"`);
      }
      assert(fileHas("src/companion/processCompanionEvent.js", "publicChat"), "processCompanionEvent must thread publicChat");
      assert(fileHas("src/companion/secondLifeReplyGenerator.js", "publicChat"), "reply generator must accept publicChat");
    });
  })();

  // ─── Verdict ──────────────────────────────────────────────────────────────
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(`  PASSED:   ${passed}`);
  console.log(`  FAILED:   ${failed}`);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  if (failed > 0) console.log("  VERDICT:  \u274c NO GO");
  else console.log("  VERDICT:  \u2705 PASS");
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
})();
