require("dotenv").config();

const tmi          = require("tmi.js");
const fs           = require("fs");
const path         = require("path");
const MarkovChain  = require("./markov");
const stateManager = require("./state");
const commands     = require("./commands");
const filter       = require("./filter");

const BOT_START = Date.now(); // used by ?ping for uptime

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
  const homeCh = HOME_CHANNEL.toLowerCase();
  console.warn(`⚠️  Home channel #${homeCh} was missing from postChannels — re-adding.`);
  state.postChannels.unshift(homeCh);
  // Only apply fresh defaults if there are no existing settings for this channel
  if (!state.channelSettings[homeCh]) {
    state.channelSettings[homeCh] = {};
    state.channelSettings[homeCh].paused    = true;
    state.channelSettings[homeCh].onlineOnly = true;
    state.channelSettings[homeCh].intervalMs = 3_600_000;
  }
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

const CORPUS_LOAD_LIMIT = 100_000;  // cap startup load to avoid OOM on low-RAM hosts
if (fs.existsSync(LEARNED_FILE)) {
  let lines = fs.readFileSync(LEARNED_FILE, "utf8")
    .split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > CORPUS_LOAD_LIMIT) {
    console.log(`✂️   Corpus has ${lines.length} lines — loading last ${CORPUS_LOAD_LIMIT} only.`);
    lines = lines.slice(-CORPUS_LOAD_LIMIT);
  }
  markov.trainBulk(lines);
  console.log(`🧠  Learned corpus loaded: ${lines.length} lines | total: ${markov.size}`);
}

// ── Live channel tracking ─────────────────────────────────────────────────────

const liveChannels     = new Set();
const prevLiveChannels = new Set(); // tracks previous state to detect go-live
const prevCategories   = {};         // { channelName: "category name" }
let   appAccessToken   = null;

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
  // Always include xqc and forsen so category tracking works for ?xqcrun and ?forsenrun
  const TRACKED_EXTRA = ["xqc", "forsen"];
  const channels = [...new Set([...allChannels(), ...TRACKED_EXTRA])];
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
    // Snapshot previous state before updating
    const snapshot = new Set(prevLiveChannels);

    prevLiveChannels.clear();
    liveChannels.forEach(ch => prevLiveChannels.add(ch));
    liveChannels.clear();
    for (const stream of (data.data || [])) {
      liveChannels.add(stream.user_login.toLowerCase());
    }
    console.log(`📡  [${ts()}] Live: ${liveChannels.size > 0 ? [...liveChannels].join(", ") : "(none)"}`);

    // Build a map of current stream info for category tracking
    const streamInfo = {};
    for (const stream of (data.data || [])) {
      streamInfo[stream.user_login.toLowerCase()] = stream.game_name || "";
    }

    // Helper: batch-ping subscribers for a specific event
    function fireNotification(ch, event, message) {
      const chUsers = (state.notifyUsers && state.notifyUsers[ch]) || {};
      const users = chUsers[event] || [];
      if (users.length === 0) return;
      const prefix = `${message} `;
      const chunks = [];
      let current = [];
      let len = prefix.length;
      for (const u of users) {
        const part = `@${u} `;
        if (len + part.length > 490 && current.length > 0) {
          chunks.push(current);
          current = [];
          len = prefix.length;
        }
        current.push(u);
        len += part.length;
      }
      if (current.length > 0) chunks.push(current);
      const target = `#${ch}`;
      chunks.forEach((chunk, i) => {
        setTimeout(() => {
          client.say(target, prefix + chunk.map(u => `@${u}`).join(" ")).catch(() => {});
        }, i * 500);
      });
    }

    function notifyEvent(ch, event) {
      const chUsers = (state.notifyUsers && state.notifyUsers[ch]) || {};
      return (chUsers[event] || []).length > 0;
    }

    const allTracked = new Set([...snapshot, ...liveChannels]);
    for (const ch of allTracked) {
      const wasLive  = snapshot.has(ch);
      const isLive   = liveChannels.has(ch);

      // 🔴 Went live
      if (!wasLive && isLive && notifyEvent(ch, "live")) {
        const cat = streamInfo[ch] ? ` — playing ${streamInfo[ch]}` : "";
        fireNotification(ch, "live", `🔴 ${ch} is now live${cat}!`);
        console.log(`🔴  [${ts()}] Fired live notification in #${ch}.`);
      }

      // ⚫ Went offline
      if (wasLive && !isLive && notifyEvent(ch, "offline")) {
        fireNotification(ch, "offline", `⚫ ${ch} has gone offline.`);
        console.log(`⚫  [${ts()}] Fired offline notification in #${ch}.`);
      }

      // 🎮 Category changed (only while live)
      if (isLive && notifyEvent(ch, "category")) {
        const newCat  = streamInfo[ch] || "";
        const prevCat = prevCategories[ch];
        if (prevCat !== undefined && prevCat !== newCat && newCat) {
          fireNotification(ch, "category", `🎮 ${ch} switched to ${newCat}!`);
          console.log(`🎮  [${ts()}] Fired category change notification in #${ch}: ${prevCat} → ${newCat}.`);
        }
      }

      // Update category memory
      if (isLive) prevCategories[ch] = streamInfo[ch] || "";
      else delete prevCategories[ch];
    }
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

setInterval(updateLiveChannels, 10 * 60 * 1000);  // every 10 min

// ── xQc MC speedrun alert ─────────────────────────────────────────────────────
// Polls the xqcmc tracker every 45s while xQc is live.
// Fires a chat alert in all post + manual channels when his run hits 11 minutes.
// Resets automatically when his timer drops back below the threshold (new run).
//
// API endpoint: GET https://xqcmc.piggeywig2000.dev/api/time/latest?streamer=xqc

const partnerChannels = new Set(); // kept for partner detection (fetchPartnerChannels)

async function fetchPartnerChannels() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
  const joined = allChannels();
  if (!joined.length) return;
  try {
    const chunks = [];
    for (let i = 0; i < joined.length; i += 100) chunks.push(joined.slice(i, i + 100));
    partnerChannels.clear();
    for (const chunk of chunks) {
      const params = chunk.map(ch => `login=${encodeURIComponent(ch)}`).join("&");
      const data   = await helixGet(`users?${params}`);
      for (const u of (data.data || [])) {
        if (u.broadcaster_type === "partner") partnerChannels.add(u.login.toLowerCase());
      }
    }
    console.log(`🌟  Partner channels: ${[...partnerChannels].join(", ") || "(none)"}`);
  } catch (e) {
    console.warn("⚠️  Could not fetch partner status:", e.message);
  }
}

setInterval(fetchPartnerChannels, 10 * 60 * 1000);

const XQCMC_THRESHOLD  = 11 * 60;   // 11 minutes in seconds
const XQCMC_POLL_MS    = 45_000;    // poll every 45s

let xqcMcAlertFired   = false;
let xqcMcLastGameSecs = 0;
let xqcMcLastRunSecs  = 0;
let xqcMcLatestData   = null;

const XQCMC_URLS = [
  "https://xqcmc.piggeywig2000.dev/api/time/latest?streamer=xqc",
  "https://xqcmc.piggeywig2000.dev/api/times/latest?streamer=xqc",
  "https://xqcmc.piggeywig2000.dev/api/Times/latest?streamer=xqc",
  "https://xqcmc.piggeywig2000.dev/api/times?streamer=xqc",
];

function parseTimeToSecs(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return 0;
}

function formatRunTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function extractGameTime(entry) {
  const direct = entry.gameTime || entry.game_time || entry.GameTime ||
                 entry.time || entry.timer || entry.runTime || entry.run_time || "";
  if (direct) return direct;
  const nested = entry.data || entry.result || entry.payload;
  if (nested && typeof nested === "object") {
    return nested.gameTime || nested.game_time || nested.GameTime ||
           nested.time || nested.timer || "";
  }
  return "";
}

function extractRealTime(entry) {
  const direct = entry.realTime || entry.real_time || entry.RealTime || "";
  if (direct) return direct;
  const nested = entry.data || entry.result || entry.payload;
  if (nested && typeof nested === "object") {
    return nested.realTime || nested.real_time || nested.RealTime || "";
  }
  return "";
}

async function checkXqcMc() {
  const twitchTracking = TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET;
  if (twitchTracking && liveChannels.size > 0 && !liveChannels.has("xqc")) return;

  try {
    let data = null;

    for (const url of XQCMC_URLS) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "shibez-bot/1.0" } });
        if (!res.ok) { console.warn(`🎮 [xqcmc] HTTP ${res.status} from ${url}`); continue; }
        const text = await res.text();
        console.log(`🎮 [xqcmc] Raw response from ${url}: ${text.slice(0, 300)}`);
        data = JSON.parse(text);
        break;
      } catch (urlErr) {
        console.warn(`🎮 [xqcmc] Failed ${url}: ${urlErr.message}`);
      }
    }

    if (!data) { console.warn("🎮 [xqcmc] All URL variants failed."); return; }

    const entry = Array.isArray(data) ? data[data.length - 1] : data;
    if (!entry) return;
    xqcMcLatestData = entry;

    // API returns seconds as a number (game_time, igt) — parseFloat handles both
    // numbers and numeric strings. parseTimeToSecs is the fallback for "MM:SS" strings.
    const gameSecs =
      entry.igt       != null ? parseFloat(entry.igt) :
      entry.gameTime  != null ? parseFloat(entry.gameTime) :
      entry.game_time != null ? parseFloat(entry.game_time) :
      parseTimeToSecs(extractGameTime(entry));

    if (!gameSecs || gameSecs === 0) {
      console.log(`🎮 [xqcmc] Timer is zero — no active run.`);
      return;
    }

    if (gameSecs < xqcMcLastGameSecs - 30) {
      if (xqcMcLastGameSecs > 0) xqcMcLastRunSecs = xqcMcLastGameSecs;
      console.log(`🎮 [xqcmc] Timer reset (${formatRunTime(xqcMcLastGameSecs)} → ${formatRunTime(gameSecs)}) — alert ready for next run.`);
      xqcMcAlertFired = false;
    }
    xqcMcLastGameSecs = gameSecs;
    if (gameSecs > 0) xqcMcLastRunSecs = gameSecs;

    if (!xqcMcAlertFired && gameSecs >= XQCMC_THRESHOLD && gameSecs < 30 * 60) {
      xqcMcAlertFired = true;
      const timeStr = formatRunTime(gameSecs);
      const hint    = "| type ?forsenalert to get notified!";

      const targets = [...new Set([...state.postChannels, ...(state.manualChannels || [])])].filter(ch => ch !== "xqc");
      for (const ch of targets) {
        const channelSubs = (state.forsenAlertChannels && state.forsenAlertChannels[ch]) || [];
        const alertMsg    = `xqcSmile 🎯 xQc is on a god run! Current time: ${timeStr} — twitch.tv/xqc ${hint}`;
        const CHUNK_SIZE  = 7;
        if (channelSubs.length === 0) {
          client.say(`#${ch}`, alertMsg).catch(() => {});
        } else {
          for (let i = 0; i < channelSubs.length; i += CHUNK_SIZE) {
            const chunk = channelSubs.slice(i, i + CHUNK_SIZE);
            const msg   = `${chunk.map(u => `@${u}`).join(" ")} ${alertMsg}`;
            setTimeout(() => client.say(`#${ch}`, msg.slice(0, 499)).catch(() => {}), Math.floor(i / CHUNK_SIZE) * 1800);
          }
        }
        console.log(`🎮 [xqcmc] Firing alert in #${ch} (${channelSubs.length} subs, ${Math.ceil(channelSubs.length / 7) || 1} msg(s))`);
      }
    }
  } catch (e) {
    console.warn(`🎮 [xqcmc] Poll error: ${e.message}`);
  }
}

setInterval(checkXqcMc, XQCMC_POLL_MS);


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
    if (!state.postChannels.includes(ch)) return;
    if (isChannelPaused(ch)) {
      console.log(`⏸️   [#${ch}] Skipping timer restart — paused by broadcaster.`);
      return;
    }
    const ms = getChannelInterval(ch);
    postTimers[ch] = setInterval(() => {
      if (state.channelSettings[ch] && state.channelSettings[ch].onlineOnly && !isChannelLive(ch)) {
        console.log('[auto] #' + ch + ': online-only — offline, skipping auto-post.');
        return;
      }
      postNow(ch);
    }, ms);
    console.log(`⏱️   [#${ch}] Timer set to ${ms / 1000}s.`);
  } else {
    // Restart all channels
    stopTimer();
    // (no global active flag — each channel is controlled via paused setting)
    for (const c of state.postChannels) {
      if (isChannelPaused(c)) {
        console.log(`⏸️   [#${c}] Skipping timer restart — paused by broadcaster.`);
        continue;
      }
      const ms = getChannelInterval(c);
      postTimers[c] = setInterval(() => {
        if (state.channelSettings[c] && state.channelSettings[c].onlineOnly && !isChannelLive(c)) {
          console.log('[auto] #' + c + ': online-only — offline, skipping auto-post.');
          return;
        }
        postNow(c);
      }, ms);
      console.log(`⏱️   [#${c}] Timer set to ${ms / 1000}s.`);
    }
  }
}

// ── Post a Markov message ─────────────────────────────────────────────────────

function postNow(channel, force = false) {
  const ch = channel.replace(/^#/, "");
  if (markov.size < state.minCorpus) return "corpus_small";

  if (!force && !cooldownReady(ch)) {
    const needed    = getChannelCooldown(ch);
    const remaining = needed - (msgCounters[ch] || 0);
    console.log(`⏳  [${ts()}] #${ch}: cooldown — ${remaining} more message(s) needed.`);
    return "cooldown";
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
    return "filtered";
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

const newLines      = [];
let   dailyNewLines = 0;          // resets at midnight — stops learning after 20k/day
const DAILY_LINE_CAP = 20_000;    // max new lines learned per day

// Reset daily counter at midnight
function scheduleDailyLinecountReset() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  setTimeout(() => {
    dailyNewLines = 0;
    console.log("🔄  Daily line cap reset.");
    scheduleDailyLinecountReset();
  }, next - now);
}
scheduleDailyLinecountReset();

// ── Per-user tracking ─────────────────────────────────────────────────────────

const userLastMessage = {};        // { username: "last message text" }
const userMessages    = {};        // { username: ["msg1", "msg2", ...] } (capped at 150)
const reminders       = {};        // { username: [{ from, text, when, channel }] }
const sayCooldowns    = {};        // { username: timestamp } — last time user triggered ?say
const watchtime       = {};        // { channelName: { username: seconds } }
const recentViewers   = {};        // { channelName: { username: lastMsgTimestamp } }
let   watchtimeTick   = null;      // interval handle
const USER_MSG_CAP = 150;

function learnMessage(username, message) {
  if (IGNORE_BOTS.includes(username.toLowerCase())) return;
  if (username.toLowerCase() === BOT_USERNAME.toLowerCase()) return;
  if (message.startsWith("!") || message.startsWith("/") || message.startsWith("$") || message.startsWith("&")) return;
  if (message.length < 10) return;
  if (dailyNewLines >= DAILY_LINE_CAP) return;  // hit today's cap — stop learning until midnight
  markov.train(message);
  newLines.push(message.replace(/[\r\n]/g, " "));
  dailyNewLines++;

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
  console.log(`💾  Saved ${newLines.length} new lines. Total corpus: ${markov.size} | Daily: ${dailyNewLines}/${DAILY_LINE_CAP}`);
  newLines.length = 0;
  // Trim corpus to 20k lines max to keep RAM low
  const CORPUS_TRIM_AT = 22_000;
  const CORPUS_TRIM_TO = 20_000;
  try {
    const allLines = fs.readFileSync(LEARNED_FILE, "utf8").split("\n").filter(Boolean);
    if (allLines.length > CORPUS_TRIM_AT) {
      fs.writeFileSync(LEARNED_FILE, allLines.slice(-CORPUS_TRIM_TO).join("\n") + "\n", "utf8");
      console.log(`✂️   Corpus trimmed to ${CORPUS_TRIM_TO} lines (was ${allLines.length}).`);
    }
  } catch (e) { /* non-fatal */ }
}, 5 * 60_000);  // every 5 min (was 60s)

// ── Watchtime tracker — ticks every 60s while stream is live ─────────────────
const WATCHTIME_FILE = path.join(DATA_DIR, "watchtime.json");
if (fs.existsSync(WATCHTIME_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(WATCHTIME_FILE, "utf8"));
    Object.assign(watchtime, raw);
    console.log(`👁️  Watchtime data loaded.`);
  } catch (e) { console.warn("⚠️  Could not load watchtime.json"); }
}

watchtimeTick = setInterval(() => {
  const allChs = [...(state.postChannels || []), ...(state.manualChannels || [])];
  for (const ch of allChs) {
    if (!isChannelLive(ch)) continue;
    if (!watchtime[ch]) watchtime[ch] = {};
    // Give 60s to every user who sent a message in the last 5 minutes
    const now = Date.now();
    for (const [u, ts] of Object.entries(recentViewers[ch] || {})) {
      if (now - ts < 5 * 60 * 1000) {
        watchtime[ch][u] = (watchtime[ch][u] || 0) + 60;
      }
    }
  }
  // Save every tick
  try { fs.writeFileSync(WATCHTIME_FILE, JSON.stringify(watchtime, null, 2), "utf8"); } catch (e) {}
}, 60_000);

// ── Linecount / lastseen / firstline tracking ─────────────────────────────────

const LINECOUNT_FILE = path.join(DATA_DIR, "linecount.json");
const LASTSEEN_FILE  = path.join(DATA_DIR, "lastseen.json");
const FIRSTLINE_FILE = path.join(DATA_DIR, "firstline.json");

const linecount   = {};  // { channel: { user: totalCount } }
const lastseen    = {};  // { user: { channel, at } }
const firstline   = {};  // { channel: { user: { text, at } } }
const lastMessage = {};  // { channel: { user: "last msg text" } } — in-memory only
const dailyCount  = {};  // { channel: { user: count } } — resets at midnight (in-memory only)

function loadJSON(file) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
  }
  return {};
}

Object.assign(linecount, loadJSON(LINECOUNT_FILE));
Object.assign(lastseen,  loadJSON(LASTSEEN_FILE));
Object.assign(firstline, loadJSON(FIRSTLINE_FILE));
console.log(`📊  Linecount loaded: ${Object.keys(linecount).length} channel(s).`);

setInterval(() => {
  try { fs.writeFileSync(LINECOUNT_FILE, JSON.stringify(linecount), "utf8"); } catch (e) {}
  try { fs.writeFileSync(LASTSEEN_FILE,  JSON.stringify(lastseen),  "utf8"); } catch (e) {}
  try { fs.writeFileSync(FIRSTLINE_FILE, JSON.stringify(firstline), "utf8"); } catch (e) {}
}, 60_000);

// Reset daily count at midnight
function scheduleMidnightReset() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  setTimeout(() => {
    for (const ch of Object.keys(dailyCount)) dailyCount[ch] = {};
    console.log("🕛  Daily linecount reset.");
    scheduleMidnightReset();
  }, next - now);
}
scheduleMidnightReset();

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
  reminders,
  sayCooldowns,
  watchtime,
  botcheckCooldowns: {},
  botStart: BOT_START,
  linecount,
  dailyCount,
  lastseen,
  firstline,
  lastMessage,
  xqcMcLatestData: () => xqcMcLatestData,
  isXqcLive: () => liveChannels.has("xqc"),
  isXqcPlayingMinecraft: () => (prevCategories["xqc"] || "").toLowerCase().includes("minecraft"),
  getXqcLastRunSecs: () => xqcMcLastRunSecs,
  getXqcCategory: () => prevCategories["xqc"] || null,
  // forsen ctx kept for ?forsenrun static message (offline/online check)
  isForsenLive: () => liveChannels.has("forsen"),
  getForsenCategory: () => prevCategories["forsen"] || null,
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
    fetchPartnerChannels();
  } else {
    console.log(`⚠️  Live channel tracking: disabled (TWITCH_CLIENT_ID/SECRET not set)`);
  }
  restartTimer(); // starts all non-paused channels
});

client.on("message", (channel, tags, message, self) => {
  if (self) return;

  const username       = (tags["display-name"] || tags.username || "").toLowerCase();
  const ch             = channel.replace(/^#/, "");
  const manualChannels = state.manualChannels || [];

  if (state.postChannels.includes(ch) || state.learnChannels.includes(ch)) {
    if (isChannelLive(ch)) learnMessage(username, message);
  }

  // Track recent viewers for watchtime
  if (state.postChannels.includes(ch) || state.manualChannels.includes(ch)) {
    if (!recentViewers[ch]) recentViewers[ch] = {};
    recentViewers[ch][username] = Date.now();
  }

  // Track linecount, lastseen, firstline, lastMessage (post + manual channels only)
  if (state.postChannels.includes(ch) || manualChannels.includes(ch)) {
    if (!linecount[ch]) linecount[ch] = {};
    linecount[ch][username] = (linecount[ch][username] || 0) + 1;
    if (!dailyCount[ch]) dailyCount[ch] = {};
    dailyCount[ch][username] = (dailyCount[ch][username] || 0) + 1;
    lastseen[username] = { channel: ch, at: Date.now() };
    if (!lastMessage[ch]) lastMessage[ch] = {};
    lastMessage[ch][username] = message;
    if (!firstline[ch]) firstline[ch] = {};
    if (!firstline[ch][username]) firstline[ch][username] = { text: message, at: Date.now() };
  }

  if (state.postChannels.includes(ch)) incrementCounter(ch);

  // ── First-message greeter (uses Twitch native first-msg tag) ────────────
  if (
    state.greeterEnabled &&
    state.postChannels.includes(ch) &&
    tags["first-msg"] &&
    !IGNORE_BOTS.includes(username)
  ) {
    if (markov.size >= state.minCorpus) {
      const greeting = markov.generate({ minWords: 5, maxWords: 18 });
      if (greeting) {
        client.say(channel, `@${username} ${greeting}`).catch(() => {});
      }
    }
  }

  // ── Reminders ────────────────────────────────────────────────────────────
  if (reminders[username] && reminders[username].length > 0) {
    const pending = reminders[username].splice(0);
    for (const r of pending) {
      const ago  = formatAgo(Date.now() - r.when);
      const msg  = `@${username} 🔔 Reminder from @${r.from} (${ago} ago): ${r.text}`;
      client.say(channel, msg).catch(() => {});
    }
  }

  // ── Owner ?say works from ANY channel the bot is in ─────────────────────
  if (commands.isOwner(tags) && message.trim().toLowerCase() === "?say") {
    const result = postNow(channel, true);
    const errorReasons = {
      corpus_small: `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — add more seed data.`,
      cooldown:     `⚠️ Cooldown active — need more chat messages before posting.`,
      filtered:     `⚠️ Couldn't generate a clean message — TOS filter blocked all candidates.`,
    };
    if (result in errorReasons) {
      client.say(channel, errorReasons[result]).catch(() => {});
    }
    return;
  }

  // Command routing:
  //   postChannels   → everyone can use commands + auto-posting
  //   manualChannels → only owner (shlbez) or the channel's broadcaster can use commands
  //   learnChannels  → completely silent, owner-only commands
  const isOwnerMsg      = commands.isOwner(tags);
  const isBroadcaster   = username === ch; // broadcaster's username always equals their channel name
  const inPostCh        = state.postChannels.includes(ch);
  const inManualCh      = manualChannels.includes(ch);
  const inLearnCh       = state.learnChannels.includes(ch);

  // Not in any known channel — ignore completely
  if (!inPostCh && !inManualCh && !inLearnCh) return;

  // In a learn-only channel — only owner can run commands (except ?forsenalert)
  const isForsenAlertCmd = message.trim().toLowerCase().startsWith("?forsenalert");
  if (inLearnCh && !inPostCh && !inManualCh && !isOwnerMsg && !isForsenAlertCmd) return;

  // In a manual channel — only owner or that channel's broadcaster can use commands
  if (inManualCh && !inPostCh && !isOwnerMsg && !isBroadcaster) return;

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
  try { fs.writeFileSync(WATCHTIME_FILE, JSON.stringify(watchtime, null, 2), "utf8"); } catch (e) {}
  try { fs.writeFileSync(LINECOUNT_FILE, JSON.stringify(linecount), "utf8"); } catch (e) {}
  try { fs.writeFileSync(LASTSEEN_FILE,  JSON.stringify(lastseen),  "utf8"); } catch (e) {}
  try { fs.writeFileSync(FIRSTLINE_FILE, JSON.stringify(firstline), "utf8"); } catch (e) {}
  saveState();
  client.disconnect();
  process.exit(0);
});

function ts() {
  return new Date().toLocaleTimeString();
}

function formatAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
