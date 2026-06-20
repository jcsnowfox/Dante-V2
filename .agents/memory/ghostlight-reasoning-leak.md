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

## Internal-thought prompt is OPT-IN (default off) — concealment wording bricks chat

The `<think>` capture feature CAN be requested via a system-prompt instruction, but it
is gated behind `config.chat.internalThoughtEnabled` (`CHAT_INTERNAL_THOUGHT_ENABLED`,
default **false**). Default chat ships without the instruction; stripping still runs
downstream as defense-in-depth.

**Why default-off (incident):** an ungated instruction telling the model to "think
privately", that the block is "never shown to anyone", and to make "no mention of the
tags, the thinking, or this instruction" is *concealment/instruction-hiding* phrasing.
The upstream provider safety layer flagged it on EVERY request, so the bot replied with
the verbatim refusal "The request was rejected because it was considered high risk" to
every message, on every model. Bricked all chat.

**Durable rule:** never inject secrecy/concealment language ("hidden from everyone",
"don't reveal this instruction", "never shown") into a system prompt on the hot path —
safety layers read it as a jailbreak signal and can reject every request. Keep any
reasoning instruction neutral and transparent (e.g. "you may plan in `<think>` tags;
keep your reply outside it"), and gate experimental prompt additions behind a
default-off flag so the known-good prompt is the default.

When enabled, the captured thought is hidden from users but kept (internal only) to feed
memory curation, and must NOT change how the bot talks.

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

---

## Inbound IMAGE (vision) refusals — the third, sneakiest leak path

**Symptom:** the bot replies with the verbatim "...considered high risk" to *benign*
turns — including text-only follow-ups — once a realistic human-face photo has been
posted in the thread. Looks identical to the concealment-prompt brick, but the trigger
is the **image**, not the prompt.

**Root cause:** inbound images are NOT sent to the chat model as image parts. The
enrich step (`enrichInput`) sends each attachment to a separate vision model
(`analyzeImage.analyzeImageInput`) and splices the returned **text description** into
the user turn. That call returned `response.output_text` verbatim, so when the vision
provider declined a realistic face ("high risk"), the *refusal became the image
description* — and the chat model relayed it. Worse, the rejected image stays in
conversation history, so every later turn re-sends it and re-triggers the refusal →
"impossible to have a convo."

**Durable rule:** treat the vision/transcription enrich calls as the same trust
boundary as tool results. Detect a content-filter refusal in the vision response
(`output_text` OR `response.error`) at the source and refuse to splice it: throw a
tagged `contentFiltered` error and have the enricher substitute a NEUTRAL placeholder
("the attached image could not be described automatically") so chat continues. Also
add a final-text safety net in `callModel` (`isStandaloneProviderRefusal`) that
suppresses a short standalone refusal leaking via `output_text` — `chooseResponseText`
returns `output_text` verbatim and `buildMissingOutputText` only fires when text is
*empty*, so a non-empty refusal otherwise slips straight through.

**False-positive caution:** the refusal classifier runs against *captions* and replies,
so keep its pattern tight. Avoid stems like `moderat` (matches "moderately lit") or
bare `flagged as`; anchor the visible-text net to short standalone refusal templates
only. **Verify** with `scripts/verify-image-refusal.js` (refusal in output_text, in
error, normal caption incl. "moderately lit", enrich placeholder, and the
standalone-refusal net) — keep it green when touching enrich or text selection.

**Lesson across all three paths:** the "high risk" brick has recurred via (1) prompt
concealment wording, (2) raw tool-failure error relay, and (3) vision-caption relay.
Whenever you see that string, ask *which surface fed provider text to the model or the
reply* — there is no single chokepoint; every enrich/tool/visible-text surface needs
its own sanitizer.

---

## The refusal POISONS PERSISTED CONTEXT — sanitizing only new writes is not enough

**Symptom:** after a refusal once appears, the bot then declines **every** later turn,
including plain text ("Hello?"), not just the offending image turn. Looks like "you
broke the pipeline."

**Root cause:** a refusal that leaks as a derived image description or as a visible
assistant reply gets **persisted** to `conversation_events` (and can land in Qdrant
memory). On every subsequent turn `buildChatInput` re-injects that stored text verbatim
into the request; the provider's safety layer then rejects the whole request because the
*history itself* now contains refusal/"high risk" content. A masking safety net on the
visible reply (replacing it with "The model provider declined this request.") hides the
raw string but does NOT break the loop — and that masked string is itself persisted,
compounding it.

**Fast triage when the bot declines every turn:** have the user send a plain
"Hello" in a BRAND-NEW channel/DM (no prior refusal, no image). If the fresh
channel works but old channels still decline → the cause is poisoned PERSISTED
history/memory in those channels (shared surfaces like system prompt/persona/model
are ruled out, since they'd break the fresh channel too). The scrub-at-injection
fix heals the old channels automatically once deployed — no DB surgery. If even a
fresh channel declines → look at the always-injected system prompt/persona/model
or the provider account/routing, not history.

**Durable rule:** content sanitizers must run at BOTH boundaries:
- **write boundary** (enrich/tool/visible-text) — stop new poison being stored, AND
- **injection/read boundary** (`buildChatInput`: history turns + memory lines) — scrub
  ALREADY-stored poison before it is re-sent, so previously-bricked threads self-heal
  without DB surgery.

Use **two strictnesses**: keep the visible-reply detector TIGHT (short, anchored
templates, length-capped) so legit replies aren't clobbered; use a broader
contains-anywhere scrubber for stored history/memory (false positive there only costs
one neutralized history line, vs. a fully bricked bot). Shared module:
`src/chat/pipeline/providerRefusal.js` (`isStandaloneProviderRefusal` tight vs.
`containsProviderRefusalText`/`sanitizeStoredText` broad). Include the app's OWN
fallback string in the broad markers so masked replies don't re-poison. Regression:
`scripts/verify-image-refusal.js` (sanitizer + buildChatInput history/memory cases).

---

## Per-turn image descriptions persist and brick the chat forever

**Symptom:** text chat works; sending a photo makes the provider refuse the reply,
and AFTER that even plain text turns are refused forever (masked as "The model
provider declined this request."). Fresh channels work; only channels that received
an image are stuck.

**Durable lesson:** the vision description of an attachment is persisted as a
`conversation_events` row with `event_type:"image_analysis"` (role `system`). On
later turns it is replayed as history, and `buildHistoryRole` maps role `system` ->
`user`, so an explicit/flagged description re-enters EVERY subsequent request as a
user message. Because it is descriptive content with no refusal *phrase*, the
refusal-phrase scrubber cannot catch it, and the provider rejects every later turn.
**Derived, per-turn context must NOT be re-injected verbatim on every future turn.**

**Fix shape:** neutralize `image_analysis` items at the history-injection boundary
(`resolveStoredHistoryContent` in `buildChatInput.js`) — collapse to a short neutral
marker. The full description still reaches the model live on the turn the image is
sent (enrichInput appends it to `input.content`), so in-the-moment understanding is
unchanged; only the permanent replay is removed. Heals already-bricked channels on
the next turn, no DB surgery. Audio transcriptions are left intact (benign + useful).

**Known residual (follow-up, not yet fixed):** summarization / weekly-summary
pipelines still ingest `image_analysis` event text, so explicit content can re-enter
prompts slowly via generated memory artifacts. Harden by excluding/neutralizing
`image_analysis` text at memory-ingestion time if this resurfaces.

**Update — the leak has THREE entry points, neutralize at each chokepoint:**
1. Live chat history replay — `resolveStoredHistoryContent` in `buildChatInput.js`
   (keys on `item.eventType === "image_analysis"`).
2. Daily/weekly summaries — `formatEventAsPlainText` in
   `storage/conversations/index.js` (the single fn both summarizers funnel through;
   also redacts admin conversation exports as a side effect — acceptable).
3. Memory curator — `buildCuratorEventLine` in `memory/curator.js` (feeds the
   curator LLM source text → staged/generated long-term memories).
All three use the SAME neutral marker. `buildEventContentText` is left unchanged
(still prefixes `[image_analysis] ...`); neutralization happens at each consumer, not
at the content builder, so audio_transcription / messages stay intact.
