# Integration Truth Report

Overall status: PARTIALLY FRAGMENTED, improving. Discord and Second Life now both route through a canonical companion event/chat pipeline, but dashboard/admin, life runtime, scheduling, image/audio galleries, and diagnostic surfaces remain partly parallel.

| System | Status | Entrypoints | Dashboard controls | Memory read/write | Prompt/context | Diagnostics/logging | Known failures | User-visible impact | Score |
|---|---|---|---|---|---|---|---|---|---:|
| Discord | active | `src/index.js`, `src/bot/events/messageCreate.js` | channel modes, memory, audio/image settings | read/write through chat pipeline | canonical chat prompt | logger, health, tests | none after triage | primary coherent channel | 85 |
| Dashboard/web | active | `src/http/createHealthServer.js`, admin handlers/actions | extensive | reads/writes stores directly | mostly admin-only, some runtime settings | dashboard proof | none after triage | strong visibility, not always runtime source of truth | 78 |
| Second Life | partial/active | `src/channels/secondLifeAdapter.js`, `src/http/secondLifeApi.js` | Second Life admin page | journal/world store; pipeline event path for chat | companion event + SL reply generator | safe wrapper logging | no required failures | rich bridge but many local commands bypass chat memory | 72 |
| Telegram | stub/unknown | `companionEvent` allows `telegram`; context tests mention it | none found | unknown | possible via event contract only | unknown | no adapter found | not supported as a real channel yet | 20 |
| Companion identity | active | config/env, `resolveCompanionId`, prompt builder | settings/admin | indirect | prompt core | tests/proofs | duplicate loaders | identity can drift across paths | 75 |
| User identity | partial | Discord IDs, memory userScope, SL avatar identity | limited | yes, scoped differently by channel | included by channel context | partial | possible ID-model drift | cross-channel continuity risk | 62 |
| Memory retrieval | active | `memory/index.js`, chat pipeline | memory dashboard | read/write | injected into chat | tests/verifiers | duplicate curator paths | core UX depends on it | 82 |
| Memory writing | active | chat tools, memory actions, curator, alive/life side paths | memory dashboard/review | writes many stores | some writes become prompt context | partial | many write lanes | risk of orphaned memories | 74 |
| Journals | active/partial | innerLife journal, SL journal, storage journal | inner-life/admin pages | writes journal store | partial via preludes | tests | several journal concepts | private continuity may fragment | 65 |
| Dreams | partial | `innerLife/dreamEngine.js` | inner-life page | innerLife store | innerLife prelude | limited | retrieval path not fully proven | dreams may exist more than affect chat | 55 |
| Schedules/proactive | active/partial | schedulerRegistry, alive, heartbeat, automations, lifeRuntime | alive/heartbeat/proactive pages | some writes | some context | status routes | multiple schedulers | action provenance hard to trace | 68 |
| Image generation | active | tools/mediaTools, `images/generateImage.js` | gallery/images pages | generated image store | tool result context | verifiers | gallery/prompt linkage partially proven | images work but context reuse should be tested | 76 |
| Audio/voice | active | `audio/generateAudio.js`, media tools | audio pages/settings | generated audio store/cache | reply/audio tool path | verifiers | provider env-dependent | audio can work; dashboard linkage needs e2e | 73 |
| Emotional arc | active/partial | companionSystems/emotionalArc | admin page/actions | store-backed | injected into pipeline | verifiers | multiple emotion systems | can affect context but overlaps inner weather | 70 |
| Presence/world/time | active/partial | alivePresence, temporal awareness, SL world state | alive/situational/SL pages | stores presence/world | context builders | proof scripts | duplicate time/world builders | consistency risk across channels | 70 |
| Travel/adventures | partial | travel actions/store/pages | travel dashboard | travel store | uncertain prompt retrieval | travel verifier | no required failures | may be visible in dashboard more than companion | 55 |
| Diagnostics/health | active | health server, diagnosticRuntime, repository proofs | system/admin pages | reads appContext/stores | no | strong command proofs | background worker coverage partial | good for dashboard, less for all workers | 80 |
| Database/storage | active | storage factories, schema guard | many pages | central Postgres + in-memory fallbacks | indirect | schema guard | generated dist remains review item | reliable backbone with fallback ambiguity | 82 |
| Provider routing | active | chat/model providers, image/audio providers | settings | no | LLM/tool calls | model diagnostics tests | env-dependent | failures should surface better | 74 |
| Prompt assembly | active | buildSystemPrompt, buildChatRequest, companion prompt | limited | memory/context injected | central for chat | tests | overlapping prompt/prelude builders | high behavioral sensitivity | 78 |

## Critical Findings

- Baseline failures were verifier/test drift, not product behavior regressions.
- Dashboard proof command was documented but missing as a direct package script.
- Alive verifiers and tests had time-of-day false failures due to default quiet hours.
- Telegram is represented in contracts/tests but no active adapter was found.
- Multiple proactive/scheduling systems exist and should be unified by trace IDs before consolidation.

## Recommended Consolidation Order

1. Add cross-channel integration tests for Discord/dashboard/Second Life memory and prompt parity.
2. Define a single trace envelope for channel events, scheduler events, memory writes, and diagnostics.
3. Normalize user/companion identity resolution across Discord, web, and Second Life.
4. Consolidate prompt/context preludes only with snapshot tests protecting personality behavior.
5. Unify proactive/schedule runners after observability proves current behavior.
