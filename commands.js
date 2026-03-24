/**
 * commands.js — All bot commands
 *
 * Auth tiers:
 *   1. OWNER ("shlbez")                          — all commands
 *   2. Mods / VIPs / allowedUsers in channel     — $say, $adduser, $channels, $lines, $users
 */

const PREFIX = process.env.CMD_PREFIX || "$";
const OWNER  = "shlbez";

function isOwner(tags) {
  return (tags.username || "").toLowerCase() === OWNER;
}

function isAllowedUser(tags, state) {
  const user = (tags.username || "").toLowerCase();
  return (state.allowedUsers || []).includes(user);
}

function isModOrVip(tags) {
  const badges = tags.badges || {};
  return !!(badges.moderator || tags.mod || badges.vip);
}

function hasLimitedAccess(tags, state) {
  return isOwner(tags) || isAllowedUser(tags, state) || isModOrVip(tags);
}

function parseCommand(message) {
  if (!message.startsWith(PREFIX)) return null;
  const parts = message.slice(PREFIX.length).trim().split(/\s+/);
  return { cmd: parts[0].toLowerCase(), args: parts.slice(1) };
}

function handle(channel, tags, message, ctx) {
  const parsed = parseCommand(message);
  if (!parsed) return null;

  const { state } = ctx;

  // Silently ignore anyone with no access at all
  if (!hasLimitedAccess(tags, state)) return null;

  const { cmd, args } = parsed;
  const { saveState, markov, restartTimer, stopTimer, postNow, joinChannel, leaveChannel } = ctx;

  // ── Commands available to everyone with any access ────────────────────────

  if (cmd === "say") {
    const result = postNow(channel);
    if (!result) return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — add more seed data or wait for chat.`;
    return null;
  }

  if (cmd === "adduser") {
    const user = (args[0] || "").toLowerCase().trim();
    if (!user) return `⚠️ Usage: ${PREFIX}adduser <username>`;
    if (user === OWNER) return `${OWNER} is already the owner.`;
    if (!state.allowedUsers) state.allowedUsers = [];
    if (state.allowedUsers.includes(user)) return `${user} already has access.`;
    state.allowedUsers.push(user);
    saveState();
    return `✅ ${user} can now use bot commands.`;
  }

  if (cmd === "channels") {
    const postList   = state.postChannels.join(", ")         || "(none)";
    const manualList = (state.manualChannels||[]).join(", ") || "(none)";
    const learnList  = state.learnChannels.join(", ")        || "(none)";
    return `📡 Auto-posting: ${postList} | Manual-only: ${manualList} | Learning: ${learnList}`;
  }

  if (cmd === "lines") {
    return `📚 Lines: ${markov.size} trained (min to post: ${state.minCorpus}).`;
  }

  if (cmd === "users") {
    const list = (state.allowedUsers || []).join(", ") || "(none)";
    return `👥 Owner: ${OWNER} | Allowed users: ${list} | Mods/VIPs can use ${PREFIX}say + basic commands`;
  }

  // ── Everything below is owner-only ───────────────────────────────────────
  if (!isOwner(tags)) return null;

  if (cmd === "help") {
    return (
      `Commands (${PREFIX}): ` +
      `start | stop | status | say | interval <s> | cooldown <n> | minlines <n> | ` +
      `join <ch> | leave <ch> | manual <ch> | unmanual <ch> | addlearn <ch> | removelearn <ch> | ` +
      `channels | lines | adduser <u> | removeuser <u> | users`
    );
  }

  if (cmd === "start") {
    if (state.active) return "✅ Auto-post is already running.";
    state.active = true;
    saveState();
    restartTimer();
    return `✅ Auto-post started. Interval: ${state.intervalMs / 1000}s.`;
  }

  if (cmd === "stop") {
    if (!state.active) return "⏸️ Auto-post is already stopped.";
    state.active = false;
    saveState();
    stopTimer();
    return "⏸️ Auto-post stopped.";
  }

  if (cmd === "status") {
    const postList   = state.postChannels.join(", ")         || "(none)";
    const manualList = (state.manualChannels||[]).join(", ") || "(none)";
    const learnList  = state.learnChannels.join(", ")        || "(none)";
    const cdInfo     = state.cooldownMessages > 0 ? `${state.cooldownMessages} msgs` : "off";
    return (
      `📊 Status: ${state.active ? "▶ running" : "⏸ stopped"} | ` +
      `Interval: ${state.intervalMs / 1000}s | Cooldown: ${cdInfo} | ` +
      `Lines: ${markov.size} (min: ${state.minCorpus}) | ` +
      `Auto: ${postList} | Manual: ${manualList} | Learn: ${learnList}`
    );
  }

  if (cmd === "interval") {
    const secs = parseInt(args[0]);
    if (isNaN(secs) || secs < 30) return `⚠️ Usage: ${PREFIX}interval <seconds> (minimum 30)`;
    state.intervalMs = secs * 1000;
    saveState();
    if (state.active) restartTimer();
    return `⏱️ Interval set to ${secs}s.`;
  }

  if (cmd === "cooldown") {
    const n = parseInt(args[0]);
    if (isNaN(n) || n < 0) return `⚠️ Usage: ${PREFIX}cooldown <number> (0 = off)`;
    state.cooldownMessages = n;
    saveState();
    ctx.resetCooldownCounters();
    return n === 0 ? `💬 Message cooldown disabled.` : `💬 Cooldown set to ${n} messages between bot posts.`;
  }

  if (cmd === "minlines") {
    const n = parseInt(args[0]);
    if (isNaN(n) || n < 1) return `⚠️ Usage: ${PREFIX}minlines <number>`;
    state.minCorpus = n;
    saveState();
    return `📚 Minimum lines set to ${n} (current: ${markov.size}).`;
  }

  if (cmd === "join") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}join <channel>`;
    if (state.postChannels.includes(ch)) return `Already posting in #${ch}.`;
    joinChannel(ch);
    state.postChannels.push(ch);
    saveState();
    return `✅ Joined #${ch} — will post there.`;
  }

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
    return `✅ Joined #${ch} in manual mode — won't auto-post. Use ${PREFIX}say to post.`;
  }

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

  if (cmd === "addlearn") {
    const ch = normalise(args[0]);
    if (!ch) return `⚠️ Usage: ${PREFIX}addlearn <channel>`;
    if (state.learnChannels.includes(ch) || state.postChannels.includes(ch)) return `Already in #${ch}.`;
    joinChannel(ch);
    state.learnChannels.push(ch);
    saveState();
    return `📖 Now learning from #${ch} (listen-only).`;
  }

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

  return null;
}

function normalise(ch) {
  if (!ch) return null;
  return ch.replace(/^#/, "").toLowerCase().trim();
}

module.exports = { handle, isOwner, isAllowedUser, isModOrVip, PREFIX };
