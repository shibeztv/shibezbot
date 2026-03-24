require("dotenv").config();

const tmi          = require("tmi.js");
const fs           = require("fs");
const path         = require("path");
const MarkovChain  = require("./markov");
const stateManager = require("./state");
const commands     = require("./commands");

// ── Required env vars ─────────────────────────────────────────────────────────

const BOT_USERNAME = process.env.BOT_USERNAME;
const OAUTH_TOKEN  = process.env.OAUTH_TOKEN;
const HOME_CHANNEL = process.env.CHANNEL;       // the bot's "home" channel (also used for command replies)
const SEED_FILE    = process.env.SEED_FILE || "./seed.txt";

const IGNORE_BOTS = (process.env.IGNORE_BOTS ||
  "nightbot,streamelements,fossabot,moobot,wizebot,botisimo")
  .split(",").map(b => b.trim().toLowerCase());

if (!BOT_USERNAME || !OAUTH_TOKEN || !HOME_CHANNEL) {
  console.error("❌  Missing required env vars: BOT_USERNAME, OAUTH_TOKEN, CHANNEL");
  process.exit(1);
}

// ── Load persistent state ─────────────────────────────────────────────────────

const state = stateManager.load();

// Always ensure home channel is in postChannels
if (!state.postChannels.includes(HOME_CHANNEL.toLowerCase())) {
  state.postChannels.unshift(HOME_CHANNEL.toLowerCase());
  stateManager.save(state);
}

function saveState() {
  stateManager.save(state);
}

// ── Markov chain ──────────────────────────────────────────────────────────────

const markov = new MarkovChain(2);

if (fs.existsSync(SEED_FILE)) {
  const lines = fs.readFileSync(SEED_FILE, "utf8")
    .split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  markov.trainBulk(lines);
  console.log(`📚  Seed loaded: ${lines.length} lines | corpus: ${markov.size}`);
}

// Also load previously learned corpus if it exists
const LEARNED_FILE = "./learned_corpus.txt";
if (fs.existsSync(LEARNED_FILE)) {
  const lines = fs.readFileSync(LEARNED_FILE, "utf8")
    .split("\n").map(l => l.trim()).filter(Boolean);
  markov.trainBulk(lines);
  console.log(`🧠  Learned corpus loaded: ${lines.length} extra lines | total: ${markov.size}`);
}

// ── Per-channel message counter (for cooldown) ────────────────────────────────
// Tracks how many non-bot messages have been sent since the bot last posted
// in each channel. Reset to 0 after the bot posts.
const msgCounters = {};  // { channelName: number }

function resetCooldownCounters() {
  for (const ch of state.postChannels) msgCounters[ch] = 0;
}

function incrementCounter(ch) {
  if (!(ch in msgCounters)) msgCounters[ch] = 0;
  msgCounters[ch]++;
}

function cooldownReady(ch) {
  if (!state.cooldownMessages || state.cooldownMessages === 0) return true;
  return (msgCounters[ch] || 0) >= state.cooldownMessages;
}



function allChannels() {
  return [...new Set([...state.postChannels, ...state.learnChannels, ...(state.manualChannels||[])])];
}

// ── Twitch client ─────────────────────────────────────────────────────────────

const client = new tmi.Client({
  options:    { debug: false },
  connection: { reconnect: true, secure: true },
  identity:   { username: BOT_USERNAME, password: OAUTH_TOKEN },
  channels:   allChannels(),
});

// ── Timer ─────────────────────────────────────────────────────────────────────

let postTimer = null;

function stopTimer() {
  if (postTimer) { clearInterval(postTimer); postTimer = null; }
}

function restartTimer() {
  stopTimer();
  if (!state.active) return;
  postTimer = setInterval(() => {
    for (const ch of state.postChannels) postNow(ch);
  }, state.intervalMs);
  console.log(`⏱️   Timer (re)started at ${state.intervalMs / 1000}s interval.`);
}

// ── Post a Markov message to a specific channel ───────────────────────────────

function postNow(channel) {
  const ch = channel.replace(/^#/, "");
  if (markov.size < state.minCorpus) return null;
  if (!cooldownReady(ch)) {
    const remaining = state.cooldownMessages - (msgCounters[ch] || 0);
    console.log(`⏳  [${ts()}] #${ch}: cooldown active — ${remaining} more message(s) needed.`);
    return null;
  }
  const msg = markov.generate({ minWords: 6, maxWords: 28 });
  if (!msg) return null;
  const target = channel.startsWith("#") ? channel : `#${channel}`;
  client.say(target, msg).catch(err =>
    console.warn(`⚠️  [${ts()}] say() failed on ${target}:`, err.message)
  );
  msgCounters[ch] = 0;  // reset counter after posting
  console.log(`💬  [${ts()}] → ${target}: "${msg}"`);
  return msg;
}

// ── Join / leave channels dynamically ────────────────────────────────────────

function joinChannel(ch) {
  const name = ch.startsWith("#") ? ch : `#${ch}`;
  client.join(name).catch(err =>
    console.warn(`⚠️  Could not join ${name}:`, err.message)
  );
}

function leaveChannel(ch) {
  const name = ch.startsWith("#") ? ch : `#${ch}`;
  client.part(name).catch(err =>
    console.warn(`⚠️  Could not leave ${name}:`, err.message)
  );
}

// ── Learn from chat messages ──────────────────────────────────────────────────

const newLines = [];

function learnMessage(username, message) {
  if (IGNORE_BOTS.includes(username.toLowerCase())) return;
  if (username.toLowerCase() === BOT_USERNAME.toLowerCase()) return;
  if (message.startsWith("!") || message.startsWith("/") || message.startsWith("$")) return;
  if (message.length < 10) return;

  markov.train(message);
  newLines.push(message.replace(/[\r\n]/g, " "));
}

// Flush learned lines to disk every 60s
setInterval(() => {
  if (newLines.length === 0) return;
  fs.appendFileSync(LEARNED_FILE, newLines.join("\n") + "\n", "utf8");
  console.log(`💾  Saved ${newLines.length} new lines. Total corpus: ${markov.size}`);
  newLines.length = 0;
}, 60_000);

// ── Command context (passed to commands.js) ───────────────────────────────────

const ctx = {
  state, saveState,
  markov,
  restartTimer, stopTimer,
  postNow,
  joinChannel, leaveChannel,
  resetCooldownCounters,
  addLearnChannel: (ch) => {
    if (!state.learnChannels.includes(ch)) state.learnChannels.push(ch);
  },
  removeLearnChannel: (ch) => {
    const i = state.learnChannels.indexOf(ch);
    if (i !== -1) state.learnChannels.splice(i, 1);
  },
};

// ── Twitch events ─────────────────────────────────────────────────────────────

client.on("connected", (addr, port) => {
  console.log(`✅  Connected to ${addr}:${port} as ${BOT_USERNAME}`);
  console.log(`📡  Channels: ${allChannels().join(", ")}`);
  console.log(`⏱️   Interval: ${state.intervalMs / 1000}s | Active: ${state.active}`);
  console.log(`📚  Corpus: ${markov.size} lines`);

  if (state.active) restartTimer();
});

client.on("message", (channel, tags, message, self) => {
  if (self) return;

  const username = (tags["display-name"] || tags.username || "").toLowerCase();
  const ch       = channel.replace(/^#/, "");
  const manualChannels = state.manualChannels || [];

  // Learn from all joined channels (post, manual, and learn)
  if (state.postChannels.includes(ch) || state.learnChannels.includes(ch)) {
    learnMessage(username, message);
  }

  // Count messages for cooldown — only in auto-post channels
  if (state.postChannels.includes(ch)) {
    incrementCounter(ch);
  }

  // Handle commands in post channels AND manual channels (but not learn-only)
  if (!state.postChannels.includes(ch) && !manualChannels.includes(ch)) return;

  const reply = commands.handle(channel, tags, message, ctx);
  if (reply) {
    client.say(channel, reply).catch(err =>
      console.warn(`⚠️  say() failed on ${channel}:`, err.message)
    );
  }
});

client.on("disconnected", (reason) => {
  console.warn(`⚡  Disconnected: ${reason} — tmi.js will attempt to reconnect.`);
});

client.on("reconnect", () => {
  console.log(`🔄  Reconnecting to Twitch…`);
});

// ── Safety net — prevent Railway crashes on unhandled async errors ─────────────

process.on("unhandledRejection", (reason) => {
  console.error("⚠️  Unhandled rejection (continuing):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("⚠️  Uncaught exception (continuing):", err.message);
});

// ── Connect ───────────────────────────────────────────────────────────────────

client.connect().catch(err => {
  console.error("❌  Connection failed:", err);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("\n🛑  Shutting down…");
  if (newLines.length > 0) {
    fs.appendFileSync(LEARNED_FILE, newLines.join("\n") + "\n", "utf8");
  }
  saveState();
  client.disconnect();
  process.exit(0);
});

// ── Utility ───────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString();
}
