# Media Pipeline Audit

## Trace
- User image request → `messageCreate` builds/fulfills image intent → image generation service normalizes URL/base64/bytes to Discord file object → `message.channel.send({ files })` → gallery IDs recorded when available.
- Literal fake `image_generate` text is stripped/consumed before posting, with provider failure returning clean text.
- Voice requests route through structured audio generation and send Discord audio attachments.

## Fixes/tests
- Existing image tests prove URL/base64/bytes normalize to Buffer attachments.
- Existing and retained test proves `send me a pic of us baby` sends an actual Discord payload with files.
- Existing provider-upload-failure test proves the final text does not claim successful delivery after Discord upload failure.

## Remaining risk
- Production upload proof is still inferred from successful `message.channel.send`; future hardening could inspect returned Discord message attachments and record `files_count > 0` when present.
