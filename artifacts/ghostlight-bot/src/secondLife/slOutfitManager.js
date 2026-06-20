/**
 * secondLife/slOutfitManager
 *
 * Phase 10 — the outfit system.
 *
 * Outfits are configurable from the dashboard and persisted in
 * `second_life_outfits`. Each outfit has:
 *   - trigger: a "!" command token (e.g. "!formal") shared with the command
 *     registry's outfit commands (payload.outfitTrigger points here).
 *   - outfitName: the in-world outfit/folder name the relay applies. Blank by
 *     default — generic deployments have no real wardrobe yet.
 *   - contextTags: free-form situational tags ("formal", "beach", "evening")
 *     used by autonomous context selection.
 *
 * This module owns:
 *   - DEFAULT_OUTFITS: a generic set of contexts (no customer-specific names).
 *   - resolveOutfit:  trigger -> outfit + a permission decision.
 *   - chooseForContext: pick the best-matching outfit for a situational context.
 *   - seedDefaults / listForCopy helpers for boot and the dashboard.
 *
 * With no database resolveOutfit still answers from DEFAULT_OUTFITS so the
 * bridge degrades safely. Nothing customer-specific is hardcoded; outfitName is
 * deliberately empty in the defaults so the owner fills in real wardrobe names.
 */

const CLOSE_TIERS = ["owner", "family", "friend", "trusted"];

/**
 * Generic default outfits. One per common spec context. `outfitName` is empty:
 * the relay only applies a real outfit once the owner sets the in-world folder
 * name from the dashboard. Triggers mirror the outfit commands in
 * slCommandRegistry so a "!formal" command resolves to this registry entry.
 */
const DEFAULT_OUTFITS = [
  { trigger: "!formal", description: "Formal / dressy attire.", contextTags: ["formal", "dressy", "evening", "event"], allowedRelationships: CLOSE_TIERS },
  { trigger: "!beachwear", description: "Beach / swimwear.", contextTags: ["beach", "swim", "summer", "pool", "water"], allowedRelationships: CLOSE_TIERS },
  { trigger: "!casual", description: "Everyday casual wear.", contextTags: ["casual", "everyday", "relaxed", "default"], allowedRelationships: CLOSE_TIERS },
  { trigger: "!clubwear", description: "Club / nightlife attire.", contextTags: ["club", "nightlife", "party", "dance"], allowedRelationships: CLOSE_TIERS },
  { trigger: "!sleepwear", description: "Sleep / loungewear.", contextTags: ["sleep", "lounge", "home", "night", "bed"], requiresOwnerPermission: true },
  { trigger: "!date-night", description: "Date-night attire.", contextTags: ["date", "romantic", "dinner", "evening"], requiresOwnerPermission: true },
  { trigger: "!workwear", description: "Work / office attire.", contextTags: ["work", "office", "professional", "business"], allowedRelationships: CLOSE_TIERS },
  { trigger: "!winterwear", description: "Cold-weather / winter attire.", contextTags: ["winter", "cold", "snow", "warm"], allowedRelationships: CLOSE_TIERS },
];

function asText(value) {
  return value == null ? "" : String(value);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.map((t) => asText(t).trim().toLowerCase()).filter(Boolean);
}

function createOutfitManager({ secondLife = null, config = null, logger = null } = {}) {
  function defaultByTrigger(trigger) {
    const t = asText(trigger).toLowerCase();
    const found = DEFAULT_OUTFITS.find((o) => o.trigger === t);
    if (!found) return null;
    return {
      ...found,
      outfitName: "",
      contextTags: Array.isArray(found.contextTags) ? found.contextTags : [],
      allowedRelationships: Array.isArray(found.allowedRelationships) ? found.allowedRelationships : [],
      requiresOwnerPermission: Boolean(found.requiresOwnerPermission),
      enabled: true,
      isDefault: true,
    };
  }

  /**
   * Decide whether `relationship` (a resolved identity carrying { tier, isOwner })
   * is allowed to apply `outfit`. Mirrors the command-registry permission model.
   */
  function decide({ outfit, relationship }) {
    if (!outfit) return { allowed: false, reason: "unknown" };
    if (outfit.enabled === false) return { allowed: false, reason: "disabled" };

    const tier = asText(relationship?.tier) || (relationship?.isOwner ? "owner" : "stranger");
    const isOwner = relationship?.isOwner === true || tier === "owner";

    if (tier === "blocked") return { allowed: false, reason: "blocked" };
    if (outfit.requiresOwnerPermission && !isOwner) return { allowed: false, reason: "owner_only" };
    const allowed = Array.isArray(outfit.allowedRelationships) ? outfit.allowedRelationships : [];
    if (allowed.length > 0 && !isOwner && !allowed.includes(tier)) {
      return { allowed: false, reason: "relationship_not_allowed" };
    }
    return { allowed: true, reason: "ok" };
  }

  /**
   * Resolve a trigger to an outfit and a permission decision.
   * Returns { outfit, allowed, reason }. Unknown triggers return
   * { outfit: null, allowed: false, reason: "unknown" }.
   */
  async function resolveOutfit({ companionId, trigger, relationship = null } = {}) {
    const t = asText(trigger).toLowerCase();
    if (!t) return { outfit: null, allowed: false, reason: "no_trigger" };

    let outfit = null;
    if (secondLife && typeof secondLife.getOutfitByTrigger === "function") {
      try {
        outfit = await secondLife.getOutfitByTrigger({ companionId, trigger: t });
      } catch (error) {
        logger?.warn?.("[second-life] outfit lookup failed; using defaults.", { error: error.message });
        outfit = null;
      }
    }
    if (!outfit) outfit = defaultByTrigger(t);
    if (!outfit) return { outfit: null, allowed: false, reason: "unknown" };

    const { allowed, reason } = decide({ outfit, relationship });
    return { outfit, allowed, reason };
  }

  /**
   * Autonomous context selection. Given a free-text context (or a list of tags),
   * return the enabled outfit whose contextTags best overlap. Returns null when
   * there is no match so the caller keeps the current outfit instead of guessing.
   */
  async function chooseForContext({ companionId, context = "", tags = [] } = {}) {
    const wanted = new Set([
      ...normalizeTags(tags),
      ...asText(context).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    ]);
    if (wanted.size === 0) return null;

    let outfits = [];
    if (secondLife && typeof secondLife.listOutfits === "function") {
      try {
        outfits = await secondLife.listOutfits({ companionId });
      } catch (error) {
        logger?.warn?.("[second-life] listOutfits failed; using defaults.", { error: error.message });
        outfits = [];
      }
    }
    if (!outfits.length) outfits = DEFAULT_OUTFITS.map((o) => defaultByTrigger(o.trigger));

    let best = null;
    let bestScore = 0;
    for (const outfit of outfits) {
      if (!outfit || outfit.enabled === false) continue;
      const outfitTags = normalizeTags(outfit.contextTags);
      let score = 0;
      for (const tag of outfitTags) {
        if (wanted.has(tag)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = outfit;
      }
    }
    return best;
  }

  async function seedDefaults({ companionId }) {
    if (!secondLife || typeof secondLife.seedDefaultOutfits !== "function") return 0;
    try {
      return await secondLife.seedDefaultOutfits({ companionId, defaults: DEFAULT_OUTFITS });
    } catch (error) {
      logger?.warn?.("[second-life] seedDefaultOutfits failed.", { error: error.message });
      return 0;
    }
  }

  /**
   * Build a copy/paste block of the enabled outfit triggers for the dashboard.
   * Falls back to the defaults with no DB.
   */
  async function listForCopy({ companionId } = {}) {
    let outfits = [];
    if (secondLife && typeof secondLife.listOutfits === "function") {
      try {
        outfits = await secondLife.listOutfits({ companionId });
      } catch (error) {
        logger?.warn?.("[second-life] listOutfits failed; using defaults.", { error: error.message });
        outfits = [];
      }
    }
    if (!outfits.length) outfits = DEFAULT_OUTFITS;
    return outfits
      .filter((o) => o.enabled !== false)
      .map((o) => `${o.trigger} — ${o.description || (o.outfitName || "outfit")}`)
      .join("\n");
  }

  return { resolveOutfit, chooseForContext, seedDefaults, listForCopy, DEFAULT_OUTFITS };
}

module.exports = {
  createOutfitManager,
  DEFAULT_OUTFITS,
};
