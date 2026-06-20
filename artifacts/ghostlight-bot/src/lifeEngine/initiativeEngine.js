/**
 * lifeEngine/initiativeEngine
 *
 * Phase 18 — initiative.
 *
 * When ENABLED, the companion may occasionally start something itself: invite the
 * owner somewhere, recommend a venue, share a memory, follow up on something
 * previously mentioned, suggest an activity, show a discovered place, or ask to
 * visit a saved landmark.
 *
 * Hard rules from the spec, all enforced here:
 *   - Evidence-driven only (no proposal without a real backing record).
 *   - No random spam.
 *   - Respect quiet hours.
 *   - Respect cooldowns.
 *   - Respect owner-busy mode.
 *   - Respect privacy.
 *   - Max initiatives per day is configurable.
 *   - Every outcome (delivered OR suppressed) logs WHY.
 *
 * Disabled by default. With no database the engine still gates correctly and is a
 * safe no-op; it never throws and never drives the avatar in-world.
 */

const INITIATIVE_TYPES = [
  "invite_owner",
  "recommend_venue",
  "share_memory",
  "follow_up",
  "suggest_activity",
  "show_discovery",
  "visit_landmark",
];

function asText(value) {
  return value == null ? "" : String(value);
}

function getInitiativeConfig(config) {
  const ini = config?.secondLife?.lifeEngine?.initiative || {};
  const maxPerDay = Number(ini.maxPerDay);
  const cooldownMinutes = Number(ini.cooldownMinutes);
  const quietStart = Number(ini.quietHoursStart);
  const quietEnd = Number(ini.quietHoursEnd);
  return {
    enabled: Boolean(ini.enabled),
    maxPerDay: Number.isFinite(maxPerDay) && maxPerDay >= 0 ? Math.floor(maxPerDay) : 3,
    cooldownMinutes: Number.isFinite(cooldownMinutes) && cooldownMinutes >= 0 ? Math.floor(cooldownMinutes) : 120,
    quietHoursStart: Number.isInteger(quietStart) && quietStart >= 0 && quietStart <= 23 ? quietStart : 22,
    quietHoursEnd: Number.isInteger(quietEnd) && quietEnd >= 0 && quietEnd <= 23 ? quietEnd : 7,
  };
}

/**
 * Quiet hours can wrap midnight (e.g. 22 → 7). Pure helper, exported for tests.
 */
function isQuietHour(hour, start, end) {
  const h = Number(hour);
  if (!Number.isInteger(h)) return false;
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

function createInitiativeEngine({ secondLife = null, config = null, logger = null } = {}) {
  function hasStore(method) {
    return secondLife && typeof secondLife[method] === "function";
  }

  function isEnabled() {
    return getInitiativeConfig(config).enabled;
  }

  async function logOutcome({ companionId, initiativeType, reason, evidence, status }) {
    if (!hasStore("recordInitiative")) return null;
    try {
      return await secondLife.recordInitiative({ companionId, initiativeType, reason, evidence, status });
    } catch (error) {
      logger?.warn?.("[life-engine] recordInitiative failed.", { error: error.message });
      return null;
    }
  }

  /**
   * Gather REAL evidence the companion could act on. Only returns records that
   * actually exist in the store — never synthesises candidates.
   */
  async function gatherEvidence({ companionId } = {}) {
    const evidence = { discovery: null, favorite: null, milestone: null, openLoop: null };
    try {
      if (hasStore("listDiscoveries")) {
        const discoveries = await secondLife.listDiscoveries({ companionId, limit: 50 });
        const real = (Array.isArray(discoveries) ? discoveries : []).filter((d) => d && d.visited);
        evidence.discovery = real.find((d) => !d.shared) || real[0] || null;
        evidence.favorite = real.find((d) => d.isFavorite) || null;
      }
      if (hasStore("listSharedExperiences")) {
        const milestones = await secondLife.listSharedExperiences({ companionId, milestonesOnly: true, limit: 20 });
        evidence.milestone = (Array.isArray(milestones) ? milestones : [])[0] || null;
        const loops = await secondLife.listSharedExperiences({ companionId, experienceType: "open_loop", limit: 10 });
        evidence.openLoop = (Array.isArray(loops) ? loops : [])[0] || null;
      }
    } catch (error) {
      logger?.warn?.("[life-engine] gatherEvidence failed.", { error: error.message });
    }
    return evidence;
  }

  /**
   * Turn real evidence into a concrete proposal, or null when there is nothing
   * genuine to act on. Pure (no I/O), exported for tests.
   */
  function buildProposal(evidence = {}) {
    if (evidence.openLoop) {
      return {
        type: "follow_up",
        reason: "There is an open loop worth following up on.",
        message: `Earlier you mentioned "${asText(evidence.openLoop.title) || "something"}" — want to pick that back up?`,
        evidence: { sharedExperienceId: evidence.openLoop.id },
      };
    }
    if (evidence.favorite) {
      return {
        type: "invite_owner",
        reason: "A favorite place exists worth revisiting together.",
        message: `Want to head back to ${asText(evidence.favorite.name) || "our favorite spot"} together?`,
        evidence: { placeKey: evidence.favorite.placeKey },
      };
    }
    if (evidence.discovery) {
      return {
        type: "show_discovery",
        reason: "A genuinely visited place has not been shared yet.",
        message: `I found ${asText(evidence.discovery.name) || "a new place"}${evidence.discovery.region ? ` in ${evidence.discovery.region}` : ""} — want to see it?`,
        evidence: { placeKey: evidence.discovery.placeKey },
      };
    }
    if (evidence.milestone) {
      return {
        type: "share_memory",
        reason: "A shared milestone is worth recalling.",
        message: `I was just thinking about ${asText(evidence.milestone.title) || "a moment we shared"}.`,
        evidence: { sharedExperienceId: evidence.milestone.id },
      };
    }
    return null;
  }

  /**
   * Decide whether to start something. Returns { proposal } when one is made,
   * otherwise { proposal: null, reason }. EVERY outcome is logged (delivered or
   * suppressed) so there is always a record of WHY. `ownerBusy` / `privacy`
   * reflect owner-controlled modes; when true the companion stays quiet.
   */
  async function propose({ companionId, now = new Date(), ownerBusy = false, privacy = false } = {}) {
    const cfg = getInitiativeConfig(config);

    // No companion ⇒ nothing to attribute a log row to, so we cannot record WHY.
    if (!companionId) return { proposal: null, reason: "no_companion" };
    // Disabled is only reachable via a manual (admin) propose call — tick gates on
    // isEnabled() — so logging here is low-volume and explains WHY nothing happened.
    if (!cfg.enabled) {
      await logOutcome({ companionId, initiativeType: "note", reason: "Suppressed: initiative disabled.", evidence: {}, status: "suppressed" });
      return { proposal: null, reason: "disabled" };
    }

    if (privacy) {
      await logOutcome({ companionId, initiativeType: "note", reason: "Suppressed: privacy mode.", evidence: {}, status: "suppressed" });
      return { proposal: null, reason: "privacy" };
    }
    if (ownerBusy) {
      await logOutcome({ companionId, initiativeType: "note", reason: "Suppressed: owner busy.", evidence: {}, status: "suppressed" });
      return { proposal: null, reason: "owner_busy" };
    }

    const hour = now instanceof Date ? now.getHours() : new Date(now).getHours();
    if (isQuietHour(hour, cfg.quietHoursStart, cfg.quietHoursEnd)) {
      await logOutcome({ companionId, initiativeType: "note", reason: `Suppressed: quiet hours (${cfg.quietHoursStart}:00–${cfg.quietHoursEnd}:00).`, evidence: { hour }, status: "suppressed" });
      return { proposal: null, reason: "quiet_hours" };
    }

    // Per-day cap.
    if (hasStore("countInitiativesSince")) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      let deliveredToday = 0;
      try {
        deliveredToday = await secondLife.countInitiativesSince({ companionId, since: startOfDay, status: "delivered" });
      } catch (error) {
        logger?.warn?.("[life-engine] countInitiativesSince failed.", { error: error.message });
      }
      if (deliveredToday >= cfg.maxPerDay) {
        await logOutcome({ companionId, initiativeType: "note", reason: `Suppressed: daily cap reached (${deliveredToday}/${cfg.maxPerDay}).`, evidence: { deliveredToday }, status: "suppressed" });
        return { proposal: null, reason: "daily_cap" };
      }
    }

    // Cooldown since the last delivered initiative.
    if (cfg.cooldownMinutes > 0 && hasStore("listInitiatives")) {
      try {
        const recent = await secondLife.listInitiatives({ companionId, limit: 10 });
        const lastDelivered = (Array.isArray(recent) ? recent : []).find((i) => i && i.status === "delivered");
        if (lastDelivered && lastDelivered.createdAt) {
          const elapsedMin = (now.getTime() - new Date(lastDelivered.createdAt).getTime()) / 60000;
          if (elapsedMin < cfg.cooldownMinutes) {
            await logOutcome({ companionId, initiativeType: "note", reason: `Suppressed: cooldown (${Math.round(elapsedMin)}/${cfg.cooldownMinutes} min).`, evidence: {}, status: "suppressed" });
            return { proposal: null, reason: "cooldown" };
          }
        }
      } catch (error) {
        logger?.warn?.("[life-engine] cooldown check failed.", { error: error.message });
      }
    }

    // Evidence-driven only.
    const evidence = await gatherEvidence({ companionId });
    const proposal = buildProposal(evidence);
    if (!proposal) {
      await logOutcome({ companionId, initiativeType: "note", reason: "Suppressed: no real evidence to act on.", evidence: {}, status: "suppressed" });
      return { proposal: null, reason: "no_evidence" };
    }

    const logged = await logOutcome({
      companionId,
      initiativeType: proposal.type,
      reason: proposal.reason,
      evidence: proposal.evidence || {},
      status: "delivered",
    });
    return { proposal: { ...proposal, id: logged?.id || null } };
  }

  async function listRecent({ companionId, limit = 30 } = {}) {
    if (!hasStore("listInitiatives")) return [];
    try {
      return await secondLife.listInitiatives({ companionId, limit });
    } catch (error) {
      logger?.warn?.("[life-engine] listInitiatives failed.", { error: error.message });
      return [];
    }
  }

  return {
    isEnabled,
    gatherEvidence,
    buildProposal,
    propose,
    listRecent,
    getConfig: () => getInitiativeConfig(config),
    INITIATIVE_TYPES,
    isQuietHour,
  };
}

module.exports = {
  createInitiativeEngine,
  isQuietHour,
  INITIATIVE_TYPES,
};
