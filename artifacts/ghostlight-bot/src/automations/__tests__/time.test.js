const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isDailySummaryDueNow,
  isWeeklySummaryDueNow,
} = require('../time');

function buildConfig(overrides = {}) {
  return {
    chat: { timezone: 'UTC' },
    memory: {
      dailySummaryEnabled: true,
      dailySummaryTime: '04:00',
      weeklySummaryEnabled: true,
      weeklySummaryTime: '04:00',
      weeklySummaryDay: 'friday',
      ...overrides.memory,
    },
  };
}

test('daily memory heartbeat remains due after its scheduled minute until it runs', () => {
  const config = buildConfig();

  assert.equal(isDailySummaryDueNow(config, new Date('2026-06-26T04:00:00Z')), true);
  assert.equal(isDailySummaryDueNow(config, new Date('2026-06-26T04:17:00Z')), true);
  assert.equal(isDailySummaryDueNow(config, new Date('2026-06-26T03:59:00Z')), false);
});

test('daily memory heartbeat does not rerun after today has been marked complete', () => {
  const config = buildConfig({
    memory: {
      dailySummaryLastRunAt: '2026-06-26T04:02:00Z',
    },
  });

  assert.equal(isDailySummaryDueNow(config, new Date('2026-06-26T04:30:00Z')), false);
});

test('weekly memory heartbeat remains due after scheduled time on selected weekday', () => {
  const config = buildConfig();

  assert.equal(isWeeklySummaryDueNow(config, new Date('2026-06-26T04:00:00Z')), true);
  assert.equal(isWeeklySummaryDueNow(config, new Date('2026-06-26T05:00:00Z')), true);
  assert.equal(isWeeklySummaryDueNow(config, new Date('2026-06-25T05:00:00Z')), false);
});
