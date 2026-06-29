"use strict";

const VOICE_NOTE_REQUEST_RE = /\b(?:send\s+me\s+a\s+voice\s+note|lemme\s+hear\s+it|i\s+want\s+to\s+hear\s+it\s+in\s+your\s+voice|say\s+it\s+in\s+your\s+voice|voice\s+message|voice\s+memo|send\s+audio)\b/i;
const FAKE_VOICE_ACTION_RE = /^\s*[(*_\[]?\s*(?:sends?|sent|sending)\s+(?:a\s+)?(?:voice\s+note|voice\s+message|voice\s+memo|audio)(?:\s+file)?\s*[)*_\]]?\s*$/i;

function detectVoiceNoteRequest(text) {
  return VOICE_NOTE_REQUEST_RE.test(String(text || ""));
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

function buildVoiceNoteScript({ userText = "", replyText = "" } = {}) {
  const cleanedReply = stripFakeVoiceNoteAction(replyText).replace(/\s+/g, " ").trim();
  if (cleanedReply) return cleanedReply.slice(0, 700);
  const cleanedUser = String(userText || "").replace(VOICE_NOTE_REQUEST_RE, "").replace(/\s+/g, " ").trim();
  return (cleanedUser || "I’m here. Listen close—this one is for you.").slice(0, 700);
}

module.exports = { detectVoiceNoteRequest, isFakeVoiceNoteAction, stripFakeVoiceNoteAction, buildVoiceNoteScript };
