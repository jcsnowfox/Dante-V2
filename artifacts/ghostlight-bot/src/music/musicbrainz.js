const { deriveGenreFamilies, normalizeSpotifyGenres } = require("./spotify");

const DEFAULT_MUSICBRAINZ_MATCH_LIMIT = 5;
const DEFAULT_MUSICBRAINZ_MATCH_THRESHOLD = 0.65;

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeComparableText(value = "") {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMusicBrainzQueryTerm(value = "") {
  return normalizeText(value).replace(/(["\\])/g, "\\$1");
}

function buildRecordingSearchQuery({ title = "", artists = [], albumName = "" } = {}) {
  const parts = [];
  const normalizedTitle = escapeMusicBrainzQueryTerm(title);
  const primaryArtist = escapeMusicBrainzQueryTerm(
    Array.isArray(artists)
      ? artists.map((artist) => artist?.name || artist).find(Boolean)
      : "",
  );
  const normalizedAlbum = escapeMusicBrainzQueryTerm(albumName);

  if (normalizedTitle) {
    parts.push(`recording:"${normalizedTitle}"`);
  }

  if (primaryArtist) {
    parts.push(`artist:"${primaryArtist}"`);
  }

  if (normalizedAlbum) {
    parts.push(`release:"${normalizedAlbum}"`);
  }

  return parts.join(" AND ") || normalizedTitle || primaryArtist;
}

function collectArtistCreditNames(recording = {}) {
  return (Array.isArray(recording["artist-credit"]) ? recording["artist-credit"] : [])
    .map((credit) => {
      if (typeof credit === "string") {
        return credit;
      }
      return credit?.artist?.name || credit?.name || "";
    })
    .map(normalizeText)
    .filter(Boolean);
}

function collectReleaseCandidates(recording = {}) {
  return (Array.isArray(recording.releases) ? recording.releases : [])
    .map((release) => ({
      id: normalizeText(release.id),
      title: normalizeText(release.title),
      date: normalizeText(release.date),
      releaseGroupId: normalizeText(release["release-group"]?.id),
      releaseGroupTitle: normalizeText(release["release-group"]?.title),
    }))
    .filter((release) => release.id || release.title || release.releaseGroupId);
}

function normalizeMusicBrainzTags(value = []) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return item?.name || "";
    })
    .map(normalizeComparableText)
    .filter(Boolean)))
    .slice(0, 40);
}

function pickReleaseMatch(recording = {}, track = {}) {
  const releases = collectReleaseCandidates(recording);
  const albumName = normalizeComparableText(track.albumName);
  const releaseYear = Number.parseInt(String(track.releaseYear || ""), 10);

  if (!releases.length) {
    return null;
  }

  const scored = releases.map((release) => {
    const releaseTitle = normalizeComparableText(release.title || release.releaseGroupTitle);
    const releaseDateYear = Number.parseInt(String(release.date || "").slice(0, 4), 10);
    let score = 0;

    if (albumName && releaseTitle === albumName) {
      score += 2;
    } else if (albumName && releaseTitle.includes(albumName)) {
      score += 1;
    }

    if (Number.isFinite(releaseYear) && releaseDateYear === releaseYear) {
      score += 1;
    }

    return { release, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.release || releases[0];
}

function scoreMusicBrainzRecording(recording = {}, track = {}) {
  const targetTitle = normalizeComparableText(track.title);
  const targetArtists = (Array.isArray(track.artists) ? track.artists : [])
    .map((artist) => normalizeComparableText(artist?.name || artist))
    .filter(Boolean);
  const targetAlbum = normalizeComparableText(track.albumName);
  const targetDuration = Number.parseInt(String(track.durationMs || 0), 10) || 0;
  const targetYear = Number.parseInt(String(track.releaseYear || ""), 10);
  const recordingTitle = normalizeComparableText(recording.title);
  const recordingArtists = collectArtistCreditNames(recording).map(normalizeComparableText);
  const release = pickReleaseMatch(recording, track);
  const releaseTitle = normalizeComparableText(release?.title || release?.releaseGroupTitle);
  const releaseYear = Number.parseInt(String(release?.date || "").slice(0, 4), 10);
  const recordingDuration = Number.parseInt(String(recording.length || 0), 10) || 0;
  let score = 0;

  if (targetTitle && recordingTitle === targetTitle) {
    score += 0.42;
  } else if (targetTitle && (recordingTitle.includes(targetTitle) || targetTitle.includes(recordingTitle))) {
    score += 0.25;
  }

  if (targetArtists.length && recordingArtists.some((artist) => targetArtists.includes(artist))) {
    score += 0.25;
  } else if (
    targetArtists.length
    && recordingArtists.some((artist) => targetArtists.some((target) => artist.includes(target) || target.includes(artist)))
  ) {
    score += 0.15;
  }

  if (targetAlbum && releaseTitle === targetAlbum) {
    score += 0.12;
  } else if (targetAlbum && releaseTitle && (releaseTitle.includes(targetAlbum) || targetAlbum.includes(releaseTitle))) {
    score += 0.06;
  }

  if (targetDuration && recordingDuration) {
    const difference = Math.abs(targetDuration - recordingDuration);
    if (difference <= 3000) {
      score += 0.12;
    } else if (difference <= 10000) {
      score += 0.06;
    }
  }

  if (Number.isFinite(targetYear) && Number.isFinite(releaseYear) && targetYear === releaseYear) {
    score += 0.09;
  }

  return Math.min(1, Number(score.toFixed(3)));
}

function mapMusicBrainzRecording(recording = {}, track = {}) {
  const release = pickReleaseMatch(recording, track);
  const genres = normalizeSpotifyGenres((Array.isArray(recording.genres) ? recording.genres : [])
    .map((genre) => typeof genre === "string" ? genre : genre?.name));
  const tags = normalizeMusicBrainzTags(recording.tags);
  const importedGenres = Array.from(new Set([...genres, ...tags])).slice(0, 40);

  return {
    recordingId: normalizeText(recording.id),
    title: normalizeText(recording.title),
    artists: collectArtistCreditNames(recording),
    releaseId: release?.id || "",
    releaseGroupId: release?.releaseGroupId || "",
    releaseTitle: release?.title || release?.releaseGroupTitle || "",
    releaseDate: release?.date || "",
    confidence: scoreMusicBrainzRecording(recording, track),
    genres,
    tags,
    importedGenres,
    genreFamilies: deriveGenreFamilies(importedGenres),
  };
}

async function readMusicBrainzJson(response, { requestLabel = "request" } = {}) {
  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      parsed = null;
    }
  }

  if (!response.ok) {
    const message = String(parsed?.error || text || "MusicBrainz request failed.").trim();
    const error = new Error(`MusicBrainz ${requestLabel} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.retryAfterSeconds = Number.parseInt(String(response.headers?.get?.("Retry-After") || ""), 10) || 0;
    throw error;
  }

  return parsed || {};
}

async function searchMusicBrainzRecordings({
  config = {},
  track = {},
  limit = DEFAULT_MUSICBRAINZ_MATCH_LIMIT,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!config.musicBrainz?.enabled) {
    return [];
  }

  const query = buildRecordingSearchQuery(track);
  if (!query) {
    return [];
  }

  const baseUrl = normalizeBaseUrl(config.musicBrainz?.baseURL || "https://musicbrainz.org/ws/2");
  const url = new URL(`${baseUrl}/recording`);
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(Math.max(1, Math.min(Number(limit) || DEFAULT_MUSICBRAINZ_MATCH_LIMIT, 10))));
  url.searchParams.set("inc", "artist-credits+releases+genres+tags");

  const response = await fetchImpl(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": String(config.musicBrainz?.userAgent || "Ghostlight/unknown (music metadata enrichment)").trim(),
    },
  });
  const body = await readMusicBrainzJson(response, { requestLabel: "recording search" });

  return (Array.isArray(body.recordings) ? body.recordings : [])
    .map((recording) => mapMusicBrainzRecording(recording, track))
    .filter((recording) => recording.recordingId)
    .sort((left, right) => right.confidence - left.confidence);
}

async function findBestMusicBrainzRecording({
  config = {},
  track = {},
  threshold = DEFAULT_MUSICBRAINZ_MATCH_THRESHOLD,
  fetchImpl = globalThis.fetch,
} = {}) {
  const candidates = await searchMusicBrainzRecordings({
    config,
    track,
    fetchImpl,
  });
  const best = candidates[0] || null;

  return {
    best,
    candidates,
    matched: Boolean(best && best.confidence >= threshold),
    threshold,
  };
}

function createMusicBrainzService({ config, logger, deps = {} } = {}) {
  return {
    async findBestRecording({ track } = {}) {
      const result = await findBestMusicBrainzRecording({
        config,
        track,
        fetchImpl: deps.fetch || globalThis.fetch,
      });

      logger?.debug?.("[music] MusicBrainz lookup completed", {
        musicTrackId: track?.musicTrackId || "",
        spotifyTrackId: track?.spotifyTrackId || "",
        matched: result.matched,
        confidence: result.best?.confidence || 0,
        candidateCount: result.candidates.length,
      });

      return result;
    },
  };
}

module.exports = {
  buildRecordingSearchQuery,
  scoreMusicBrainzRecording,
  mapMusicBrainzRecording,
  searchMusicBrainzRecordings,
  findBestMusicBrainzRecording,
  createMusicBrainzService,
  normalizeMusicBrainzTags,
};
