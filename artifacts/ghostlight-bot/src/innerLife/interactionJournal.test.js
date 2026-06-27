"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldRecordInteractionJournal,
  buildInteractionJournalBody,
  recordInteractionJournal,
} = require("./interactionJournal");

test("shouldRecordInteractionJournal detects Dante diagnostic journal gaps", () => {
  assert.equal(shouldRecordInteractionJournal({
    message: "what do your diagnostics need?",
    reply: "the first thing is the ability to write to my own journal, because thoughts don't stick.",
  }), true);
});

test("buildInteractionJournalBody includes owner context, reply evidence, and carry-forward instruction", () => {
  const body = buildInteractionJournalBody({
    message: "investigate diagnostics",
    reply: "i need an evidence store and provenance layer",
  });

  assert.match(body, /Owner context: investigate diagnostics/);
  assert.match(body, /What I said: i need an evidence store and provenance layer/);
  assert.match(body, /Carry-forward:/);
});

test("recordInteractionJournal writes a journal entry with evidence metadata", async () => {
  const writes = [];
  const store = {
    async create(entry) {
      writes.push(entry);
      return { id: 42, ...entry };
    },
  };

  const entry = await recordInteractionJournal({
    store,
    config: { inner_life_enabled: true, journal_enabled: true },
    message: "diagnostics",
    reply: "i can think things, but they don't stick. i need to write to my own journal.",
    sourceMessageId: "m1",
    sourceChannelId: "c1",
  });

  assert.equal(entry.id, 42);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].entryType, "journal_entry");
  assert.equal(writes[0].sourceEventType, "conversation_diagnostic_journal");
  assert.equal(writes[0].metadata.kind, "diagnostic_carry_forward");
  assert.equal(writes[0].metadata.evidence.userMessage, "diagnostics");
});
