import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync(new URL('../src/humanSimulation/humanSimulationEngine.js', import.meta.url), 'utf8');
const pipeline = readFileSync(new URL('../src/chat/createChatPipeline.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const adminHandlers = readFileSync(new URL('../src/http/adminPageHandlers.js', import.meta.url), 'utf8');
const innerWeather = readFileSync(new URL('../src/humanSimulation/innerWeatherEngine.js', import.meta.url), 'utf8');
const attentionResidue = readFileSync(new URL('../src/humanSimulation/attentionResidueEngine.js', import.meta.url), 'utf8');
const silenceBehavior = readFileSync(new URL('../src/humanSimulation/silenceBehaviorEngine.js', import.meta.url), 'utf8');

// 1. Engine accepts all 3 Pack 2 store params
assert(engine.includes('innerWeatherStore'), 'engine must accept innerWeatherStore');
assert(engine.includes('attentionResidueStore'), 'engine must accept attentionResidueStore');
assert(engine.includes('interactionPresenceStore'), 'engine must accept interactionPresenceStore');

// 2. Engine calls Pack 2 systems
assert(engine.includes('updateInnerWeather'), 'engine must call updateInnerWeather');
assert(engine.includes('maybeCreateResidue'), 'engine must call maybeCreateResidue');
assert(engine.includes('calculateSilenceBucket'), 'engine must call calculateSilenceBucket');

// 3. Engine exposes postProcessMessage
assert(engine.includes('postProcessMessage'), 'engine must expose postProcessMessage');

// 4. Pipeline calls postProcessMessage after reply
assert(pipeline.includes('humanSimulation.postProcessMessage'), 'pipeline must call humanSimulation.postProcessMessage');

// 5. Pipeline has Pack 2 log trace
assert(pipeline.includes('[reply-trace] humanSimulationPack2 processed=true'), 'pipeline must log humanSimulationPack2 processed=true');

// 6. Labels are correct
assert(innerWeather.includes("label: 'INNER WEATHER'"), 'innerWeatherEngine must use INNER WEATHER label');
assert(attentionResidue.includes("label: 'ATTENTION RESIDUE'"), 'attentionResidueEngine must use ATTENTION RESIDUE label');
assert(silenceBehavior.includes("label: 'PRESENCE'"), 'silenceBehaviorEngine must use PRESENCE label');

// 7. index.js creates all 3 Pack 2 stores
assert(index.includes('createInnerWeatherStore'), 'index.js must create innerWeatherStore');
assert(index.includes('createAttentionResidueStore'), 'index.js must create attentionResidueStore');
assert(index.includes('createInteractionPresenceStore'), 'index.js must create interactionPresenceStore');

// 8. index.js passes stores to engine
assert(index.includes('innerWeatherStore,'), 'index.js must pass innerWeatherStore to engine');
assert(index.includes('attentionResidueStore,'), 'index.js must pass attentionResidueStore to engine');
assert(index.includes('interactionPresenceStore,'), 'index.js must pass interactionPresenceStore to engine');

// 9. index.js includes stores in appContext
assert(index.includes('innerWeatherStore,') && index.includes('attentionResidueStore,') && index.includes('interactionPresenceStore,'), 'appContext must include Pack 2 stores');

// 10. Admin handlers load Pack 2 data
assert(adminHandlers.includes('innerWeatherStore'), 'admin handlers must load innerWeatherStore data');
assert(adminHandlers.includes('attentionResidueStore'), 'admin handlers must load attentionResidueStore data');
assert(adminHandlers.includes('interactionPresenceStore'), 'admin handlers must load interactionPresenceStore data');

// 11. Engine init awaits all 7 stores
assert(engine.includes('innerWeatherStore?.init'), 'engine init must await innerWeatherStore');
assert(engine.includes('attentionResidueStore?.init'), 'engine init must await attentionResidueStore');
assert(engine.includes('interactionPresenceStore?.init'), 'engine init must await interactionPresenceStore');

// 12. Engine stores getter exposes Pack 2 stores for dashboard
assert(engine.includes("get innerWeather()"), 'engine stores getter must expose innerWeather');
assert(engine.includes("get attentionResidue()"), 'engine stores getter must expose attentionResidue');
assert(engine.includes("get interactionPresence()"), 'engine stores getter must expose interactionPresence');

console.log('[verify:human-simulation-pack-2-runtime-wiring] PASS');
