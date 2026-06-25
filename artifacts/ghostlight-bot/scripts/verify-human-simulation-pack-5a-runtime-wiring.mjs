import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../src');

function readSrc(rel) {
  return readFileSync(resolve(srcDir, rel), 'utf8');
}

// 1. humanSimulationEngine.js imports all three new engine modules
const engineSrc = readSrc('humanSimulation/humanSimulationEngine.js');
assert(engineSrc.includes("require('./boundaryConsentEngine')") || engineSrc.includes('require("./boundaryConsentEngine")'), 'humanSimulationEngine must import boundaryConsentEngine');
assert(engineSrc.includes("require('./doNotAskEngine')") || engineSrc.includes('require("./doNotAskEngine")'), 'humanSimulationEngine must import doNotAskEngine');
assert(engineSrc.includes("require('./userEnergyEngine')") || engineSrc.includes('require("./userEnergyEngine")'), 'humanSimulationEngine must import userEnergyEngine');

// 2. humanSimulationEngine.js accepts and inits new stores
assert(engineSrc.includes('boundaryConsentStore'), 'humanSimulationEngine must accept boundaryConsentStore');
assert(engineSrc.includes('doNotAskStore'), 'humanSimulationEngine must accept doNotAskStore');
assert(engineSrc.includes('userEnergyStore'), 'humanSimulationEngine must accept userEnergyStore');
assert(engineSrc.includes('boundaryConsentStore?.init'), 'humanSimulationEngine must init boundaryConsentStore');
assert(engineSrc.includes('doNotAskStore?.init'), 'humanSimulationEngine must init doNotAskStore');
assert(engineSrc.includes('userEnergyStore?.init'), 'humanSimulationEngine must init userEnergyStore');

// 3. processMessage calls detection, save, retrieve, and format functions for all three
assert(engineSrc.includes('detectBoundaryLanguage'), 'processMessage must call detectBoundaryLanguage');
assert(engineSrc.includes('saveBoundaryConsent'), 'processMessage must call saveBoundaryConsent');
assert(engineSrc.includes('retrieveRelevantBoundaries'), 'processMessage must call retrieveRelevantBoundaries');
assert(engineSrc.includes('formatBoundaryPrelude'), 'processMessage must call formatBoundaryPrelude');
assert(engineSrc.includes('detectDoNotAskLanguage'), 'processMessage must call detectDoNotAskLanguage');
assert(engineSrc.includes('saveDoNotAskRule'), 'processMessage must call saveDoNotAskRule');
assert(engineSrc.includes('retrieveActiveRules'), 'processMessage must call retrieveActiveRules');
assert(engineSrc.includes('formatDoNotAskPrelude'), 'processMessage must call formatDoNotAskPrelude');
assert(engineSrc.includes('detectUserEnergy'), 'processMessage must call detectUserEnergy');
assert(engineSrc.includes('saveEnergyObservation'), 'processMessage must call saveEnergyObservation');
assert(engineSrc.includes('formatUserEnergyPrelude'), 'processMessage must call formatUserEnergyPrelude');

// 4. preludeSections pushes from boundary, do-not-ask, and energy
assert(engineSrc.includes('boundarySection') && engineSrc.includes('preludeSections.push(boundarySection)'), 'Boundary section must be pushed to preludeSections');
assert(engineSrc.includes('dnaSection') && engineSrc.includes('preludeSections.push(dnaSection)'), 'DNA section must be pushed to preludeSections');
assert(engineSrc.includes('energySection') && engineSrc.includes('preludeSections.push(energySection)'), 'Energy section must be pushed to preludeSections');

// 5. createChatPipeline.js uses humanSimulation (existing wiring confirmed)
const pipelineSrc = readSrc('chat/createChatPipeline.js');
assert(pipelineSrc.includes('humanSimulation'), 'createChatPipeline must use humanSimulation');
assert(pipelineSrc.includes('humanSimulation.processMessage'), 'createChatPipeline must call humanSimulation.processMessage');
assert(pipelineSrc.includes('hsResult?.preludeSections'), 'createChatPipeline must inject hsResult.preludeSections');

// 6. index.js creates and passes new stores
const indexSrc = readSrc('index.js');
assert(indexSrc.includes('createBoundaryConsentStore'), 'index.js must create boundaryConsentStore');
assert(indexSrc.includes('createDoNotAskStore'), 'index.js must create doNotAskStore');
assert(indexSrc.includes('createUserEnergyStore'), 'index.js must create userEnergyStore');
assert(indexSrc.includes('boundaryConsentStore'), 'index.js must pass boundaryConsentStore to engine');
assert(indexSrc.includes('doNotAskStore'), 'index.js must pass doNotAskStore to engine');
assert(indexSrc.includes('userEnergyStore'), 'index.js must pass userEnergyStore to engine');

// 7. storage/index.js exports new stores
const storageIndexSrc = readSrc('storage/index.js');
assert(storageIndexSrc.includes('createBoundaryConsentStore'), 'storage/index.js must export createBoundaryConsentStore');
assert(storageIndexSrc.includes('createDoNotAskStore'), 'storage/index.js must export createDoNotAskStore');
assert(storageIndexSrc.includes('createUserEnergyStore'), 'storage/index.js must export createUserEnergyStore');

// 8. adminPageHandlers.js loads new store data for dashboard
const adminSrc = readSrc('http/adminPageHandlers.js');
assert(adminSrc.includes('boundaryConsentStore?.listBoundaries'), 'adminPageHandlers must load boundaries from store');
assert(adminSrc.includes('doNotAskStore?.listRules'), 'adminPageHandlers must load do-not-ask rules from store');
assert(adminSrc.includes('userEnergyStore?.listObservations'), 'adminPageHandlers must load energy observations from store');

// 9. renderAdminPages/humanSimulationPages.js renders new tabs
const renderSrc = readSrc('http/renderAdminPages/humanSimulationPages.js');
assert(renderSrc.includes('boundaries'), 'render page must handle boundaries tab');
assert(renderSrc.includes('donotask'), 'render page must handle donotask tab');
assert(renderSrc.includes('energy'), 'render page must handle energy tab');
assert(renderSrc.includes('renderBoundariesTab'), 'render page must have renderBoundariesTab function');
assert(renderSrc.includes('renderDoNotAskTab'), 'render page must have renderDoNotAskTab function');
assert(renderSrc.includes('renderEnergyTab'), 'render page must have renderEnergyTab function');

// 10. Engine stores are exposed
assert(engineSrc.includes("get boundaryConsent()"), 'engine.stores must expose boundaryConsent');
assert(engineSrc.includes("get doNotAsk()"), 'engine.stores must expose doNotAsk');
assert(engineSrc.includes("get userEnergy()"), 'engine.stores must expose userEnergy');

console.log('[verify:human-simulation-pack-5a-runtime-wiring] PASS');
