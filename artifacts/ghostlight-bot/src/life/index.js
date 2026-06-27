"use strict";

/**
 * Life systems barrel export.
 *
 * One import point for all life-system factory functions.
 * Does not move files — existing imports continue to work unchanged.
 *
 * Usage:
 *   const { createAliveEngine, createInnerLifeEngine } = require("./life");
 */

const { createAliveEngine } = require("../alive/aliveEngine");
const { createAlivePresenceStore } = require("../alive/alivePresenceStore");
const { createAliveEventsStore } = require("../alive/aliveEventsStore");
const { createIntentionQueueStore } = require("../alive/intentionQueueStore");
const { executeNextIntention, isInQuietHours } = require("../alive/aliveExecutor");
const { alivePostUpdate } = require("../alive/alivePostUpdate");
const { buildAliveContextPrelude, scoreToLabel } = require("../alive/aliveContextBuilder");
const { checkBackbone, buildBackboneSection } = require("../alive/backbonePolicy");

const { createInnerLifeEngine } = require("../innerLife/innerLifeEngine");
const { createContinuityEngine } = require("../continuity/continuityEngine");
const { createHumanSimulationEngine } = require("../humanSimulation/humanSimulationEngine");
const { createLifeEngine } = require("../lifeEngine");
const { createEmotionalArcEngine } = require("../companionSystems/emotionalArc/");
const { createFeedbackLearningEngine } = require("../companionSystems/feedbackLearning/");
const { createRelationalStateEngine } = require("../companionSystems/relationalState/");

module.exports = {
  // Alive Layer
  createAliveEngine,
  createAlivePresenceStore,
  createAliveEventsStore,
  createIntentionQueueStore,
  executeNextIntention,
  isInQuietHours,
  alivePostUpdate,
  buildAliveContextPrelude,
  scoreToLabel,
  checkBackbone,
  buildBackboneSection,

  // Inner Life
  createInnerLifeEngine,

  // Continuity
  createContinuityEngine,

  // Human Simulation
  createHumanSimulationEngine,

  // Life Engine (Second Life autonomy)
  createLifeEngine,

  // Companion Systems
  createEmotionalArcEngine,
  createFeedbackLearningEngine,
  createRelationalStateEngine,
};
