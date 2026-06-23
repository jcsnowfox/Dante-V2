const assert = require("node:assert/strict");
const test = require("node:test");

const { searchMusicLibrary, createMusicLibraryService } = require("./library");

test("music library search falls back to local imported tracks when vector search fetch fails", async () => {
  const result = await searchMusicLibrary({
    config: {
      qdrant: { url: "https://qdrant.test", musicCollection: "music" },
      llm: { embedding: { apiKey: "test-key", model: "embedding-model" } },
    },
    query: "star song",
    userScope: "user",
    limit: 2,
    deps: {
      embedTexts: async () => [[0.1, 0.2, 0.3]],
      searchPoints: async () => {
        throw new Error("fetch failed");
      },
      store: {
        async listTracks() {
          return [
            {
              musicTrackId: "track-1",
              spotifyTrackId: "spotify-1",
              spotifyUri: "spotify:track:spotify-1",
              spotifyUrl: "https://open.spotify.com/track/spotify-1",
              title: "Star Song",
              artists: [{ name: "Dante" }],
              albumName: "Fallbacks",
              albumReleaseDate: "2026",
              releaseYear: 2026,
              artistGenres: ["indie"],
              genreFamilies: ["indie"],
              userGenres: [],
              musicBrainzTags: [],
            },
          ];
        },
      },
    },
  });

  assert.equal(result.localFallbackUsed, true);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].title, "Star Song");
  assert.match(result.warnings[0], /local imported-library keyword fallback/);
});

test("music library service remains searchable with local storage when Qdrant is unavailable", () => {
  const service = createMusicLibraryService({
    config: {},
    store: {
      persistenceEnabled: true,
      listTracks: async () => [],
    },
  });

  assert.equal(service.canSearch(), true);
});
