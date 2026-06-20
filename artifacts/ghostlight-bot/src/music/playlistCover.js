const sharp = require("sharp");

const SPOTIFY_COVER_MAX_BYTES = 256 * 1024;

async function prepareSpotifyPlaylistCover({
  imageBuffer,
  maxBytes = SPOTIFY_COVER_MAX_BYTES,
} = {}) {
  const source = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || "");

  if (!source.length) {
    throw new Error("Playlist cover image buffer is required.");
  }

  const sizes = [640, 512, 384, 300];
  const qualities = [88, 80, 72, 64, 56, 48, 40, 32];

  for (const size of sizes) {
    for (const quality of qualities) {
      const buffer = await sharp(source)
        .resize(size, size, { fit: "cover" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      if (buffer.length <= maxBytes) {
        return {
          buffer,
          base64: buffer.toString("base64"),
          mimeType: "image/jpeg",
          size,
          quality,
          byteLength: buffer.length,
        };
      }
    }
  }

  throw new Error("Playlist cover image could not be compressed under Spotify's 256 KB limit.");
}

module.exports = {
  SPOTIFY_COVER_MAX_BYTES,
  prepareSpotifyPlaylistCover,
};
