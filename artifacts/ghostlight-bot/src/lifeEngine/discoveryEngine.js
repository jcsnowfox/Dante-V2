/**
 * lifeEngine/discoveryEngine
 *
 * Phase 16 — discovery.
 *
 * The companion can discover, bookmark, rate, favorite and journal about places.
 * The hard rule (spec): NEVER fake a discovery. A place only enters the log when
 * it was actually visited, registered, or imported — `recordVisit` is the single
 * write path and it forces `visited = true`. Recommendations are only ever drawn
 * from real, visited entries.
 *
 * With no database every method degrades to a safe no-op / empty list so the
 * bridge keeps working without persistence.
 */

const VALID_SOURCES = ["visited", "registered", "imported"];

function asText(value) {
  return value == null ? "" : String(value);
}

/**
 * Build a stable de-dup key from region + name. Returns "" when there is nothing
 * real to key on — callers must refuse to record in that case (no fake places).
 */
function makePlaceKey({ name = "", region = "" } = {}) {
  const slug = `${asText(region).trim().toLowerCase()}::${asText(name).trim().toLowerCase()}`
    .replace(/[^a-z0-9:]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "::" ? "" : slug;
}

function createDiscoveryEngine({ secondLife = null, config = null, logger = null } = {}) {
  function hasStore(method) {
    return secondLife && typeof secondLife[method] === "function";
  }

  /**
   * Record a genuine discovery. Requires a real name or region and a valid
   * source. Returns null (records nothing) for anything that would be a fake.
   */
  async function recordVisit({ companionId, name = "", region = "", coordinates = {}, source = "visited", tags = [] } = {}) {
    const cleanSource = VALID_SOURCES.includes(asText(source)) ? asText(source) : "visited";
    const placeKey = makePlaceKey({ name, region });
    if (!placeKey) {
      logger?.debug?.("[life-engine] discovery skipped — no real place to record.");
      return null;
    }
    if (!hasStore("upsertDiscovery")) return null;
    try {
      return await secondLife.upsertDiscovery({
        companionId,
        placeKey,
        name,
        region,
        coordinates,
        source: cleanSource,
        tags,
      });
    } catch (error) {
      logger?.warn?.("[life-engine] recordVisit failed.", { error: error.message });
      return null;
    }
  }

  async function bookmark({ companionId, placeKey, bookmarked = true }) {
    if (!hasStore("setDiscoveryBookmark") || !placeKey) return null;
    try {
      return await secondLife.setDiscoveryBookmark({ companionId, placeKey, bookmarked });
    } catch (error) {
      logger?.warn?.("[life-engine] bookmark failed.", { error: error.message });
      return null;
    }
  }

  async function rate({ companionId, placeKey, rating = 0 }) {
    if (!hasStore("setDiscoveryRating") || !placeKey) return null;
    try {
      return await secondLife.setDiscoveryRating({ companionId, placeKey, rating });
    } catch (error) {
      logger?.warn?.("[life-engine] rate failed.", { error: error.message });
      return null;
    }
  }

  async function setFavorite({ companionId, placeKey, isFavorite = true }) {
    if (!hasStore("setDiscoveryFavorite") || !placeKey) return null;
    try {
      return await secondLife.setDiscoveryFavorite({ companionId, placeKey, isFavorite });
    } catch (error) {
      logger?.warn?.("[life-engine] setFavorite failed.", { error: error.message });
      return null;
    }
  }

  async function share({ companionId, placeKey, shared = true }) {
    if (!hasStore("setDiscoveryShared") || !placeKey) return null;
    try {
      return await secondLife.setDiscoveryShared({ companionId, placeKey, shared });
    } catch (error) {
      logger?.warn?.("[life-engine] share failed.", { error: error.message });
      return null;
    }
  }

  async function listRecent({ companionId, limit = 20 } = {}) {
    if (!hasStore("listDiscoveries")) return [];
    try {
      return await secondLife.listDiscoveries({ companionId, limit });
    } catch (error) {
      logger?.warn?.("[life-engine] listDiscoveries failed.", { error: error.message });
      return [];
    }
  }

  async function listFavorites({ companionId, limit = 20 } = {}) {
    if (!hasStore("listDiscoveries")) return [];
    try {
      return await secondLife.listDiscoveries({ companionId, favoritesOnly: true, limit });
    } catch (error) {
      logger?.warn?.("[life-engine] listFavorites failed.", { error: error.message });
      return [];
    }
  }

  /**
   * Pick one real place worth recommending — highest rated / favorited among
   * actually-visited entries. Returns null when there is nothing genuine to
   * suggest (so the companion never invents a place).
   */
  async function recommend({ companionId } = {}) {
    const places = await listRecent({ companionId, limit: 50 });
    const real = places.filter((p) => p && p.visited);
    if (!real.length) return null;
    real.sort((a, b) => {
      const favDelta = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
      if (favDelta !== 0) return favDelta;
      return (b.rating || 0) - (a.rating || 0);
    });
    return real[0];
  }

  /**
   * Journal a real discovery into the shared life journal. Refuses to journal
   * places that were not actually visited.
   */
  async function journalDiscovery({ companionId, discovery } = {}) {
    if (!discovery || !discovery.visited) return null;
    if (!hasStore("appendJournalEntry")) return null;
    const where = asText(discovery.name) || asText(discovery.region) || "a new place";
    try {
      return await secondLife.appendJournalEntry({
        companionId,
        entryType: "discovery",
        title: `Discovered ${where}`,
        body: `I spent time at ${where}${discovery.region ? ` in ${discovery.region}` : ""}.`,
        locationContext: { name: discovery.name, region: discovery.region, coordinates: discovery.coordinates },
      });
    } catch (error) {
      logger?.warn?.("[life-engine] journalDiscovery failed.", { error: error.message });
      return null;
    }
  }

  return {
    recordVisit,
    bookmark,
    rate,
    setFavorite,
    share,
    listRecent,
    listFavorites,
    recommend,
    journalDiscovery,
    makePlaceKey,
    VALID_SOURCES,
  };
}

module.exports = {
  createDiscoveryEngine,
  makePlaceKey,
  VALID_SOURCES,
};
