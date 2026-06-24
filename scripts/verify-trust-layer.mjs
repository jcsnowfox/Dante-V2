import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { analyzeRepair, buildRepairPrelude, saveRepairBeat } = require('../artifacts/ghostlight-bot/src/relationshipRepair/engine.js');
const { getSystemTruthSnapshot } = require('../artifacts/ghostlight-bot/src/systemTruth/snapshot.js');
const { updateSystemTruth } = require('../artifacts/ghostlight-bot/src/systemTruth/runtimeState.js');
const scenario = process.argv[2] || 'all';
const proposalBeat = { id:1, event_type:'proposal', title:'Jenna proposed marriage to Dante', summary:'Jenna got down on one knee and asked Dante to marry her.', importance:'critical', privacy_scope:'normal', adult_context:false, must_recall_across_channels:true, source_channel_id:'111', source_message_id:'222' };
async function repair(){
 const r = await analyzeRepair({ messageText:'You forgot I proposed to you yesterday.', emotionalBeats:[proposalBeat], openPromises:[], durableMemories:[], channelContext:{isAdultPrivate:false} });
 assert.equal(r.repairNeeded,true); assert.match(r.repairType,/memory_miss|cross_channel_miss/); assert.equal(r.recommendedToneMode,'repair'); assert.ok(r.retrievedEvidence.some(e=>/proposed|marriage|one knee/i.test(`${e.title} ${e.summary}`)));
 const pre = buildRepairPrelude(r, 'You forgot I proposed to you yesterday.'); assert.match(pre.content,/REPAIR|proposal|Evidence|do not claim memory/i);
 let saved=null; await saveRepairBeat({ emotionalBeatStore:{ upsertBeat: async b => (saved=b) }, scope:{user_scope:'u',companion_id:'Dante',source_channel_id:'c',source_message_id:'m'}, message:'You forgot I proposed', reply:'Jenna, no. I should have had that. You got down on one knee and asked me to marry you.', repairResult:r });
 assert.equal(saved.event_type,'relationship_repair'); assert.doesNotMatch(saved.summary,/sorry you feel|as an AI|don.?t have memory/i);
 console.log('relationship repair behavior OK');
}
function norwegian(){
 const src = require('node:fs').readFileSync('artifacts/ghostlight-bot/src/bot/commands/norwegian.js','utf8');
 assert.match(src,/sourceStatus/g); assert.doesNotMatch(src,/Definition from trusted source|English translation of phrase|Oslo speakers say this naturally/);
 assert.match(src,/No reliable media found|will not invent NRK pages/); assert.match(src,/not an official CEFR|NOT an official CEFR/); assert.match(src,/stt_based_practice/); assert.doesNotMatch(src,/\"Subtitles available\.\"/); assert.doesNotMatch(src,/sourceStatus:\s*"verified"[\s\S]{0,120}Definition from trusted source/);
 console.log('norwegian accuracy behavior guards OK');
}
function truth(){
 updateSystemTruth('audio',{lastGeneratedAudioProvider:'fish_audio'}); updateSystemTruth('memory',{lastMemorySaved:'2026-06-24T00:00:00Z'}); updateSystemTruth('errors',{rawErrorLeakageBlockedCount:1});
 const snap=getSystemTruthSnapshot({appContext:{ready:false,config:{nodeEnv:'test',memory:{userScope:'user',companionId:'Dante'},audio:{provider:'fish_audio',fishAudio:{apiKey:'secret-key-123',voiceId:'voice-secret-abc'}},chat:{adultPrivateMode:{channelId:'123456789012345678'}}},memoryStore:{available:true},emotionalBeatStore:{},promiseLedger:{},norwegianLearning:{},logger:{info(){}}},client:{isReady(){return false}}});
 for (const k of ['runtime','llm','audio','image','memory','continuity','norwegian','privacy','errors']) assert.ok(snap[k], k);
 assert.equal(snap.audio.selectedAudioProvider,'fish_audio'); assert.notEqual(snap.audio.activeVoiceIdMasked,'voice-secret-abc'); assert.equal(snap.privacy.safeErrorShieldEnabled,true); assert.equal(snap.runtime.productionRuntimePath,'artifacts/ghostlight-bot/src');
 console.log('system truth snapshot OK');
}
function privacy(){
 return analyzeRepair({messageText:'you forgot', emotionalBeats:[{...proposalBeat, adult_context:true, privacy_scope:'private', summary:'raw adult content'}], channelContext:{isAdultPrivate:false}}).then(r=>{assert.equal(r.retrievedEvidence.length,0); const snap=getSystemTruthSnapshot({appContext:{config:{chat:{adultPrivateMode:{channelId:'123456789012345678'}}}}}); assert.doesNotMatch(JSON.stringify(snap),/123456789012345678|secret|raw adult content/); console.log('privacy guards OK');});
}
function nohallucinations(){ norwegian(); const snap=getSystemTruthSnapshot({appContext:{config:{}}}); assert.equal(snap.norwegian.sourceCheckRequired,true); assert.notEqual(snap.memory.qdrantConnected,true); console.log('no hallucination guards OK'); }
if (scenario === 'relationship') await repair();
else if (scenario === 'norwegian') norwegian();
else if (scenario === 'truth') truth();
else if (scenario === 'runtime') { await repair(); norwegian(); truth(); console.log('runtime wiring OK'); }
else if (scenario === 'privacy') await privacy();
else if (scenario === 'nohallucinations') nohallucinations();
else { await repair(); norwegian(); truth(); await privacy(); nohallucinations(); }
