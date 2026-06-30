# Test Coverage Gaps

## Tests added in this pass
- `adminSafeStoreList.test.js` covers synchronous arrays, thrown errors, and rejected promises for dashboard store lists.
- `imageExecutionPath.test.js` now covers the empty reply/no-files path sending a clean fallback instead of silently returning.

## Existing useful coverage
- Image URL/base64/bytes normalization to Discord file attachments.
- Actual Discord send payload includes files for image requests.
- Discord upload failure does not claim successful attachment delivery.
- Fake tool-call leakage is stripped and provider failures remain clean.
- Sanitizer preserves media intent before execution.

## Remaining gaps
- Browser-level dashboard dead-button crawl.
- Production Discord response attachment-count assertion after upload.
- Prompt section/token snapshot test.
- Central autonomy outbound source attribution manifest test.
