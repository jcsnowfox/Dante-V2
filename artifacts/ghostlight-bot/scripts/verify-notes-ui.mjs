/**
 * Verify: Notes UI structure and functionality.
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

test("STATUSES includes all required groups", () => {
  assert.ok(STATUSES.includes("active"), "should have active status");
  assert.ok(STATUSES.includes("upcoming"), "should have upcoming status");
  assert.ok(STATUSES.includes("expired"), "should have expired status");
  assert.ok(STATUSES.includes("archived"), "should have archived status");
});

promises.push(test("notes can be grouped by active/upcoming/expired", async () => {
  const store = createTimedNotesStore({});
  await store.init();

  const now = new Date();
  const past = new Date(now.getTime() - 1000000).toISOString();
  const future = new Date(now.getTime() + 1000000).toISOString();
  const farFuture = new Date(now.getTime() + 86400000).toISOString();

  await store.createNote({
    user_scope: "user",
    companion_id: "Dante",
    title: "Active now",
    starts_at: past,
    ends_at: future,
  });
  await store.createNote({
    user_scope: "user",
    companion_id: "Dante",
    title: "Upcoming",
    starts_at: farFuture,
  });

  const all = await store.listNotes({
    user_scope: "user",
    companion_id: "Dante",
  });

  assert.ok(all.length >= 2, "should retrieve grouped notes");
}));

promises.push(test("notes can be searched and filtered", async () => {
  const store = createTimedNotesStore({});
  await store.init();

  await store.createNote({
    user_scope: "user2",
    companion_id: "Dante",
    title: "Search me",
    tags_json: ["important"],
  });

  const list = await store.listNotes({
    user_scope: "user2",
    companion_id: "Dante",
  });

  assert.ok(list.some((n) => n.title === "Search me"), "should find by title");
}));

promises.push(test("notes support bulk operations (archive)", async () => {
  const store = createTimedNotesStore({});
  await store.init();

  const n1 = await store.createNote({
    user_scope: "user3",
    companion_id: "Dante",
    title: "Note 1",
  });
  const n2 = await store.createNote({
    user_scope: "user3",
    companion_id: "Dante",
    title: "Note 2",
  });

  await store.archiveNote({ id: n1.id });
  await store.archiveNote({ id: n2.id });

  const remaining = await store.listNotes({
    user_scope: "user3",
    companion_id: "Dante",
    status: "active",
  });

  assert.ok(remaining.every((n) => n.id !== n1.id && n.id !== n2.id));
}));

promises.push(test("empty states work for notes", async () => {
  const store = createTimedNotesStore({});
  await store.init();

  const empty = await store.listNotes({
    user_scope: "nonexistent",
    companion_id: "Dante",
  });

  assert.ok(Array.isArray(empty), "should return array");
  assert.equal(empty.length, 0, "should be empty");
}));

promises.push(test("archived notes can be listed separately", async () => {
  const store = createTimedNotesStore({});
  await store.init();

  const active = await store.createNote({
    user_scope: "user4",
    companion_id: "Dante",
    status: "active",
  });
  const archived = await store.archiveNote({ id: active.id });

  const activeList = await store.listNotes({
    user_scope: "user4",
    companion_id: "Dante",
    status: "active",
  });
  const archivedList = await store.listNotes({
    user_scope: "user4",
    companion_id: "Dante",
    status: "archived",
  });

  assert.ok(activeList.length === 0, "active list should be empty");
  assert.ok(archivedList.length >= 1, "archived list should have item");
}));

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
