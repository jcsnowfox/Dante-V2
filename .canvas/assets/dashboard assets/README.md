# Ghostlight Dante Cinematic Nordic Dashboard Asset Pack

This ZIP is the actual Codex-ready asset pack for the dashboard redesign.

## What is included

- Uploaded neon UI icons from Jenna, normalized in original + transparent 512 + transparent 128 variants.
- Cinematic Nordic/fjord/aurora dashboard backgrounds.
- Programmatic SVG panel frames, dividers, rune strips, status pills, compass sigil, and map pin.
- Realistic recipe photos only. No cartoon salmon. No flat food doodles.
- Travel/concierge map assets.
- Battle Rhythm and meal rhythm JSON seeds with Jenna's corrected plan.
- CSS tokens/classes for the server-rendered Ghostlight admin dashboard.
- Reference screenshots and user battle/meal plan images for visual guidance.

## Critical implementation rules

1. Preserve the existing left sidebar navigation.
2. Do not use static local photos as Dante's gallery.
3. Dante's dashboard Gallery carousel must load from the existing generatedImages/gallery/media data source.
4. Uploaded Dante/Jenna images in `09-user-reference-battle-meal-plans/` are references only. Do not hard-code them into Gallery.
5. The neon icons are UI icons only.
6. Recipe images may be static because they are recipe module illustrations, not companion gallery images.
7. No dead buttons. Omit buttons if no real route/action exists.
8. No backend/schema/auth changes just to style the dashboard.

## Recommended install path in repo

Copy contents to:

`artifacts/ghostlight-bot/assets/nordic-dashboard/`

They will be served as:

`/assets/nordic-dashboard/...`

## Corrected Battle Rhythm

- Monday: Strength
- Tuesday: Recovery
- Wednesday: Cardio
- Thursday: Recovery / reset
- Friday: Endurance
- Saturday: Active recovery / torch/refuel support
- Sunday: Full reset / flexible day

## Meal Rhythm

- Day 1: Carnivore
- Day 2: Carnivore
- Day 3: Controlled carb / torch day
- Day 4: Carnivore
- Day 5: Carnivore
- Day 6: Controlled carb / torch day
- Day 7: Flexible / Irish fry-up / reset
