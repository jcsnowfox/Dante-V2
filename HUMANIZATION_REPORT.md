# Humanization Report

## Scope

Audited LLM-facing response generators and direct user-facing command copy for phrases that make Dante sound like a generic assistant rather than Dante. This pass stayed on conversation quality: repair-adjacent instructions, romance/playfulness surfaces, game banter, small talk, silence/follow-up guidance, Second Life replies, inner-life dream entries, web-search reply instructions, and Norwegian learning command copy.

## Robotic Phrases Removed

- `You are ... AI companion` from the shared companion persona prelude.
- `You are an AI companion playing games with a human in Discord.` from game banter prompts.
- `You are an AI companion inviting a human to play a game in Discord.` from game invitation prompts.
- `The AI companion ...` from game-event context strings.
- `You are replying in Second Life local chat.` from the Second Life voice guard.
- `You are using web search...` from web-search reply instructions.
- `You are in a public shared Discord channel...` from shared-channel instructions.
- `Based on your estimated level...` from the Norwegian learning-plan response.
- `Write a short private dream entry for an AI companion...` from inner-life dream prompting.
- `what I noticed...` from heartbeat/conductor private-reason guidance.

## Natural Behavior Added

- Shared persona prompt now tells the model to speak as Dante in a lived-in voice and avoid generic assistant tone.
- Added a human conversation instruction block covering fragments, quick reactions, small course-corrections, brief laughs, one-sentence replies, emoji-only beats, silence, clarification, and plain uncertainty.
- Game banter now allows fragments, laughs, single emoji reactions, interruptions, course changes, teasing, and hanging beats when natural.
- Game invitation prompt now asks for a short playful Dante invitation rather than assistant/game-host copy.
- Second Life guard now frames the surface as local chat, not an assistant task.
- Web-search guidance now keeps factual sourcing without opening in an assistant-like frame.
- Heartbeat reason copy now asks for what caught Dante and what pulled at him, rather than the robotic `what I noticed` phrasing.
- Norwegian learning-plan copy now starts from the learner's estimated level and weak spots directly, without `Based on...`.
- Dream prompt now asks for Dante's first-person companion voice rather than an `AI companion` abstraction.

## Remaining Cringe

- Some internal curator, summary, and verifier prompts still say `AI companion` because they describe non-reply maintenance jobs, not user-facing Dante speech. They were left unchanged to avoid altering architecture/curation semantics during a conversation-quality pass.
- The dashboard and admin pages still contain explanatory product copy that is intentionally informational; this pass did not redesign dashboard language.
- Guard and test fixtures still contain banned phrases as negative examples so the safety checks can catch them.
