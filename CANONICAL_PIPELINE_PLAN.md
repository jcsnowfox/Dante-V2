# Canonical Pipeline Plan

## Intended One True Path

Channel Adapter → Companion Event → Identity Resolver → User Resolver → Capability Resolver → Memory Context Builder → World/Time Context Builder → Prompt Builder → LLM Provider → Tool Router → Response Postprocessor → Memory/Journal Writer → Diagnostics Trace → Channel Response Adapter

## Current Channel Fit

| Channel | Current fit | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| Discord | partially uses canonical path | `messageCreate.js` calls `companion.processCompanionEvent` when wired and the app builds a shared `chatPipeline`. | Low/medium | Keep Discord as canonical reference, then add trace assertions around memory/context/write stages. |
| Dashboard/web chat/admin | partially uses canonical path | Dashboard uses direct admin handlers/actions for settings/stores; not primarily a chat channel. | Medium | Separate admin mutation pipeline from chat pipeline; add tests proving settings used by runtime. |
| Second Life | partially uses canonical path | `secondLifeAdapter.js` calls `companion.processCompanionEvent` for chat, but commands/world updates use bridge-local flows. | Medium | Keep bridge-local commands thin and route all conversational replies through companion events. |
| Telegram | unknown/stub | `companionEvent` allows telegram, but no active adapter was found. | Low now, high if advertised | Do not market as active until an adapter uses the same event processor. |
| Schedules/proactive | bypass/partial | Alive, heartbeat, automations, and life runtime can enqueue or execute without a single event envelope. | Medium/high | Introduce a canonical `CompanionEvent` type for scheduled actions before merging schedulers. |

## Safest Unification Order

1. Add diagnostics trace IDs to the existing companion event/chat pipeline.
2. Write cross-channel integration tests proving identical identity, memory retrieval, prompt assembly, and memory write behavior.
3. Adapt Second Life conversational events to emit the same trace envelope as Discord.
4. Add dashboard assertions that saved settings affect the next runtime context where intended.
5. Route scheduled/proactive outputs through a `scheduled_companion_event` envelope while preserving current behavior.
6. Only then consolidate duplicate context builders, prompt preludes, and memory writers.

## Guardrails

- Do not change companion personality or prompt wording without snapshot coverage.
- Do not merge memory stores until read/write visibility is proven across dashboard and channel runtime.
- Do not delete Telegram or travel code solely because integration is partial; mark as stub/partial until product intent is confirmed.
