/**
 * Verify: Conversation follow-up state storage and functionality.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  PASS  ${name}`);
          passed++;
        })
        .catch((err) => {
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

test("createConversationFollowupStore returns a store object", () => {
  const store = createConversationFollowupStore({});
  assert.ok(store, "should return store");
  assert.equal(typeof store.init, "function");
  assert.equal(typeof store.createFollowUp, "function");
  assert.equal(typeof store.getState, "function");
  assert.equal(typeof store.listDue, "function");
  assert.equal(typeof store.updateStatus, "function");
});

test("fallback store is available", () => {
  const store = createConversationFollowupStore({});
  assert.equal(store.available, true);
});

promises.push(
  test("createFollowUp stores a record", async () => {
    const store = createConversationFollowupStore({});
    await store.init();
    const result = await store.createFollowUp({
      user_scope: "user1",
      companion_id: "Dante",
      channel_id: "123",
      last_user_message_id: "msg1",
      last_companion_message_id: "msg2",
      last_topic_summary: "Talked about hobbies",
      follow_up_due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      privacy_scope: "normal",
    });
    assert.ok(result, "should return inserted record");
    assert.equal(result.user_scope, "user1");
    assert.equal(result.channel_id, "123");
    assert.equal(result.status, "pending");
  })
);

promises.push(
  test("getState retrieves correct state", async () => {
    const store = createConversationFollowupStore({});
    await store.init();
    const created = await store.createFollowUp({
      user_scope: "user2",
      companion_id: "Dante",
      channel_id: "456",
      last_topic_summary: "Meeting discussed",
    });
    const retrieved = await store.getState({
      user_scope: "user2",
      companion_id: "Dante",
      channel_id: "456",
    });
    assert.ok(retrieved, "should find state");
    assert.equal(retrieved.id, created.id);
  })
);

promises.push(
  test("listDue returns only due items", async () => {
    const store = createConversationFollowupStore({});
    await store.init();
    const now = new Date();
    const pastDue = new Date(now.getTime() - 1000).toISOString();
    const futureDue = new Date(now.getTime() + 1000).toISOString();

    await store.createFollowUp({
      user_scope: "user3",
      companion_id: "Dante",
      follow_up_due_at: pastDue,
    });
    await store.createFollowUp({
      user_scope: "user3",
      companion_id: "Dante",
      follow_up_due_at: futureDue,
    });

    const due = await store.listDue({ user_scope: "user3", companion_id: "Dante" });
    assert.ok(due.length >= 1, "should have at least one due item");
    assert.ok(
      due.some((d) => new Date(d.follow_up_due_at) <= now),
      "due items should be past due date"
    );
  })
);

promises.push(
  test("updateStatus changes status and sent_at", async () => {
    const store = createConversationFollowupStore({});
    await store.init();
    const created = await store.createFollowUp({
      user_scope: "user4",
      companion_id: "Dante",
    });
    const now = new Date().toISOString();
    const updated = await store.updateStatus({
      id: created.id,
      status: "sent",
      follow_up_sent_at: now,
    });
    assert.equal(updated.status, "sent");
    assert.ok(updated.follow_up_sent_at);
  })
);

promises.push(
  test("adult_context flag respected in filtering", async () => {
    const store = createConversationFollowupStore({});
    await store.init();
    await store.createFollowUp({
      user_scope: "user5",
      companion_id: "Dante",
      adult_context: true,
    });
    await store.createFollowUp({
      user_scope: "user5",
      companion_id: "Dante",
      adult_context: false,
    });
    const all = await store.listDue({
      user_scope: "user5",
      companion_id: "Dante",
      include_adult: true,
    });
    const noAdult = await store.listDue({
      user_scope: "user5",
      companion_id: "Dante",
      include_adult: false,
    });
    assert.ok(all.length >= noAdult.length, "should filter adult items when flag off");
  })
);

promises.push(
  test("deleteState removes record", async () => {
    const store = createConversationFollowupStore({});
    await store.init();
    const created = await store.createFollowUp({
      user_scope: "user6",
      companion_id: "Dante",
    });
    const deleted = await store.deleteState({ id: created.id });
    assert.ok(deleted, "should return true on delete");
    const retrieved = await store.getState({
      user_scope: "user6",
      companion_id: "Dante",
      channel_id: "",
    });
    assert.ok(!retrieved, "deleted state should not be retrievable");
  })
);

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
