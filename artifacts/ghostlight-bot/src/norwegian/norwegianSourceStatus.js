const SOURCE_STATUS = Object.freeze({
  verified: 'verified',
  partial: 'partial',
  stt_based_practice: 'stt_based_practice',
  low_confidence: 'low_confidence',
  unverified_practice: 'unverified_practice',
  not_checked: 'not_checked',
});

const ALLOWED_SOURCE_STATUSES = new Set(Object.values(SOURCE_STATUS));

function validateSourceStatus(status) {
  if (!ALLOWED_SOURCE_STATUSES.has(status)) {
    throw new Error(
      `[norwegian] Invalid sourceStatus: "${status}". Allowed values: ${[...ALLOWED_SOURCE_STATUSES].join(', ')}`,
    );
  }
  console.log(`[norwegian] sourceStatus validated status=${status}`);
  return status;
}

module.exports = { SOURCE_STATUS, ALLOWED_SOURCE_STATUSES, validateSourceStatus };
