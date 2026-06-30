# Bug and Fragility Audit

## Evidence gathered
- Searched runtime and tests for `.catch(`, fake tool text, media attachment handling, `files_count`, no-reply branches, sanitizer continuity labels, and Discord send paths with `rg` across `artifacts/ghostlight-bot/src` and `artifacts/ghostlight-bot/test`.
- Inspected the active Discord send path in `src/bot/events/messageCreate.js`, the chat pipeline in `src/chat/createChatPipeline.js`, sanitizer in `src/chat/promptContextSanitizer.js`, tool loop in `src/chat/pipeline/runToolLoop.js`, and dashboard route handler in `src/http/adminPageHandlers.js`.

## Verified bugs fixed in this pass
1. **Human Simulation dashboard `.catch is not a function` risk.** The Human Simulation page called `.catch()` directly on optional store results. If a store implementation returned a synchronous array, page rendering could throw `TypeError: ...catch is not a function`. Fixed with `safeStoreList`, which accepts sync arrays, promises, thrown errors, and rejections.
2. **No-reply path dropped the turn.** If the chat pipeline returned no text and no files after hidden-thought stripping/media routing, `messageCreate` logged and returned without any user-visible reply. Fixed by sending a clean fallback message.

## Verified existing safeguards retained
- Fake image tool-call leakage is already covered by `replyPromptIntegrity.test.js` and the send path still runs `stripFakeToolLeaks` before Discord output.
- Image provider success with Discord upload failure already sends a failure message rather than pretending the attachment delivered.
- Sanitizer preserves pending media/action continuity labels through `CONTINUITY_STATE_LABEL_RE`.

## Findings documented but not changed
- Many fire-and-forget systems use `.catch(() => {})`. Most are safe when the called function is async, but this remains fragile if implementations change to sync returns. Recommended future cleanup: shared `fireAndForget`/`safeInvoke` helpers.
- Some upload success logs still use attempted file count as proof. Tests now assert actual send payloads include files, but production cannot inspect Discord CDN attachment persistence without Discord API response normalization.
