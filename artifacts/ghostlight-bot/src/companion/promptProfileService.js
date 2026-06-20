/**
 * companion/promptProfileService
 *
 * Phase 2 — service layer over the prompt profile store.
 *
 * Resolves the companion id (derived from the persona name, never hardcoded),
 * caches the active profile for the hot chat path, and exposes generic,
 * name-free default prompts for the admin editor + "reset to defaults".
 *
 * The active-profile cache returns null until the owner has activated a
 * profile, so an install that never touches the prompt editor behaves exactly
 * like before (the persona falls back to the legacy config prompt blocks).
 */

// Generic, customer-agnostic default prompt sections. Prompt profiles are now a
// Second-Life-only OVERLAY: the companion personality lives in
// config.chat.promptBlocks (the single source of truth, shared by Discord and
// Second Life). These two fields only add Second-Life-specific behaviour on top
// of that persona, and are safe, name-free starting points the owner can edit.
const GENERIC_DEFAULT_PROMPTS = Object.freeze({
  secondLifeBehaviorPrompt:
    "When present in a virtual world, behave like an embodied companion: move, react, and take part in the space around you naturally rather than narrating from outside it.",
  secondLifeLocalChatPrompt:
    "In local chat, keep messages short, natural, and suited to a shared social space. Greet people warmly and respect conversations already in progress.",
});

const PROMPT_FIELDS = Object.keys(GENERIC_DEFAULT_PROMPTS);

function resolveCompanionId(config) {
  const personaName = config?.chat?.promptBlocks?.personaName
    || config?.chat?.promptBlocks?.persona_name
    || config?.companionId
    || "companion";
  return String(personaName).trim().toLowerCase().replace(/\s+/g, "_") || "companion";
}

function getPromptProfileDefaults() {
  return { ...GENERIC_DEFAULT_PROMPTS };
}

function pickPromptFields(source = {}) {
  const prompts = {};
  for (const field of PROMPT_FIELDS) {
    prompts[field] = String(source[field] == null ? "" : source[field]);
  }
  return prompts;
}

function createPromptProfileService({ store, config, logger }) {
  const companionId = resolveCompanionId(config);
  let activeCache = null;
  let activeLoaded = false;

  async function getActiveProfile({ force = false } = {}) {
    if (activeLoaded && !force) {
      return activeCache;
    }
    if (!store || store.available !== true) {
      activeCache = null;
      activeLoaded = true;
      return null;
    }
    try {
      activeCache = await store.getActiveProfile({ companionId });
    } catch (error) {
      logger?.warn?.("[prompt-profiles] Failed to load active profile; using legacy persona.", {
        companionId,
        error: error.message,
      });
      activeCache = null;
    }
    activeLoaded = true;
    return activeCache;
  }

  function invalidate() {
    activeLoaded = false;
    activeCache = null;
  }

  async function listProfiles() {
    if (!store || store.available !== true) return [];
    return store.listProfiles({ companionId });
  }

  async function getProfile(id) {
    if (!store || store.available !== true) return null;
    return store.getProfile({ companionId, id });
  }

  async function createProfile({ profileName, prompts = {}, isActive = false } = {}) {
    if (!store || store.available !== true) return null;
    const result = await store.createProfile({
      companionId,
      profileName,
      prompts: pickPromptFields(prompts),
      isActive,
    });
    invalidate();
    return result;
  }

  async function saveProfile({ id, profileName, prompts = {} } = {}) {
    if (!store || store.available !== true) return null;
    const result = await store.updateProfile({
      companionId,
      id,
      profileName,
      prompts: pickPromptFields(prompts),
    });
    invalidate();
    return result;
  }

  async function setActive(id) {
    if (!store || store.available !== true) return null;
    const result = await store.setActiveProfile({ companionId, id });
    invalidate();
    return result;
  }

  async function deactivate() {
    if (!store || store.available !== true) return;
    await store.deactivateAll({ companionId });
    invalidate();
  }

  async function resetToDefaults(id) {
    if (!store || store.available !== true) return null;
    const result = await store.updateProfile({
      companionId,
      id,
      profileName: undefined,
      prompts: pickPromptFields(getPromptProfileDefaults()),
    });
    invalidate();
    return result;
  }

  async function deleteProfile(id) {
    if (!store || store.available !== true) return false;
    const result = await store.deleteProfile({ companionId, id });
    invalidate();
    return result;
  }

  async function getStoreSummary() {
    if (!store || store.available !== true) {
      return { available: false, profiles: 0, hasActive: false };
    }
    return store.getStoreSummary({ companionId });
  }

  return {
    store,
    resolveCompanionId: () => companionId,
    getDefaults: getPromptProfileDefaults,
    getActiveProfile,
    invalidate,
    listProfiles,
    getProfile,
    createProfile,
    saveProfile,
    setActive,
    deactivate,
    resetToDefaults,
    deleteProfile,
    getStoreSummary,
  };
}

module.exports = {
  createPromptProfileService,
  getPromptProfileDefaults,
  resolveCompanionId,
  GENERIC_DEFAULT_PROMPTS,
  PROMPT_FIELDS,
};
