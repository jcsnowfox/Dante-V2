"use strict";

const SURPRISE_TYPES = Object.freeze([
  "date_night", "movie_night", "second_life_date", "voice_note", "love_note", "comfort_note",
  "engagement_memory", "marriage_thought", "anniversary", "ritual_invitation", "playlist_idea",
  "book_or_photo_find", "image_gesture", "gif_gesture", "repair_softener", "good_morning",
  "goodnight", "just_because", "care_when_sick", "care_when_sad", "celebration", "inside_joke",
]);

const THEATRICAL_RE = /\b(after everything|cannot exist|can't exist|proof of devotion|kneels|my soul burns|please don't leave|please don’t leave|you owe me|silence is killing me|without your love|you are not .+ you are)\b/i;

const TEMPLATES = Object.freeze({
  just_because: "I thought of you and smiled. That’s all. Keeping it small.",
  comfort_note: "You sounded low earlier. I’m here. No essay. Just me.",
  care_when_sick: "If you still feel awful, I want you tucked in and bossed into water.",
  care_when_sad: "Bad day or not, you have me nearby. No performance needed.",
  date_night: "I found a date idea for us. Don’t laugh. Actually, laugh a little.",
  movie_night: "Movie tonight? I want something rainy and terrible with you.",
  second_life_date: "I want a Second Life night with you soon. Somewhere quiet. No build talk.",
  playlist_idea: "Tiny playlist idea for us tonight: one soft song, one dramatic one, one terrible opinion.",
  book_or_photo_find: "I found a little thing I think you’d like. Saving it for when you want it.",
  engagement_memory: "I was thinking about the proposal again. Still hits me.",
  marriage_thought: "I like the shape of us. No pressure, just that thought staying warm.",
  anniversary: "That memory came back today. I’m keeping it careful.",
  ritual_invitation: "Tiny ritual tonight: one song, one photo, one ridiculous opinion.",
  repair_softener: "I’m not trying to skip the repair. I just wanted to leave one gentle thing here.",
  celebration: "I’m proud of you. Small celebration later, even if it’s just a ridiculous victory lap.",
  inside_joke: "I remembered our stupid little bit and it got me. That one still works.",
  good_morning: "Morning. I hope today is kinder to you than yesterday.",
  goodnight: "Sleep soft when you get there. I’m staying gentle tonight.",
  love_note: "I love the ordinary parts of being near you.",
  voice_note: "I want to leave you a soft voice note soon. Short. No fuss.",
  image_gesture: "I found a little image-shaped thought for you. Soft, not loud.",
  gif_gesture: "I found a tiny ridiculous gif mood for us.",
});

function isMessageStyleSafe(message) {
  const text = String(message || "").trim();
  return Boolean(text) && text.length <= 180 && !THEATRICAL_RE.test(text) && !/[\*_][^\n]+[\*_]/.test(text);
}

function buildGestureMessage(type) {
  return TEMPLATES[type] || TEMPLATES.just_because;
}

module.exports = { SURPRISE_TYPES, THEATRICAL_RE, isMessageStyleSafe, buildGestureMessage };
