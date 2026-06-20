/**
 * emotionalDecayEngine — Phase B implementation
 *
 * Applies time-based decay to the current emotion state. Emotions fade
 * unless reinforced by new events. Decay is deterministic and based on the
 * per-emotion decay rate (fraction lost per hour) defined in emotionTypes,
 * with optional per-companion overrides in profile.decayRates.
 *
 * Slow-decay emotions (hurt, anger, guilt, remorse, distance, distrust)
 * persist until acknowledged/repaired; fast-decay emotions (annoyance,
 * playfulness, relief) fade quickly.
 */

const { getEmotion } = require("./emotionTypes");

// Below this intensity the state is considered resolved and retired.
const RESOLVE_FLOOR = 0.5;

/**
 * Pure helper — exponential decay. intensity * (1 - rate)^hours.
 * Deterministic and side-effect free for easy verification.
 */
function computeDecayedIntensity(intensity, ratePerHour, hours) {
  const i = Number(intensity) || 0;
  const r = Math.min(Math.max(Number(ratePerHour) || 0, 0), 1);
  const h = Math.max(Number(hours) || 0, 0);
  if (i <= 0 || r <= 0 || h <= 0) {
    return Math.round(i * 100) / 100;
  }
  const decayed = i * Math.pow(1 - r, h);
  return Math.round(decayed * 100) / 100;
}

function resolveDecayRate({ emotionId, profile }) {
  const override = profile?.decayRates?.[emotionId];
  if (typeof override === "number" && override >= 0 && override <= 1) {
    return override;
  }
  const emotion = getEmotion(emotionId);
  return emotion ? emotion.defaultDecayRate : 0.1;
}

function hoursBetween(then, now) {
  const start = then instanceof Date ? then : new Date(then);
  const end = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/**
 * Applies decay to a single state and persists the result through the
 * state service. Returns the updated state, or null if the state was
 * retired (decayed below the resolve floor).
 */
async function applyDecay({ companionId, state, profile, stateService, logger, now = new Date() }) {
  if (!state || !state.primaryEmotion) {
    return null;
  }

  if (!profile || !profile.enabled || profile.emotionalDepth === "off") {
    return state;
  }

  const rate = resolveDecayRate({ emotionId: state.primaryEmotion, profile });
  const hours = hoursBetween(state.updatedAt || state.createdAt || now, now);
  const newIntensity = computeDecayedIntensity(state.intensity, rate, hours);

  if (newIntensity === state.intensity) {
    return state;
  }

  if (newIntensity < RESOLVE_FLOOR) {
    logger.info?.("[emotional-arc:decay:applied] Emotion decayed below floor; retiring state.", {
      companionId,
      primaryEmotion: state.primaryEmotion,
      from: state.intensity,
    });
    await stateService.updateState(state.id, { intensity: 0, expiresAt: now });
    return null;
  }

  logger.debug?.("[emotional-arc:decay:applied] Decay applied.", {
    companionId,
    primaryEmotion: state.primaryEmotion,
    from: state.intensity,
    to: newIntensity,
    hours: Math.round(hours * 100) / 100,
  });

  const updated = await stateService.updateState(state.id, { intensity: newIntensity });
  return updated || { ...state, intensity: newIntensity };
}

/**
 * Loads the current state and applies decay. Used by the scheduler.
 */
async function runDecayCycle({ companionId, stateService, profile, logger, now = new Date() }) {
  const state = await stateService.getCurrentState();
  if (!state) return null;
  return applyDecay({ companionId, state, profile, stateService, logger, now });
}

module.exports = {
  applyDecay,
  runDecayCycle,
  computeDecayedIntensity,
  resolveDecayRate,
  hoursBetween,
  RESOLVE_FLOOR,
};
