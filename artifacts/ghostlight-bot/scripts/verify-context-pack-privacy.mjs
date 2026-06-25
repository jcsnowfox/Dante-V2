/**
 * Verify: Context pack respects privacy and adult scopes.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        console.log(`  PASS  ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`  FAIL  ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

const promises = [];

const { createConversationFollowupStore } = await import(
  "../src/storage/conversationFollowupState.js"
);
const { createTimedNotesStore } = await import("../src/storage/timedNotes.js");

promises.push(test("conversation followup stores privacy_scope", async () => {
  const store = createConversationFollowupStore({});
  await store.init();
  const result = await store.createFollowUp({
    user_scope: "user",
    companion_id: "Dante",
    privacy_scope: "adult_private",
    adult_context: true,
  });
  assert.equal(result.privacy_scope, "adult_private");
  assert.equal(result.adult_context, true);
}));

promises.push(test("conversation followup filters adult when include_adult=false", async () => {
  const store = createConversationFollowupStore({});
  await store.init();
  await store.createFollowUp({
    user_scope: "user2",
    companion_id: "Dante",
    adult_context: true,
  });
  await store.createFollowUp({
    user_scope: "user2",
    companion_id: "Dante",
    adult_context: false,
  });
  const all = await store.listDue({
    user_scope: "user2",
    companion_id: "Dante",
    include_adult: true,
  });
  const noAdult = await store.listDue({
    user_scope: "user2",
    companion_id: "Dante",
    include_adult: false,
  });
  assert.ok(all.length >= noAdult.length);
  assert.ok(noAdult.every((f) => !f.adult_context));
}));

promises.push(test("timed notes stores privacy_scope", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const result = await store.createNote({
    user_scope: "user",
    companion_id: "Dante",
    privacy_scope: "adult_private",
    adult_context: true,
  });
  assert.equal(result.privacy_scope, "adult_private");
  assert.equal(result.adult_context, true);
}));

promises.push(test("timed notes filters adult when include_adult=false", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  await store.createNote({
    user_scope: "user3",
    companion_id: "Dante",
    adult_context: true,
  });
  await store.createNote({
    user_scope: "user3",
    companion_id: "Dante",
    adult_context: false,
  });
  const all = await store.listNotes({
    user_scope: "user3",
    companion_id: "Dante",
    include_adult: true,
  });
  const noAdult = await store.listNotes({
    user_scope: "user3",
    companion_id: "Dante",
    include_adult: false,
  });
  assert.ok(all.length >= noAdult.length);
  assert.ok(noAdult.every((n) => !n.adult_context));
}));

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
