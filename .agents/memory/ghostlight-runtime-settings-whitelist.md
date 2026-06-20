---
name: Ghostlight runtime-settings whitelist gate
description: Why a setting can "save" yet never apply/render in the ghostlight-bot admin UI.
---

A DB-persisted admin setting will silently fail to take effect unless its key is
listed in `EDITABLE_RUNTIME_SETTINGS` in `src/config/runtimeSettings.js`.

**Why:** Both `applyRuntimeSettings()` (write into in-memory `config`) and
`extractRuntimeSettings()` (build the `runtimeSettings` map the admin pages
render from) only iterate that whitelist. A handler can `upsertSettings(...)` a
key into the `app_settings` table successfully (user sees a success banner), but
if the key is not whitelisted it is never applied to `config` and never read
back — render helpers see empty. Symptom: "Saved." yet the value never appears,
even after a fresh page load or restart.

**How to apply:** When adding any new admin-editable setting (e.g. a new
`chat.promptBlocks.*` field, an avatar/image data URL, a toggle), add an entry
with `key`, `path` (nested config path), and a `normalize` fn. Use a plain
`String(value || "").trim()` normalize for free-text / data-URL values — do NOT
add a length `.slice()` that would truncate base64 payloads.
