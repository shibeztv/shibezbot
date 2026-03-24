/**
 * commands.js — All bot commands
 *
 * Auth tiers:
 *   1. OWNER ("shlbez")                          — all commands
 *   2. Mods / VIPs / allowedUsers in channel     — &say, &adduser, &channels, &lines, &users
 *   3. Broadcaster of the channel                — &start, &stop, &status, &say, &interval,
 *                                                   &cooldown, &minlines, &channels, &lines,
 *                                                   &adduser, &users, &removeme
 *
 * Broadcaster commands are always scoped to their own channel only.
 * &start / &stop for a broadcaster pause/resume only their channel — the global
 * active flag (controlled by the owner) is not touched.
 *
 * &interval and &cooldown are per-channel — they only affect the channel the command is typed in.
 */


const PREFIX   = "?";  // used in help/usage strings
const PREFIXES = new Set(["?"]);
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

/** True when the message author is the broadcaster of the channel it was sent in. */
function isBroadcaster(tags) {
  const badges = tags.badges || {};
  return !!badges.broadcaster;
}

/** Any recognised access tier. */
function hasAnyAccess(tags, state) {
  return isOwner(tags) || isAllowedUser(tags, state) || isModOrVip(tags) || isBroadcaster(tags);
}

/** Original limited-access tier (mods / VIPs / allowed users — excludes broadcaster). */
function hasLimitedAccess(tags, state) {
  return isOwner(tags) || isAllowedUser(tags, state) || isModOrVip(tags);
}

function parseCommand(message) {
  if (!message || !PREFIXES.has(message[0])) return null;
  const parts = message.slice(1).trim().split(/\s+/);
  return { cmd: parts[0].toLowerCase(), args: parts.slice(1) };
}

function handle(channel, tags, message, ctx) {
  const parsed = parseCommand(message);
  if (!parsed) return null;

  const { state } = ctx;
  if (!hasAnyAccess(tags, state)) return null;

  const { cmd, args } = parsed;
  const {
    saveState, markov,
    restartTimer, stopTimer,
    postNow, joinChannel, leaveChannel,
    resetCooldownCounters,
    getChannelInterval, getChannelCooldown, setChannelSetting,
    helixGet,
  } = ctx;

  // ch = the channel the command was typed in (no # prefix)
  const ch = channel.replace(/^#/, "");

  // ── Commands available to ALL tiers ──────────────────────────────────────

  if (cmd === "say") {
    const result = postNow(channel);
    if (!result) return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — add more seed data or wait for chat.`;
    return null;
  }

  // ── Public commands (any viewer) ─────────────────────────────────────────

  if (cmd === "8ball") {
    const RESPONSES = [
      "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
      "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.",
      "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
      "Better not tell you now.", "Cannot predict now.", "Don't count on it.",
      "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
    ];
    // 1-in-4 chance to give a Markov answer instead for extra chaos
    if (markov.size >= state.minCorpus && Math.random() < 0.25) {
      const markovAnswer = markov.generate({ minWords: 4, maxWords: 14 });
      if (markovAnswer) return `🎱 ${markovAnswer}`;
    }
    return `🎱 ${RESPONSES[Math.floor(Math.random() * RESPONSES.length)]}`;
  }

  if (cmd === "mock") {
    const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}mock <username>`;
    const last = ctx.userLastMessage[target];
    if (!last) return `🤷 No messages from ${target} yet.`;
    const mocked = last.split("").map((c, i) =>
      i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
    ).join("");
    return `@${target} ${mocked}`;
  }

  if (cmd === "markov") {
    const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}markov <username>`;
    const msgs = ctx.userMessages[target];
    if (!msgs || msgs.length < 5) return `📚 Not enough messages from ${target} yet (need at least 5).`;
    const MarkovChain = require("./markov");
    const userChain = new MarkovChain(2);
    userChain.trainBulk(msgs);
    const sentence = userChain.generate({ minWords: 4, maxWords: 20 });
    if (!sentence) return `⚠️ Couldn't generate from ${target}'s messages.`;
    return `🗣️ ${target} probably said: ${sentence}`;
  }

  if (cmd === "story") {
    if (markov.size < state.minCorpus) return `📚 Corpus too small for a story yet.`;
    const sentences = [];
    for (let i = 0; i < 3; i++) {
      const s = markov.generate({ minWords: 6, maxWords: 18 });
      if (s) sentences.push(s);
    }
    if (sentences.length === 0) return `⚠️ Couldn't generate a story right now.`;
    return `📖 ${sentences.join(" ")}`;
  }

  if (cmd === "notify") {
    const sub  = (args[0] || "").toLowerCase();
    const user = (tags.username || "").toLowerCase();

    // ?notify join — any user adds themselves
    if (sub === "join") {
      if (!state.notifyUsers) state.notifyUsers = {};
      if (!state.notifyUsers[ch]) state.notifyUsers[ch] = [];
      if (state.notifyUsers[ch].includes(user)) return `@${user} You are already on the notification list for #${ch}.`;
      state.notifyUsers[ch].push(user);
      saveState();
      return `@${user} ✅ You will be pinged when #${ch} goes live!`;
    }

    // ?notify leave — any user removes themselves
    if (sub === "leave") {
      if (!state.notifyUsers || !state.notifyUsers[ch]) return `@${user} You are not on the notification list.`;
      const idx = state.notifyUsers[ch].indexOf(user);
      if (idx === -1) return `@${user} You are not on the notification list.`;
      state.notifyUsers[ch].splice(idx, 1);
      saveState();
      return `@${user} 🔕 Removed from notifications for #${ch}.`;
    }

    // ?notify live|offline|category on|off — broadcaster or mod only
    if ((sub === "live" || sub === "offline" || sub === "category") && (args[1] === "on" || args[1] === "off")) {
      if (!isOwner(tags) && !isBroadcaster(tags) && !isModOrVip(tags)) return null;
      if (!state.notifyEvents) state.notifyEvents = {};
      if (!state.notifyEvents[ch]) state.notifyEvents[ch] = { live: false, offline: false, category: false };
      state.notifyEvents[ch][sub] = (args[1] === "on");
      saveState();
      return args[1] === "on"
        ? `✅ ${sub} notifications enabled for #${ch}.`
        : `🔕 ${sub} notifications disabled for #${ch}.`;
    }

    // ?notify list — show count and event states
    if (sub === "list") {
      const users  = (state.notifyUsers && state.notifyUsers[ch]) || [];
      const events = (state.notifyEvents && state.notifyEvents[ch]) || {};
      const live     = events.live     ? "🔴 live" : "";
      const offline  = events.offline  ? "⚫ offline" : "";
      const category = events.category ? "🎮 category" : "";
      const active   = [live, offline, category].filter(Boolean).join(" | ") || "none enabled";
      return `🔔 #${ch}: ${users.length} subscriber(s) | active: ${active}`;
    }

    return `Usage: ?notify join/leave/list | ?notify live/offline/category on/off (mod/broadcaster)`;
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

  // ── $followage ───────────────────────────────────────────────────────────

  if (cmd === "followage") {
    const target = (args[0] || "").toLowerCase().trim();
    if (!target) return `⚠️ Usage: ${PREFIX}followage <username>`;

    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;

    // async — reply lands when API responds
    Promise.resolve().then(async () => {
      const { client } = ctx;
      const replyTo = channel.startsWith("#") ? channel : `#${channel}`;

      try {
        // Resolve both user IDs in parallel
        const [bcData, userData] = await Promise.all([
          helixGet(`users?login=${encodeURIComponent(ch)}`),
          helixGet(`users?login=${encodeURIComponent(target)}`),
        ]);

        const broadcasterId = bcData.data?.[0]?.id;
        const userId        = userData.data?.[0]?.id;

        if (!broadcasterId) return client.say(replyTo, `⚠️ Channel #${ch} not found on Twitch.`);
        if (!userId)        return client.say(replyTo, `⚠️ User ${target} not found on Twitch.`);

        const followData = await helixGet(
          `channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`
        );

        if (!followData.data?.length) {
          return client.say(replyTo, `📊 ${target} is not following #${ch}.`);
        }

        const followedAt = new Date(followData.data[0].followed_at);
        const now        = new Date();
        const diffMs     = now - followedAt;
        const days       = Math.floor(diffMs / 86_400_000);
        const years      = Math.floor(days / 365);
        const months     = Math.floor((days % 365) / 30);
        const remDays    = days % 30;

        const parts = [];
        if (years)   parts.push(`${years} year${years  !== 1 ? "s" : ""}`);
        if (months)  parts.push(`${months} month${months !== 1 ? "s" : ""}`);
        if (remDays || parts.length === 0)
                     parts.push(`${remDays} day${remDays !== 1 ? "s" : ""}`);

        client.say(replyTo, `📅 ${target} has been following #${ch} for ${parts.join(", ")} (since ${followedAt.toLocaleDateString("en-GB")}).`);
      } catch (err) {
        client.say(replyTo, `⚠️ Followage lookup failed: ${err.message}`).catch(() => {});
      }
    });

    return `🔍 Checking followage for ${target}...`;
  }

  // ── $top ─────────────────────────────────────────────────────────────────

  if (cmd === "top") {
    if (markov.size === 0) return `📚 Corpus is empty.`;

    // Count every word that appears as a key token in the chain
    const freq = new Map();
    const SKIP = new Set([
      "the","a","an","and","or","but","is","it","i","to","of","in",
      "that","was","he","she","they","we","you","this","with","for",
      "on","are","as","at","be","by","from","not","my","your","his",
      "her","its","our","their","what","just","so","up","do","if",
      "me","him","us","them","have","had","has","no","all","can",
      "been","get","got","im","dont","its","like","would","could",
    ]);

    for (const key of markov.chain.keys()) {
      for (const word of key.split(" ")) {
        const w = word.toLowerCase().replace(/[^a-z]/g, "");
        if (w.length < 3 || SKIP.has(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }

    const top = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w, n]) => `${w} (${n})`)
      .join(", ");

    return `🔤 Top words in corpus: ${top || "(not enough data)"}`;
  }

  // ── $compliment ───────────────────────────────────────────────────────────

  if (cmd === "compliment") {
    const target = (args[0] || "").toLowerCase().trim();
    if (!target) return `⚠️ Usage: ${PREFIX}compliment <username>`;
    if (markov.size < state.minCorpus) {
      return `⚠️ Corpus too small to generate a compliment yet.`;
    }
    const sentence = markov.generate({ minWords: 5, maxWords: 20 });
    if (!sentence) return `⚠️ Couldn't generate a compliment right now.`;
    return `@${target} ${sentence}`;
  }

  if (cmd === "adduser") {
    if (!hasLimitedAccess(tags, state) && !isBroadcaster(tags)) return null;
    const user = (args[0] || "").toLowerCase().trim();
    if (!user) return `⚠️ Usage: ${PREFIX}adduser <username>`;
    if (user === OWNER) return `${OWNER} is already the owner.`;
    if (!state.allowedUsers) state.allowedUsers = [];
    if (state.allowedUsers.includes(user)) return `${user} already has access.`;
    state.allowedUsers.push(user);
    saveState();
    return `✅ ${user} can now use bot commands.`;
  }

  // ── Broadcaster-scoped commands ───────────────────────────────────────────
  // These run before the owner-only block so broadcasters can't fall through
  // to owner commands.

  if (isBroadcaster(tags) && !isOwner(tags)) {

    if (cmd === "start") {
      setChannelSetting(ch, "paused", false);
      saveState();
      if (state.active) restartTimer(ch);
      return `✅ Auto-posting enabled in #${ch}.`;
    }

    if (cmd === "stop") {
      setChannelSetting(ch, "paused", true);
      saveState();
      stopTimer(ch);
      return `⏸️ Auto-posting paused in #${ch}.`;
    }

    if (cmd === "status") {
      const paused        = !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
      const channelActive = state.active && !paused;
      const intervalSecs  = getChannelInterval(ch) / 1000;
      const cooldown      = getChannelCooldown(ch);
      const cdInfo        = cooldown > 0 ? `${cooldown} msgs` : "off";
      return (
        `📊 [#${ch}] ${channelActive ? "▶ running" : "⏸ paused"} | ` +
        `Interval: ${intervalSecs}s | Cooldown: ${cdInfo} | ` +
        `Lines: ${markov.size} (min: ${state.minCorpus})`
      );
    }

    if (cmd === "interval") {
      const secs = parseInt(args[0]);
      if (isNaN(secs) || secs < 30) return `⚠️ Usage: ${PREFIX}interval <seconds> (minimum 30)`;
      setChannelSetting(ch, "intervalMs", secs * 1000);
      saveState();
      const paused = !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
      if (state.active && !paused) restartTimer(ch);
      return `⏱️ [#${ch}] Interval set to ${secs}s.`;
    }

    if (cmd === "cooldown") {
      const n = parseInt(args[0]);
      if (isNaN(n) || n < 0) return `⚠️ Usage: ${PREFIX}cooldown <number> (0 = off)`;
      setChannelSetting(ch, "cooldownMessages", n);
      saveState();
      resetCooldownCounters(ch);
      return n === 0
        ? `💬 [#${ch}] Cooldown disabled.`
        : `💬 [#${ch}] Cooldown set to ${n} messages between bot posts.`;
    }

    if (cmd === "minlines") {
      const n = parseInt(args[0]);
      if (isNaN(n) || n < 1) return `⚠️ Usage: ${PREFIX}minlines <number>`;
      state.minCorpus = n;
      saveState();
      return `📚 Minimum lines set to ${n} (current: ${markov.size}).`;
    }

    if (cmd === "removeme") {
      const inPost   = state.postChannels.indexOf(ch);
      const inManual = (state.manualChannels || []).indexOf(ch);
      const inLearn  = state.learnChannels.indexOf(ch);

      if (inPost === -1 && inManual === -1 && inLearn === -1) {
        return `Bot is not active in #${ch}.`;
      }

      if (inPost   !== -1) state.postChannels.splice(inPost, 1);
      if (inManual !== -1) state.manualChannels.splice(inManual, 1);
      if (inLearn  !== -1) state.learnChannels.splice(inLearn, 1);

      saveState();
      // Delay the part() slightly so the farewell reply can be delivered first.
      setTimeout(() => leaveChannel(ch), 800);
      return `👋 Bot is leaving #${ch}. The owner can re-add it with ${PREFIX}join.`;
    }

    // No match for broadcaster — don't fall through to owner commands.
    return null;
  }

  // ── Non-owner limited access (mods / VIPs / allowedUsers) ────────────────
  // $say / $channels / $lines / $users / $adduser are already handled above.
  // Nothing else is allowed for this tier.
  if (!isOwner(tags)) return null;

  // ── Owner-only commands ───────────────────────────────────────────────────

  if (cmd === "help") {
    return (
      `Commands (${PREFIX}): say | join | manual | interval | greeter | channels | adduser | 8ball | mock | markov | notify join/leave/list | notify live/offline/category on/off`
    );
  }

  if (cmd === "start") {
    if (state.active) return "✅ Auto-post is already running.";
    state.active = true;
    saveState();
    restartTimer(); // restarts all channels (skips individually paused ones)
    return `✅ Auto-post started.`;
  }

  if (cmd === "stop") {
    if (!state.active) return "⏸️ Auto-post is already stopped.";
    state.active = false;
    saveState();
    stopTimer(); // stops all channels
    return "⏸️ Auto-post stopped.";
  }

  if (cmd === "status") {
    const paused        = !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
    const channelActive = state.active && !paused;
    const intervalSecs  = getChannelInterval(ch) / 1000;
    const cooldown      = getChannelCooldown(ch);
    const cdInfo        = cooldown > 0 ? `${cooldown} msgs` : "off";
    const postList      = state.postChannels.join(", ")         || "(none)";
    const manualList    = (state.manualChannels||[]).join(", ") || "(none)";
    const learnList     = state.learnChannels.join(", ")        || "(none)";
    return (
      `📊 [#${ch}] ${channelActive ? "▶ running" : "⏸ stopped"} | ` +
      `Interval: ${intervalSecs}s | Cooldown: ${cdInfo} | ` +
      `Lines: ${markov.size} (min: ${state.minCorpus}) | ` +
      `Auto: ${postList} | Manual: ${manualList} | Learn: ${learnList}`
    );
  }

  if (cmd === "interval") {
    const secs = parseInt(args[0]);
    if (isNaN(secs) || secs < 30) return `⚠️ Usage: ${PREFIX}interval <seconds> (minimum 30)`;
    setChannelSetting(ch, "intervalMs", secs * 1000);
    saveState();
    if (state.active) restartTimer(ch);
    return `⏱️ [#${ch}] Interval set to ${secs}s.`;
  }

  if (cmd === "cooldown") {
    const n = parseInt(args[0]);
    if (isNaN(n) || n < 0) return `⚠️ Usage: ${PREFIX}cooldown <number> (0 = off)`;
    setChannelSetting(ch, "cooldownMessages", n);
    saveState();
    resetCooldownCounters(ch);
    return n === 0
      ? `💬 [#${ch}] Cooldown disabled.`
      : `💬 [#${ch}] Cooldown set to ${n} messages between bot posts.`;
  }

  if (cmd === "minlines") {
    const n = parseInt(args[0]);
    if (isNaN(n) || n < 1) return `⚠️ Usage: ${PREFIX}minlines <number>`;
    state.minCorpus = n;
    saveState();
    return `📚 Minimum lines set to ${n} (current: ${markov.size}).`;
  }

  if (cmd === "join") {
    const target = normalise(args[0]);
    if (!target) return `⚠️ Usage: ${PREFIX}join <channel>`;
    if (state.postChannels.includes(target)) return `Already posting in #${target}.`;
    joinChannel(target);
    state.postChannels.push(target);
    saveState();
    if (state.active) restartTimer(target);
    return `✅ Joined #${target} — will post there.`;
  }

  if (cmd === "leave") {
    const target = normalise(args[0]);
    if (!target) return `⚠️ Usage: ${PREFIX}leave <channel>`;
    const idx = state.postChannels.indexOf(target);
    if (idx === -1) return `Not currently posting in #${target}.`;
    leaveChannel(target); // leaveChannel also calls stopTimer(ch)
    state.postChannels.splice(idx, 1);
    saveState();
    return `👋 Left #${target}.`;
  }

  if (cmd === "manual") {
    const target = normalise(args[0]);
    if (!target) return `⚠️ Usage: ${PREFIX}manual <channel>`;
    if (state.postChannels.includes(target)) return `#${target} is already a full post channel. Use ${PREFIX}leave first.`;
    if (state.manualChannels.includes(target)) return `Already in manual mode for #${target}.`;
    if (state.learnChannels.includes(target)) {
      state.learnChannels.splice(state.learnChannels.indexOf(target), 1);
    } else {
      joinChannel(target);
    }
    state.manualChannels.push(target);
    saveState();
    return `✅ Joined #${target} in manual mode — won't auto-post. Use ${PREFIX}say to post.`;
  }

  if (cmd === "unmanual") {
    const target = normalise(args[0]);
    if (!target) return `⚠️ Usage: ${PREFIX}unmanual <channel>`;
    const idx = state.manualChannels.indexOf(target);
    if (idx === -1) return `#${target} is not in manual mode.`;
    leaveChannel(target);
    state.manualChannels.splice(idx, 1);
    saveState();
    return `👋 Left manual channel #${target}.`;
  }

  if (cmd === "addlearn") {
    const target = normalise(args[0]);
    if (!target) return `⚠️ Usage: ${PREFIX}addlearn <channel>`;
    if (state.learnChannels.includes(target) || state.postChannels.includes(target)) return `Already in #${target}.`;
    joinChannel(target);
    state.learnChannels.push(target);
    saveState();
    return `📖 Now learning from #${target} (listen-only).`;
  }

  if (cmd === "removelearn") {
    const target = normalise(args[0]);
    if (!target) return `⚠️ Usage: ${PREFIX}removelearn <channel>`;
    const idx = state.learnChannels.indexOf(target);
    if (idx === -1) return `Not learning from #${target}.`;
    leaveChannel(target);
    state.learnChannels.splice(idx, 1);
    saveState();
    return `🚫 Stopped learning from #${target}.`;
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

  if (cmd === "greeter") {
    state.greeterEnabled = !state.greeterEnabled;
    saveState();
    return state.greeterEnabled
      ? `👋 First-message greeter enabled — new chatters will get a Markov welcome.`
      : `🔕 First-message greeter disabled.`;
  }

  return null;
}

function normalise(ch) {
  if (!ch) return null;
  return ch.replace(/^#/, "").toLowerCase().trim();
}

module.exports = { handle, isOwner, isAllowedUser, isModOrVip, isBroadcaster, PREFIX };
