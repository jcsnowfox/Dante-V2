const assert = require("node:assert/strict");
const test = require("node:test");

const {
  fetchSpotifyPlaylistTracks,
  markSpotifyPlaylistImportability,
} = require("./spotify");

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

test("playlist item 403 explains Spotify owner/collaborator import restriction", async () => {
  await assert.rejects(
    () => fetchSpotifyPlaylistTracks({
      config: { spotify: { apiBaseURL: "https://api.spotify.test/v1" } },
      accessToken: "token",
      playlistId: "public-but-not-owned",
      fetchImpl: async () => jsonResponse({ error: { message: "Forbidden" } }, { status: 403 }),
    }),
    /only exposes playlist items through the API when the connected account owns the playlist or is a collaborator/,
  );
});

test("playlist importability allows any Spotify playlist returned by the current-user playlists endpoint", () => {
  const connection = { spotifyUserId: "current-user" };

  assert.equal(markSpotifyPlaylistImportability({ ownerId: "current-user", collaborative: false }, connection).importable, true);
  assert.equal(markSpotifyPlaylistImportability({ ownerId: "someone-else", collaborative: true }, connection).importable, true);

  const followedPublic = markSpotifyPlaylistImportability({ ownerId: "someone-else", collaborative: false }, connection);
  assert.equal(followedPublic.importable, true);
  assert.equal(followedPublic.importUnavailableReason, "");
  assert.equal(followedPublic.ownedByConnectedAccount, false);
});
