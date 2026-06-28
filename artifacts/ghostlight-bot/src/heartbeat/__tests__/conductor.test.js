"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConductorInstructions } = require("../conductor");

test("conductor display copy is guided toward inner thoughts and decisions", () => {
  const instructions = buildConductorInstructions({
    config: {
      chat: {
        promptBlocks: {
          personaName: "Dante",
          userName: "Jenna",
        },
      },
      heartbeat: {},
    },
    quietHoursActive: false,
  });

  assert.match(instructions, /private inner thought and chosen decision/);
  assert.match(instructions, /what I noticed, what I felt pulled toward, and what I chose to do or not do/);
  assert.match(instructions, /For sent actions, describe the private reason/);
  assert.match(instructions, /inner decision to wait/);
  assert.match(instructions, /Do not use labels like 'Heartbeat'/);
});
