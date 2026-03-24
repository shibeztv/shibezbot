require("dotenv").config();

const tmi          = require("tmi.js");
const fs           = require("fs");
const path         = require("path");
const MarkovChain  = require("./markov");
const stateManager = require("./state");
const commands     = require("./commands");
const filter       = require("./filter");

// ── Required env vars ─────────────────────────────────────────────────────────

const BOT_USERNAME         = process.env.BOT_USERNAME;
const OAUTH_TOKEN          = process.env.OAUTH_TOKEN;
const HOME_CHANNEL         = process.env.CHANNEL;
const SEED_FILE            = process.env.SEED_FILE || "./seed.txt";
const TWITCH_CLIENT_ID     = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const IGNORE_BOTS = (process.env.IGNORE_BOTS ||
  "nightbot,streamelements,fossabot,moobot,wizebot,botisimo")
  .split(",").map(b => b.trim().toLowerCase());

if (!BOT_USERNAME || !OAUTH_TOKEN || !HOME_CHANNEL) {
  console.error("❌  Missing required env vars: BOT_USERNAME, OAUTH_TOKEN, CHANNEL");
  process.exit(1);
}

// ── Load persistent state ─────────────────────────────────────────────────────

const state = stateManager.load();

if (!state.postChannels.includes(HOME_CHANNEL.toLowerCase())) {
  state.postChannels.unshift(HOME_CHANNEL.toLowerCase());
  stateManager.save(state);
}

function saveState() {
  stateManager.save(state);
}

// ── Per-channel setting helpers ───────────────────────────────────────────────

function getChannelInterval(ch) {
  return (state.channelSettings[ch] && state.channelSettings[ch].intervalMs != null)
    ? state.channelSettings[ch].intervalMs
    : state.intervalMs;
}

function getChannelCooldown(ch) {
  return (state.channelSettings[ch] && state.channelSettings[ch].cooldownMessages != null)
    ? state.channelSettings[ch].cooldownMessages
    : state.cooldownMessages;
}

function setChannelSetting(ch, key, value) {
  if (!state.channelSettings[ch]) state.channelSettings[ch] = {};
  state.channelSettings[ch][key] = value;
}

/** True when the broadcaster has paused posting in their own channel. */
function isChannelPaused(ch) {
  return !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
}

// ── Markov chain ──────────────────────────────────────────────────────────────

const markov = new MarkovChain(2);

if (fs.existsSync(SEED_FILE)) {
  const lines = fs.readFileSync(SEED_FILE, "utf8")
    .split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  markov.trainBulk(lines);
  console.log(`📚  Seed loaded: ${lines.length} lines | corpus: ${markov.size}`);
}

const DATA_DIR     = process.env.DATA_DIR || ".";
const LEARNED_FILE = path.join(DATA_DIR, "learned_corpus.txt");

if (fs.existsSync(LEARNED_FILE)) {
  const lines = fs.readFileSync(LEARNED_FILE, "utf8")
    .split("\n").map(l => l.trim()).filter(Boolean);
  markov.trainBulk(lines);
  console.log(`🧠  Learned corpus loaded: ${lines.length} extra lines | total: ${markov.size}`);
}

// ── Live channel tracking ─────────────────────────────────────────────────────

const liveChannels   = new Set();
let   appAccessToken = null;

async function fetchAppToken() {
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    const data = await res.json();
    return data.access_token || null;
  } catch (e) {
    console.warn("⚠️  Could not fetch Twitch app token:", e.message);
    return null;
  }
}

async function updateLiveChannels() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
  const channels = allChannels();
  if (channels.length === 0) return;
  try {
    if (!appAccessToken) appAccessToken = await fetchAppToken();
    if (!appAccessToken) return;
    const params = channels.map(ch => `user_login=${encodeURIComponent(ch)}`).join("&");
    let res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
      headers: { "Client-ID": TWITCH_CLIENT_ID, "Authorization": `Bearer ${appAccessToken}` }
    });
    if (res.status === 401) {
      appAccessToken = await fetchAppToken();
      if (!appAccessToken) return;
      res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
        headers: { "Client-ID": TWITCH_CLIENT_ID, "Authorization": `Bearer ${appAccessToken}` }
      });
    }
    const data = await res.json();
    liveChannels.clear();
    for (const stream of (data.data || [])) liveChannels.add(stream.user_login.toLowerCase());
    console.log(`📡  [${ts()}] Live: ${liveChannels.size > 0 ? [...liveChannels].join(", ") : "(none)"}`);
  } catch (e) {
    console.warn("⚠️  Could not update live channels:", e.message);
  }
}

// ── Generic Helix API helper ──────────────────────────────────────────────────

async function helixGet(path) {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not configured");
  }
  if (!appAccessToken) appAccessToken = await fetchAppToken();
  if (!appAccessToken) throw new Error("Could not obtain Twitch app token");

  const url = `https://api.twitch.tv/helix/${path}`;
  let res = await fetch(url, {
    headers: { "Client-ID": TWITCH_CLIENT_ID, "Authorization": `Bearer ${appAccessToken}` },
  });
  if (res.status === 401) {
    appAccessToken = await fetchAppToken();
    if (!appAccessToken) throw new Error("Token refresh failed");
    res = await fetch(url, {
      headers: { "Client-ID": TWITCH_CLIENT_ID, "Authorization": `Bearer ${appAccessToken}` },
    });
  }
  return res.json();
}

function isChannelLive(ch) {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return true;
  return liveChannels.has(ch.toLowerCase());
}

setInterval(updateLiveChannels, 2 * 60 * 1000);

// ── Per-channel message counters (for cooldown) ───────────────────────────────

const msgCounters = {};

function resetCooldownCounters(ch) {
  if (ch) {
    msgCounters[ch] = 0;
  } else {
    for (const c of state.postChannels) msgCounters[c] = 0;
  }
}

function incrementCounter(ch) {
  if (!(ch in msgCounters)) msgCounters[ch] = 0;
  msgCounters[ch]++;
}

function cooldownReady(ch) {
  const needed = getChannelCooldown(ch);
  if (!needed || needed === 0) return true;
  return (msgCounters[ch] || 0) >= needed;
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

// ── Per-channel timers ────────────────────────────────────────────────────────
// Each post channel gets its own independent timer.

const postTimers = {};  // { channelName: intervalId }

function stopTimer(ch) {
  if (ch) {
    if (postTimers[ch]) { clearInterval(postTimers[ch]); delete postTimers[ch]; }
  } else {
    for (const c of Object.keys(postTimers)) { clearInterval(postTimers[c]); delete postTimers[c]; }
  }
}

function restartTimer(ch) {
  if (ch) {
    // Restart a single channel's timer
    stopTimer(ch);
    if (!state.active || !state.postChannels.includes(ch)) return;
    if (isChannelPaused(ch)) {
      console.log(`⏸️   [#${ch}] Skipping timer restart — paused by broadcaster.`);
      return;
    }
    const ms = getChannelInterval(ch);
    postTimers[ch] = setInterval(() => postNow(ch), ms);
    console.log(`⏱️   [#${ch}] Timer set to ${ms / 1000}s.`);
  } else {
    // Restart all channels
    stopTimer();
    if (!state.active) return;
    for (const c of state.postChannels) {
      if (isChannelPaused(c)) {
        console.log(`⏸️   [#${c}] Skipping timer restart — paused by broadcaster.`);
        continue;
      }
      const ms = getChannelInterval(c);
      postTimers[c] = setInterval(() => postNow(c), ms);
      console.log(`⏱️   [#${c}] Timer set to ${ms / 1000}s.`);
    }
  }
}

// ── Post a Markov message ─────────────────────────────────────────────────────

function postNow(channel) {
  const ch = channel.replace(/^#/, "");
  if (markov.size < state.minCorpus) return null;
  if (!cooldownReady(ch)) {
    const needed    = getChannelCooldown(ch);
    const remaining = needed - (msgCounters[ch] || 0);
    console.log(`⏳  [${ts()}] #${ch}: cooldown — ${remaining} more message(s) needed.`);
    return null;
  }
  // Try up to 5 times to get a message that passes the TOS filter.
  let msg = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = markov.generate({ minWords: 6, maxWords: 28 });
    if (!candidate) break;
    const result = filter.check(candidate);
    if (result.ok) { msg = candidate; break; }
    console.warn(`🚫  [${ts()}] #${ch}: filtered (${result.reason}) — "${candidate}"`);
  }
  if (!msg) {
    console.warn(`⚠️  [${ts()}] #${ch}: all candidates blocked by TOS filter, skipping.`);
    return null;
  }
  const target = channel.startsWith("#") ? channel : `#${channel}`;
  client.say(target, msg).catch(err =>
    console.warn(`⚠️  [${ts()}] say() failed on ${target}:`, err.message)
  );
  msgCounters[ch] = 0;
  console.log(`💬  [${ts()}] → ${target}: "${msg}"`);
  return msg;
}

// ── Join / leave channels dynamically ────────────────────────────────────────

function joinChannel(ch) {
  const name = ch.startsWith("#") ? ch : `#${ch}`;
  client.join(name).catch(err => console.warn(`⚠️  Could not join ${name}:`, err.message));
}

function leaveChannel(ch) {
  stopTimer(ch);
  const name = ch.startsWith("#") ? ch : `#${ch}`;
  client.part(name).catch(err => console.warn(`⚠️  Could not leave ${name}:`, err.message));
}

// ── Learn from chat messages ──────────────────────────────────────────────────

const newLines = [];

// ── Per-user tracking ─────────────────────────────────────────────────────────

const userLastMessage = {};        // { username: "last message text" }
const userMessages    = {};        // { username: ["msg1", "msg2", ...] } (capped at 150)
const USER_MSG_CAP = 150;

function learnMessage(username, message) {
  if (IGNORE_BOTS.includes(username.toLowerCase())) return;
  if (username.toLowerCase() === BOT_USERNAME.toLowerCase()) return;
  if (message.startsWith("!") || message.startsWith("/") || message.startsWith("$") || message.startsWith("&")) return;
  if (message.length < 10) return;
  markov.train(message);
  newLines.push(message.replace(/[\r\n]/g, " "));

  // Track per-user messages for &markov and &mock
  const u = username.toLowerCase();
  userLastMessage[u] = message;
  if (!userMessages[u]) userMessages[u] = [];
  userMessages[u].push(message);
  if (userMessages[u].length > USER_MSG_CAP) userMessages[u].shift();
}

setInterval(() => {
  if (newLines.length === 0) return;
  fs.appendFileSync(LEARNED_FILE, newLines.join("\n") + "\n", "utf8");
  console.log(`💾  Saved ${newLines.length} new lines. Total corpus: ${markov.size}`);
  newLines.length = 0;
}, 60_000);

// ── Command context ───────────────────────────────────────────────────────────

const ctx = {
  state, saveState,
  markov,
  client,
  restartTimer, stopTimer,
  postNow,
  joinChannel, leaveChannel,
  resetCooldownCounters,
  getChannelInterval, getChannelCooldown, setChannelSetting,
  helixGet,
  userLastMessage,
  userMessages,
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
  console.log(`📚  Corpus: ${markov.size} lines`);
  if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    console.log(`🔴  Live channel tracking: enabled`);
    updateLiveChannels();
  } else {
    console.log(`⚠️  Live channel tracking: disabled (TWITCH_CLIENT_ID/SECRET not set)`);
  }
  if (state.active) restartTimer();
});

client.on("message", (channel, tags, message, self) => {
  if (self) return;

  const username       = (tags["display-name"] || tags.username || "").toLowerCase();
  const ch             = channel.replace(/^#/, "");
  const manualChannels = state.manualChannels || [];

  if (state.postChannels.includes(ch) || state.learnChannels.includes(ch)) {
    if (isChannelLive(ch)) learnMessage(username, message);
  }

  if (state.postChannels.includes(ch)) incrementCounter(ch);

  // ── First-message greeter (uses Twitch native first-msg tag) ────────────
  if (
    state.greeterEnabled &&
    state.postChannels.includes(ch) &&
    tags["first-msg"] === "1" &&
    !IGNORE_BOTS.includes(username)
  ) {
    if (markov.size >= state.minCorpus) {
      const greeting = markov.generate({ minWords: 5, maxWords: 18 });
      if (greeting) {
        client.say(channel, `@${username} ${greeting}`).catch(() => {});
      }
    }
  }

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

process.on("unhandledRejection", (reason) => {
  console.error("⚠️  Unhandled rejection (continuing):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("⚠️  Uncaught exception (continuing):", err.message);
});

client.connect().catch(err => {
  console.error("❌  Connection failed:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n🛑  Shutting down…");
  if (newLines.length > 0) fs.appendFileSync(LEARNED_FILE, newLines.join("\n") + "\n", "utf8");
  saveState();
  client.disconnect();
  process.exit(0);
});

function ts() {
  return new Date().toLocaleTimeString();
}
