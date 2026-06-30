"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { safeStoreList } = require("../src/http/adminPageHandlers");

test("safeStoreList accepts synchronous store arrays without .catch runtime failures", async () => {
  const rows = [{ id: "sync-row" }];
  const result = await safeStoreList(() => rows);
  assert.deepEqual(result, rows);
});

test("safeStoreList falls back for thrown or rejected store calls", async () => {
  assert.deepEqual(await safeStoreList(() => { throw new Error("boom"); }), []);
  assert.deepEqual(await safeStoreList(() => Promise.reject(new Error("boom"))), []);
});
