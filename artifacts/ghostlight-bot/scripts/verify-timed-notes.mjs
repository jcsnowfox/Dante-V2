/**
 * Verify: Timed notes storage and functionality.
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

const { createTimedNotesStore, STATUSES } = await import(
  "../src/storage/timedNotes.js"
);

test("createTimedNotesStore returns a store object", () => {
  const store = createTimedNotesStore({});
  assert.ok(store);
  assert.equal(typeof store.init, "function");
  assert.equal(typeof store.createNote, "function");
  assert.equal(typeof store.listNotes, "function");
  assert.equal(typeof store.updateNote, "function");
  assert.equal(typeof store.archiveNote, "function");
});

test("STATUSES is frozen", () => {
  assert.ok(Array.isArray(STATUSES));
  assert.ok(STATUSES.includes("active"));
  assert.ok(STATUSES.includes("archived"));
  assert.ok(Object.isFrozen(STATUSES));
});

promises.push(test("createNote stores record", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const result = await store.createNote({
    user_scope: "user",
    companion_id: "Dante",
    title: "Birthday",
    note_summary: "Friend's birthday tomorrow",
    starts_at: new Date().toISOString(),
    status: "active",
  });
  assert.ok(result);
  assert.equal(result.title, "Birthday");
  assert.equal(result.status, "active");
}));

promises.push(test("listNotes filters by active_only", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const now = new Date();
  const past = new Date(now.getTime() - 10000).toISOString();
  const future = new Date(now.getTime() + 10000).toISOString();

  await store.createNote({
    user_scope: "user2",
    companion_id: "Dante",
    title: "Past",
    starts_at: past,
    ends_at: past,
  });
  await store.createNote({
    user_scope: "user2",
    companion_id: "Dante",
    title: "Active",
    starts_at: past,
    ends_at: future,
  });

  const all = await store.listNotes({ user_scope: "user2", companion_id: "Dante" });
  const active = await store.listNotes({
    user_scope: "user2",
    companion_id: "Dante",
    active_only: true,
  });
  assert.ok(all.length >= active.length);
  assert.ok(active.every((n) => n.title === "Active" || !n.title));
}));

promises.push(test("updateNote modifies record", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const created = await store.createNote({
    user_scope: "user3",
    companion_id: "Dante",
    title: "Original",
  });
  const updated = await store.updateNote({
    id: created.id,
    title: "Modified",
  });
  assert.equal(updated.title, "Modified");
}));

promises.push(test("archiveNote sets status to archived", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const created = await store.createNote({
    user_scope: "user4",
    companion_id: "Dante",
    title: "To archive",
  });
  const archived = await store.archiveNote({ id: created.id });
  assert.equal(archived.status, "archived");
  assert.ok(archived.archived_at);
}));

promises.push(test("deleteNote soft-deletes", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const created = await store.createNote({
    user_scope: "user5",
    companion_id: "Dante",
  });
  const deleted = await store.deleteNote({ id: created.id });
  assert.ok(deleted);
  const list = await store.listNotes({
    user_scope: "user5",
    companion_id: "Dante",
  });
  assert.ok(!list.find((n) => n.id === created.id), "deleted note should not appear");
}));

promises.push(test("adult_context respected", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  await store.createNote({
    user_scope: "user6",
    companion_id: "Dante",
    adult_context: true,
  });
  await store.createNote({
    user_scope: "user6",
    companion_id: "Dante",
    adult_context: false,
  });
  const all = await store.listNotes({
    user_scope: "user6",
    companion_id: "Dante",
    include_adult: true,
  });
  const noAdult = await store.listNotes({
    user_scope: "user6",
    companion_id: "Dante",
    include_adult: false,
  });
  assert.ok(all.length >= noAdult.length);
  assert.ok(noAdult.every((n) => !n.adult_context));
}));

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
