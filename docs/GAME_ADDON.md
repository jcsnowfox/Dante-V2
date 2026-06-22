# Discord Game Add-On

An interactive game module for the companion bot — lets users play games with the AI companion directly in Discord channels.

## Supported Games

### Core Games (enabled by default)

| Game | Command Value | Description |
|------|--------------|-------------|
| Farkle | `farkle` | Press-your-luck dice game. Roll, set aside scoring dice, and bank before you Farkle. First to 10,000 wins. |
| Blackjack | `blackjack` | Classic card game vs. the dealer (companion). No real money — companion enforces that explicitly. |
| Yahtzee | `yahtzee` | Fill 13 scoring categories across multiple rolls. Upper-section bonus at 63+. |
| Trivia | `trivia` | 50 questions across 9 categories. Companion competes at ~65% accuracy. |
| Mad Libs | `madlibs` | Fill-in-the-blank story templates. 10 templates across adventure, fantasy, sitcom, horror-lite, and chaotic categories. |
| Pictionary | `pictionary` | Emoji/ASCII art drawing challenge. Companion generates clues; human guesses. |
| Chaos Cards | `chaos-cards` | Original prompt + answer card game (not Cards Against Humanity — original content only). |
| Hand & Foot Canasta | `hand-and-foot-canasta` | ⚠️ BETA. Complex Canasta variant. Basic draw/discard only; full rule set is planned. |

### Adult Party Games Pack (disabled by default)

These games require `adultPartyGamesEnabled` in admin settings. All content is original — no material from Dirty Minds, CAH, or other commercial decks.

| Game | Command Value | Description |
|------|--------------|-------------|
| Dirty Double Takes | `dirty-double-takes` | Innocently worded clues that sound suggestive. Guess the wholesome answer. |
| Red/Green/Black Flag | `red-green-black-flag` | Vote on dating/life scenarios with the companion. Green = fine, Red = dealbreaker, Black = nope. |
| Would You Rather: After Dark | `would-you-rather-after-dark` | Awkward choice scenarios for adults. Companion picks too. |

## Discord Commands

All game commands are under `/game`:

| Subcommand | Description |
|-----------|-------------|
| `/game start <name>` | Start a new game in the current channel |
| `/game stop` | Cancel the active game in this channel |
| `/game rules <name>` | Show rules for a game (ephemeral) |
| `/game score` | Show the current game state (ephemeral) |
| `/game resume` | Resume a paused game |
| `/game leaderboard [game]` | Show completed session scores for this server |
| `/game invite` | Have the companion invite you to play a randomly chosen game |
| `/game settings` | Show current game settings (ephemeral) |
| `/game list` | List all currently enabled games |

## Admin Settings

Navigate to **Admin → Games** (`/admin/games`) to configure:

### General Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Games System | On | Master switch. Disabling this prevents all game commands. |
| Max Active Sessions | Unlimited | Cap on concurrent active sessions across the server. |
| Max Game Duration (minutes) | No limit | Sessions older than this are considered expired. |
| Allow Companion Invites | Off | Lets the companion proactively suggest games via autonomy/heartbeat. |
| Game Invite Cooldown | 60 min | Minimum time between companion-initiated invites. |
| Allowed Channels | All | Comma-separated channel IDs that allow games. Blank = all. |
| Blocked Channels | None | Comma-separated channel IDs that never allow games. |

### Adult Party Games Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Adult Party Games | Off | Master switch for the adult games pack. |
| Require Adult/Private Channel | On | Gates adult games to allowed adult channels only. |
| Allow Suggestive Prompts | On (when pack enabled) | Includes suggestive-but-not-explicit content. |
| Allow Explicit Prompts | Off | Enables explicit content (requires adult private channel). |
| Allow Companion Adult Banter | On (when pack enabled) | Companion uses adult-appropriate tone during adult games. |
| Adult Game Invite Cooldown | 180 min | Minimum time between companion-initiated adult game invites. |
| Allowed Adult Game Channels | All adult-enabled | Restrict which channels can run adult games. |
| Blocked Adult Game Channels | None | Channels that never run adult games. |

### Individual Game Toggles

The admin page shows a table of all registered games with per-game enable/disable toggles. Adult games are greyed out unless the adult pack is enabled.

### Active Sessions & Reset

The admin page shows all currently active sessions. Use **Reset All Active Games** to cancel every active session (useful after a crash or stuck game).

## Architecture

```
src/games/
├── index.js                    # createGameSystem() factory
├── gameRegistry.js             # Registers all game modules, alias resolution
├── gameSessionStore.js         # PostgreSQL session persistence (noop if no DB)
├── gameTypes/
│   ├── farkle.js
│   ├── blackjack.js
│   ├── yahtzee.js
│   ├── trivia.js
│   ├── madlibs.js
│   ├── pictionary.js
│   ├── chaosCards.js
│   ├── handAndFootCanasta.js   # BETA
│   ├── dirtyDoubleTakes.js     # Adult
│   ├── redGreenBlackFlag.js    # Adult
│   └── wouldYouRatherAfterDark.js  # Adult
├── discord/
│   ├── gameCommands.js         # /game slash command handler
│   ├── gameButtons.js          # Button interaction handler
│   └── gameEmbeds.js           # EmbedBuilder / ActionRowBuilder helpers
├── ai/
│   ├── gameBanter.js           # LLM-powered companion banter
│   └── companionGamePlayer.js  # Companion turn runner
├── http/
│   ├── renderGameAdminPage.js  # HTML render function
│   └── gameAdminPageHandler.js # GET/POST handlers for /admin/games
├── content/
│   ├── trivia/questions.json
│   ├── madlibs/templates.json
│   ├── chaosCards/promptCards.json
│   ├── chaosCards/answerCards.json
│   └── adultParty/
│       ├── dirtyDoubleTakes.json
│       ├── redGreenBlackFlag.json
│       └── wouldYouRatherAfterDark.json
└── tests/
    └── games.test.js           # node:test suite (60+ tests)
```

## Game Type Interface

Every game module exports an object with this shape:

```js
{
  id: "my-game",                  // unique, kebab-case
  displayName: "My Game",
  description: "Short description",
  category: "card",               // dice, card, trivia, word, party
  rulesText: "Full rules text...",
  supportsCompanionPlayer: true,  // false = companion watches only
  defaultEnabled: true,           // false = off by default
  requiresAdultPartyGames: false, // true = gated behind adult toggle
  isBeta: false,

  createInitialState({ humanPlayerIds, companionId, settings }) → state,
  processAction({ state, action, payload, humanId, companionId }) → { newState, events },
  buildEmbedData({ state, companionName, humanName }) → embedData,
  buildButtons({ state }) → buttons[],
  getCompanionMove({ state }) → { action, payload } | null,
}
```

## Session Persistence

Sessions are stored in the `game_sessions` PostgreSQL table. The bot can restart without losing in-progress games — players can use `/game resume` to pick up where they left off.

When `DATABASE_URL` is not set, the session store runs in noop mode: games still work for the lifetime of the process, but don't survive restarts.

## Safety Notes

- **No gambling**: The Blackjack rules text explicitly states no real money, and the companion enforces this in banter.
- **No adult content by default**: All three adult games are `defaultEnabled: false` and require `adultPartyGamesEnabled` in admin settings plus explicit channel allowlisting.
- **No copyrighted content**: Chaos Cards uses original content (not Cards Against Humanity). Dirty Double Takes uses original clues (not Dirty Minds).
- **Deterministic scoring**: All game mechanics and scoring are handled in deterministic code. The LLM is only used for companion banter and AI player move selection — never for scoring.
- **Privacy-respecting**: Session data stored in the bot's own DB. No data sent to third parties beyond normal LLM API calls.

## Running Tests

```bash
cd artifacts/ghostlight-bot
node --test src/games/tests/games.test.js
```

The test suite covers: registry listing, adult gating, session ID uniqueness, all core game mechanics (farkle scoring, blackjack hand values, yahtzee categories, trivia answers, madlibs filling, chaos cards dealing, pictionary clues), adult game flows (disabled by default, channel gating, content filtering), button custom ID parsing, and copyright compliance checks.

## Future Game Ideas

- **Wordle-style**: Daily word puzzle with the companion giving emoji-style feedback
- **20 Questions**: Companion picks a concept, human asks yes/no questions
- **Story Chain**: Alternating sentences to build a story
- **Music Quiz**: Companion hums a song (if TTS enabled), human guesses
- **Full Hand & Foot Canasta**: Complete rules implementation once the BETA scaffolding is validated
