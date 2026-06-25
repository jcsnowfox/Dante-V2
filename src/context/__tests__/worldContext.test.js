const {
  buildWorldContext,
  formatWorldContextForPrompt,
  getSeason,
  getQuarter,
  getCycleOfDay,
} = require("../worldContext");

describe("WorldContext", () => {
  describe("buildWorldContext", () => {
    test("builds complete context for a specific date/time", () => {
      const testDate = new Date("2025-06-25T14:30:45Z");
      const context = buildWorldContext({
        now: testDate,
        timezone: "America/Chicago",
        companionConfig: {},
        customerConfig: { timezone: "America/Chicago" },
        config: {},
      });

      expect(context).toHaveProperty("timestamp");
      expect(context).toHaveProperty("timezone");
      expect(context).toHaveProperty("time");
      expect(context).toHaveProperty("date");
      expect(context).toHaveProperty("seasonal");

      expect(context.timezone.iana).toBe("America/Chicago");
      expect(context.timezone.source).toBe("customer_setting");
      expect(context.timestamp.iso).toBe(testDate.toISOString());
    });

    test("falls back to companion timezone if customer timezone missing", () => {
      const testDate = new Date("2025-06-25T14:30:45Z");
      const context = buildWorldContext({
        now: testDate,
        companionConfig: { timezone: "Europe/London" },
        customerConfig: {},
        config: {},
      });

      expect(context.timezone.iana).toBe("Europe/London");
      expect(context.timezone.source).toBe("companion_setting");
    });

    test("falls back to DEFAULT_TIMEZONE env var", () => {
      const originalEnv = process.env.DEFAULT_TIMEZONE;
      process.env.DEFAULT_TIMEZONE = "Asia/Tokyo";

      try {
        const testDate = new Date("2025-06-25T14:30:45Z");
        const context = buildWorldContext({
          now: testDate,
          companionConfig: {},
          customerConfig: {},
          config: {},
        });

        expect(context.timezone.iana).toBe("Asia/Tokyo");
        expect(context.timezone.source).toBe("env_default_timezone");
      } finally {
        process.env.DEFAULT_TIMEZONE = originalEnv;
      }
    });

    test("defaults to UTC if no timezone configured", () => {
      const testDate = new Date("2025-06-25T14:30:45Z");
      const context = buildWorldContext({
        now: testDate,
        companionConfig: {},
        customerConfig: {},
        config: {},
      });

      expect(context.timezone.iana).toBe("UTC");
      expect(context.timezone.source).toBe("fallback_utc");
    });

    test("includes cycle of day", () => {
      const morningDate = new Date("2025-06-25T09:30:00Z");
      const eveningDate = new Date("2025-06-25T19:30:00Z");

      const morningContext = buildWorldContext({
        now: morningDate,
        timezone: "UTC",
        companionConfig: {},
        customerConfig: { timezone: "UTC" },
      });

      const eveningContext = buildWorldContext({
        now: eveningDate,
        timezone: "UTC",
        companionConfig: {},
        customerConfig: { timezone: "UTC" },
      });

      expect(morningContext.time.cycleOfDay).toBe("morning");
      expect(eveningContext.time.cycleOfDay).toBe("evening");
    });

    test("includes season and quarter", () => {
      const springDate = new Date("2025-04-15T12:00:00Z");
      const winterDate = new Date("2025-01-15T12:00:00Z");

      const springContext = buildWorldContext({
        now: springDate,
        companionConfig: {},
        customerConfig: { timezone: "UTC" },
      });

      const winterContext = buildWorldContext({
        now: winterDate,
        companionConfig: {},
        customerConfig: { timezone: "UTC" },
      });

      expect(springContext.seasonal.season).toBe("spring");
      expect(springContext.seasonal.quarter).toBe("Q2");
      expect(winterContext.seasonal.season).toBe("winter");
      expect(winterContext.seasonal.quarter).toBe("Q1");
    });
  });

  describe("formatWorldContextForPrompt", () => {
    test("formats context as readable text section", () => {
      const context = buildWorldContext({
        now: new Date("2025-06-25T14:30:45Z"),
        companionConfig: {},
        customerConfig: { timezone: "UTC" },
      });

      const formatted = formatWorldContextForPrompt(context);

      expect(formatted).toContain("## WORLD CONTEXT");
      expect(formatted).toContain("Current Time");
      expect(formatted).toContain("Date");
      expect(formatted).toContain("UTC");
      expect(formatted).toContain("Wednesday");
      expect(formatted).toContain("June");
    });

    test("returns null-safe string for missing context", () => {
      const formatted = formatWorldContextForPrompt(null);
      expect(typeof formatted).toBe("string");
      expect(formatted).toContain("not available");
    });
  });

  describe("Season calculation", () => {
    test("getSeason returns correct seasons", () => {
      expect(getSeason(1)).toBe("winter");
      expect(getSeason(3)).toBe("spring");
      expect(getSeason(6)).toBe("summer");
      expect(getSeason(9)).toBe("autumn");
      expect(getSeason(12)).toBe("winter");
    });

    test("getQuarter returns correct quarters", () => {
      expect(getQuarter(1)).toBe("Q1");
      expect(getQuarter(4)).toBe("Q2");
      expect(getQuarter(7)).toBe("Q3");
      expect(getQuarter(10)).toBe("Q4");
    });
  });

  describe("Cycle of day calculation", () => {
    test("getCycleOfDay returns correct cycles", () => {
      expect(getCycleOfDay(2)).toBe("late night");
      expect(getCycleOfDay(7)).toBe("early morning");
      expect(getCycleOfDay(10)).toBe("morning");
      expect(getCycleOfDay(13)).toBe("midday");
      expect(getCycleOfDay(16)).toBe("afternoon");
      expect(getCycleOfDay(19)).toBe("evening");
      expect(getCycleOfDay(23)).toBe("late night");
    });
  });
});
