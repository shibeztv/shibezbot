/**
 * commands.js — All bot commands
 *
 * Auth tiers:
 *   1. OWNER ("shlbez")          — all commands
 *   2. allowedUsers (state)      — all commands
 *   3. Mods / VIPs in channel    — $say only
 *
 * Commands (prefix configurable, default $):
 *
 *   $help                      — list all commands
 *   $start                     — start auto-posting
 *   $stop                      — stop auto-posting
 *   $status                    — show current settings
 *   $say                       — force one Markov message right now
 *   $interval <seconds>        — set post interval (min 30s)
 *   $cooldown <messages>       — min chat messages between bot posts (0 = off)
 *   $minlines <number>         — set minimum lines before posting
 *   $join <channel>            — join a new channel to post in
 *   $leave <channel>           — leave a post channel
 *   $addlearn <channel>        — add a channel to learn from (no posting)
 *   $removelearn <channel>     — stop learning from a channel
 *   $channels                  — list all joined / learn channels
 *   $lines                     — show corpus size
 *   $adduser <username>        — grant full command access to a user
 *   $removeuser <username>     — revoke full command access
 *   $users                     — list all allowed users
 */

const PREFIX = process.env.CMD_PREFIX || "$";

// Only this user has permanent owner-level access
const OWNER = "shlbez";

// ── Auth helpers ──────────────────────────────────────────────────────────────

function isOwnerOrAdmin(tags, state) {
  const user = (tags.username || "").toLowerCase();
  if (user === OWNER) return true;
  if (state.allowedUsers && state.allowedUsers.includes(user)) return true;
  return false;
}

function isModOrVip(tags) {
  const badges = tags.badges || {};
  return !!(badges.moderator || tags.mod || badges.vip);
}

function parseCommand(message) {
  if (!message.startsWith(PREFIX)) return null;
  const parts = message.slice(PREFIX.length).trim().split(/\s+/);
  return { cmd: parts[0].toLowerCase(), args: parts.slice(1) };
}

/**
 * Handle an incoming message. Returns a reply string or null.
 * The bot module passes its live state and helpers in via `ctx`.
 */
function handle(channel, tags, message, ctx) {
  const parsed = parseCommand(message);
  if (!parsed) return null;

  const { state } = ctx;
  const admin  = isOwnerOrAdmin(tags, state);
  const modvip = isModOrVip(tags);

  // Silently ignore anyone with no access at all
  if (!admin && !modvip) return null;

  const { cmd, args } = parsed;
  const {
    saveState,
    markov,
    restartTimer, stopTimer,
    postNow,
    joinChannel, leaveChannel,
    addLearnChannel, removeLearnChannel,
  } = ctx;

  // ── $say — available to mods/VIPs too ────────────────────────────────────
  if (cmd === "say") {
    const result = postNow(channel);
    if (!result) return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — add more seed data or wait for chat.`;
    return null; // postNow already sent the message
  }

  // Everything below requires admin (owner or allowed user)
  if (!admin) return null;

  // ── $help ─────────────────────────────────────────────────────────────────
  if (cmd === "help") {
    return (
      `Commands (${PREFIX}): ` +
      `start | stop | status | say | interval <s> | cooldown <n> | minlines <n> | ` +
      `join <ch> | leave <ch> | manual <ch> | unmanual <ch> | addlearn <ch> | removelearn <ch> | ` +
      `channels | lines | adduser <u> | removeuser <u> | users`
    );
  }

  // ── $start ────────────────────────────────────────────────────────────────
  if (cmd === "start") {
    if (state.active) return "✅ Auto-post is already running.";
    state.active = true;
    saveState();
    restartTimer();
    return `✅ Auto-post started. Interval: ${state.intervalMs / 1000}s.`;
  }

  // ── $stop ─────────────────────────────────────────────────────────────────
  if (cmd === "stop") {
    if (!state.active) return "⏸️ Auto-post is already stopped.";
    state.active = false;
    saveState();
    stopTimer();
    return "⏸️ Auto-post stopped.";
  }

  // ── $status ───────────────────────────────────────────────────────────────
  if (cmd === "status") {
    const postList   = state.postChannels.join(", ")         || "(none)";
    const manualList = (state.manualChannels||[]).join(", ") || "(none)";
    const learnList  = state.learnChannels.join(", ")        || "(none)";
    const cdInfo     = state.cooldownMessages > 0
      ? `${state.cooldownMessages} msgs`
      : "off";
    return (
      `📊 Status: ${state.active ? "▶ running" : "⏸ stopped"} | ` +
      `Interval: ${state.intervalMs / 1000}s | ` +
      `Cooldown: ${cdInfo} | ` +
      `Lines: ${markov.size} (min: ${state.minCorpus}) | ` +
      `Auto: ${postList} | Manual: ${manualList} | Learn: ${learnList}`
    );
  }

  // ── $interval <seconds> ──────────────────────────────────────────────────
  if (cmd === "interval") {
    const secs = parseInt(args[0]);
    if (isNaN(secs) || secs < 30) return `⚠️ Usage: ${PREFIX}interval <seconds> (minimum 30)`;
    state.intervalMs = secs * 1000;
    saveState();
    if (state.active) restartTimer();
    return `⏱️ Interval set to ${secs}s.`;
  }

  // ── $cooldown <messages> ─────────────────────────────────────────────────
  if (cmd === "cooldown") {
    const n = parseInt(args[0]);
    if (isNaN(n) || n < 0) return `⚠️ Usage: ${PREFIX}cooldown <number> (0 = off)`;
    state.cooldownMessages = n;
    saveState();
    ctx.resetCooldownCounters();
    if (n === 0) return `💬 Message cooldown disabled.`;
    return `💬 Cooldown set to ${n} messages between bot posts.`;
  }

  // ── $minlines <n> ────────────────────────────────────────────────────────
  if (cmd === "minlines") {
    const n = parseInt(args[0]);
    if (isNaN(n) || n < 1) return `⚠️ Usage: ${PREFIX}minlines <number>`;
    state.minCorpus = n;
    saveState();
    return `📚 Minimum lines set to ${n} (current: ${markov.size}).`;
  }

  // ── $join <channel> ──────────────────────────────────────────────────────
  if (cmd === "join") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}join <channel>`;
    if (state.postChannels.includes(ch)) return `Already posting in #${ch}.`;
    joinChannel(ch);
    state.postChannels.push(ch);
    saveState();
    return `✅ Joined #${ch} — will post there.`;
  }

  // ── $leave <channel> ─────────────────────────────────────────────────────
  if (cmd === "leave") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}leave <channel>`;
    const idx = state.postChannels.indexOf(ch);
    if (idx === -1) return `Not currently posting in #${ch}.`;
    leaveChannel(ch);
    state.postChannels.splice(idx, 1);
    saveState();
    return `👋 Left #${ch}.`;
  }

  // ── $manual <channel> ────────────────────────────────────────────────────
  if (cmd === "manual") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}manual <channel>`;
    if (state.postChannels.includes(ch)) return `#${ch} is already a full post channel. Use ${PREFIX}leave first.`;
    if (state.manualChannels.includes(ch)) return `Already in manual mode for #${ch}.`;
    if (state.learnChannels.includes(ch)) {
      state.learnChannels.splice(state.learnChannels.indexOf(ch), 1);
    } else {
      joinChannel(ch);
    }
    state.manualChannels.push(ch);
    saveState();
    return `✅ Joined #${ch} in manual mode — I'll respond to commands but won't auto-post. Use ${PREFIX}say to post.`;
  }

  // ── $unmanual <channel> ──────────────────────────────────────────────────
  if (cmd === "unmanual") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}unmanual <channel>`;
    const idx = state.manualChannels.indexOf(ch);
    if (idx === -1) return `#${ch} is not in manual mode.`;
    leaveChannel(ch);
    state.manualChannels.splice(idx, 1);
    saveState();
    return `👋 Left manual channel #${ch}.`;
  }

  // ── $addlearn <channel> ──────────────────────────────────────────────────
  if (cmd === "addlearn") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}addlearn <channel>`;
    if (state.learnChannels.includes(ch) || state.postChannels.includes(ch))
      return `Already in #${ch}.`;
    joinChannel(ch);
    state.learnChannels.push(ch);
    saveState();
    return `📖 Now learning from #${ch} (listen-only).`;
  }

  // ── $removelearn <channel> ───────────────────────────────────────────────
  if (cmd === "removelearn") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}removelearn <channel>`;
    const idx = state.learnChannels.indexOf(ch);
    if (idx === -1) return `Not learning from #${ch}.`;
    leaveChannel(ch);
    state.learnChannels.splice(idx, 1);
    saveState();
    return `🚫 Stopped learning from #${ch}.`;
  }

  // ── $channels ─────────────────────────────────────────────────────────────
  if (cmd === "channels") {
    const postList   = state.postChannels.join(", ")         || "(none)";
    const manualList = (state.manualChannels||[]).join(", ") || "(none)";
    const learnList  = state.learnChannels.join(", ")        || "(none)";
    return `📡 Auto-posting: ${postList} | Manual-only: ${manualList} | Learning: ${learnList}`;
  }

  // ── $lines ────────────────────────────────────────────────────────────────
  if (cmd === "lines") {
    return `📚 Lines: ${markov.size} trained (min to post: ${state.minCorpus}).`;
  }

  // ── $adduser <username> ──────────────────────────────────────────────────
  if (cmd === "adduser") {
    const user = (args[0] || "").toLowerCase().trim();
    if (!user) return `⚠️ Usage: ${PREFIX}adduser <username>`;
    if (user === OWNER) return `${OWNER} is already the owner.`;
    if (!state.allowedUsers) state.allowedUsers = [];
    if (state.allowedUsers.includes(user)) return `${user} already has access.`;
    state.allowedUsers.push(user);
    saveState();
    return `✅ ${user} can now use all bot commands.`;
  }

  // ── $removeuser <username> ───────────────────────────────────────────────
  if (cmd === "removeuser") {
    const user = (args[0] || "").toLowerCase().trim();
    if (!user) return `⚠️ Usage: ${PREFIX}removeuser <username>`;
    if (!state.allowedUsers) return `${user} doesn't have access.`;
    const idx = state.allowedUsers.indexOf(user);
    if (idx === -1) return `${user} doesn't have access.`;
    state.allowedUsers.splice(idx, 1);
    saveState();
    return `🚫 Removed ${user}'s access.`;
  }

  // ── $users ────────────────────────────────────────────────────────────────
  if (cmd === "users") {
    const list = (state.allowedUsers || []).join(", ") || "(none)";
    return `👥 Owner: ${OWNER} | Allowed users: ${list} | Mods/VIPs in channel can use ${PREFIX}say`;
  }

  return null; // unknown command — ignore
}

function normalise(ch) {
  if (!ch) return null;
  return ch.replace(/^#/, "").toLowerCase().trim();
}

module.exports = { handle, isOwnerOrAdmin, isModOrVip, PREFIX };
