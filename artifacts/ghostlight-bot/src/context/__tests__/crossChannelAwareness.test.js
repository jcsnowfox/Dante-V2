const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");
const {
  retrieveCrossChannelEvents,
  buildCrossChannelContextSection,
  filterCrossChannelByPrivacy,
} = require("../crossChannelAwareness");

describe("Cross-Channel Awareness", () => {
  describe("buildCrossChannelContextSection", () => {
    it("builds context section from events", () => {
      const events = [
        {
          platform: "discord",
          authorDisplayName: "User1",
          contentText: "Hello from Discord",
          createdAt: new Date(),
        },
        {
          platform: "telegram",
          authorDisplayName: "User1",
          contentText: "Hello from Telegram",
          createdAt: new Date(),
        },
      ];

      const section = buildCrossChannelContextSection(events);

      assert.ok(section.includes("## CROSS-CHANNEL CONTEXT"));
      assert.ok(section.includes("Discord"));
      assert.ok(section.includes("Telegram"));
      assert.ok(section.includes("Hello from Discord"));
      assert.ok(section.includes("Hello from Telegram"));
    });

    it("includes platform summary", () => {
      const events = [
        {
          platform: "discord",
          authorDisplayName: "User1",
          contentText: "Message 1",
        },
        {
          platform: "discord",
          authorDisplayName: "User1",
          contentText: "Message 2",
        },
        {
          platform: "telegram",
          authorDisplayName: "User1",
          contentText: "Message 3",
        },
      ];

      const section = buildCrossChannelContextSection(events);

      assert.ok(section.includes("Platform summary:"));
      assert.ok(section.includes("Discord"));
      assert.ok(section.includes("Telegram"));
    });

    it("returns null for empty events", () => {
      const section = buildCrossChannelContextSection([]);
      assert.strictEqual(section, null);
    });

    it("returns null for null events", () => {
      const section = buildCrossChannelContextSection(null);
      assert.strictEqual(section, null);
    });

    it("limits to 10 events in narrative", () => {
      const events = Array.from({ length: 20 }, (_, i) => ({
        platform: "discord",
        authorDisplayName: "User1",
        contentText: `Message ${i}`,
        createdAt: new Date(),
      }));

      const section = buildCrossChannelContextSection(events);

      // Count how many "Message X" are in the narrative part (before "Platform summary")
      const narrativePart = section.split("Platform summary:")[0];
      const messageMatches = narrativePart.match(/Message \d+/g) || [];
      assert.ok(messageMatches.length <= 10);
    });
  });

  describe("filterCrossChannelByPrivacy", () => {
    it("allows public messages in public channels", () => {
      const events = [
        {
          platform: "discord",
          privacyScope: "public",
          contentText: "Public message",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "public");
      assert.strictEqual(filtered.length, 1);
    });

    it("blocks private messages in public channels", () => {
      const events = [
        {
          platform: "discord",
          privacyScope: "private",
          contentText: "Private message",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "public");
      assert.strictEqual(filtered.length, 0);
    });

    it("blocks DM-only messages in public channels", () => {
      const events = [
        {
          platform: "discord",
          channelMode: "dm",
          contentText: "DM message",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "public");
      assert.strictEqual(filtered.length, 0);
    });

    it("allows all messages in private channels", () => {
      const events = [
        {
          platform: "discord",
          privacyScope: "public",
          contentText: "Public",
        },
        {
          platform: "discord",
          privacyScope: "private",
          contentText: "Private",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "private");
      assert.strictEqual(filtered.length, 2);
    });

    it("returns empty array for null events", () => {
      const filtered = filterCrossChannelByPrivacy(null, "public");
      assert.strictEqual(filtered.length, 0);
    });
  });

  describe("retrieveCrossChannelEvents", () => {
    it("returns empty array when conversations is null", async () => {
      const events = await retrieveCrossChannelEvents({
        conversations: null,
        userId: "user123",
      });

      assert.deepStrictEqual(events, []);
    });

    it("returns empty array when userId is null", async () => {
      const calls = [];
      const mockConversations = {
        listRecentEventsByAuthor: (...args) => {
          calls.push(args);
          return Promise.resolve([]);
        },
      };

      const events = await retrieveCrossChannelEvents({
        conversations: mockConversations,
        userId: null,
      });

      assert.deepStrictEqual(events, []);
    });

    it("calls conversations.listRecentEventsByAuthor with correct parameters", async () => {
      const calls = [];
      const mockConversations = {
        listRecentEventsByAuthor: (args) => {
          calls.push(args);
          return Promise.resolve([]);
        },
      };

      const userId = "user123";
      const companionId = "companion456";
      const customerId = "customer789";

      await retrieveCrossChannelEvents({
        conversations: mockConversations,
        userId,
        companionId,
        customerId,
        limit: 10,
        hoursBack: 24,
      });

      assert.ok(calls.length > 0);
      assert.strictEqual(calls[0].userId, userId);
    });

    it("deduplicates events by message ID and content", async () => {
      const mockConversations = {
        listRecentEventsByAuthor: () =>
          Promise.resolve([
            {
              messageId: "msg123",
              contentText: "Hello",
              channelId: "channel1",
              role: "user",
              platform: "discord",
              authorDisplayName: "User1",
            },
            {
              messageId: "msg123",
              contentText: "Hello",
              channelId: "channel2",
              role: "user",
              platform: "discord",
              authorDisplayName: "User1",
            },
          ]),
      };

      const events = await retrieveCrossChannelEvents({
        conversations: mockConversations,
        userId: "user123",
        currentChannelId: "channel3",
      });

      assert.strictEqual(events.length, 1);
    });

    it("filters out events from current channel", async () => {
      const mockConversations = {
        listRecentEventsByAuthor: () =>
          Promise.resolve([
            {
              messageId: "msg1",
              contentText: "Message 1",
              channelId: "current_channel",
              role: "user",
              platform: "discord",
              authorDisplayName: "User1",
            },
            {
              messageId: "msg2",
              contentText: "Message 2",
              channelId: "other_channel",
              role: "user",
              platform: "discord",
              authorDisplayName: "User1",
            },
          ]),
      };

      const events = await retrieveCrossChannelEvents({
        conversations: mockConversations,
        userId: "user123",
        currentChannelId: "current_channel",
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].contentText, "Message 2");
    });
  });
});
