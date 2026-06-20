---
name: Model reasoning/chain-of-thought leaking into Discord replies
description: Why the bot can post the model's internal analysis as the visible reply, and how to think about the fix
---

**Symptom:** the bot posts its own internal monologue ("The user is asking... I
should respond in character...") as plain prose before the actual reply.

**Durable lesson:** the visible Discord reply is only as clean as the text
*extractor*. When pulling text out of a model response's `output[]` array, you must
key on each item's `type` — never collect every item's `text`/`content` blindly, or
`type:"reasoning"` items get concatenated into the user-facing reply. `reasoning:
{ exclude: true }` on the request does NOT guarantee this: some models still return a
reasoning item, or inline analysis straight into content.

**Two-layer defense (keep both):**
1. Drop `type:"reasoning"` output items / nested content blocks in the extractor —
   this is the real fix for structured reasoning.
2. Strip tag-wrapped reasoning (`<think>`, `<reasoning>`, `<analysis>`, etc.) from the
   final reply for models that inline reasoning as tags.

**Known limits / tradeoffs:**
- Untagged chain-of-thought dumped directly into `message.content` cannot be
  deterministically separated — the genuine fix there is selecting a non-reasoning
  chat model for the Discord path.
- Tag-stripping runs anywhere in the text, so a reply that *legitimately* contains
  those literal XML-ish tags (tutorials, examples) would lose them. Acceptable for a
  companion persona; revisit (narrow to leading-only / provider-marked blocks) if real
  false positives appear.

**Verify** with the exported `collectResponseOutputTextParts` / `chooseResponseText`
/ `stripReasoningMarkup` from a tiny node harness — no DB or Discord token needed.
There is now a dedicated `scripts/verify-reasoning-strip.js` harness — keep its
malformed-tag cases green when touching the sanitizer.

---

## Intentional thought capture for memory curation (now the design, not a bug)

The reasoning tags are now *deliberately requested*: the system prompt instructs the
model to wrap private reasoning in `<think>...</think>` before its visible reply. That
thought is ALWAYS hidden from users but captured (internal only) to feed memory
curation. It must NOT change how the bot talks.

**Durable rules:**
- `stripReasoningMarkup` (visible text) and `extractReasoningMarkup` (private thought)
  must stay **exact inverses** and **iterate until stable** — whatever one removes, the
  other captures. First-match-only handling leaks on repeated/malformed dangling tags
  (e.g. `a</think>b</think>c`). Any sanitizer change needs symmetric regression cases.
- The captured thought rides `reply.internalThought` → assistant event
  `metadata.internalThought` → curator event line. The curator surfaces it **only for
  assistant-role events** (a user event must never expose a thought line).
- **Every reply-producing channel must strip**, not just Discord. The Second Life path
  (`secondLifeReplyGenerator`) returns raw `modelOutput.text`, so it has to strip +
  capture itself — the prompt instruction is global, so an unstripped surface leaks.
- A `<think>`-only response yields empty visible content. The Discord sender must bail
  out gracefully when there's nothing sendable (no chunks, no files) or it
  null-derefs the un-sent message when recording the assistant event.
- Dev-mode `overrideSystemPrompt` skips the instruction (no tags emitted) — acceptable;
  stripping still runs downstream as defense-in-depth.

---

## Tool-failure errors leaking as the visible reply

**Symptom:** a failed tool (e.g. image gen refused by the provider's safety system —
"The request was rejected because it was considered high risk") made the bot post that
raw provider error string as its whole Discord reply, so it looked like it "stopped
answering."

**Root cause:** failed tool results (`{ ok:false, error: <provider message> }`) are
serialized back to the model as JSON. There was guidance for *successful* image/audio
but none for *failures*, so the model just relayed the raw error verbatim.

**Durable rule:** the model-facing tool-result serializer is the trust boundary. Strip
raw provider/safety error text there (classify into a `failureReason` like
`declined_by_content_filter` and drop the raw `.error`) so the model physically cannot
paste it; keep ordinary `tool_error` messages so the model can self-correct. Pair this
with explicit failure guidance ("ok:false means it failed — never quote raw error/
system text, stay in character, offer an alternative"). Raw errors still go to logs
upstream, not to the model. **Why:** any provider text the model can see, it may relay.
