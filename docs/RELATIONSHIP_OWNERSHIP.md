# Relationship Ownership

Dante's relationship state is domain-specific at write time and canonical at read time.

## Domain writers

- `relationshipWeatherEngine`: slow emotional weather.
- `relationalConsequencesEngine`: repair, give-space, consequence, and suppression marks.
- `sharedHistoryEngine`: remembered shared events.
- `ritualEngine` / `traditionEngine`: repeated relational practices.
- `anniversaryEngine`: dated milestones.
- `insideJokeEngine`: recurring private humour.
- `relationshipTimelineEngine`: current chapter.
- Legacy continuity/promise systems retain their existing tables and commands.

## Canonical read model

`src/lifeRuntime/relationshipStateRuntime.js` is the canonical read-only relationship snapshot. It does not write relationship data and does not duplicate domain logic. It composes the domain outputs into:

`weather`, `consequences`, `repair`, `giveSpace`, `rituals`, `traditions`, `milestones`, `promises`, `timelineChapter`, `insideJokes`, and `sourceHealth`.

Life Runtime consumes this snapshot for safe status, self-consistency relationship checks, and downstream runtime context where low-risk.
