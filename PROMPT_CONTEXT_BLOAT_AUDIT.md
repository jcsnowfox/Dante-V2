# PROMPT_CONTEXT_BLOAT_AUDIT.md

## Active prompt/context construction points
- Chat system prompt: `artifacts/ghostlight-bot/src/chat/prompt/buildSystemPrompt.js`.
- Model context assembly: `artifacts/ghostlight-bot/src/context/modelContextBuilder.js`.
- Chat request assembly: `artifacts/ghostlight-bot/src/chat/pipeline/buildChatRequest.js`.
- Second Life companion prompt: `artifacts/ghostlight-bot/src/companion/assembleCompanionPrompt.js`.
- Continuity/emotional/relational prelude builders under `src/continuity/*` and `src/companionSystems/*/*PreludeBuilder.js`.

## Bloat risks found
| Area | Risk | Estimated token impact | Action |
| --- | --- | --- | --- |
| Multiple context builders | World/time/memory/relationship context may be assembled in more than one stage | medium-high | needs human review |
| Prelude builders | Emotional, relational, feedback, continuity, and alive layers can stack adjacent guidance | medium | keep; behavior-sensitive |
| Prompt audit/debug capture | Debug metadata can grow if inserted into live prompt paths | medium | verify in future pass |
| Second Life prompt path | Separate prompt assembly may duplicate identity/context from Discord path | medium | needs human review |

## Changes made
No persona, prompt, or runtime context semantics were changed. The only cleanup was removal of stale root verifier scripts.

## Safe consolidation plan
1. Add prompt section IDs and a duplicate-section guard around final assembled context.
2. Snapshot prompt output before/after with golden tests.
3. Only remove byte-identical duplicate sections.
4. Keep Dante identity, relationship-quality rules, and safety/personality constraints intact.
