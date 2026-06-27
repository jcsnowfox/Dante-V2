"use strict";

/**
 * resourceDiscoveryRuntime
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Wraps resourceDiscoveryEngine (raw discovery) + resourceLibraryStore
 * (Dante's personal relationship with resources). Adds:
 *   - "think Jenna would like" tagging
 *   - personal library curation
 *   - status lifecycle management
 *
 * Does NOT replace resourceDiscoveryEngine. That engine remains owned by
 * homeostasisRuntime. This runtime manages Dante's personal library layer on
 * top of discovered resources.
 */

function createResourceDiscoveryRuntime({
  resourceDiscoveryEngine = null,
  resourceLibraryStore    = null,
  logger                  = null,
} = {}) {


  function rankResourcesByPreferences(resources = [], preferences = [], dislikes = []) {
    return [...resources].sort((a, b) => scoreResource(b, preferences, dislikes) - scoreResource(a, preferences, dislikes));
  }

  function scoreResource(resource = {}, preferences = [], dislikes = []) {
    const haystack = `${resource.title || ""} ${resource.author || ""} ${resource.note || ""} ${resource.whyRelevant || ""}`.toLowerCase();
    let score = 0;
    for (const pref of preferences || []) {
      const item = String(pref.item || pref.value || "").toLowerCase();
      if (item && haystack.includes(item)) score += Number(pref.strength || pref.weight || 1);
    }
    for (const dislike of dislikes || []) {
      const item = String(dislike.item || dislike.value || "").toLowerCase();
      if (item && haystack.includes(item)) score -= Number(dislike.strength || dislike.weight || 1);
    }
    return score;
  }

  async function init() {
    if (resourceDiscoveryEngine?.init) await resourceDiscoveryEngine.init().catch(() => {});
    if (resourceLibraryStore?.init)    await resourceLibraryStore.init().catch(() => {});
  }

  /**
   * addToLibrary — promote a discovered resource into the personal library.
   * Source must be a real discovery (e.g., from webSearch result), never fabricated.
   */
  async function addToLibrary({
    companionId, customerId, resourceType, title, author = "", url = "",
    note = "", whyRelevant = "", source = "discovery", jennaTag = false, metadata = {},
  } = {}) {
    if (!resourceLibraryStore) return null;
    if (!title) return null;

    const valence = jennaTag ? "jenna_would_like" : "found";

    const entry = await resourceLibraryStore.add({
      companionId, customerId, resourceType, title, author, url, note,
      valence, source, whyRelevant, jennaTag, metadata,
    }).catch(() => null);

    if (entry && resourceDiscoveryEngine) {
      await resourceDiscoveryEngine.addResource({
        companionId, customerId, resourceType, title, author, url,
        source, summary: note, whyRelevant,
      }).catch(() => {});
    }

    return entry;
  }

  /**
   * getLibrary — Dante's personal library, filtered by valence/status.
   */
  async function getLibrary({ companionId, customerId, valence = null, status = null, limit = 20 } = {}) {
    if (!resourceLibraryStore) return [];
    return resourceLibraryStore.getLibrary({ companionId, customerId, valence, status, limit }).catch(() => []);
  }

  /**
   * markWantToRead — tag a discovered resource as "want to read later".
   */
  async function markWantToRead({
    companionId, customerId, resourceType, title, author = "", url = "",
    whyRelevant = "", source = "discovery",
  } = {}) {
    if (!resourceLibraryStore) return null;
    return resourceLibraryStore.add({
      companionId, customerId, resourceType, title, author, url,
      valence: "want", source, whyRelevant,
    }).catch(() => null);
  }

  /**
   * tagForJenna — mark an existing library item as "Jenna would like this".
   */
  async function tagForJenna({ id, companionId, customerId } = {}) {
    if (!resourceLibraryStore) return null;
    return resourceLibraryStore.tagForJenna({ id, companionId, customerId }).catch(() => null);
  }

  /**
   * markConsuming — Dante has started consuming this resource.
   */
  async function markConsuming({ id, companionId, customerId } = {}) {
    if (!resourceLibraryStore) return null;
    return resourceLibraryStore.updateStatus({ id, companionId, customerId, status: "consuming" }).catch(() => null);
  }

  /**
   * markCompleted — Dante finished this resource.
   */
  async function markCompleted({ id, companionId, customerId } = {}) {
    if (!resourceLibraryStore) return null;
    return resourceLibraryStore.updateStatus({ id, companionId, customerId, status: "completed" }).catch(() => null);
  }

  /**
   * getLibrarySummary — compact summary for status endpoint.
   */
  async function getLibrarySummary({ companionId, customerId } = {}) {
    if (!resourceLibraryStore) return null;
    try {
      const [totalFound, totalWant, jennaTagged] = await Promise.all([
        resourceLibraryStore.count({ companionId, customerId, valence: "found" }),
        resourceLibraryStore.count({ companionId, customerId, valence: "want" }),
        resourceLibraryStore.count({ companionId, customerId, valence: "jenna_would_like" }),
      ]);
      return { totalFound, totalWant, jennaTagged };
    } catch {
      return null;
    }
  }

  async function pruneOlderThan({ companionId, customerId, days = 180 } = {}) {
    const r1 = resourceLibraryStore
      ? await resourceLibraryStore.pruneOlderThan({ companionId, customerId, days }).catch(() => 0)
      : 0;
    const r2 = resourceDiscoveryEngine
      ? await resourceDiscoveryEngine.pruneOlderThan?.({ companionId, customerId, days }).catch(() => 0) ?? 0
      : 0;
    return r1 + r2;
  }

  return {
    init, addToLibrary, getLibrary, markWantToRead,
    tagForJenna, markConsuming, markCompleted,
    getLibrarySummary, pruneOlderThan, rankResourcesByPreferences, scoreResource,
  };
}

module.exports = { createResourceDiscoveryRuntime };
