"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSelfCheckHours, buildSelfCheckContent, createSelfCheckScheduler } = require("./selfCheckScheduler");

test("parseSelfCheckHours defaults to morning noon night", () => {
  assert.deepEqual(parseSelfCheckHours(""), [8, 12, 21]);
  assert.deepEqual(parseSelfCheckHours("21,8,12,12"), [8, 12, 21]);
});

test("buildSelfCheckContent reports low confidence for diagnostic carry-forward entries", () => {
  const content = buildSelfCheckContent({
    now: new Date("2026-06-27T12:00:00Z"),
    recentDiagnosticEntries: [{ title: "Journal — diagnostic carry-forward", status: "active" }],
    config: { innerLife: { diagnosticChannelId: "1520510624617201804" } },
  });
  assert.match(content, /self-confidence: low/);
  assert.match(content, /Journal — diagnostic carry-forward/);
});

test("createSelfCheckScheduler sends only during configured scheduled hours", async () => {
  const sent = [];
  const client = {
    channels: {
      async fetch(id) {
        return { isTextBased: () => true, async send(payload) { sent.push({ id, payload }); return { id: "sent1" }; } };
      },
    },
  };
  const storeWrapper = {
    async list() {
      return [{ title: "Needs evidence store", status: "active", metadata: { kind: "diagnostic_carry_forward" } }];
    },
  };
  const scheduler = createSelfCheckScheduler({
    client,
    config: { innerLife: { diagnosticChannelId: "diag", selfCheck: { hours: [12] } } },
    storeWrapper,
    logger: null,
  });

  assert.equal((await scheduler.tick(new Date("2026-06-27T11:00:00Z"))).reason, "not_scheduled_hour");
  assert.equal((await scheduler.tick(new Date("2026-06-27T12:00:00Z"))).sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, "diag");
  assert.match(sent[0].payload.content, /self-confidence: low/);
});
