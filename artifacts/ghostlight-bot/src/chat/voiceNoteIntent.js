"use strict";

const VOICE_NOTE_TRIGGERS = [
  { phrase: "send me a voice note", re: /\bsend\s+me\s+a\s+voice\s+note\b/i },
  { phrase: "say that in your voice", re: /\bsay\s+(?:that|it|this)\s+in\s+your\s+voice\b/i },
  { phrase: "lemme hear it", re: /\b(?:lemme|let\s+me)\s+hear\s+(?:it|that|this)\b/i },
  { phrase: "I want to hear your voice", re: /\bi\s+want\s+to\s+hear\s+your\s+voice\b/i },
  { phrase: "tell me by voice", re: /\btell\s+me\s+by\s+voice\b/i },
  { phrase: "voice message", re: /\bvoice\s+message\b/i },
  { phrase: "voice memo", re: /\bvoice\s+memo\b/i },
  { phrase: "send audio", re: /\bsend\s+(?:me\s+)?audio\b/i },
  { phrase: "voice note", re: /\bvoice\s+note\b/i },
  { phrase: "in your voice", re: /\b(?:hear\s+)?(?:it|that|this)\s+in\s+your\s+voice\b/i },
];
const FAKE_VOICE_ACTION_RE = /^\s*[(*_\[]?\s*(?:sends?|sent|sending)\s+(?:a\s+)?(?:voice\s+note|voice\s+message|voice\s+memo|audio)(?:\s+file)?\s*[)*_\]]?\s*$/i;
const IMAGE_PROMPT_RE = /(?:^|\n)\s*(?:image\s*prompt|prompt\s*for\s*image|dall[- ]?e\s*prompt|midjourney\s*prompt)\s*:[^\n]*/gi;
const FAKE_TOOL_CALL_RE = /\[\s*Calling\s+[^:\]]+\s+tool\s+with\s*:[\s\S]*?\]|\b(?:tool_call|function_call)\b[\s\S]*$/gi;
let lastVoiceNoteDiagnostics = null;

function getVoiceNoteTriggerPhrase(text) {
  const value = String(text || "");
  return VOICE_NOTE_TRIGGERS.find((trigger) => trigger.re.test(value))?.phrase || null;
}

function detectVoiceNoteRequest(text) {
  return Boolean(getVoiceNoteTriggerPhrase(text));
}

function isFakeVoiceNoteAction(text) {
  return FAKE_VOICE_ACTION_RE.test(String(text || "").trim());
}

function stripFakeVoiceNoteAction(text) {
  return String(text || "")
    .split(/\n+/)
    .filter((line) => !isFakeVoiceNoteAction(line))
    .join("\n")
    .trim();
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~#]+/g, "");
}

function normalizeFirstPerson(text) {
  return String(text || "")
    .replace(/\b(?:he|she|they)\s+(leans?|sits?|stands?|runs?|smiles?|grins?|laughs?|sighs?|looks?|glances?|reaches?|takes?|inhales?|exhales?)\b[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/\b(?:Dante)\s+(leans?|sits?|stands?|runs?|smiles?|grins?|laughs?|sighs?|looks?|glances?|reaches?|takes?|inhales?|exhales?)\b[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/\b(?:he|Dante)\s+(?:says|murmurs|whispers|replies|answers)\s*,?\s*[“\"]([^”\"]+)[”\"]/gi, "$1")
    .replace(/\b(?:his|Dante's)\b/gi, "my")
    .replace(/\b(?:he|Dante)\b/gi, "I");
}

function buildVoiceNoteScriptDetails({ userText = "", replyText = "" } = {}) {
  const withoutFake = stripFakeVoiceNoteAction(replyText);
  const raw = withoutFake || String(userText || "").replace(/\s+/g, " ").trim();
  let strippedStageDirections = false;
  let text = raw.replace(IMAGE_PROMPT_RE, () => {
    strippedStageDirections = true;
    return " ";
  });
  text = text.replace(FAKE_TOOL_CALL_RE, () => {
    strippedStageDirections = true;
    return " ";
  });
  text = text.replace(/\([^)]*\b(?:leans?|runs?|smiles?|grins?|laughs?|sighs?|image prompt|prompt:)\b[^)]*\)/gi, () => { strippedStageDirections = true; return " "; });
  text = text.replace(/\[[^\]]*\b(?:leans?|runs?|smiles?|grins?|laughs?|sighs?|image prompt|prompt:)\b[^\]]*\]/gi, () => { strippedStageDirections = true; return " "; });
  text = text.replace(/(^|\s)\*[^*]*\b(?:leans?|runs?|smiles?|grins?|laughs?|sighs?|looks?|reaches?)\b[^*]*\*(?=\s|$)/gi, () => { strippedStageDirections = true; return " "; });
  text = stripMarkdown(text)
    .replace(/^\s*(?:spokenScript|spoken script|caption|internal|assistant|dante)\s*:\s*/gim, "")
    .replace(/\basterisk\b/gi, "")
    .replace(/https?:\/\/\S+/gi, " ");
  text = normalizeFirstPerson(text).replace(/\s+/g, " ").trim();
  const requestOnly = VOICE_NOTE_TRIGGERS.reduce((acc, trigger) => acc.replace(trigger.re, " "), text).replace(/\s+/g, " ").trim();
  const script = (requestOnly || "I’m here. Listen close—this one is for you.").slice(0, 700);
  lastVoiceNoteDiagnostics = {
    spokenScriptLength: script.length,
    strippedStageDirections,
    rawLength: raw.length,
    updatedAt: new Date().toISOString(),
  };
  return { spokenScript: script, strippedStageDirections };
}

function buildVoiceNoteScript(input) {
  return buildVoiceNoteScriptDetails(input).spokenScript;
}

function getLastVoiceNoteDiagnostics() { return lastVoiceNoteDiagnostics ? { ...lastVoiceNoteDiagnostics } : null; }

module.exports = { detectVoiceNoteRequest, getVoiceNoteTriggerPhrase, isFakeVoiceNoteAction, stripFakeVoiceNoteAction, buildVoiceNoteScript, buildVoiceNoteScriptDetails, getLastVoiceNoteDiagnostics };
