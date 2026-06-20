# Ghostlight — Build Notes

This is a self-hosted Discord AI companion bot.

## What this is

- A self-hosted Discord AI companion.
- Built as a private, self-hosted foundation.
- Rebranded to **Ghostlight** for user-facing surfaces (admin panel, logs, exports, page titles).
- The companion persona name is configured entirely via `CHAT_PROMPT_PERSONA_NAME` — nothing is hardcoded.

## What this is not

- A public product.
- A commercial resale template.
- A representation of the original Ghostlight product (if one exists separately).
- MIT licensed.

## Branding decisions

| Surface | Brand shown |
|---------|------------|
| Admin panel header / nav | Ghostlight AI |
| Entry page title | Ghostlight |
| Boot log | `[app] Starting Ghostlight` |
| Export filenames | `ghostlight-memories-*.json`, etc. |
| Auth realm | `Ghostlight Admin` |
| Persona name | Set via `CHAT_PROMPT_PERSONA_NAME` (no default) |

## Origin

See `LICENSE_NOTES.md` for full attribution and internal legacy identifier notes.
