# Diagnostic Runtime Map

Diagnostics are read through one status-oriented runtime, not by creating another scheduler or journal writer.

## Sources

- `selfConsistencyMonitor`: last reply self-trust signal and prelude warning.
- `selfCheckScheduler`: existing scheduled morning/noon/night diagnostic posts.
- `interactionJournal`: existing diagnostic carry-forward journal writer.
- `innerLifeDispatch`: existing diagnostic/autonomy channel routing through the Discord send gateway.

## Canonical read model

`src/diagnostics/diagnosticRuntime.js` exposes:

`selfConsistency`, `scheduledSelfChecks`, `diagnosticCarryForward`, `diagnosticChannel`, `autonomyChannel`, `lastSelfCheck`, and `sourceHealth`.

It is read-only. It creates no scheduler, no sender, and no journal writes.
