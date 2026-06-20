const { EMOTION_IDS, ALL_EXPRESSION_MODES } = require("./emotionTypes");

const VALID_EMOTIONAL_DEPTHS = Object.freeze(["off", "light", "realistic", "intense"]);

const DEFAULT_PROFILE = Object.freeze({
  enabled: true,
  emotionalDepth: "light",
  baselineTemperament: {
    warmth: 7,
    patience: 7,
    directness: 5,
    playfulness: 5,
    protectiveness: 5,
    anger: 2,
    jealousy: 0,
  },
  thresholds: {
    annoyance: 6,
    hurt: 7,
    anger: 9,
    guilt: 4,
    remorse: 4,
    distance: 7,
  },
  expressionStyle: {
    annoyance: "subtle and direct, never cruel",
    hurt: "honest but not guilt-tripping",
    anger: "brief, controlled, boundary-led",
    guilt: "repair-only, accountable, no self-pity",
    remorse: "direct apology with behavior correction",
    longing: "warm, no pressure",
  },
  blockedExpressions: [
    "silent treatment",
    "punishment",
    "threats of leaving",
    "guilt-tripping",
    "public humiliation",
    "possessive control",
    "emotional blackmail",
    "cruelty",
    "contempt",
    "forced apology demand",
  ],
  repairStyle: {
    admitFault: true,
    apologizeDirectly: true,
    explainWithoutExcuses: true,
    offerRepairAction: true,
    doNotOverGrovel: true,
    doNotCenterCompanionPain: true,
  },
});

function validateProfile(profile) {
  const errors = [];

  if (!profile || typeof profile !== "object") {
    return { valid: false, errors: ["Profile must be an object."] };
  }

  if (typeof profile.enabled !== "boolean") {
    errors.push("enabled must be a boolean.");
  }

  if (profile.emotionalDepth && !VALID_EMOTIONAL_DEPTHS.includes(profile.emotionalDepth)) {
    errors.push(`emotionalDepth must be one of: ${VALID_EMOTIONAL_DEPTHS.join(", ")}.`);
  }

  if (profile.baselineTemperament && typeof profile.baselineTemperament !== "object") {
    errors.push("baselineTemperament must be an object.");
  }

  if (profile.thresholds) {
    for (const [key, value] of Object.entries(profile.thresholds)) {
      if (!EMOTION_IDS.includes(key)) {
        errors.push(`Unknown emotion in thresholds: "${key}".`);
      }
      if (typeof value !== "number" || value < 0 || value > 10) {
        errors.push(`Threshold for "${key}" must be a number 0–10.`);
      }
    }
  }

  if (profile.blockedExpressions && !Array.isArray(profile.blockedExpressions)) {
    errors.push("blockedExpressions must be an array.");
  }

  if (profile.repairStyle && typeof profile.repairStyle !== "object") {
    errors.push("repairStyle must be an object.");
  }

  return { valid: errors.length === 0, errors };
}

function mergeWithDefaults(overrides = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...overrides,
    baselineTemperament: {
      ...DEFAULT_PROFILE.baselineTemperament,
      ...(overrides.baselineTemperament || {}),
    },
    thresholds: {
      ...DEFAULT_PROFILE.thresholds,
      ...(overrides.thresholds || {}),
    },
    expressionStyle: {
      ...DEFAULT_PROFILE.expressionStyle,
      ...(overrides.expressionStyle || {}),
    },
    blockedExpressions: overrides.blockedExpressions || DEFAULT_PROFILE.blockedExpressions,
    repairStyle: {
      ...DEFAULT_PROFILE.repairStyle,
      ...(overrides.repairStyle || {}),
    },
  };
}

module.exports = {
  VALID_EMOTIONAL_DEPTHS,
  DEFAULT_PROFILE,
  validateProfile,
  mergeWithDefaults,
};
