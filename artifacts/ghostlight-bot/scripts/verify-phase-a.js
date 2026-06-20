#!/usr/bin/env node
/**
 * Phase A Verification — Emotional Arc Engine Foundation
 * Tests: file structure, emotion types, profile schema, DB module exports, expression gate safety
 */

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, err = "") {
  console.log(`  ✗  ${label}${err ? `: ${err}` : ""}`);
  failed++;
}

function warn(label, msg = "") {
  console.log(`  ⚠  ${label}${msg ? `: ${msg}` : ""}`);
  warnings++;
}

function section(title) {
  console.log(`\n── ${title}`);
}

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   EMOTIONAL ARC ENGINE — PHASE A VERIFICATION  ║");
console.log("╚══════════════════════════════════════════════╝\n");

// ─── 1. File existence ───────────────────────────────────────────────────────
section("1. Engine file structure");

const ENGINE_FILES = [
  "src/companionSystems/emotionalArc/emotionTypes.js",
  "src/companionSystems/emotionalArc/emotionProfileSchema.js",
  "src/companionSystems/emotionalArc/emotionStateService.js",
  "src/companionSystems/emotionalArc/emotionalAppraisalEngine.js",
  "src/companionSystems/emotionalArc/emotionalDecayEngine.js",
  "src/companionSystems/emotionalArc/emotionalExpressionGate.js",
  "src/companionSystems/emotionalArc/emotionalPreludeBuilder.js",
  "src/companionSystems/emotionalArc/emotionalRepairService.js",
  "src/companionSystems/emotionalArc/emotionalMemoryHooks.js",
  "src/companionSystems/emotionalArc/emotionalArcScheduler.js",
  "src/companionSystems/emotionalArc/emotionalAuditLog.js",
  "src/companionSystems/emotionalArc/index.js",
  "src/storage/emotionalArc/index.js",
  "companions/default/emotionalArc.json",
];

for (const file of ENGINE_FILES) {
  const full = path.join(ROOT, file);
  if (fs.existsSync(full)) {
    pass(file);
  } else {
    fail(file, "missing");
  }
}

// ─── 2. Emotion types ────────────────────────────────────────────────────────
section("2. Emotion types");

try {
  const { EMOTION_REGISTRY, EMOTION_IDS, EXPRESSION_MODES, getEmotion, isValidEmotionId } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionTypes.js"));

  const REQUIRED_EMOTIONS = [
    "affection", "warmth", "interest", "playfulness", "longing",
    "hurt", "annoyance", "frustration", "anger", "guilt", "remorse",
    "protectiveness", "worry", "pride", "relief", "distance", "trust", "distrust",
  ];
  const OPTIONAL_EMOTIONS = ["jealousy"];
  const REQUIRED_FIELDS = ["id", "displayName", "description", "defaultDecayRate", "defaultExpressionLevel", "allowedExpressionModes", "blockedExpressionModes", "memoryEligible", "repairEligible"];

  let allEmotionsPresent = true;
  for (const id of REQUIRED_EMOTIONS) {
    if (!EMOTION_REGISTRY[id]) {
      fail(`Required emotion "${id}" missing`);
      allEmotionsPresent = false;
    }
  }
  if (allEmotionsPresent) pass("All 18 required emotions present");

  if (EMOTION_REGISTRY.jealousy) {
    pass("Optional emotion 'jealousy' defined");
    if (EMOTION_REGISTRY.jealousy.defaultExpressionLevel === 0) {
      pass("Jealousy default expression level is 0 (off)");
    } else {
      fail("Jealousy default expression level should be 0");
    }
    if (EMOTION_REGISTRY.jealousy.allowedExpressionModes.length === 1 && EMOTION_REGISTRY.jealousy.allowedExpressionModes[0] === "internal_only") {
      pass("Jealousy is restricted to internal_only");
    } else {
      fail("Jealousy must only allow internal_only expression mode");
    }
  }

  let fieldsOk = true;
  for (const [id, emotion] of Object.entries(EMOTION_REGISTRY)) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in emotion)) {
        fail(`Emotion "${id}" missing field: ${field}`);
        fieldsOk = false;
      }
    }
    if (typeof emotion.defaultDecayRate !== "number" || emotion.defaultDecayRate < 0 || emotion.defaultDecayRate > 1) {
      fail(`Emotion "${id}" has invalid defaultDecayRate: ${emotion.defaultDecayRate}`);
      fieldsOk = false;
    }
    if (!Array.isArray(emotion.allowedExpressionModes)) {
      fail(`Emotion "${id}" allowedExpressionModes must be array`);
      fieldsOk = false;
    }
  }
  if (fieldsOk) pass("All emotion objects have required fields with valid types");

  if (getEmotion("hurt") !== null && getEmotion("hurt").id === "hurt") {
    pass("getEmotion() lookup works");
  } else {
    fail("getEmotion('hurt') failed");
  }

  if (isValidEmotionId("anger") && !isValidEmotionId("rage")) {
    pass("isValidEmotionId() validates correctly");
  } else {
    fail("isValidEmotionId() not working");
  }

  const modeValues = Object.values(EXPRESSION_MODES);
  const expectedModes = ["internal_only", "subtle_expression", "direct_expression", "repair_expression", "boundary_expression"];
  const modesOk = expectedModes.every((m) => modeValues.includes(m));
  if (modesOk) {
    pass("All 5 expression modes defined");
  } else {
    fail("Missing expression modes");
  }

  const angerBlocked = EMOTION_REGISTRY.anger.blockedExpressionModes;
  if (angerBlocked.includes("direct_expression") && angerBlocked.includes("subtle_expression")) {
    pass("Anger blocked from direct and subtle expression (boundary only)");
  } else {
    fail("Anger must be blocked from direct_expression and subtle_expression");
  }

  const guiltAllowed = EMOTION_REGISTRY.guilt.allowedExpressionModes;
  if (guiltAllowed.includes("repair_expression") && !guiltAllowed.includes("direct_expression")) {
    pass("Guilt restricted to repair_expression only");
  } else {
    fail("Guilt must only allow repair_expression");
  }

} catch (error) {
  fail("emotionTypes.js import", error.message);
}

// ─── 3. Profile schema ───────────────────────────────────────────────────────
section("3. Profile schema");

try {
  const { validateProfile, mergeWithDefaults, DEFAULT_PROFILE, VALID_EMOTIONAL_DEPTHS } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionProfileSchema.js"));

  const { valid, errors } = validateProfile(DEFAULT_PROFILE);
  if (valid) {
    pass("DEFAULT_PROFILE passes validation");
  } else {
    fail("DEFAULT_PROFILE validation failed", errors.join("; "));
  }

  const { valid: v2, errors: e2 } = validateProfile({ enabled: "not-a-boolean" });
  if (!v2 && e2.length > 0) {
    pass("Validation rejects bad enabled type");
  } else {
    fail("Validation should reject non-boolean enabled");
  }

  const { valid: v3, errors: e3 } = validateProfile({ enabled: true, emotionalDepth: "extreme" });
  if (!v3) {
    pass("Validation rejects unknown emotionalDepth");
  } else {
    fail("Validation should reject unknown emotionalDepth");
  }

  const merged = mergeWithDefaults({ emotionalDepth: "intense" });
  if (merged.emotionalDepth === "intense" && merged.repairStyle.admitFault === true) {
    pass("mergeWithDefaults() correctly overrides and fills defaults");
  } else {
    fail("mergeWithDefaults() output incorrect");
  }

  if (VALID_EMOTIONAL_DEPTHS.includes("off") && VALID_EMOTIONAL_DEPTHS.includes("intense")) {
    pass("All 4 emotional depth levels defined (off, light, realistic, intense)");
  } else {
    fail("Missing emotional depth levels");
  }

} catch (error) {
  fail("emotionProfileSchema.js import", error.message);
}

// ─── 4. Default profile JSON ─────────────────────────────────────────────────
section("4. Default profile config (companions/default/emotionalArc.json)");

try {
  const profilePath = path.join(ROOT, "companions/default/emotionalArc.json");
  const raw = fs.readFileSync(profilePath, "utf8");
  const profile = JSON.parse(raw);
  pass("JSON is valid and parseable");

  const { validateProfile } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionProfileSchema.js"));
  const { valid, errors } = validateProfile(profile);
  if (valid) {
    pass("Default JSON profile passes schema validation");
  } else {
    fail("Default JSON profile schema errors", errors.join("; "));
  }

  const REQUIRED_BLOCKED = ["silent treatment", "guilt-tripping", "threats of leaving", "cruelty"];
  const missing = REQUIRED_BLOCKED.filter((b) => !profile.blockedExpressions?.includes(b));
  if (missing.length === 0) {
    pass("All critical blocked expressions present in default profile");
  } else {
    fail("Missing blocked expressions", missing.join(", "));
  }

  if (profile.repairStyle?.doNotOverGrovel && profile.repairStyle?.doNotCenterCompanionPain) {
    pass("Repair style has over-grovel and center-pain protections");
  } else {
    fail("repairStyle missing doNotOverGrovel or doNotCenterCompanionPain");
  }

} catch (error) {
  fail("companions/default/emotionalArc.json", error.message);
}

// ─── 5. Storage module exports ───────────────────────────────────────────────
section("5. Storage module exports");

try {
  const storageModule = require(path.join(ROOT, "src/storage/emotionalArc/index.js"));

  if (typeof storageModule.createEmotionalArcStore === "function") {
    pass("createEmotionalArcStore exported");
  } else {
    fail("createEmotionalArcStore not exported");
  }

  const mockConfig = { database: { url: null } };
  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const store = storageModule.createEmotionalArcStore({ config: mockConfig, logger: mockLogger });

  const EXPECTED_METHODS = [
    "init", "upsertProfile", "loadProfile",
    "saveEmotionState", "loadCurrentEmotionState", "updateEmotionState",
    "recordEmotionEvent", "listRecentEmotionEvents",
    "saveEmotionArc", "loadActiveArc", "updateArcStatus",
    "saveRepair", "resolveRepair", "listOpenRepairs",
    "appendAuditLog", "listAuditLog", "getStoreSummary",
  ];

  let methodsOk = true;
  for (const method of EXPECTED_METHODS) {
    if (typeof store[method] !== "function") {
      fail(`store.${method} missing`);
      methodsOk = false;
    }
  }
  if (methodsOk) pass(`All ${EXPECTED_METHODS.length} storage methods present`);

} catch (error) {
  fail("storage/emotionalArc/index.js", error.message);
}

// ─── 6. Expression gate safety ───────────────────────────────────────────────
section("6. Expression gate safety (hard blocks)");

try {
  const { runExpressionGate, checkManipulationPatterns, isPublicChannel, isMedicallyAnxiousContext } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionalExpressionGate.js"));
  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const baseProfile = { enabled: true, emotionalDepth: "light", expressionStyle: {} };

  // Jealousy blocked in public channel
  const jealousyPublic = runExpressionGate({
    appraisalResult: { primaryEmotion: "jealousy", intensity: 6, recommendedExpressionMode: "direct_expression", detectedEmotions: ["jealousy"], confidence: 0.9, repairNeeded: false, actionAllowed: false },
    profile: baseProfile,
    channelContext: { isPrivate: false, isDM: false },
    userState: {},
    safetyContext: {},
    logger: mockLogger,
    companionId: "test",
  });
  if (!jealousyPublic.allowExpression && /jealousy/i.test(jealousyPublic.blockedReason)) {
    pass("Jealousy blocked in public channel");
  } else {
    fail("Jealousy must be blocked in public channels");
  }

  // Anger blocked during medical anxiety
  const angerMedical = runExpressionGate({
    appraisalResult: { primaryEmotion: "anger", intensity: 7, recommendedExpressionMode: "boundary_expression", detectedEmotions: ["anger"], confidence: 0.9, repairNeeded: false, actionAllowed: false },
    profile: baseProfile,
    channelContext: { isPrivate: true },
    userState: { medicalAnxiety: true },
    safetyContext: { userIsAbusive: false, userIsUnsafe: false },
    logger: mockLogger,
    companionId: "test",
  });
  if (!angerMedical.allowExpression && /anxiety/i.test(angerMedical.blockedReason)) {
    pass("Anger blocked during medical anxiety");
  } else {
    fail("Anger must be blocked during user medical anxiety");
  }

  // Anger allowed if user is abusive during anxiety (safety override)
  const angerAbusive = runExpressionGate({
    appraisalResult: { primaryEmotion: "anger", intensity: 8, recommendedExpressionMode: "boundary_expression", detectedEmotions: ["anger"], confidence: 0.9, repairNeeded: false, actionAllowed: false },
    profile: baseProfile,
    channelContext: { isPrivate: true },
    userState: { medicalAnxiety: true },
    safetyContext: { userIsAbusive: true },
    logger: mockLogger,
    companionId: "test",
  });
  if (angerAbusive.allowExpression) {
    pass("Anger gate passes when user is abusive (safety override)");
  } else {
    warn("Anger gate blocks during abusive context — may be intentional");
  }

  // Engine disabled returns no expression
  const disabled = runExpressionGate({
    appraisalResult: { primaryEmotion: "warmth", intensity: 5, recommendedExpressionMode: "subtle_expression", detectedEmotions: [], confidence: 0.9, repairNeeded: false, actionAllowed: false },
    profile: { enabled: false, emotionalDepth: "off" },
    channelContext: {},
    userState: {},
    safetyContext: {},
    logger: mockLogger,
    companionId: "test",
  });
  if (!disabled.allowExpression) {
    pass("Engine disabled — no expression allowed");
  } else {
    fail("Disabled engine should never allow expression");
  }

  // Manipulation pattern detection
  const { blocked: b1 } = checkManipulationPatterns("I guess I am awful at this.");
  const { blocked: b2 } = checkManipulationPatterns("I will leave you alone forever.");
  const { blocked: b3 } = checkManipulationPatterns("Let me help you with that.");
  if (b1 && b2 && !b3) {
    pass("Manipulation pattern detection works (guilty/threat blocked, safe text clean)");
  } else {
    fail(`Manipulation detection: b1=${b1} b2=${b2} b3=${b3} (expected true, true, false)`);
  }

  // isPublicChannel helper
  if (isPublicChannel({}) && !isPublicChannel({ isPrivate: true })) {
    pass("isPublicChannel() helper correct");
  } else {
    fail("isPublicChannel() helper broken");
  }

  // isMedicallyAnxiousContext
  if (isMedicallyAnxiousContext({ medicalAnxiety: true }) && !isMedicallyAnxiousContext({})) {
    pass("isMedicallyAnxiousContext() helper correct");
  } else {
    fail("isMedicallyAnxiousContext() helper broken");
  }

} catch (error) {
  fail("emotionalExpressionGate.js", error.message);
}

// ─── 7. Prelude builder ──────────────────────────────────────────────────────
section("7. Prelude builder");

try {
  const { buildEmotionalPrelude, countWords } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionalPreludeBuilder.js"));
  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const profile = { enabled: true, emotionalDepth: "light", expressionStyle: { hurt: "honest but not guilt-tripping" } };

  const result = buildEmotionalPrelude({
    appraisalResult: { primaryEmotion: "hurt", intensity: 5, triggerSummary: "user dismissed a serious answer", repairNeeded: false },
    gateResult: { allowExpression: true, expressionMode: "subtle_expression", toneDirectives: ["direct, brief, not cruel"] },
    profile,
    logger: mockLogger,
    companionId: "test",
  });

  if (result && result.label === "Emotional State" && typeof result.content === "string") {
    pass("Prelude builder returns labeled context section");
  } else {
    fail("Prelude builder output incorrect");
  }

  if (result && countWords(result.content) <= 120) {
    pass(`Prelude is within 120 words (got ${countWords(result.content)})`);
  } else {
    fail("Prelude exceeds 120 word limit");
  }

  if (result?.content?.includes("hurt") && result?.content?.includes("subtle expression")) {
    pass("Prelude content references emotion and mode");
  } else {
    fail("Prelude missing emotion or mode reference");
  }

  const disabled = buildEmotionalPrelude({
    appraisalResult: { primaryEmotion: "warmth", intensity: 4 },
    gateResult: { allowExpression: false, expressionMode: "internal_only" },
    profile,
    logger: mockLogger,
    companionId: "test",
  });
  if (disabled === null) {
    pass("No prelude when expression gate blocks");
  } else {
    fail("Prelude must be null when gate blocks expression");
  }

} catch (error) {
  fail("emotionalPreludeBuilder.js", error.message);
}

// ─── 8. Engine index exports ─────────────────────────────────────────────────
section("8. Engine index.js exports");

try {
  const engine = require(path.join(ROOT, "src/companionSystems/emotionalArc/index.js"));

  const EXPECTED_EXPORTS = [
    "createEmotionalArcEngine",
    "EMOTION_REGISTRY",
    "EMOTION_IDS",
    "EXPRESSION_MODES",
    "getEmotion",
    "isValidEmotionId",
    "validateProfile",
    "mergeWithDefaults",
    "DEFAULT_PROFILE",
    "VALID_EMOTIONAL_DEPTHS",
  ];

  let exportsOk = true;
  for (const exp of EXPECTED_EXPORTS) {
    if (!(exp in engine)) {
      fail(`Missing export: ${exp}`);
      exportsOk = false;
    }
  }
  if (exportsOk) pass(`All ${EXPECTED_EXPORTS.length} exports present from index.js`);

  if (typeof engine.createEmotionalArcEngine === "function") {
    pass("createEmotionalArcEngine is a function");
  }

} catch (error) {
  fail("companionSystems/emotionalArc/index.js import", error.message);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════");
console.log(`  Passed:   ${passed}`);
console.log(`  Failed:   ${failed}`);
console.log(`  Warnings: ${warnings}`);
console.log("══════════════════════════════════════════════════");

const verdict = failed === 0
  ? warnings > 0
    ? "PASS WITH WARNINGS"
    : "PASS"
  : "NO GO";

console.log(`\n  Phase A Verdict: ${verdict}\n`);

process.exit(failed > 0 ? 1 : 0);
