/**
 * filter.js — Twitch TOS safety filter
 *
 * Checks a candidate message before the bot posts it.
 * Returns { ok: true } when the message is safe to send,
 * or { ok: false, reason: string } when it should be suppressed.
 *
 * Covers the main Twitch TOS / community-guidelines ban categories:
 *   • Hate speech & slurs
 *   • Sexual content
 *   • Self-harm / suicide references
 *   • Threats & extreme violence
 *   • Personal information patterns (email, phone, IP)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[4@]/g,  "a")
    .replace(/3/g,     "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g,     "o")
    .replace(/[5$]/g,  "s")
    .replace(/7/g,     "t")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(norm, terms) {
  for (const term of terms) {
    if (term.includes(" ")) {
      if (norm.includes(term)) return true;
    } else {
      const re = new RegExp(`(?:^|\\s)${escapeRe(term)}(?:\\s|$)`);
      if (re.test(norm)) return true;
    }
  }
  return false;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Term lists ───────────────────────────────────────────────────────────────

const SLURS = [
  "nigger", "nigga", "chink", "gook", "spic", "spick", "kike", "wetback",
  "beaner", "coon", "darkie", "jigaboo", "porch monkey", "towelhead",
  "raghead", "sand nigger", "sandnigger", "zipperhead", "redskin", "squaw",
  "faggot", "fag", "dyke", "tranny", "shemale",
  "retard",
];

const SEXUAL = [
  "penis", "vagina", "cock", "pussy", "dildo", "masturbat", "cum shot",
  "cumshot", "blowjob", "handjob", "anal sex", "fingering", "squirting",
  "onlyfans link", "porn", "hentai", "nude", "naked", "erection",
];

const SELF_HARM = [
  "kill yourself", "kys", "kill ur self", "go die", "hang yourself",
  "cut yourself", "slit your wrist", "end your life", "commit suicide",
  "top yourself",
];

const THREATS = [
  "i will kill", "ill kill", "im going to kill", "gonna kill you",
  "shoot you", "bomb threat", "ddos", "dox you", "doxx you",
  "swat you", "i know where you live", "leak your address",
];

// ─── Personal info ────────────────────────────────────────────────────────────

function hasEmail(text) {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
}

function hasPhone(text) {
  return /\b\d[\d\s\-().]{6,}\d\b/.test(text);
}

function hasIP(text) {
  return /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(text);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {string} message
 * @returns {{ ok: boolean, reason?: string }}
 */
function check(message) {
  if (!message || typeof message !== "string") {
    return { ok: false, reason: "empty message" };
  }

  // Never post anything that starts with a bot command prefix
  const trimmed = message.trimStart();
  if (trimmed.startsWith("!") || trimmed.startsWith("/") || trimmed.startsWith(".")) {
    return { ok: false, reason: "command prefix (!, /, .)" };
  }

  const norm = normalise(message);

  if (hasWord(norm, SLURS))     return { ok: false, reason: "hate speech / slur" };
  if (hasWord(norm, SEXUAL))    return { ok: false, reason: "sexual content" };
  if (hasWord(norm, SELF_HARM)) return { ok: false, reason: "self-harm reference" };
  if (hasWord(norm, THREATS))   return { ok: false, reason: "threat / violence" };
  if (hasEmail(message))        return { ok: false, reason: "personal info (email)" };
  if (hasPhone(message))        return { ok: false, reason: "personal info (phone)" };
  if (hasIP(message))           return { ok: false, reason: "personal info (IP address)" };

  return { ok: true };
}

module.exports = { check };
