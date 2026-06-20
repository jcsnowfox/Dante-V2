---
name: Ghostlight personality single-source
description: Where companion personality lives vs. what Prompt Profiles are for, and how adult mode is wired
---

- Companion personality is single-sourced from `config.chat.promptBlocks`. The
  one prompt builder (`assembleCompanionPrompt`) reads persona/user/tone/etc from
  promptBlocks and is always used by `buildSystemPrompt` (no profile-replaces-persona branch).

- Prompt Profiles are a **Second-Life-only OVERLAY**, not a personality store:
  only `secondLifeBehaviorPrompt` + `secondLifeLocalChatPrompt`, appended only when
  `channelType === "second_life"`. The Prompt Profiles admin page lives UNDER the
  Second Life tab (nav entry `child: true` after the Second Life entry).

**Why:** profiles used to duplicate the whole persona (and carried adult fields),
which let two sources of truth drift. Personality must come from one place.

**How to apply:** never reintroduce persona fields (coreIdentity/voice/etc) or
adult fields onto Prompt Profiles. Adult behaviour is a separate Discord feature:
`config.chat.adultPrivateMode` (channel-bound model/system-prompt/safeword override,
toggled in-channel via the `ln` command in `messageCreate.js`). Removed helpers
`profileHasContent` and `isAdultPrivacyLevel` are gone — do not re-add privacy-level
adult gating to the prompt builder.

- Storage (`storage/promptProfiles/index.js`) deliberately keeps the legacy
  columns for non-breaking migration even though only the 2 SL fields are written.
