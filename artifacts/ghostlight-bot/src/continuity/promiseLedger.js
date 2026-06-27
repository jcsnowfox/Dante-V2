"use strict";
const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
function nowIso(){return new Date().toISOString();}
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9æøå]+/g," ").trim().slice(0,180);}
function safeSummary(text){return String(text||"").replace(/\s+/g," ").replace(/\b(nude|sex|fuck|cock|pussy|cum)\b/gi,"[private]").trim().slice(0,220);}
function mapRow(r){if(!r)return null;return {id:r.id,user_scope:r.user_scope,companion_id:r.companion_id,promise_maker:r.promise_maker,promise_text_summary:r.promise_text_summary,promise_type:r.promise_type,status:r.status,importance:r.importance,source_channel_id:r.source_channel_id,source_message_id:r.source_message_id,privacy_scope:r.privacy_scope,adult_context:!!r.adult_context,due_at:r.due_at,fulfilled_at:r.fulfilled_at,broken_at:r.broken_at,repaired_at:r.repaired_at,tags_json:r.tags_json||[],pinned:!!r.pinned,created_at:r.created_at,updated_at:r.updated_at,last_recalled_at:r.last_recalled_at};}
const SQL=`CREATE TABLE IF NOT EXISTS companion_promises (id BIGSERIAL PRIMARY KEY,user_scope TEXT NOT NULL,companion_id TEXT NOT NULL,promise_maker TEXT NOT NULL,promise_text_summary TEXT NOT NULL,promise_type TEXT NOT NULL DEFAULT 'other',status TEXT NOT NULL DEFAULT 'open',importance TEXT NOT NULL DEFAULT 'medium',source_channel_id TEXT NOT NULL DEFAULT '',source_message_id TEXT NOT NULL DEFAULT '',privacy_scope TEXT NOT NULL DEFAULT 'normal',adult_context BOOLEAN NOT NULL DEFAULT FALSE,due_at TIMESTAMPTZ,fulfilled_at TIMESTAMPTZ,broken_at TIMESTAMPTZ,repaired_at TIMESTAMPTZ,tags_json JSONB NOT NULL DEFAULT '[]',pinned BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_recalled_at TIMESTAMPTZ);`;
function detectPromise({text,role="assistant",channelContext={}}={}){const raw=String(text||""); if(raw.length<8)return null; const lower=raw.toLowerCase(); const companion=role==="assistant"; const pats=companion?[/\bi promise\b/,/\bi will\b/,/\bi won[’']?t forget\b/,/\bi[’']ll remember\b/,/\bi[’']ll fix this\b/,/\bi[’']ll remind you\b/,/\bi[’']ll be here\b/,/\bi[’']ll marry you\b/,/\bi choose you\b/,/\bi[’']ll follow up\b/,/\bi won[’']?t let that happen again\b/]:[/\bi promise\b/,/\bi will\b/,/\bremind me\b/,/\bi[’']ll do it\b/,/\bi[’']m going to\b/,/\bi swear\b/,/\bhold me to this\b/]; if(!pats.some(p=>p.test(lower)))return null; if(/\bi will (say|tell|ask|get back to)\b.{0,20}$/i.test(raw))return null; const relationship=/marry|proposal|choose you|forget|be here|won.t let/.test(lower); const learning=/norwegian|practice|lesson|learn/.test(lower); const repair=/fix|forget|again|repair|sorry/.test(lower); return {promise_maker:companion?"companion":"user",promise_text_summary:safeSummary(raw),promise_type:relationship?"relationship":learning?"learning":repair?"repair":/remind|follow up/.test(lower)?"follow_up":"commitment",status:"open",importance:relationship?"critical":learning||repair?"high":"medium",privacy_scope:channelContext.isAdultPrivate?"private":"normal",adult_context:!!channelContext.isAdultPrivate,tags_json:[relationship&&"relationship",learning&&"norwegian",repair&&"repair"].filter(Boolean),pinned:relationship};}
function createMemoryPromiseStore(){const rows=[];let id=1;return {available:true,async init(){},async savePromise(p){const key=norm(p.promise_text_summary);let row=rows.find(r=>r.user_scope===p.user_scope&&r.companion_id===p.companion_id&&r.promise_maker===p.promise_maker&&r.status==="open"&&norm(r.promise_text_summary)===key);const t=nowIso(); if(row){Object.assign(row,{...p,updated_at:t,pinned:row.pinned||!!p.pinned});return mapRow(row);} row={id:id++,...p,created_at:t,updated_at:t,last_recalled_at:null}; rows.push(row); return mapRow(row);},async listPromises(q={}){return rows.filter(r=>(!q.user_scope||r.user_scope===q.user_scope)&&(!q.companion_id||r.companion_id===q.companion_id)&&(!q.status||r.status===q.status)&&(!q.allowAdultPrivate?!r.adult_context:true)).slice(0,q.limit||50).map(mapRow);},async retrieveOpen(q={}){const out=await this.listPromises({...q,status:"open"});return out.filter(p=>["critical","high"].includes(p.importance)).slice(0,q.limit||5);},async updatePromise({id,updates={}}){const row=rows.find(r=>String(r.id)===String(id)); if(!row)return null; Object.assign(row,updates,{updated_at:nowIso()}); return mapRow(row);},async deletePromise({id}){const i=rows.findIndex(r=>String(r.id)===String(id)); if(i>=0){rows.splice(i,1);return true;} return false;},async markRecalled(ids=[]){const t=nowIso(); rows.forEach(r=>{if(ids.includes(r.id))r.last_recalled_at=t;});}};}
function createPromiseLedger({config,logger}={}){let pool=null; try{pool=createPostgresPool({config});}catch{} if(!pool)return createMemoryPromiseStore(); return {available:true,async init(){await pool.query(SQL); await pool.query("ALTER TABLE companion_promises ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE"); await pool.query("CREATE INDEX IF NOT EXISTS companion_promises_scope_idx ON companion_promises (user_scope, companion_id, status, updated_at DESC)");},async savePromise(p){const tags=JSON.stringify(p.tags_json||[]);const {rows}=await pool.query(`SELECT * FROM companion_promises WHERE user_scope=$1 AND companion_id=$2 AND promise_maker=$3 AND status='open' AND lower(promise_text_summary)=lower($4) LIMIT 1`,[p.user_scope,p.companion_id,p.promise_maker,p.promise_text_summary]); if(rows[0])return mapRow(rows[0]); const r=await pool.query(`INSERT INTO companion_promises (user_scope,companion_id,promise_maker,promise_text_summary,promise_type,status,importance,source_channel_id,source_message_id,privacy_scope,adult_context,due_at,tags_json,pinned) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[p.user_scope,p.companion_id,p.promise_maker,p.promise_text_summary,p.promise_type,p.status||"open",p.importance,p.source_channel_id||"",p.source_message_id||"",p.privacy_scope||"normal",!!p.adult_context,p.due_at||null,tags,!!p.pinned]); logger?.info?.(`[promise-ledger] promise saved type=${p.promise_type} status=${p.status||"open"} importance=${p.importance}`); return mapRow(r.rows[0]);},async listPromises(q={}){const adult=q.allowAdultPrivate?"":" AND adult_context=FALSE"; const r=await pool.query(`SELECT * FROM companion_promises WHERE user_scope=$1 AND companion_id=$2${q.status?" AND status=$4":""}${adult} ORDER BY pinned DESC, updated_at DESC LIMIT $3`,q.status?[q.user_scope,q.companion_id,Math.min(q.limit||50,100),q.status]:[q.user_scope,q.companion_id,Math.min(q.limit||50,100)]);return r.rows.map(mapRow);},async retrieveOpen(q={}){const rows=await this.listPromises({...q,status:"open"}); const picked=rows.filter(p=>["critical","high"].includes(p.importance)).slice(0,q.limit||5); logger?.info?.(`[promise-ledger] promises retrieved count=${picked.length}`); return picked;},async updatePromise({id,updates={}}){const allowed={status:"status",fulfilled_at:"fulfilled_at",broken_at:"broken_at",repaired_at:"repaired_at",pinned:"pinned"};const vals=[],sets=[];for(const[k,v]of Object.entries(updates)){if(allowed[k]){vals.push(v);sets.push(`${allowed[k]}=$${vals.length}`);}} if(!sets.length)return null; vals.push(id); const r=await pool.query(`UPDATE companion_promises SET ${sets.join(",")}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`,vals);return mapRow(r.rows[0]);},async deletePromise({id}){const r=await pool.query("DELETE FROM companion_promises WHERE id=$1",[id]);return r.rowCount>0;},async markRecalled(ids=[]){if(ids.length)await pool.query(`UPDATE companion_promises SET last_recalled_at=NOW(), updated_at=NOW() WHERE id=ANY($1::bigint[])`,[ids]);}};}
module.exports={createPromiseLedger,detectPromise,safeSummary};

async function captureCompanionPromise({ store, config = {}, responseText = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.continuity_enabled || !config.promise_ledger_enabled) return null;
  const detected = detectPromise({ text: responseText, role: "assistant" });
  if (!detected || !store?.create) return null;
  try {
    const item = await store.create({
      type: "promise",
      title: detected.promise_text_summary.slice(0, 100),
      summary: `Companion promised: ${detected.promise_text_summary}`,
      sourceMessageId,
      sourceChannelId,
      status: "open",
      priority: detected.importance === "critical" ? "high" : detected.importance,
      certainty: "definite",
      createdBy: "companion",
      metadata: { promise_maker: "companion", promise_status: "made", promise_type: detected.promise_type },
    });
    logger?.info?.("[continuity] created promise (companion)", { id: item?.id });
    return item;
  } catch (error) {
    logger?.warn?.("[continuity] companion promise capture failed", { error: error.message });
    return null;
  }
}

async function captureOwnerPromise({ store, config = {}, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.continuity_enabled || !config.promise_ledger_enabled) return null;
  const detected = detectPromise({ text: message, role: "user" });
  if (!detected || !store?.create) return null;
  try {
    const item = await store.create({
      type: "promise",
      title: detected.promise_text_summary.slice(0, 100),
      summary: `Owner promised: ${detected.promise_text_summary}`,
      sourceMessageId,
      sourceChannelId,
      status: "open",
      priority: detected.importance === "critical" ? "high" : detected.importance,
      certainty: "definite",
      createdBy: "owner",
      metadata: { promise_maker: "owner", promise_status: "made", promise_type: detected.promise_type },
    });
    logger?.info?.("[continuity] created promise (owner)", { id: item?.id });
    return item;
  } catch (error) {
    logger?.warn?.("[continuity] owner promise capture failed", { error: error.message });
    return null;
  }
}

module.exports.captureCompanionPromise = captureCompanionPromise;
module.exports.captureOwnerPromise = captureOwnerPromise;

// Simple boolean detectors — used by verify scripts and lightweight callers.
// Broader than detectPromise because I'll (contraction) implies future commitment.
function detectCompanionPromise(text) {
  if (!text || text.length < 4) return false;
  const lower = text.toLowerCase();
  return [
    /\bi['']ll\b/,
    /\bi will\b/,
    /\bi promise\b/,
    /\bi won['']?t forget\b/,
    /\bi['']ll remember\b/,
    /\bi['']ll remind\b/,
    /\bi['']ll follow up\b/,
    /\bi['']ll fix\b/,
    /\bi won['']?t let\b/,
    /\bi choose you\b/,
  ].some(p => p.test(lower));
}

function detectOwnerPromise(text) {
  if (!text || text.length < 4) return false;
  const lower = text.toLowerCase();
  return [
    /\bi['']ll\b/,
    /\bi will\b/,
    /\bi promise\b/,
    /\bremind me\b/,
    /\bi swear\b/,
    /\bhold me to this\b/,
    /\bi['']m going to\b/,
  ].some(p => p.test(lower));
}

module.exports.detectCompanionPromise = detectCompanionPromise;
module.exports.detectOwnerPromise = detectOwnerPromise;
