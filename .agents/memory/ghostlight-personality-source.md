---
name: Ghostlight personality single-source
description: Where companion personality lives (the Companion tab), why Prompt Profiles were removed, and how adult mode is wired
---

- Companion personality is single-sourced from `config.chat.promptBlocks` (the
  admin **Companion** tab). The one prompt builder (`assembleCompanionPrompt`)
  reads persona/user/tone/etc from promptBlocks and is always used by
  `buildSystemPrompt`. Discord and Second Life build the **identical** persona —
  there is no per-channel persona fork. `assembleCompanionPrompt({config, channelType})`
  ignores any legacy `profile` argument; `channelType` does not change the persona.

- **Prompt Profiles are fully removed.** They previously existed as a
  Second-Life-only OVERLAY (only `secondLifeBehaviorPrompt` + `secondLifeLocalChatPrompt`,
  appended when `channelType === "second_life"`). That overlay, its admin page/nav,
  routes, actions, storage, and the `promptProfileService` module are all deleted.
  `resolveCompanionId` now lives in its own neutral module `src/companion/resolveCompanionId.js`.

**Why:** the SL overlay was the only thing prompt profiles carried, and the
Companion tab already drives the base persona for both channels. Keeping a separate
profile fork risked two sources of truth drifting apart; Second Life should speak
and behave exactly like Discord.

**How to apply:** never reintroduce a per-channel persona fork or a "prompt profile"
store/overlay. All persona/behaviour edits go through the Companion tab
(`config.chat.promptBlocks`). Adult behaviour remains a separate Discord feature:
`config.chat.adultPrivateMode` (channel-bound model/system-prompt/safeword override,
toggled in-channel via the `ln` command in `messageCreate.js`) — do not re-add
privacy-level adult gating to the prompt builder.
