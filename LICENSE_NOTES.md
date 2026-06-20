# Licence Notes — Ghostlight Build

This repository is a **private deployment** built from a private
companion-core foundation.

## Origin attribution

| Item | Detail |
|------|--------|
| Upstream base | Private companion-core foundation |
| Original licence gate | Removed (CORE_LICENSE_KEY check stubbed out in `src/license/index.js`) |
| Original licence server | Removed (no longer required) |
| Product identifier | `ghostlight-core` (in `src/license/index.js`) |

## This build

- User-facing branding has been changed to **Ghostlight**.
- This is **not** a resale template, a commercial fork, or a generic public release.
- The word "Ghostlight" refers to this private build's brand identity only.
- No claim is made that this is the original Ghostlight source or that the
  underlying base is MIT.

## Package licence

The bot package (`artifacts/ghostlight-bot/package.json`) is set to
`"license": "UNLICENSED"` — this is a private build and is not distributed under
any open-source licence. (The root workspace `package.json` retains the template's
`"license": "MIT"`, which covers only the monorepo scaffolding, not the bot.)

## Internal identifiers

This is a **fresh template** with no existing deployment data to migrate, so all
functional identifiers were renamed to Ghostlight, including the workspace
package (`@workspace/ghostlight-bot`), the folder path (`artifacts/ghostlight-bot/`),
the admin cookie name, the Qdrant collection defaults (`ghostlight-memory` /
`ghostlight-music`), and the memory-queue sourceKind values.

All functional identifiers use the Ghostlight namespace:

| Identifier | Location | Notes |
|------------|----------|--------------|
| `LICENSE_PRODUCT = "ghostlight-core"` | `src/license/index.js` | Product identifier for this build |
