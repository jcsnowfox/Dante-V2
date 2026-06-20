---
name: Qdrant memory layer — lazy collection creation
description: Why Qdrant retrieval 404s on fresh deploys and the rule for read vs write paths.
---

The Qdrant collection (`ghostlight-memory`, configurable via `QDRANT_COLLECTION`) is created **lazily on the first memory WRITE** — `syncMemories` calls `ensureCollection`, and the vector size is derived from the embedding result (`vectors[0].length`), so the dimension is not known until an embedding exists.

**Consequence / rule:** memory READ paths run on every message, before any write. If a read assumes the collection exists, it 404s (`Collection ... doesn't exist`) and spams warns (4 per message: durable/continuity × primary/continuity lanes). So **read operations in `qdrantClient.js` (`searchPoints`, `scrollPoints`, `getPoints`) must tolerate a missing collection** (`allow404: true` → return empty), treating "no collection" as "no memories yet".

**Why:** you cannot eagerly create the collection at startup without knowing the vector dimension, and hardcoding a dimension is brittle. Lazy-create-on-write + tolerant-reads is the correct split.

**How to apply:** never make WRITE paths 404-tolerant — `ensureCollection`-then-`upsert` is where collection existence is enforced with the right dimension. Keep non-404 errors (500/auth) throwing so real outages stay visible. This also softens missing-collection behavior for other collections sharing these helpers (e.g. music `ghostlight-music`).
