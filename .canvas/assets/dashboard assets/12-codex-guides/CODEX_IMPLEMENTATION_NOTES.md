# CODEX IMPLEMENTATION NOTES

Use these assets to implement the cinematic Nordic dashboard.

## Server-rendered repo reality
The app is server-rendered HTML/CSS, not React/Tailwind.
Use CommonJS renderer helpers and src/http/adminStyles.js.

## Icon mapping
Use `01-icons/icon-map.json` as the semantic mapping source.
Install icon assets under `/assets/nordic-dashboard/icons/...`.

## CSS
Merge or import `10-css/ghostlight-nordic-dashboard.css` into the existing admin CSS entrypoint.
Do not break light/dark toggle. The Nordic redesign should be dark-first.

## Gallery data
The gallery carousel must use existing live data from generatedImages/gallery/media:
- image URL
- thumbnail URL if available
- createdAt
- prompt/caption if available
- source/type if available
- companionId filtering if already implemented

Never use assets in this pack as Dante gallery photos.

## Battle Rhythm module
Use `11-data-seeds/battle-rhythm.json` only if no backend exists.
Keep it isolated and replaceable.

## Recipes module
Use `11-data-seeds/recipe-seeds.json` only if no backend exists.
Recipe photos are static assets and safe for the recipe section.

## Travel Saga / Concierge
Use `11-data-seeds/travel-saga-seed.json` as UI-only starter data.
Only make buttons clickable when a real route/tool exists.
