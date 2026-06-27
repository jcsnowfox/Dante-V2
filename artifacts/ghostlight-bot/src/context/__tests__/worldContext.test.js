const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildWorldContext,
  formatWorldContextForPrompt,
  getSeason,
  getQuarter,
  getCycleOfDay,
} = require("../worldContext");

describe("WorldContext", () => {
  describe("buildWorldContext", () => {
    it("builds complete context for a specific date/time", () => {
      const testDate = new Date("2025-06-25T14:30:45Z");
      const context = buildWorldContext({
        now: testDate,
        timezone: "America/Chicago",
        companionConfig: {},
        customerConfig: { timezone: "America/Chicago" },
        config: {},
      });

      assert.ok("timestamp" in context);
      assert.ok("timezone" in context);
      assert.ok("time" in context);
      assert.ok("date" in context);
      assert.ok("seasonal" in context);

      assert.strictEqual(context.timezone.iana, "America/Chicago");
      assert.strictEqual(context.timezone.source, "customer_setting");
      assert.strictEqual(context.timestamp.iso, testDate.toISOString());
    });

    it("falls back to companion timezone if customer timezone missing", () => {
      const testDate = new Date("2025-06-25T14:30:45Z");
      const context = buildWorldContext({
        now: testDate,
        companionConfig: { timezone: "Europe/London" },
        customerConfig: {},
        config: {},
      });

      assert.strictEqual(context.timezone.iana, "Europe/London");
      assert.strictEqual(context.timezone.source, "companion_setting");
    });

    it("falls back to DEFAULT_TIMEZONE env var", () => {
      const hadEnv = "DEFAULT_TIMEZONE" in process.env;
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

        assert.strictEqual(context.timezone.iana, "Asia/Tokyo");
        assert.strictEqual(context.timezone.source, "env_default_timezone");
      } finally {
        if (hadEnv) {
          process.env.DEFAULT_TIMEZONE = originalEnv;
        } else {
          delete process.env.DEFAULT_TIMEZONE;
        }
      }
    });

    it("defaults to UTC if no timezone configured", () => {
      const testDate = new Date("2025-06-25T14:30:45Z");
      const context = buildWorldContext({
        now: testDate,
        companionConfig: {},
        customerConfig: {},
        config: {},
      });

      assert.strictEqual(context.timezone.iana, "UTC");
      assert.strictEqual(context.timezone.source, "fallback_utc");
    });

    it("includes cycle of day", () => {
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

      assert.strictEqual(morningContext.time.cycleOfDay, "morning");
      assert.strictEqual(eveningContext.time.cycleOfDay, "evening");
    });

    it("includes season and quarter", () => {
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

      assert.strictEqual(springContext.seasonal.season, "spring");
      assert.strictEqual(springContext.seasonal.quarter, "Q2");
      assert.strictEqual(winterContext.seasonal.season, "winter");
      assert.strictEqual(winterContext.seasonal.quarter, "Q1");
    });
  });

  describe("formatWorldContextForPrompt", () => {
    it("formats context as readable text section", () => {
      const context = buildWorldContext({
        now: new Date("2025-06-25T14:30:45Z"),
        companionConfig: {},
        customerConfig: { timezone: "UTC" },
      });

      const formatted = formatWorldContextForPrompt(context);

      assert.ok(formatted.includes("## WORLD CONTEXT"));
      assert.ok(formatted.includes("Current Time"));
      assert.ok(formatted.includes("Date"));
      assert.ok(formatted.includes("UTC"));
      assert.ok(formatted.includes("Wednesday"));
      assert.ok(formatted.includes("June"));
    });

    it("returns null-safe string for missing context", () => {
      const formatted = formatWorldContextForPrompt(null);
      assert.strictEqual(typeof formatted, "string");
      assert.ok(formatted.includes("not available"));
    });
  });

  describe("Season calculation", () => {
    it("getSeason returns correct seasons", () => {
      assert.strictEqual(getSeason(1), "winter");
      assert.strictEqual(getSeason(3), "spring");
      assert.strictEqual(getSeason(6), "summer");
      assert.strictEqual(getSeason(9), "autumn");
      assert.strictEqual(getSeason(12), "winter");
    });

    it("getQuarter returns correct quarters", () => {
      assert.strictEqual(getQuarter(1), "Q1");
      assert.strictEqual(getQuarter(4), "Q2");
      assert.strictEqual(getQuarter(7), "Q3");
      assert.strictEqual(getQuarter(10), "Q4");
    });
  });

  describe("Cycle of day calculation", () => {
    it("getCycleOfDay returns correct cycles", () => {
      assert.strictEqual(getCycleOfDay(2), "late night");
      assert.strictEqual(getCycleOfDay(7), "early morning");
      assert.strictEqual(getCycleOfDay(10), "morning");
      assert.strictEqual(getCycleOfDay(13), "midday");
      assert.strictEqual(getCycleOfDay(16), "afternoon");
      assert.strictEqual(getCycleOfDay(19), "evening");
      assert.strictEqual(getCycleOfDay(23), "late night");
    });
  });
});
