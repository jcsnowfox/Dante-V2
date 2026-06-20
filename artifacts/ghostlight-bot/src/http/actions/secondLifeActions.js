const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { resolveCompanionId } = require("../../companion/promptProfileService");
const {
  BOOLEAN_SETTINGS,
  TEXT_SETTINGS,
  NUMBER_SETTINGS,
  RELATIONSHIP_TIERS,
  COMMAND_TYPES,
  COMMAND_ALLOWED_TIERS,
  AUTONOMY_LEVELS,
  SCHEDULE_DAYS,
  SCHEDULE_ACTIVITY_TYPES,
  EXPERIENCE_TYPES,
  GOAL_TYPES,
  GOAL_STATUSES,
} = require("../renderAdminPages/secondLifePage");
const { createCommandRegistry } = require("../../secondLife/slCommandRegistry");
const { createOutfitManager } = require("../../secondLife/slOutfitManager");
const { DEFAULT_SCHEDULE } = require("../../lifeEngine/dailyScheduleEngine");

function csvToList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const RETURN_PATH = "/admin/second-life";

function fieldValue(fields, key) {
  const raw = fields[key];
  return String(Array.isArray(raw) ? raw[0] : raw == null ? "" : raw);
}

function fieldList(fields, key) {
  const raw = fields[key];
  if (raw == null) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((v) => String(v));
}

function redirect(innerRes, { returnTo, theme, message, error }) {
  return innerRes.writeHead(303, {
    Location: buildReturnLocation({
      returnTo,
      fallbackPath: RETURN_PATH,
      theme,
      message,
      error,
      extra: {},
    }),
  }).end();
}

function storeReady(store) {
  return Boolean(store && store.available === true);
}

function buildSettingsFromFields(fields) {
  const settings = {};
  for (const { field } of BOOLEAN_SETTINGS) {
    settings[field] = Boolean(fields[field]);
  }
  for (const { field } of TEXT_SETTINGS) {
    settings[field] = fieldValue(fields, field).trim();
  }
  for (const { field } of NUMBER_SETTINGS) {
    settings[field] = Number(fieldValue(fields, field)) || 0;
  }
  return settings;
}

/**
 * Map a single relationship tier to the role booleans the store persists. The
 * tier select is the single source of truth, so exactly one role flag (or none,
 * for known/stranger) is set.
 */
function rolesFromTier(tier) {
  const t = RELATIONSHIP_TIERS.includes(tier) ? tier : "stranger";
  return {
    relationshipType: t,
    isOwner: t === "owner",
    isFamily: t === "family",
    isFriend: t === "friend",
    isTrusted: t === "trusted",
    isBlocked: t === "blocked",
  };
}

function resolveCompanion(innerContext) {
  try {
    return resolveCompanionId(innerContext.config || {});
  } catch {
    return "";
  }
}

async function handleSecondLifeActions({ req, res, url, context, withAdmin }) {
  if (req.method !== "POST") return false;

  const path = url.pathname;
  const knownPaths = new Set([
    "/admin/actions/second-life-save",
    "/admin/actions/second-life-relationship-save",
    "/admin/actions/second-life-relationship-delete",
    "/admin/actions/second-life-command-save",
    "/admin/actions/second-life-command-delete",
    "/admin/actions/second-life-command-toggle",
    "/admin/actions/second-life-command-seed",
    "/admin/actions/second-life-command-test",
    "/admin/actions/second-life-outfit-save",
    "/admin/actions/second-life-outfit-delete",
    "/admin/actions/second-life-outfit-toggle",
    "/admin/actions/second-life-outfit-seed",
    "/admin/actions/second-life-landmark-save",
    "/admin/actions/second-life-landmark-delete",
    "/admin/actions/second-life-object-delete",
    "/admin/actions/second-life-life-engine-toggle",
    "/admin/actions/second-life-schedule-save",
    "/admin/actions/second-life-schedule-delete",
    "/admin/actions/second-life-schedule-seed",
    "/admin/actions/second-life-discovery-bookmark",
    "/admin/actions/second-life-discovery-rate",
    "/admin/actions/second-life-discovery-favorite",
    "/admin/actions/second-life-discovery-delete",
    "/admin/actions/second-life-initiative-save",
    "/admin/actions/second-life-experience-save",
    "/admin/actions/second-life-experience-delete",
    "/admin/actions/second-life-goal-save",
    "/admin/actions/second-life-goal-delete",
  ]);
  if (!knownPaths.has(path)) return false;

  return withAdmin(async (innerReq, innerRes, innerContext) => {
    const { fields } = await parseRequestForm(innerReq);
    const theme = normalizeTheme(fields.theme);
    const returnTo = fieldValue(fields, "returnTo").trim() || RETURN_PATH;
    const store = innerContext.secondLife || null;

    // ── Life Engine toggle (runtime setting; no SL store required) ────────────
    if (path === "/admin/actions/second-life-life-engine-toggle") {
      const enabled = Boolean(fields.enabled);
      const rawAutonomy = fieldValue(fields, "autonomyLevel").trim().toLowerCase();
      const autonomyLevel = AUTONOMY_LEVELS.includes(rawAutonomy) ? rawAutonomy : "medium";
      const settings = {
        "secondLife.lifeEngine.enabled": enabled,
        "secondLife.lifeEngine.autonomyLevel": autonomyLevel,
      };
      try {
        await innerContext.settingsStore.upsertSettings(settings);
        applyRuntimeSettings(innerContext.config, settings);
        return redirect(innerRes, { returnTo, theme, message: `Life engine ${enabled ? "enabled" : "disabled"} (restart to apply the tick loop).` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save life-engine settings.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save life-engine settings." });
      }
    }

    // ── Initiative settings (runtime setting; no SL store required) ───────────
    if (path === "/admin/actions/second-life-initiative-save") {
      const enabled = Boolean(fields.enabled);
      const clampInt = (raw, fallback, min, max) => {
        const parsed = Number.parseInt(fieldValue(fields, raw).trim(), 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(parsed, max));
      };
      const settings = {
        "secondLife.lifeEngine.initiative.enabled": enabled,
        "secondLife.lifeEngine.initiative.maxPerDay": clampInt("maxPerDay", 3, 0, 50),
        "secondLife.lifeEngine.initiative.cooldownMinutes": clampInt("cooldownMinutes", 120, 0, 24 * 60),
        "secondLife.lifeEngine.initiative.quietHoursStart": clampInt("quietHoursStart", 22, 0, 23),
        "secondLife.lifeEngine.initiative.quietHoursEnd": clampInt("quietHoursEnd", 7, 0, 23),
      };
      try {
        await innerContext.settingsStore.upsertSettings(settings);
        applyRuntimeSettings(innerContext.config, settings);
        return redirect(innerRes, { returnTo, theme, message: `Initiative ${enabled ? "enabled" : "disabled"} (restart to apply the tick loop).` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save initiative settings.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save initiative settings." });
      }
    }

    if (!storeReady(store)) {
      return redirect(innerRes, {
        returnTo,
        theme,
        error: "Could not save — no database is configured, so the Second Life bridge stays read-only.",
      });
    }

    const companionId = resolveCompanion(innerContext);
    if (!companionId) {
      return redirect(innerRes, { returnTo, theme, error: "No companion id is configured." });
    }

    // ── Bridge settings ──────────────────────────────────────────────────────
    if (path === "/admin/actions/second-life-save") {
      const settings = buildSettingsFromFields(fields);
      const rawSecret = fieldValue(fields, "sharedSecret");
      const sharedSecret = rawSecret.length > 0 ? rawSecret : undefined;
      try {
        await store.upsertBridgeSettings({ companionId, settings, sharedSecret });
        return redirect(innerRes, { returnTo, theme, message: "Saved Second Life bridge settings." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save bridge settings from dashboard.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save Second Life bridge settings." });
      }
    }

    // ── Relationship CRUD ────────────────────────────────────────────────────
    if (path === "/admin/actions/second-life-relationship-save") {
      const avatarUuid = fieldValue(fields, "avatarUuid").trim();
      if (!avatarUuid) {
        return redirect(innerRes, { returnTo, theme, error: "An avatar UUID is required." });
      }
      const roles = rolesFromTier(fieldValue(fields, "relationshipType").trim());
      try {
        await store.upsertRelationship({
          companionId,
          avatarUuid,
          avatarName: fieldValue(fields, "avatarName").trim(),
          displayLabel: fieldValue(fields, "displayLabel").trim(),
          notes: fieldValue(fields, "notes").trim(),
          chatPermission: Boolean(fields.chatPermission),
          followPermission: Boolean(fields.followPermission),
          privateMemoryPermission: Boolean(fields.privateMemoryPermission),
          ...roles,
        });
        return redirect(innerRes, { returnTo, theme, message: "Saved relationship." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save relationship.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save relationship." });
      }
    }

    if (path === "/admin/actions/second-life-relationship-delete") {
      const avatarUuid = fieldValue(fields, "avatarUuid").trim();
      try {
        await store.deleteRelationship({ companionId, avatarUuid });
        return redirect(innerRes, { returnTo, theme, message: "Deleted relationship." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete relationship.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete relationship." });
      }
    }

    // ── Command registry CRUD ────────────────────────────────────────────────
    if (path === "/admin/actions/second-life-command-save") {
      const commandTrigger = fieldValue(fields, "commandTrigger").trim().toLowerCase();
      if (!commandTrigger) {
        return redirect(innerRes, { returnTo, theme, error: "A command trigger is required." });
      }
      const rawType = fieldValue(fields, "commandType").trim();
      const commandType = COMMAND_TYPES.includes(rawType) ? rawType : "custom";
      let payload = {};
      const rawPayload = fieldValue(fields, "payload").trim();
      if (rawPayload) {
        try {
          const parsed = JSON.parse(rawPayload);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
          else throw new Error("not an object");
        } catch {
          return redirect(innerRes, { returnTo, theme, error: "Payload must be a JSON object, e.g. {\"action\":\"custom\"}." });
        }
      }
      try {
        await store.upsertCommandDefinition({
          companionId,
          commandTrigger,
          commandType,
          description: fieldValue(fields, "description").trim(),
          payload,
          allowedRelationships: fieldList(fields, "allowedRelationships"),
          requiresOwnerPermission: Boolean(fields.requiresOwnerPermission),
          enabled: Boolean(fields.enabled),
        });
        return redirect(innerRes, { returnTo, theme, message: `Saved command ${commandTrigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save command.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save command." });
      }
    }

    if (path === "/admin/actions/second-life-command-delete") {
      const commandTrigger = fieldValue(fields, "commandTrigger").trim().toLowerCase();
      try {
        await store.deleteCommandDefinition({ companionId, commandTrigger });
        return redirect(innerRes, { returnTo, theme, message: `Deleted command ${commandTrigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete command.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete command." });
      }
    }

    if (path === "/admin/actions/second-life-command-toggle") {
      const commandTrigger = fieldValue(fields, "commandTrigger").trim().toLowerCase();
      try {
        const current = await store.getCommandDefinitionByTrigger({ companionId, trigger: commandTrigger });
        if (!current) {
          return redirect(innerRes, { returnTo, theme, error: "Command not found." });
        }
        await store.upsertCommandDefinition({
          companionId,
          commandTrigger: current.commandTrigger,
          commandType: current.commandType,
          description: current.description,
          payload: current.payload,
          allowedRelationships: current.allowedRelationships,
          requiresOwnerPermission: current.requiresOwnerPermission,
          enabled: !current.enabled,
        });
        return redirect(innerRes, { returnTo, theme, message: `${current.enabled ? "Disabled" : "Enabled"} ${commandTrigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to toggle command.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to toggle command." });
      }
    }

    if (path === "/admin/actions/second-life-command-seed") {
      try {
        const registry = innerContext.secondLifeCommandRegistry
          || createCommandRegistry({ secondLife: store, config: innerContext.config, logger: innerContext.logger });
        const inserted = await registry.seedDefaults({ companionId });
        return redirect(innerRes, { returnTo, theme, message: `Seeded ${inserted} default command(s).` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to seed default commands.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to seed default commands." });
      }
    }

    if (path === "/admin/actions/second-life-command-test") {
      const trigger = fieldValue(fields, "trigger").trim().toLowerCase();
      const tier = fieldValue(fields, "relationshipType").trim() || "stranger";
      try {
        const registry = innerContext.secondLifeCommandRegistry
          || createCommandRegistry({ secondLife: store, config: innerContext.config, logger: innerContext.logger });
        const result = await registry.resolveCommand({
          companionId,
          trigger,
          relationship: { tier, isOwner: tier === "owner" },
        });
        if (!result.command) {
          return redirect(innerRes, { returnTo, theme, message: `Test: "${trigger}" is not a recognised command.` });
        }
        const verdict = result.allowed ? "ALLOWED" : `DENIED (${result.reason})`;
        return redirect(innerRes, {
          returnTo,
          theme,
          message: `Test: ${result.command.commandTrigger} as ${tier} → ${verdict}.`,
        });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Command test failed.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Command test failed." });
      }
    }

    // ── Outfit registry CRUD (Phase 10) ──────────────────────────────────────
    if (path === "/admin/actions/second-life-outfit-save") {
      const trigger = fieldValue(fields, "trigger").trim().toLowerCase();
      if (!trigger) {
        return redirect(innerRes, { returnTo, theme, error: "An outfit trigger is required." });
      }
      try {
        await store.upsertOutfit({
          companionId,
          trigger,
          outfitName: fieldValue(fields, "outfitName").trim(),
          description: fieldValue(fields, "description").trim(),
          contextTags: csvToList(fieldValue(fields, "contextTags")),
          requiresOwnerPermission: Boolean(fields.requiresOwnerPermission),
          enabled: Boolean(fields.enabled),
        });
        return redirect(innerRes, { returnTo, theme, message: `Saved outfit ${trigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save outfit.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save outfit." });
      }
    }

    if (path === "/admin/actions/second-life-outfit-delete") {
      const trigger = fieldValue(fields, "trigger").trim().toLowerCase();
      try {
        await store.deleteOutfit({ companionId, trigger });
        return redirect(innerRes, { returnTo, theme, message: `Deleted outfit ${trigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete outfit.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete outfit." });
      }
    }

    if (path === "/admin/actions/second-life-outfit-toggle") {
      const trigger = fieldValue(fields, "trigger").trim().toLowerCase();
      try {
        const current = await store.getOutfitByTrigger({ companionId, trigger });
        if (!current) {
          return redirect(innerRes, { returnTo, theme, error: "Outfit not found." });
        }
        await store.upsertOutfit({
          companionId,
          trigger: current.trigger,
          outfitName: current.outfitName,
          description: current.description,
          contextTags: current.contextTags,
          requiresOwnerPermission: current.requiresOwnerPermission,
          isDefault: current.isDefault,
          enabled: !current.enabled,
        });
        return redirect(innerRes, { returnTo, theme, message: `${current.enabled ? "Disabled" : "Enabled"} outfit ${trigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to toggle outfit.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to toggle outfit." });
      }
    }

    if (path === "/admin/actions/second-life-outfit-seed") {
      try {
        const manager = innerContext.secondLifeOutfitManager
          || createOutfitManager({ secondLife: store, config: innerContext.config, logger: innerContext.logger });
        const inserted = await manager.seedDefaults({ companionId });
        return redirect(innerRes, { returnTo, theme, message: `Seeded ${inserted} default outfit(s).` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to seed default outfits.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to seed default outfits." });
      }
    }

    // ── Landmark registry CRUD (Phase 11) ─────────────────────────────────────
    if (path === "/admin/actions/second-life-landmark-save") {
      const trigger = fieldValue(fields, "trigger").trim().toLowerCase();
      if (!trigger) {
        return redirect(innerRes, { returnTo, theme, error: "A landmark trigger is required." });
      }
      const coordinates = {};
      for (const [key, field] of [["x", "coordX"], ["y", "coordY"], ["z", "coordZ"]]) {
        const raw = fieldValue(fields, field).trim();
        if (raw !== "") coordinates[key] = Number(raw) || 0;
      }
      const rawAllowed = fieldList(fields, "allowedRelationships").filter((t) => COMMAND_ALLOWED_TIERS.includes(t));
      try {
        await store.upsertLandmark({
          companionId,
          trigger,
          name: fieldValue(fields, "name").trim(),
          region: fieldValue(fields, "region").trim(),
          coordinates,
          description: fieldValue(fields, "description").trim(),
          tags: csvToList(fieldValue(fields, "tags")),
          favoriteScore: Number(fieldValue(fields, "favoriteScore")) || 0,
          isHome: Boolean(fields.isHome),
          isPrivate: Boolean(fields.isPrivate),
          allowedRelationships: rawAllowed,
          enabled: Boolean(fields.enabled),
        });
        return redirect(innerRes, { returnTo, theme, message: `Saved landmark ${trigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save landmark.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save landmark." });
      }
    }

    if (path === "/admin/actions/second-life-landmark-delete") {
      const trigger = fieldValue(fields, "trigger").trim().toLowerCase();
      try {
        await store.deleteLandmark({ companionId, trigger });
        return redirect(innerRes, { returnTo, theme, message: `Deleted landmark ${trigger}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete landmark.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete landmark." });
      }
    }

    // ── Object registry delete (Phase 12) ─────────────────────────────────────
    if (path === "/admin/actions/second-life-object-delete") {
      const objectUuid = fieldValue(fields, "objectUuid").trim();
      try {
        await store.deleteObject({ companionId, objectUuid });
        return redirect(innerRes, { returnTo, theme, message: "Deleted object." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete object.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete object." });
      }
    }

    // ── Daily schedule CRUD (Phase 15) ────────────────────────────────────────
    if (path === "/admin/actions/second-life-schedule-save") {
      const rawType = fieldValue(fields, "activityType").trim().toLowerCase();
      const activityType = SCHEDULE_ACTIVITY_TYPES.includes(rawType) ? rawType : "custom";
      const rawDay = fieldValue(fields, "dayOfWeek").trim().toLowerCase();
      const dayOfWeek = SCHEDULE_DAYS.includes(rawDay) ? rawDay : "";
      const rawAutonomy = fieldValue(fields, "autonomyLevel").trim().toLowerCase();
      const autonomyLevel = AUTONOMY_LEVELS.includes(rawAutonomy) ? rawAutonomy : "medium";
      const id = fieldValue(fields, "id").trim();
      try {
        await store.upsertScheduleEntry({
          companionId,
          ...(id ? { id } : {}),
          dayOfWeek,
          timeWindowStart: fieldValue(fields, "timeWindowStart").trim(),
          timeWindowEnd: fieldValue(fields, "timeWindowEnd").trim(),
          activityType,
          activityLabel: fieldValue(fields, "activityLabel").trim(),
          autonomyLevel,
          requiresOwnerPresent: Boolean(fields.requiresOwnerPresent),
          enabled: Boolean(fields.enabled),
        });
        return redirect(innerRes, { returnTo, theme, message: id ? "Updated schedule entry." : "Saved schedule entry." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save schedule entry.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save schedule entry." });
      }
    }

    if (path === "/admin/actions/second-life-schedule-delete") {
      const id = fieldValue(fields, "id").trim();
      try {
        await store.deleteScheduleEntry({ companionId, id });
        return redirect(innerRes, { returnTo, theme, message: "Deleted schedule entry." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete schedule entry.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete schedule entry." });
      }
    }

    if (path === "/admin/actions/second-life-schedule-seed") {
      try {
        const inserted = await store.seedDefaultSchedule({ companionId, defaults: DEFAULT_SCHEDULE });
        return redirect(innerRes, { returnTo, theme, message: `Seeded ${inserted} default schedule entr${inserted === 1 ? "y" : "ies"}.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to seed default schedule.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to seed default schedule." });
      }
    }

    // ── Shared experiences CRUD (Phase 17) ────────────────────────────────────
    if (path === "/admin/actions/second-life-experience-save") {
      const rawType = fieldValue(fields, "experienceType").trim().toLowerCase();
      const experienceType = EXPERIENCE_TYPES.includes(rawType) ? rawType : "moment";
      const id = fieldValue(fields, "id").trim();
      try {
        await store.upsertSharedExperience({
          companionId,
          ...(id ? { id } : {}),
          experienceType,
          title: fieldValue(fields, "title").trim(),
          body: fieldValue(fields, "body").trim(),
          isMilestone: Boolean(fields.isMilestone),
        });
        return redirect(innerRes, { returnTo, theme, message: id ? "Updated shared experience." : "Saved shared experience." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save shared experience.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save shared experience." });
      }
    }

    if (path === "/admin/actions/second-life-experience-delete") {
      const id = fieldValue(fields, "id").trim();
      try {
        await store.deleteSharedExperience({ companionId, id });
        return redirect(innerRes, { returnTo, theme, message: "Deleted shared experience." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete shared experience.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete shared experience." });
      }
    }

    // ── Long-term goals CRUD (Phase 19) — progress is event-driven, never here ─
    if (path === "/admin/actions/second-life-goal-save") {
      const rawType = fieldValue(fields, "goalType").trim().toLowerCase();
      const goalType = GOAL_TYPES.includes(rawType) ? rawType : "custom";
      const id = fieldValue(fields, "id").trim();
      const rawStatus = fieldValue(fields, "status").trim().toLowerCase();
      const status = GOAL_STATUSES.includes(rawStatus) ? rawStatus : "active";
      try {
        await store.upsertGoal({
          companionId,
          ...(id ? { id } : {}),
          goalType,
          label: fieldValue(fields, "label").trim(),
          targetValue: Math.max(0, Number(fieldValue(fields, "targetValue")) || 0),
          unit: fieldValue(fields, "unit").trim(),
          ...(id ? { status } : {}),
        });
        return redirect(innerRes, { returnTo, theme, message: id ? "Updated goal." : "Saved goal." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to save goal.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save goal." });
      }
    }

    if (path === "/admin/actions/second-life-goal-delete") {
      const id = fieldValue(fields, "id").trim();
      try {
        await store.deleteGoal({ companionId, id });
        return redirect(innerRes, { returnTo, theme, message: "Deleted goal." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete goal.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete goal." });
      }
    }

    // ── Discovery actions (Phase 16) — owner curation only; never creates ──────
    if (path === "/admin/actions/second-life-discovery-bookmark") {
      const placeKey = fieldValue(fields, "placeKey").trim();
      const bookmarked = fieldValue(fields, "bookmarked").trim() !== "false";
      try {
        await store.setDiscoveryBookmark({ companionId, placeKey, bookmarked });
        return redirect(innerRes, { returnTo, theme, message: bookmarked ? "Bookmarked place." : "Removed bookmark." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to bookmark discovery.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to bookmark discovery." });
      }
    }

    if (path === "/admin/actions/second-life-discovery-rate") {
      const placeKey = fieldValue(fields, "placeKey").trim();
      let rating = Number(fieldValue(fields, "rating")) || 0;
      rating = Math.max(0, Math.min(5, Math.round(rating)));
      try {
        await store.setDiscoveryRating({ companionId, placeKey, rating });
        return redirect(innerRes, { returnTo, theme, message: `Rated place ${rating}/5.` });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to rate discovery.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to rate discovery." });
      }
    }

    if (path === "/admin/actions/second-life-discovery-favorite") {
      const placeKey = fieldValue(fields, "placeKey").trim();
      const isFavorite = fieldValue(fields, "isFavorite").trim() !== "false";
      try {
        await store.setDiscoveryFavorite({ companionId, placeKey, isFavorite });
        return redirect(innerRes, { returnTo, theme, message: isFavorite ? "Marked as favorite." : "Removed favorite." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to favorite discovery.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to favorite discovery." });
      }
    }

    if (path === "/admin/actions/second-life-discovery-delete") {
      const placeKey = fieldValue(fields, "placeKey").trim();
      try {
        await store.deleteDiscovery({ companionId, placeKey });
        return redirect(innerRes, { returnTo, theme, message: "Deleted discovery." });
      } catch (error) {
        innerContext.logger?.error?.("[second-life] Failed to delete discovery.", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: "Failed to delete discovery." });
      }
    }

    return redirect(innerRes, { returnTo, theme, error: "Unknown action." });
  })(req, res, context);
}

module.exports = { handleSecondLifeActions };
