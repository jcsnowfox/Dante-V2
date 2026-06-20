/**
 * License service — permissive stub for local / self-hosted use.
 * The original paid license gate (an external license server validating a
 * CORE_LICENSE_KEY) has been removed so you can build freely on top of this
 * codebase.
 */

const LICENSE_CACHE_KEY = "license_validation";
const LICENSE_GRACE_HOURS = 72;
const LICENSE_PRODUCT = "ghostlight-core";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildInstallationIdentity(config = {}) {
  return {
    discordApplicationId: normalizeText(config.discord?.clientId),
    primaryGuildId: normalizeText(config.discord?.guildId),
    userScope: normalizeText(config.memory?.userScope),
  };
}

function buildLicenseValidationPayload(config = {}) {
  return {
    licenseKey: normalizeText(config.license?.key),
    product: LICENSE_PRODUCT,
    installation: buildInstallationIdentity(config),
  };
}

function createLicenseRuntime({
  status = "valid",
  blockingReason = "",
  message = "",
  validatedAt = "",
  cacheUsed = false,
  graceActive = false,
  canRunBot = true,
} = {}) {
  return {
    status,
    blockingReason: normalizeText(blockingReason),
    message: normalizeText(message),
    validatedAt: normalizeText(validatedAt),
    cacheUsed: Boolean(cacheUsed),
    graceActive: Boolean(graceActive),
    canRunBot: Boolean(canRunBot),
    health: {
      valid: Boolean(canRunBot),
      usingGrace: Boolean(graceActive),
    },
  };
}

function createInitialLicenseRuntime() {
  return createLicenseRuntime({
    status: "valid",
    message: "Self-hosted build — all features enabled.",
    canRunBot: true,
  });
}

function buildLicenseHomeWarning(_runtime = {}) {
  return null;
}

function createLicenseService({ config, cache, logger } = {}) {
  return {
    createInitialRuntime: createInitialLicenseRuntime,

    async validateStartup() {
      logger?.debug?.("[license] Self-hosted stub — skipping license validation");
      return createLicenseRuntime({
        status: "valid",
        message: "Self-hosted build — license check bypassed.",
        validatedAt: new Date().toISOString(),
        canRunBot: true,
      });
    },
  };
}

module.exports = {
  LICENSE_CACHE_KEY,
  LICENSE_GRACE_HOURS,
  LICENSE_PRODUCT,
  buildInstallationIdentity,
  buildLicenseValidationPayload,
  createInitialLicenseRuntime,
  createLicenseRuntime,
  buildLicenseHomeWarning,
  createLicenseService,
};
