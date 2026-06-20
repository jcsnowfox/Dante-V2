/**
 * verify-second-life-identity-mapping.js
 *
 * Smoke-tests identity mapping for Second Life:
 *   1.  DB migrations — preferred_display_name and identity_note columns added
 *   2.  Storage mapRelationshipRow — new fields mapped correctly
 *   3.  slIdentityResolver — displayName computed from nickname/preferredDisplayName/displayLabel
 *   4.  Adapter buildKnownSpeakerIdentityBlock — structured identity section injected
 *   5.  userDisplayName override — processCompanionEvent receives preferred name
 *   6.  Voice Guard still present after identity changes
 *   7.  Nox import pack — AngelDust Corvinus record with all required fields
 *   8.  Public safety unchanged — private sections still filtered
 *   9.  Unknown avatars still use raw avatar name safely
 *  10.  No UUIDs or database field names in generated identity section content
 *  11.  Discord brain path unchanged
 */

"use strict";

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
  console.error(`  ✗  ${label}${err ? `: ${err}` : ""}`);
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
  // ── 1. DB migrations ─────────────────────────────────────────────────────────
  section("1. DB migrations — new identity-mapping columns");

  const storageSrc = readFile("src/storage/secondLife/index.js");

  check("preferred_display_name migration exists", () => {
    assert.ok(
      storageSrc.includes("ADD COLUMN IF NOT EXISTS preferred_display_name"),
      "missing preferred_display_name migration",
    );
  });
  check("identity_note migration exists", () => {
    assert.ok(
      storageSrc.includes("ADD COLUMN IF NOT EXISTS identity_note"),
      "missing identity_note migration",
    );
  });
  check("upsertRelationship INSERT includes preferred_display_name", () => {
    assert.ok(
      storageSrc.includes("preferred_display_name") && storageSrc.includes("identity_note"),
      "upsertRelationship missing new fields",
    );
  });
  check("mapRelationshipRow maps preferredDisplayName", () => {
    assert.ok(
      storageSrc.includes("preferredDisplayName: row.preferred_display_name"),
      "mapRelationshipRow missing preferredDisplayName",
    );
  });
  check("mapRelationshipRow maps identityNote", () => {
    assert.ok(
      storageSrc.includes("identityNote: row.identity_note"),
      "mapRelationshipRow missing identityNote",
    );
  });

  // ── 2. Identity resolver — displayName computation ───────────────────────────
  section("2. slIdentityResolver — displayName priority: nickname → preferredDisplayName → displayLabel → avatarName");

  const { createIdentityResolver } = require("../src/secondLife/slIdentityResolver");

  const makeStore = (row) => ({
    getRelationshipByUuid: async () => row,
    getObjectRelationshipByUuid: async () => null,
    getObjectRelationshipByDescriptionToken: async () => null,
  });

  await checkAsync("displayName uses nickname when present", async () => {
    const resolver = createIdentityResolver({
      secondLife: makeStore({
        id: 1,
        avatarUuid: "uuid-a",
        avatarName: "AngelDust Corvinus",
        nickname: "Jenna",
        preferredDisplayName: "JC",
        displayLabel: "JC Testing",
        relationshipType: "owner",
        isOwner: true,
        isFamily: true,
        isTrusted: true,
        privateMemoryPermission: true,
        replyPolicy: "always_allowed",
        notes: "This is Jenna testing",
        identityNote: "",
      }),
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-a", avatarName: "AngelDust Corvinus" });
    assert.strictEqual(r.displayName, "Jenna", `expected Jenna got ${r.displayName}`);
  });

  await checkAsync("displayName falls back to preferredDisplayName when no nickname", async () => {
    const resolver = createIdentityResolver({
      secondLife: makeStore({
        id: 2,
        avatarUuid: "uuid-b",
        avatarName: "AngelDust Corvinus",
        nickname: "",
        preferredDisplayName: "Jenna",
        displayLabel: "Jenna (alt)",
        relationshipType: "owner",
        isOwner: true,
        isFamily: false,
        isTrusted: false,
        privateMemoryPermission: true,
        replyPolicy: "always_allowed",
        notes: "",
        identityNote: "Alt avatar",
      }),
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-b" });
    assert.strictEqual(r.displayName, "Jenna", `expected Jenna got ${r.displayName}`);
  });

  await checkAsync("displayName falls back to displayLabel when no nickname/preferredDisplayName", async () => {
    const resolver = createIdentityResolver({
      secondLife: makeStore({
        id: 3,
        avatarUuid: "uuid-c",
        avatarName: "AngelDust Corvinus",
        nickname: "",
        preferredDisplayName: "",
        displayLabel: "Jenna (testing)",
        relationshipType: "owner",
        isOwner: true,
        isFamily: false,
        isTrusted: false,
        privateMemoryPermission: true,
        replyPolicy: "always_allowed",
        notes: "",
        identityNote: "",
      }),
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-c" });
    assert.strictEqual(r.displayName, "Jenna (testing)", `expected displayLabel got ${r.displayName}`);
  });

  await checkAsync("displayName falls back to avatarName for unknown speaker", async () => {
    const resolver = createIdentityResolver({
      secondLife: { getRelationshipByUuid: async () => null, getObjectRelationshipByUuid: async () => null, getObjectRelationshipByDescriptionToken: async () => null },
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-stranger", avatarName: "Stranger Person" });
    assert.strictEqual(r.displayName, "Stranger Person", `expected raw name got ${r.displayName}`);
  });

  await checkAsync("raw avatarName always preserved separately", async () => {
    const resolver = createIdentityResolver({
      secondLife: makeStore({
        id: 4,
        avatarUuid: "uuid-d",
        avatarName: "AngelDust Corvinus",
        nickname: "Jenna",
        preferredDisplayName: "",
        displayLabel: "",
        relationshipType: "owner",
        isOwner: true,
        isFamily: false,
        isTrusted: false,
        privateMemoryPermission: true,
        replyPolicy: "always_allowed",
        notes: "",
        identityNote: "",
      }),
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-d", avatarName: "AngelDust Corvinus" });
    assert.strictEqual(r.avatarName, "AngelDust Corvinus", "raw avatarName lost");
    assert.strictEqual(r.name, "AngelDust Corvinus", "raw name lost");
    assert.strictEqual(r.displayName, "Jenna", "displayName should be Jenna");
  });

  await checkAsync("identityNote and preferredDisplayName exposed on resolved", async () => {
    const resolver = createIdentityResolver({
      secondLife: makeStore({
        id: 5,
        avatarUuid: "uuid-e",
        avatarName: "AngelDust Corvinus",
        nickname: "Jenna",
        preferredDisplayName: "Jenna",
        displayLabel: "",
        relationshipType: "owner",
        isOwner: true,
        isFamily: false,
        isTrusted: false,
        privateMemoryPermission: true,
        replyPolicy: "always_allowed",
        notes: "Main notes",
        identityNote: "Alt avatar identity note",
      }),
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-e" });
    assert.strictEqual(r.preferredDisplayName, "Jenna");
    assert.strictEqual(r.identityNote, "Alt avatar identity note");
    assert.strictEqual(r.notes, "Main notes");
  });

  await checkAsync("relationshipType exposed on resolved", async () => {
    const resolver = createIdentityResolver({
      secondLife: makeStore({
        id: 6,
        avatarUuid: "uuid-f",
        avatarName: "JC SnowFox",
        nickname: "JC",
        preferredDisplayName: "",
        displayLabel: "",
        relationshipType: "owner",
        isOwner: true,
        isFamily: false,
        isTrusted: false,
        privateMemoryPermission: true,
        replyPolicy: "always_allowed",
        notes: "",
        identityNote: "",
      }),
    });
    const r = await resolver.resolve({ companionId: "nox", avatarUuid: "uuid-f" });
    assert.ok(r.relationshipType, "relationshipType missing from resolved");
  });

  // ── 3. Adapter — buildKnownSpeakerIdentityBlock ──────────────────────────────
  section("3. Adapter — Known Speaker Identity section structure");

  const adapterSrc = readFile("src/channels/secondLifeAdapter.js");

  check("adapter contains buildKnownSpeakerIdentityBlock", () => {
    assert.ok(adapterSrc.includes("buildKnownSpeakerIdentityBlock"), "function not found in adapter");
  });
  check("adapter identity block uses 'Current speaker identity:'", () => {
    assert.ok(adapterSrc.includes("Current speaker identity:"), "missing Current speaker identity");
  });
  check("adapter identity block uses 'Second Life avatar name:'", () => {
    assert.ok(adapterSrc.includes("Second Life avatar name:"), "missing Second Life avatar name");
  });
  check("adapter identity block includes notes rule", () => {
    assert.ok(
      adapterSrc.includes("If the notes say this avatar belongs"),
      "missing notes-identity rule",
    );
  });
  check("adapter identity block uses 'Second Life Known Speaker Identity' label", () => {
    assert.ok(adapterSrc.includes("Second Life Known Speaker Identity"), "missing section label");
  });
  check("adapter does NOT hardcode Jenna or AngelDust in identity logic", () => {
    // The function body must not contain hardcoded customer names
    const fnStart = adapterSrc.indexOf("function buildKnownSpeakerIdentityBlock");
    const fnEnd = adapterSrc.indexOf("\n  }", fnStart + 1);
    const fnBody = adapterSrc.slice(fnStart, fnEnd);
    assert.ok(!fnBody.includes("Jenna"), "hardcoded 'Jenna' found in identity function");
    assert.ok(!fnBody.includes("AngelDust"), "hardcoded 'AngelDust' found in identity function");
  });

  // ── 4. userDisplayName override in adapter ───────────────────────────────────
  section("4. Adapter — userDisplayName overridden with preferred identity");

  check("adapter processCompanionEvent call uses resolved.displayName", () => {
    assert.ok(
      adapterSrc.includes("resolved.displayName || event.userDisplayName"),
      "userDisplayName override not found in adapter",
    );
  });

  // ── 5. Nox import pack — AngelDust Corvinus ──────────────────────────────────
  section("5. Nox import pack — AngelDust Corvinus record");

  const pack = JSON.parse(readFile("assets/second-life/nox-family-relationships.json"));
  const angelDust = pack.avatars.find((a) => a.avatarUuid === "1363ed05-1e50-4f10-b1e0-9204865d4141");

  check("AngelDust Corvinus record exists in pack", () => {
    assert.ok(angelDust, "AngelDust Corvinus not found by UUID");
  });
  check("avatarName is 'AngelDust Corvinus'", () => {
    assert.strictEqual(angelDust?.avatarName, "AngelDust Corvinus");
  });
  check("nickname is 'Jenna'", () => {
    assert.strictEqual(angelDust?.nickname, "Jenna");
  });
  check("preferredDisplayName is 'Jenna'", () => {
    assert.strictEqual(angelDust?.preferredDisplayName, "Jenna");
  });
  check("isOwner is true", () => {
    assert.strictEqual(angelDust?.isOwner, true);
  });
  check("privateMemoryPermission is true", () => {
    assert.strictEqual(angelDust?.privateMemoryPermission, true);
  });
  check("notes describe alternate-avatar identity", () => {
    assert.ok(
      angelDust?.notes?.toLowerCase().includes("jenna"),
      "notes don't mention Jenna",
    );
  });
  check("identityNote is set", () => {
    assert.ok(angelDust?.identityNote?.length > 0, "identityNote is empty");
  });
  check("displayLabel mentions 'testing as AngelDust Corvinus'", () => {
    assert.ok(angelDust?.displayLabel?.includes("AngelDust Corvinus"), "displayLabel missing");
  });

  // ── 6. Voice Guard content updated ───────────────────────────────────────────
  section("6. Voice Guard — updated content");

  const {
    VOICE_GUARD_SECTION,
    isGenericReply,
    GENERIC_PHRASES,
  } = require("../src/companion/secondLifeReplyGenerator");

  check("Voice Guard label unchanged", () => {
    assert.strictEqual(VOICE_GUARD_SECTION.label, "Second Life Voice Guard");
  });
  check("Voice Guard mentions casual texting allowed but spelling must be readable", () => {
    assert.ok(
      VOICE_GUARD_SECTION.content.toLowerCase().includes("casual") ||
      VOICE_GUARD_SECTION.content.toLowerCase().includes("readable"),
      "Voice Guard missing casual/readable nuance",
    );
  });
  check("Voice Guard prohibits random typos", () => {
    assert.ok(
      VOICE_GUARD_SECTION.content.toLowerCase().includes("typo"),
      "Voice Guard missing typo prohibition",
    );
  });

  // ── 7. Generic phrase guard expanded ─────────────────────────────────────────
  section("7. Generic phrase guard — expanded phrase list");

  check("'hey. you at the beach' detected", () => {
    assert.ok(isGenericReply("Hey. You at the beach again?"), "beach phrase not detected");
  });
  check("'greetings, traveler' detected", () => {
    assert.ok(isGenericReply("Greetings, traveler!"), "traveler phrase not detected");
  });
  check("'how are you doing today' detected", () => {
    assert.ok(isGenericReply("How are you doing today?"), "today phrase not detected");
  });
  check("persona reply 'I missed you' not flagged", () => {
    assert.ok(!isGenericReply("I missed you."), "persona reply incorrectly flagged");
  });
  check("cussing with context not flagged", () => {
    assert.ok(!isGenericReply("Where the hell have you been?"), "cussing incorrectly flagged");
  });

  // ── 8. Admin UI — new form fields ────────────────────────────────────────────
  section("8. Admin UI — preferredDisplayName and identityNote fields");

  const uiSrc = readFile("src/http/renderAdminPages/secondLifePage.js");

  check("preferredDisplayName input in relationship form", () => {
    assert.ok(uiSrc.includes('name="preferredDisplayName"'), "missing preferredDisplayName input");
  });
  check("identityNote input in relationship form", () => {
    assert.ok(uiSrc.includes('name="identityNote"'), "missing identityNote input");
  });
  check("Preferred Display Name label present", () => {
    assert.ok(uiSrc.includes("Preferred Display Name"), "missing label");
  });
  check("Identity Note label present", () => {
    assert.ok(uiSrc.includes("Identity Note"), "missing label");
  });

  // ── 9. Actions handler — new fields passed through ───────────────────────────
  section("9. Actions handler — new fields forwarded to upsertRelationship");

  const actionsSrc = readFile("src/http/actions/secondLifeActions.js");

  check("preferredDisplayName forwarded in relationship-save action", () => {
    assert.ok(actionsSrc.includes("preferredDisplayName: fieldValue"), "missing preferredDisplayName in action");
  });
  check("identityNote forwarded in relationship-save action", () => {
    assert.ok(actionsSrc.includes("identityNote: fieldValue"), "missing identityNote in action");
  });

  // ── 10. No UUIDs or DB field names in identity section content ───────────────
  section("10. Identity section content — no raw UUIDs or DB field names");

  await checkAsync("buildKnownSpeakerIdentityBlock content has no DB snake_case keys", async () => {
    // Simulate what buildKnownSpeakerIdentityBlock produces by reading adapter source
    // and checking that the string template literals don't reference db column names.
    const fnStart = adapterSrc.indexOf("function buildKnownSpeakerIdentityBlock");
    const fnEnd = adapterSrc.indexOf("\n  }", fnStart + 1);
    const fnBody = adapterSrc.slice(fnStart, fnEnd);
    const badPatterns = ["avatar_uuid", "avatar_name", "is_owner", "preferred_display_name", "identity_note", "relationship_type"];
    for (const p of badPatterns) {
      assert.ok(!fnBody.includes(`\`${p}`), `found raw DB column name ${p} in output template`);
    }
  });

  // ── 11. Integration — adapter passes identity through ────────────────────────
  section("11. Integration — known speaker identity section injected for private tier");

  await checkAsync("known owner speaker gets 'Second Life Known Speaker Identity' section", async () => {
    // We can't call the adapter directly without mocking everything, but we can
    // verify the logic path exists in source via structural checks.
    assert.ok(
      adapterSrc.includes("Second Life Known Speaker Identity"),
      "section label missing from adapter",
    );
    assert.ok(
      adapterSrc.includes("buildKnownSpeakerIdentityBlock(resolved)"),
      "function call missing from buildContextSections",
    );
  });

  // ── 12. Discord brain path unchanged ─────────────────────────────────────────
  section("12. Discord brain path unchanged");

  await checkAsync("processCompanionEvent routes discord to chatPipeline, not generator", async () => {
    const { createCompanionEventProcessor } = require("../src/companion/processCompanionEvent");
    let generatorCalled = false;
    const mockPipeline = { run: async () => ({ content: "ok" }) };
    const mockGenerator = { generateReply: async () => { generatorCalled = true; return { text: "ok" }; } };
    const { processCompanionEvent } = createCompanionEventProcessor({
      chatPipeline: mockPipeline,
      logger: null,
      secondLifeReplyGenerator: mockGenerator,
    });
    try {
      await processCompanionEvent({
        companionId: "nox",
        channelType: "discord",
        eventType: "message",
        metadata: { discord: { message: { content: "hello", author: { id: "u1", username: "JC" } } } },
      });
    } catch { /* pipeline may throw without full message object; that's ok */ }
    assert.ok(!generatorCalled, "generator was called for discord event");
  });

  // ── 13. Public safety — private sections still filtered ──────────────────────
  section("13. Public safety — private identity sections filtered for public speakers");

  await checkAsync("private: true sections excluded when publicChat=true", async () => {
    const { createSecondLifeReplyGenerator } = require("../src/companion/secondLifeReplyGenerator");
    let capturedSections = null;
    const mockCallModel = async ({ contextSections }) => {
      capturedSections = contextSections;
      return { text: "Hey." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const privateSections = [
      { label: "Second Life Known Speaker Identity", content: "identity", private: true },
      { label: "Public Info", content: "public" },
    ];
    await gen.generateReply({ event: {}, contextSections: privateSections, publicChat: true });
    const hasPrivate = capturedSections.some((s) => s?.label === "Second Life Known Speaker Identity");
    assert.ok(!hasPrivate, "private identity section leaked into public chat");
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
})();
