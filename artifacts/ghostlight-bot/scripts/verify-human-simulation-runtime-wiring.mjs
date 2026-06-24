import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Verify the real Discord reply path uses human simulation systems
const pipeline = readFileSync(new URL('../src/chat/createChatPipeline.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

// 1. createChatPipeline accepts humanSimulation
assert(pipeline.includes('humanSimulation = null'), 'createChatPipeline must accept humanSimulation parameter');

// 2. Pipeline calls humanSimulation.processMessage
assert(pipeline.includes('humanSimulation.processMessage'), 'pipeline must call humanSimulation.processMessage');

// 3. Prelude sections are injected into contextSections
assert(pipeline.includes('hsResult?.preludeSections'), 'pipeline must inject prelude sections from human simulation');
assert(pipeline.includes('contextSections.push(section)'), 'pipeline must push each prelude section');

// 4. Runtime wiring log line exists
assert(pipeline.includes('[reply-trace] humanSimulation processed=true'), 'pipeline must log humanSimulation processing');

// 5. humanSimulation is guarded (try/catch)
assert(pipeline.includes('Human simulation processing failed'), 'pipeline must guard human simulation with try/catch');

// 6. Human simulation is skipped in dev mode
assert(pipeline.includes('!inDevMode && humanSimulation'), 'human simulation must be skipped in dev mode');

// 7. index.js creates the engine and passes it to chatPipeline
assert(index.includes('createHumanSimulationEngine'), 'index.js must create human simulation engine');
assert(index.includes('humanSimulation,'), 'index.js must pass humanSimulation to chatPipeline');

// 8. index.js initializes all 4 stores
assert(index.includes('createMicroPreferenceStore'), 'index.js must create micro preference store');
assert(index.includes('createPersonalTimelineStore'), 'index.js must create personal timeline store');
assert(index.includes('createFollowUpStore'), 'index.js must create follow-up store');
assert(index.includes('createChannelAwarenessStore'), 'index.js must create channel awareness store');

// 9. index.js calls humanSimulation.init
assert(index.includes('humanSimulation.init'), 'index.js must call humanSimulation.init');

// 10. humanSimulation and stores are in appContext (for dashboard)
assert(index.includes('humanSimulation,') && index.includes('microPreferenceStore,'), 'appContext must include human simulation stores');

// 11. Channel awareness prelude is CHANNEL AWARENESS label
const channelAwareness = readFileSync(new URL('../src/humanSimulation/channelAwarenessMap.js', import.meta.url), 'utf8');
assert(channelAwareness.includes("label: 'CHANNEL AWARENESS'"), 'channelAwareness must use CHANNEL AWARENESS label');

// 12. Micro-preference prelude is MICRO-PREFERENCES label
const prefLearner = readFileSync(new URL('../src/humanSimulation/microPreferenceLearner.js', import.meta.url), 'utf8');
assert(prefLearner.includes("label: 'MICRO-PREFERENCES'"), 'microPreferenceLearner must use MICRO-PREFERENCES label');

// 13. Timeline prelude is TIMELINE ANCHORS label
const timeline = readFileSync(new URL('../src/humanSimulation/personalTimeline.js', import.meta.url), 'utf8');
assert(timeline.includes("label: 'TIMELINE ANCHORS'"), 'personalTimeline must use TIMELINE ANCHORS label');

// 14. Follow-up prelude is OPEN FOLLOW-UPS label
const scheduler = readFileSync(new URL('../src/humanSimulation/followUpScheduler.js', import.meta.url), 'utf8');
assert(scheduler.includes("label: 'OPEN FOLLOW-UPS'"), 'followUpScheduler must use OPEN FOLLOW-UPS label');

// 15. Dashboard route exists
const adminHandlers = readFileSync(new URL('../src/http/adminPageHandlers.js', import.meta.url), 'utf8');
assert(adminHandlers.includes('humanSimulation'), 'admin handlers must have human simulation route');
assert(adminHandlers.includes('microPreferenceStore'), 'dashboard handler must read micro preferences');
assert(adminHandlers.includes('personalTimelineStore'), 'dashboard handler must read timeline');
assert(adminHandlers.includes('followUpStore'), 'dashboard handler must read follow-ups');
assert(adminHandlers.includes('channelAwarenessStore'), 'dashboard handler must read channel awareness');

console.log('[verify:human-simulation-runtime-wiring] PASS');
