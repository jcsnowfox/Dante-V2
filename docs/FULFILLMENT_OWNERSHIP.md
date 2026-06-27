# Fulfillment Ownership

This repo intentionally keeps two fulfillment stores with separate duties.

## Raw homeostasis event log: `dante_fulfillment_logs`

- Code owner: `src/lifeRuntime/fulfillmentLogStore.js`.
- Writer: `homeostasisRuntime` through `fulfillmentExecutor`.
- Meaning: raw need-level attempts, refusals, waits, and deltas generated while Homeostasis manages pressure.
- Reader: Homeostasis status/pruning and low-level need auditing.
- Canonical for: **need adjustment history**.

## Canonical agency evidence ledger: `dante_fulfillment_history`

- Code owner: `src/lifeRuntime/fulfillmentHistoryStore.js`.
- Writer: `fulfillmentRuntime` through `agencyExecutor`.
- Meaning: evidence-backed autonomous agency outcomes: `SUCCESS`, `PARTIAL`, `DEFERRED`, `UNAVAILABLE`.
- Reader: Fulfillment status, self-consistency evidence checks, Identity belief reinforcement bridges.
- Canonical for: **whether Dante actually did the thing**.

## No fake fulfillment rule

`fulfillment_history` is the canonical evidence ledger. A successful or partial autonomous action must include evidence. If evidence is missing, the store downgrades the outcome to `UNAVAILABLE`; text claims alone do not count.

## Evidence to identity

Evidence-backed fulfillment may conservatively reinforce or challenge Identity beliefs through the emergence bridge. A single action does not wildly rewrite identity; it only adds low-delta evidence.
