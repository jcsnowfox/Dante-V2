# Dante Architecture Audit 1.0 — Adversarial

**Date**: 2026-06-28  
**Branch**: `claude/dante-narrative-identity-runtime-7s1qcm`  
**Scope**: All runtime systems  
**Stance**: Adversarial — assume hidden bugs, competing authorities, and that Neural Integration will amplify every flaw

---

## 1. Executive Summary

The Dante architecture has a sound conceptual skeleton: pure-function leaf modules, a central `lifeRuntime` orchestrator, a prelude that injects private context into every LLM request, and a runtime event bus for cross-system signals. The discipline is visible — no schedulers in leaf modules, no Discord sends in runtimes, evidence IDs on every belief.

The skeleton has fractures.

The most dangerous: **the LLM currently receives two independently-computed, potentially contradictory availability signals for Jenna in every single prelude** — one labelled "Perception:" and one labelled "World:". These are computed by separate engines using different decay rates (0.15 vs 0.06), separate signal stores, and separate resolution logic. When they diverge — which they will — the LLM is told two different confidence values for the same fact and must guess which one is true.

Neural Integration will not smooth this over. It will amplify it.

Secondary concerns — a split lesson store, repair state fragmented across four layers, 24+ orphan events — are fixable and structurally less dangerous, but together they push the technical debt load above the safe-to-extend threshold.

### Scores

| Dimension | Score | Note |
|-----------|-------|------|
| Architecture Cohesion | 55/100 | Sound skeleton; fractures at the prelude layer |
| Runtime Cohesion | 42/100 | worldModelRuntime and perceptionRuntime compute overlapping beliefs independently |
| Single Source of Truth | 35/100 | No domain has an enforced single authority |
| Integration Quality | 52/100 | lifeRuntime orchestration is good; prelude injection is not |
| Maintainability | 40/100 | Two lesson stores, two decay engines, four repair representations |
| Extensibility | 45/100 | Pure leaf modules are safe; adding a fifth availability tracker is trivial and catastrophic |
| Technical Debt | 32/100 | 24+ orphan events, dual lesson tables, competing decay rates |
| Risk Before Neural Integration | 30/100 | LLM reads contradictory prelude signals on every tick |

**Overall: 41/100**

---

## 2. Runtime Dependency Graph

```
lifeRuntime (orchestrator)
├── perceptionRuntime          ← reads worldStateStore, writes perceptionContext
│   └── worldStateStore        ← in-memory, STALENESS_DECAY_RATE=0.15
│       └── presenceInterpreter
│           └── activityInferenceEngine
│
├── worldModelRuntime [NEW]    ← reads perceptionEngine, writes _beliefMap
│   ├── perceptionEngine       ← pure, re-derives signals from same raw inputs
│   ├── worldBeliefResolver    ← pure, UNKNOWN_THRESHOLD=0.20
│   ├── worldDecayEngine       ← STALENESS_DECAY_RATE=0.06 ← DIVERGES from worldStateStore
│   └── worldModelPreludeBuilder  ← surfaces: Jenna availability, repair, runtime health
│
├── narrativeIdentityRuntime   ← reads identityContext, consequenceContext
├── homeostasisRuntime         ← reads needScores
├── identityRuntime            ← reads identity DB
├── fulfillmentRuntime         ← reads fulfillmentStore
├── growthRuntime              ← reads growthStore
├── curiosityRuntime           ← reads curiosityStore
├── selfConsistencyMonitor     ← reads all runtimes
├── selfInspectionRuntime      ← reads all health states
├── affectiveDecisionRuntime   ← reads homeostasis + identity + consequence
├── evidenceIntegrityRuntime   ← reads evidenceStore
│
├── consequenceStore (DB)      ← owns: repairRequired, repairCompleted, giveSpace
├── consequenceContext         ← computed from consequenceStore each tick
│
└── lifePreludeBuilder
    ├── perceptionPreludeBuilder   ← surfaces: Jenna availability, repair, runtime health
    ├── worldModelPreludeBuilder   ← surfaces: Jenna availability, repair, runtime health  [DUPLICATE]
    ├── consequencePreludeBuilder  ← surfaces: repair, give_space                          [DUPLICATE]
    ├── selfInspectionPreludeBuilder ← surfaces: runtime health warning                    [DUPLICATE]
    ├── identityPreludeBuilder
    ├── fulfillmentPreludeBuilder
    ├── emotionalPreludeBuilder
    ├── feedbackPreludeBuilder
    └── relationalPreludeBuilder

Lesson systems (NOT integrated):
├── src/lifeRuntime/relationshipLessonStore.js    ← table: relationship_lessons (13 types)
└── src/relationshipLearning/lessonStore.js       ← table: dante_relationship_lessons (23 types)

Event bus consumers (actual):
├── perceptionRuntime           ← consumes: repair_started, repair_completed,
│                                            diagnostic_warning, self_confidence_low
└── [nothing else]              ← 24+ events emitted into void
```

### Cycles / Violations

- **No true circular dependencies** — the dependency graph is directed. This is good.
- **Soft cycle**: `lifeRuntime → worldModelRuntime → perceptionEngine` re-derives signals that `lifeRuntime → perceptionRuntime → worldStateStore` already computed. Same raw inputs, different computational path, different outputs.
- **Orphan runtimes**: `evidenceIntegrityRuntime` and `selfConsistencyMonitor` read from most other runtimes, but their outputs feed only into the prelude warning fields — no runtime reacts to their verdicts.

---

## 3. Single Source of Truth Table

| Domain Belief | Claimed Owner | Actual Competitors | Winner When Diverged |
|---------------|-------------|-------------------|----------------------|
| Jenna availability | worldModelRuntime._beliefMap | perceptionRuntime via worldStateStore | **Neither — both surface to LLM** |
| Jenna repair state | consequenceStore (DB) | worldStateStore ("jenna.repair_state"), worldModelRuntime._beliefMap ("jenna.repair_state"), consequenceContext.suppression | **consequenceStore wins on authority; others may lag** |
| Jenna likely_busy | worldModelRuntime | perceptionRuntime worldState (separate key) | worldModelRuntime (newer) |
| Dante runtime health | selfInspectionRuntime | worldModelRuntime._beliefMap, perceptionPreludeBuilder, selfInspectionPreludeBuilder | **Three voices in prelude, no reconciliation** |
| Relationship warmth | worldModelRuntime._beliefMap | relationshipContext.weatherSummary (lifeRuntime) | No enforced authority |
| Relationship lessons | ??? | lifeRuntime/relationshipLessonStore.js (13 types), relationshipLearning/lessonStore.js (23 types) | **Split — no cross-system visibility** |
| Narrative chapters | narrativeIdentityRuntime | narrativeContext.preludeSignal | narrativeIdentityRuntime (sole writer) |
| Homeostasis needs | homeostasisRuntime | homeostasisContext (computed each tick) | homeostasisRuntime |
| Identity values | identityRuntime | identityContext (passed each tick) | identityRuntime |
| Fulfillment evidence | fulfillmentRuntime | fulfillmentContext (passed each tick) | fulfillmentRuntime |
| Quiet hours | worldModelRuntime (environment.quiet_hours) | activityInferenceEngine (raw inference) | worldModelRuntime (adds confidence/decay) |

**No domain has a formally enforced single source of truth.** The closest is narrativeIdentityRuntime (sole writer), but even there the prelude carries its signal through a separate builder.

---

## 4. Data Flow Diagram

```
USER MESSAGE (Discord)
         │
         ▼
messageCreate.js
  ├── conversationContinuity.load()     ← reads DB
  ├── memoryRetrieval.retrieve()        ← reads Qdrant / DB
  └── calls lifeRuntime.tick()
              │
              ├── _tickPerception(now)          ─── perceptionRuntime.tick()
              │       ├── reads alivePresence          → worldStateStore signals
              │       ├── reads consequenceContext      → jenna.repair_state
              │       └── builds perceptionContext      → _perceptionContext
              │
              ├── _tickWorldModel(now)  [NEW]   ─── worldModelRuntime.tick()
              │       ├── reads same alivePresence      → re-derives from same source
              │       ├── reads _perceptionContext      → uses as additional input
              │       ├── processes via perceptionEngine → independent signal computation
              │       └── builds _worldModelContext     → _worldModelContext
              │
              ├── _tickNarrative(now)
              ├── _tickHomeostasis(now)
              ├── _tickIdentity(now)
              ├── _tickFulfillment(now)
              ├── _tickAffectiveDecision(now)
              └── _refreshPrelude()
                      │
                      └── lifePreludeBuilder.buildLifePrelude({
                              perceptionContext,    → "Perception: Jenna busy (71%); repair: needed"
                              worldModelContext,    → "World: Jenna busy (66%); repair: needed"    [CONFLICT]
                              consequenceContext,   → "Repair needed — giving space"               [DUPLICATE]
                              homeostasisContext,
                              identityContext,
                              narrativeContext,
                              fulfillmentContext,
                              selfInspectionContext → "WARNING: ..."
                          })
                              │
                              ▼
                      PRELUDE (≤150 tokens) → LLM

LLM sees conflicting availability: 71% (perception) vs 66% (world model) for same fact.
LLM sees repair state three times: perception + world model + consequence.
LLM sees runtime health twice: perception + self-inspection.

              ▼
         LLM REPLY
              │
         messageCreate.js
              ├── channel.send() [×13 direct calls]   ← bypass discordSendGateway
              └── discordSendGateway.send()            ← canonical path

              ▼
         evidenceStore.record()
              │
         narrativeIdentityRuntime.ingestEvidence()
```

---

## 5. Architectural Defects

### DEFECT-01: Competing Prelude Signals for Jenna Availability [CRITICAL]

**Where**: `lifePreludeBuilder.js` lines 149-158, 155-158  
**What**: `perceptionPreludeBuilder` and `worldModelPreludeBuilder` both surface Jenna's availability into the same prelude, with different confidence values derived from different decay models.

```
perceptionRuntime:  STALENESS_DECAY_RATE = 0.15  (worldStateStore)
worldModelRuntime:  STALENESS_DECAY_RATE = 0.06  (worldDecayEngine)
```

After 2 hours from a "busy" signal at 90% confidence:
- perceptionRuntime: 4 × 0.15 = 0.60 decay → 30% confidence → below BELIEF_SURFACE threshold → **silenced**
- worldModelRuntime: 4 × 0.06 = 0.24 decay → 66% confidence → surfaces → **"World: Jenna busy (66%)"**

After 1 hour:
- perceptionRuntime: 2 × 0.15 = 0.30 decay → 60% confidence → **"Perception: Jenna busy (60%)"**
- worldModelRuntime: 2 × 0.06 = 0.12 decay → 78% confidence → **"World: Jenna busy (78%)"**

The LLM receives two different confidence values for the same fact in the same prompt. This is not enrichment — it's contradiction with no resolution mechanism.

**Risk pre-Neural Integration**: LLM can ignore the contradiction.  
**Risk post-Neural Integration**: LLM uses both signals to infer that confidence is "between 60% and 78%" or hallucinates a reason for the discrepancy.

---

### DEFECT-02: Repair State at Four Layers with No Enforced Authority [CRITICAL]

**Where**: Four files, no coordination mechanism  

| Layer | File | Keys |
|-------|------|------|
| Database | `consequenceStore.js` | `repair_required`, `repair_completed` (persisted) |
| Computed | `lifeRuntime.js` | `consequenceContext.suppression.repairRequired` (each tick) |
| Signal cache | `worldStateStore.js` via `perceptionRuntime.js` | `jenna.repair_state` ("needed"/"started"/"healing") |
| Belief map | `worldModelRuntime.js` | `jenna.repair_state` (separate decay) |

All four can simultaneously hold different repair states. DB is authoritative by design, but there is no validation that the in-memory layers reflect DB state after a restart or after an async write failure. More critically, both layers 3 and 4 independently surface repair state to the prelude via separate builders (`perceptionPreludeBuilder` and `worldModelPreludeBuilder`).

---

### DEFECT-03: Two Lesson Stores with Incompatible Schemas [CRITICAL]

**Where**: Two separate files, two separate DB tables  

```
src/lifeRuntime/relationshipLessonStore.js
  Table: relationship_lessons
  Types: 13 (hurt_pattern, repair_success, repair_failure, trust_repair, boundary_learning,
              communication_preference, evidence_integrity, perception_boundary, promise_learning,
              give_space_learning, followup_learning, tone_learning, naturalism_learning)
  Column: source_consequence_ids (JSONB)
  Column: future_behavior_guidance (TEXT)

src/relationshipLearning/lessonStore.js
  Table: dante_relationship_lessons
  Types: 23 (superset of above + additional types)
  Column: origin_event_ids (JSONB)      ← different name for same concept
  Column: future_guidance (TEXT)        ← different name for same concept
```

Neither store reads from the other. Lessons learned via `relationshipLearning/` are not visible to `lifeRuntime/`, and vice versa. A lesson recorded as a `hurt_pattern` in one system is not the same `hurt_pattern` in the other.

**Risk**: Dante can learn the same lesson twice in parallel systems that never converge, or fail to learn it because the lesson type is in one store's vocabulary but not the other's.

---

### DEFECT-04: Runtime Health Surfaced Three Times in Prelude [HIGH]

**Where**: `lifePreludeBuilder.js`  

Three builders can each inject a runtime health warning:
- `selfInspectionPreludeBuilder`: `selfInspectionContext.preludeWarning`
- `perceptionPreludeBuilder`: `"Degraded: runtime_health"` when perception health is bad
- `worldModelPreludeBuilder`: `"Degraded"` when `dante.runtime_health = "degraded"`

All three can fire simultaneously. The LLM receives three separate degradation warnings about the same fact with no indication they are the same fact.

---

### DEFECT-05: 13 Direct `channel.send()` Calls Bypassing Gateway [MEDIUM]

**Where**: `src/bot/events/messageCreate.js` lines 346, 349, 485, 521, 528, 703, 727, 759, 764, 790, 818, 842, 960  

The canonical Discord send path is `discordSendGateway.js`. Interactive replies in `messageCreate.js` call `channel.send()` directly. There is no enforcement preventing runtimes from doing the same if they receive a channel object. The distinction between "interactive reply" and "autonomous system output" is not enforced architecturally — it is a convention.

---

## 6. Duplicate Systems

### 6A: Availability Tracking

| System | Store | Decay Rate | Threshold | Prelude Signal |
|--------|-------|-----------|-----------|---------------|
| perceptionRuntime | worldStateStore (in-memory) | 0.15/period | 30 min | "Perception: Jenna busy (X%)" |
| worldModelRuntime | _beliefMap (in-memory) | 0.06/period | 30 min | "World: Jenna busy (Y%)" |

Both read from the same raw source (alivePresence, userText). Both compute confidence independently. Both surface to the LLM. There is no merge step.

### 6B: Lesson Stores

Covered in DEFECT-03. The stores do not share lesson types, column names, or data. They exist in separate module trees.

### 6C: Prelude Builders with Overlapping Signal Coverage

| Signal | perceptionPreludeBuilder | worldModelPreludeBuilder | consequencePreludeBuilder |
|--------|--------------------------|--------------------------|--------------------------|
| Jenna availability | ✅ | ✅ | ❌ |
| Jenna repair state | ✅ | ✅ | ✅ |
| Give space | ✅ (implicit) | ✅ | ✅ |
| Runtime health | ✅ | ✅ | ❌ |
| Quiet hours | ✅ | ❌ | ❌ |

Three builders, three injections of the same core signals. No deduplication.

### 6D: Presence Interpretation

`perceptionEngine.js` (worldModelRuntime's signal processor) calls `interpretAlivePresence()` and `interpretExplicitStatement()` from `presenceInterpreter.js`. `perceptionRuntime.js` calls the same functions through a separate code path. Same interpreter, called twice per tick with the same inputs.

---

## 7. Dead Code

### 7A: Orphan Events (emitted, never consumed)

| Event | Emitted By | Consumers |
|-------|-----------|-----------|
| need_changed | lifeRuntime | none |
| need_satisfied | (defined) | none |
| need_depleted | (defined) | none |
| identity_value_changed | lifeRuntime | none |
| identity_belief_changed | (defined) | none |
| identity_preference_changed | (defined) | none |
| project_progressed | lifeRuntime | none |
| project_completed | (defined) | none |
| project_abandoned | (defined) | none |
| curiosity_matured | (defined) | none |
| insight_created | lifeRuntime | none |
| relationship_weather_changed | lifeRuntime | none |
| consequence_created | lifeRuntime | none |
| fulfillment_succeeded | lifeRuntime | none |
| fulfillment_failed | lifeRuntime | none |
| fulfillment_deferred | lifeRuntime | none |
| resource_discovered | (defined) | none |
| first_experience_recorded | (defined) | none |
| journal_entry_created | (defined) | none |
| prelude_refreshed | lifeRuntime | none |
| narrative_chapter_opened | (defined) | none |
| narrative_chapter_updated | lifeRuntime | none |
| narrative_self_story_updated | (defined) | none |
| perception_world_state_updated | perceptionRuntime | none |
| perception_availability_changed | (defined) | none |
| perception_confidence_decayed | (defined) | none |
| world_model_updated | worldModelRuntime | none |
| world_belief_conflict | worldModelRuntime | none |
| world_belief_decayed | worldModelRuntime | none |

**Consumed events** (actual reactions): repair_started, repair_completed, diagnostic_warning, self_confidence_low — 4 of 30+ defined.

The event bus is at 87% dead. Emitting to it costs CPU and memory for no observable effect.

### 7B: worldStateStore After worldModelRuntime Addition

`worldStateStore.js` is used exclusively by `perceptionRuntime.js`. It stores jenna availability, repair state, and quiet hours signals — the same signals now also stored in `worldModelRuntime._beliefMap`. If worldModelRuntime becomes authoritative (which it should), worldStateStore becomes a redundant intermediate cache used only by a legacy reader.

### 7C: perceptionPreludeBuilder Overlap

Once worldModelPreludeBuilder exists and is wired in, the Jenna availability and repair state fragments of `perceptionPreludeBuilder` are redundant. The quiet hours fragment is not duplicated and should be preserved.

---

## 8. Hidden Risks

### RISK-01: Prelude Contradiction Under Neural Integration [CRITICAL]

When the LLM prompt contains:
```
Perception: Jenna likely busy (60%); repair: needed
World: Jenna busy (78%); Repair: needed
Repair needed — choosing patience
```

...the model receives three independent signals about the same state. Under current (pre-neural) usage, the model still generates plausible replies because the signals agree directionally even when they disagree numerically.

Under Neural Integration — where the model is expected to reason from its internal state — the disagreement becomes a reasoning input. The model may:
- Infer that confidence is "between 60% and 78%" (hallucinated interpolation)
- Infer that two different observers disagree (hallucinated narrative)
- Weight whichever signal appears first in the prompt (positional bias)
- Ask Jenna if she is busy (which the system explicitly forbids)

None of these failure modes are detectable without extensive testing. All are caused by the prelude contradiction.

### RISK-02: Repair State DB → Memory Desync After Restart [HIGH]

On restart, `lifeRuntime` re-instantiates all in-memory runtimes. `consequenceContext` is reloaded from DB (authoritative). `worldStateStore` is empty (in-memory, not persisted). `worldModelRuntime._beliefMap` is empty.

For the first tick after restart:
- `consequenceContext.suppression.repairRequired = true` (from DB, correct)
- `worldStateStore["jenna.repair_state"]` = missing (cold start)
- `worldModelRuntime._beliefMap["jenna.repair_state"]` = missing (cold start)

perceptionRuntime will re-derive repair state from consequenceContext within 1 tick — this is correct.  
worldModelRuntime will also re-derive it within 1 tick — this is also correct.

The risk is the **first tick**: `perceptionPreludeBuilder` and `worldModelPreludeBuilder` will surface empty/default repair states while `consequenceContext` already knows repair is required. The prelude will contradict itself between the consequence signal and the world/perception signals for one tick.

For a long-running companion relationship, one contradictory prelude tick per restart is low risk. For a system that restarts frequently (crashes, deploys, scaling), this becomes a pattern.

### RISK-03: Lesson Store Drift Is Now Structural [HIGH]

With two lesson stores and no integration point, any lesson learned in one system is invisible to the other. The two stores will accumulate incompatible lesson sets over time. Reconciliation after the fact requires a migration that must handle the column name differences (`origin_event_ids` vs `source_consequence_ids`), type vocabulary differences (13 vs 23 types), and any data already accumulated in production.

The longer this runs, the more expensive the fix.

### RISK-04: event_type Enforcement Creates Silent Failures [MEDIUM]

`runtimeEventBus.js` throws if `event_type` is not in `EVENT_TYPES`. New runtimes must add their event types before emitting. The failure mode is silent: `.catch(() => {})` wrappers on all emit calls swallow the throw. An incorrectly spelled or unregistered event type silently disappears. There is no test for this. The worldModelRuntime emit calls are correct — this is a future extension risk.

### RISK-05: presenceInterpreter Called Twice Per Tick [MEDIUM]

Both `perceptionRuntime.tick()` and `worldModelRuntime.tick()` ultimately call `interpretAlivePresence()` and `interpretExplicitStatement()` in the same tick cycle. These are pure functions with no side effects, so the double-call is safe but wasteful. Under high-frequency ticking, this doubles the inference compute per tick.

---

## 9. Technical Debt

| Debt Item | Severity | Estimated Fix Effort | Consequence of Not Fixing |
|-----------|----------|---------------------|--------------------------|
| Prelude availability/repair contradiction (DEFECT-01, 04) | CRITICAL | 1 day — suppress overlapping fields in perceptionPreludeBuilder when worldModelContext is present | LLM receives contradictory signals on every tick |
| Two lesson stores (DEFECT-03) | CRITICAL | 2-3 days — migrate one table to the other, update all callers | Lesson sets diverge permanently |
| Repair state authority (DEFECT-02) | HIGH | 1 day — add a single `getRepairState()` function that all layers call | Desync on restart, contradictory prelude |
| 26 orphan events | HIGH | 0.5 day — prune undefined events, document the 4 real consumers | Event bus noise, false confidence in observability |
| worldStateStore redundancy | MEDIUM | 1 day — remove after worldModelRuntime is authoritative | Two caches for same signals, different decay rates |
| presenceInterpreter double-call | MEDIUM | 0.5 day — pass derived signals from perceptionRuntime to worldModelRuntime instead of re-deriving | CPU waste per tick |
| Discord send path convention | MEDIUM | 1 day — document as intentional or enforce architecturally | Any runtime with a channel object can bypass gateway |
| selfConsistencyMonitor / evidenceIntegrityRuntime outputs not reacted to | LOW | 2 days — wire outputs into affectiveDecisionRuntime | Integrity checks fire and are silently ignored |

**Total estimated fix effort: ~9-10 days**  
**Cost of waiting**: Each day in production doubles the lesson store divergence and runs another N ticks of prelude contradiction.

---

## 10. Merge Decision

### CONTINUE AFTER FIXES

The Dante architecture is not broken at the core. The runtime separation is correct. The event bus pattern is extensible. The pure function discipline on leaf modules is exemplary. The world model concept is right.

The architecture is broken at the integration layer — specifically at the point where multiple systems inject their view of the same reality into a single LLM prompt with no reconciliation.

### Required Before Neural Integration (Blocking)

**FIX-1: Establish prelude signal authority.**  
`worldModelPreludeBuilder` should be the single source for Jenna availability, repair state, and runtime health in the prelude. `perceptionPreludeBuilder` should suppress these fields when `worldModelContext` is present. This eliminates DEFECT-01 and DEFECT-04 and reduces the prelude contradiction to zero.

**FIX-2: Resolve lesson store split.**  
Designate one store as authoritative. Migrate data and callers. Minimum viable fix: document the split as intentional (two separate learning systems) and prevent any code from expecting cross-system visibility. Full fix: merge tables with a schema that covers all 23+ types under a unified column vocabulary.

**FIX-3: Single repair state accessor.**  
Add a `getRepairState(companionId, customerId)` function (backed by consequenceStore as authority) and route all four layers through it. This eliminates DEFECT-02's desync risk.

### Required Before Production Hardening (Non-blocking but Urgent)

**FIX-4: Prune orphan events.**  
Remove or stub the 26 events with no consumers. Keep repair_started, repair_completed, diagnostic_warning, self_confidence_low. Mark all others as TODO-STUB with a comment if they are intended for future consumers.

**FIX-5: Pass derived signals from perceptionRuntime into worldModelRuntime.**  
Instead of calling `presenceInterpreter` twice, pass `perceptionContext` (which already contains the derived signals) as a primary input into `worldModelRuntime.tick()`. The `perceptionEngine` should consume pre-derived perception signals, not re-derive them.

### What Is Safe to Continue Building

- narrativeIdentityRuntime — sole writer, no competing authorities
- homeostasisRuntime — sole writer
- identityRuntime — sole writer
- fulfillmentRuntime — sole writer
- growthRuntime / curiosityRuntime — sole writers
- affectiveDecisionRuntime — reads multiple sources but does not surface to prelude directly

### What Must Not Be Extended Until Fixed

- Any new prelude builder that surfaces availability, repair state, or runtime health
- Any new runtime that writes to worldStateStore OR worldModelRuntime._beliefMap for the same keys
- Any new lesson type added to only one of the two lesson stores
- Any new event type that requires a consumer (add the consumer first, then the event type)

---

*Audit conducted adversarially: evidence only, no benefit of the doubt. Findings reflect confirmed code paths, not hypothetical risks.*
