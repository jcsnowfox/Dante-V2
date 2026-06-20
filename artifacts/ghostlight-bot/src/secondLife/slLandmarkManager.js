/**
 * secondLife/slLandmarkManager
 *
 * Phase 11 — the landmark / teleport system.
 *
 * Landmarks are configurable from the dashboard and persisted in
 * `second_life_landmarks`. Each landmark has:
 *   - trigger: a "!" command token (e.g. "!home", "!beach") for explicit teleport
 *     commands. The "!home" landmark is also reachable via the home flag.
 *   - region + coordinates: the in-world teleport target the relay drives to.
 *   - tags: free-form situational tags used by autonomous selection.
 *   - isPrivate: a private landmark only autonomy/non-owners can reach when
 *     explicitly allowed (allowedRelationships) — owners always may.
 *   - isHome: marks the home landmark (a single one; the store enforces it).
 *   - favoriteScore: weights autonomous selection toward favourite places.
 *
 * IMPORTANT: there are NO default landmarks. Landmarks are region-specific and
 * must be entered by the owner; the companion must never fake a visit to a place
 * it has no stored coordinates for. With no database every accessor returns
 * empty so the bridge degrades safely (resolve returns "unknown", autonomy
 * returns null).
 */

function asText(value) {
  return value == null ? "" : String(value);
}

function createLandmarkManager({ secondLife = null, config = null, logger = null } = {}) {
  /**
   * Decide whether `relationship` (a resolved identity carrying { tier, isOwner })
   * may teleport the companion to `landmark`. Private landmarks require the owner
   * or an explicitly allowed relationship tier.
   */
  function decide({ landmark, relationship }) {
    if (!landmark) return { allowed: false, reason: "unknown" };
    if (landmark.enabled === false) return { allowed: false, reason: "disabled" };

    const tier = asText(relationship?.tier) || (relationship?.isOwner ? "owner" : "stranger");
    const isOwner = relationship?.isOwner === true || tier === "owner";

    if (tier === "blocked") return { allowed: false, reason: "blocked" };
    if (isOwner) return { allowed: true, reason: "ok" };

    const allowed = Array.isArray(landmark.allowedRelationships) ? landmark.allowedRelationships : [];
    if (landmark.isPrivate) {
      if (allowed.length === 0 || !allowed.includes(tier)) {
        return { allowed: false, reason: "private" };
      }
      return { allowed: true, reason: "ok" };
    }
    // Public landmark: if an allow-list is set, honour it; otherwise allow.
    if (allowed.length > 0 && !allowed.includes(tier)) {
      return { allowed: false, reason: "relationship_not_allowed" };
    }
    return { allowed: true, reason: "ok" };
  }

  /**
   * Resolve a trigger to a landmark and a permission decision.
   * Returns { landmark, allowed, reason }. Unknown triggers return
   * { landmark: null, allowed: false, reason: "unknown" } — there are no default
   * landmarks to fall back on.
   */
  async function resolveLandmark({ companionId, trigger, relationship = null } = {}) {
    const t = asText(trigger).toLowerCase();
    if (!t) return { landmark: null, allowed: false, reason: "no_trigger" };

    let landmark = null;
    if (secondLife && typeof secondLife.getLandmarkByTrigger === "function") {
      try {
        landmark = await secondLife.getLandmarkByTrigger({ companionId, trigger: t });
      } catch (error) {
        logger?.warn?.("[second-life] landmark lookup failed.", { error: error.message });
        landmark = null;
      }
    }
    if (!landmark) return { landmark: null, allowed: false, reason: "unknown" };

    const { allowed, reason } = decide({ landmark, relationship });
    return { landmark, allowed, reason };
  }

  async function getHome({ companionId } = {}) {
    if (!secondLife || typeof secondLife.getHomeLandmark !== "function") return null;
    try {
      return await secondLife.getHomeLandmark({ companionId });
    } catch (error) {
      logger?.warn?.("[second-life] getHomeLandmark failed.", { error: error.message });
      return null;
    }
  }

  /**
   * Autonomous selection. Pick a landmark the companion may visit on its own,
   * optionally biased toward a free-text context / tags. Only landmarks that are
   * enabled, allowed for `relationship`, and have stored coordinates are eligible
   * (never fake a visit). Returns null when nothing qualifies.
   */
  async function chooseForAutonomy({ companionId, relationship = null, context = "", tags = [] } = {}) {
    let landmarks = [];
    if (secondLife && typeof secondLife.listLandmarks === "function") {
      try {
        landmarks = await secondLife.listLandmarks({ companionId });
      } catch (error) {
        logger?.warn?.("[second-life] listLandmarks failed.", { error: error.message });
        landmarks = [];
      }
    }
    if (!landmarks.length) return null;

    const wanted = new Set([
      ...(Array.isArray(tags) ? tags : []).map((t) => asText(t).trim().toLowerCase()).filter(Boolean),
      ...asText(context).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    ]);

    let best = null;
    let bestScore = -Infinity;
    for (const landmark of landmarks) {
      if (!landmark || landmark.enabled === false) continue;
      // Never fake a visit: a landmark with no region is not a real destination.
      if (!asText(landmark.region).trim()) continue;
      const { allowed } = decide({ landmark, relationship });
      if (!allowed) continue;

      const landmarkTags = (Array.isArray(landmark.tags) ? landmark.tags : []).map((t) => asText(t).toLowerCase());
      let score = Number(landmark.favoriteScore || 0);
      for (const tag of landmarkTags) {
        if (wanted.has(tag)) score += 5;
      }
      if (score > bestScore) {
        bestScore = score;
        best = landmark;
      }
    }
    return best;
  }

  async function listForCopy({ companionId } = {}) {
    let landmarks = [];
    if (secondLife && typeof secondLife.listLandmarks === "function") {
      try {
        landmarks = await secondLife.listLandmarks({ companionId });
      } catch (error) {
        logger?.warn?.("[second-life] listLandmarks failed.", { error: error.message });
        landmarks = [];
      }
    }
    return landmarks
      .filter((l) => l.enabled !== false)
      .map((l) => `${l.trigger} — ${l.name || l.region || "landmark"}`)
      .join("\n");
  }

  return { resolveLandmark, getHome, chooseForAutonomy, listForCopy };
}

module.exports = {
  createLandmarkManager,
};
