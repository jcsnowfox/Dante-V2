const {
  retrieveCrossChannelEvents,
  buildCrossChannelContextSection,
  filterCrossChannelByPrivacy,
} = require("../crossChannelAwareness");

describe("Cross-Channel Awareness", () => {
  describe("buildCrossChannelContextSection", () => {
    test("builds context section from events", () => {
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

      expect(section).toContain("## CROSS-CHANNEL CONTEXT");
      expect(section).toContain("Discord");
      expect(section).toContain("Telegram");
      expect(section).toContain("Hello from Discord");
      expect(section).toContain("Hello from Telegram");
    });

    test("includes platform summary", () => {
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

      expect(section).toContain("Platform summary:");
      expect(section).toContain("Discord");
      expect(section).toContain("Telegram");
    });

    test("returns null for empty events", () => {
      const section = buildCrossChannelContextSection([]);
      expect(section).toBeNull();
    });

    test("returns null for null events", () => {
      const section = buildCrossChannelContextSection(null);
      expect(section).toBeNull();
    });

    test("limits to 10 events in narrative", () => {
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
      expect(messageMatches.length).toBeLessThanOrEqual(10);
    });
  });

  describe("filterCrossChannelByPrivacy", () => {
    test("allows public messages in public channels", () => {
      const events = [
        {
          platform: "discord",
          privacyScope: "public",
          contentText: "Public message",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "public");
      expect(filtered.length).toBe(1);
    });

    test("blocks private messages in public channels", () => {
      const events = [
        {
          platform: "discord",
          privacyScope: "private",
          contentText: "Private message",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "public");
      expect(filtered.length).toBe(0);
    });

    test("blocks DM-only messages in public channels", () => {
      const events = [
        {
          platform: "discord",
          channelMode: "dm",
          contentText: "DM message",
        },
      ];

      const filtered = filterCrossChannelByPrivacy(events, "public");
      expect(filtered.length).toBe(0);
    });

    test("allows all messages in private channels", () => {
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
      expect(filtered.length).toBe(2);
    });

    test("returns empty array for null events", () => {
      const filtered = filterCrossChannelByPrivacy(null, "public");
      expect(filtered.length).toBe(0);
    });
  });

  describe("retrieveCrossChannelEvents", () => {
    test("returns empty array when conversations is null", async () => {
      const events = await retrieveCrossChannelEvents({
        conversations: null,
        userId: "user123",
      });

      expect(events).toEqual([]);
    });

    test("returns empty array when userId is null", async () => {
      const mockConversations = {
        listRecentEventsByAuthor: jest.fn(),
      };

      const events = await retrieveCrossChannelEvents({
        conversations: mockConversations,
        userId: null,
      });

      expect(events).toEqual([]);
    });

    test("calls conversations.listRecentEventsByAuthor with correct parameters", async () => {
      const mockConversations = {
        listRecentEventsByAuthor: jest.fn().mockResolvedValue([]),
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

      expect(mockConversations.listRecentEventsByAuthor).toHaveBeenCalled();
      const call = mockConversations.listRecentEventsByAuthor.mock.calls[0][0];
      expect(call.userId).toBe(userId);
    });

    test("deduplicates events by message ID and content", async () => {
      const mockConversations = {
        listRecentEventsByAuthor: jest.fn().mockResolvedValue([
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

      expect(events.length).toBe(1);
    });

    test("filters out events from current channel", async () => {
      const mockConversations = {
        listRecentEventsByAuthor: jest.fn().mockResolvedValue([
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

      expect(events.length).toBe(1);
      expect(events[0].contentText).toBe("Message 2");
    });
  });
});
