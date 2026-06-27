# Verify Scripts

## Local deterministic runtime proof

Use:

```bash
pnpm --dir artifacts/ghostlight-bot run verify:runtime:all
```

This runs the existing aggregate verification plus deterministic runtime proofs for Life, Growth, Curiosity, Relationship/Consequences, Homeostasis, Identity, Fulfillment, Self-Consistency, Dashboard, Alive, and Runtime Integration.

## External/live proofs

Scripts that require live API keys, Discord connectivity, Qdrant, Postgres, Spotify, or network services remain documented as feature-specific checks and are not folded into `verify:runtime:all` unless they can run deterministically without credentials.
