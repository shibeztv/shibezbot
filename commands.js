/**
 * commands.js — All bot commands
 *
 * Auth tiers:
 *   1. OWNER ("shlbez") — full access to everything from any channel
 *   2. Mods / VIPs / Broadcaster — elevated commands (start/stop/interval etc.)
 *   3. Everyone — all public commands
 */

const PREFIX   = "?";
const PREFIXES = new Set(["?"]);
const OWNER    = "shlbez";

const song = require("./song");

function isOwner(tags) {
  return (tags.username || "").toLowerCase() === OWNER;
}

function isModOrVip(tags) {
  const badges = tags.badges || {};
  return !!(badges.moderator || tags.mod || badges.vip);
}

function isBroadcaster(tags) {
  const badges = tags.badges || {};
  return !!badges.broadcaster;
}

function hasAnyAccess(tags, state) {
  return isOwner(tags) || isModOrVip(tags) || isBroadcaster(tags);
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
  const { cmd, args } = parsed;
  const {
    saveState, markov,
    restartTimer, stopTimer,
    postNow, joinChannel, leaveChannel,
    resetCooldownCounters,
    getChannelInterval, getChannelCooldown, setChannelSetting,
    helixGet,
  } = ctx;

  const ch = channel.replace(/^#/, "");

  // ═══════════════════════════════════════════════════════════════════════════
  // ── OWNER BLOCK — shlbez only, all commands, any channel ─────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (isOwner(tags)) {

    if (cmd === "help") {
      return (
        `👑 Owner (?): ` +
        `say | markov | dadjoke | gpt | song | 8ball | mock | story | compliment | remind | ` +
        `forsen | copypasta | monka | iq | clip | urban | translate | weather | watchtime | ` +
        `roll | choose | coinflip | bancheck | botcheck | forsenalert | forsenrun | lines | followage | top | status | commands | ` +
        `notify | start | stop | interval | cooldown | minlines | onlineonly | greeter | ` +
        `join | leave | manual | unmanual | addlearn | removelearn | adduser | removeuser | users | ` +
        `channels | removeme`
      );
    }

    if (cmd === "say") {
      const result = postNow(channel, true);
      if (typeof result === "string") {
        if (result === "corpus_small") return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}).`;
        if (result === "cooldown") return `⚠️ Cooldown active — need more chat messages between bot posts.`;
        if (result === "filtered") return `⚠️ Couldn't generate a clean message right now.`;
        return `⚠️ Could not post.`;
      }
      return null;
    }

    if (cmd === "markov") {
      const seed = args.join(" ").trim();
      if (!seed) return `⚠️ Usage: ${PREFIX}markov <seed text>`;
      if (markov.size < state.minCorpus) return `📚 Corpus too small (${markov.size}/${state.minCorpus}).`;
      const sentence = markov.generateSeeded(seed, { minWords: 6, maxWords: 28 });
      if (!sentence) return `⚠️ Couldn't generate a sentence from that seed.`;
      return sentence;
    }

    if (cmd === "remind") {
      const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
      const text   = args.slice(1).join(" ").trim();
      if (!target || !text) return `⚠️ Usage: ${PREFIX}remind <user> <message>`;
      const from = (tags.username || "").toLowerCase();
      if (!ctx.reminders[target]) ctx.reminders[target] = [];
      ctx.reminders[target].push({ from, text, when: Date.now(), channel });
      return `✅ @${from} I'll remind ${target} when they next chat!`;
    }

    if (cmd === "dadjoke") {
      const { client } = ctx;
      const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
      Promise.resolve().then(async () => {
        try {
          const res = await fetch("https://icanhazdadjoke.com/", {
            headers: { "Accept": "application/json", "User-Agent": "TwitchMarkovBot/2.0" }
          });
          const data = await res.json();
          client.say(replyTo, data && data.joke ? `🥁 ${data.joke}` : "⚠️ Couldn't fetch a dad joke.").catch(() => {});
        } catch (e) {
          client.say(replyTo, "⚠️ Couldn't reach the dad joke server.").catch(() => {});
        }
      });
      return null;
    }

    if (cmd === "song" || cmd === "music") { handleSongCommand(channel, ch, tags, ctx); return null; }

    if (cmd === "8ball") {
      const RESPONSES = [
        "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
        "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.",
        "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
        "Better not tell you now.", "Cannot predict now.", "Don't count on it.",
        "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
      ];
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

    if (cmd === "compliment") {
      const target = (args[0] || "").toLowerCase().trim();
      if (!target) return `⚠️ Usage: ${PREFIX}compliment <username>`;
      if (markov.size < state.minCorpus) return `⚠️ Corpus too small to generate a compliment yet.`;
      const sentence = markov.generate({ minWords: 5, maxWords: 20 });
      if (!sentence) return `⚠️ Couldn't generate a compliment right now.`;
      return `@${target} ${sentence}`;
    }

    if (cmd === "start") {
      setChannelSetting(ch, "paused", false);
      saveState();
      restartTimer(ch);
      return `✅ [#${ch}] Auto-posting started.`;
    }

    if (cmd === "stop") {
      setChannelSetting(ch, "paused", true);
      saveState();
      stopTimer(ch);
      return `⏸️ [#${ch}] Auto-posting stopped.`;
    }

    if (cmd === "status") {
      const paused     = !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
      const onlineOnly = !!(state.channelSettings[ch] && state.channelSettings[ch].onlineOnly);
      const active     = !paused;
      const intervalSecs = getChannelInterval(ch) / 1000;
      const cooldown     = getChannelCooldown(ch);
      const cdInfo       = cooldown > 0 ? `${cooldown}` : "none";
      return (
        `📊 #${ch}: ${active ? "▶ posting" : "⏸ paused"} | ` +
        `Every: ${intervalSecs}s | Min messages: ${cdInfo} | ` +
        `Corpus: ${markov.size.toLocaleString()} lines | ` +
        `Online-only: ${onlineOnly ? "on" : "off"}`
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

    if (cmd === "onlineonly") {
      const current = !!(state.channelSettings[ch] && state.channelSettings[ch].onlineOnly);
      setChannelSetting(ch, "onlineOnly", !current);
      saveState();
      return !current
        ? `📴 [#${ch}] Online-only mode ON — bot will only post when stream is live.`
        : `📡 [#${ch}] Online-only mode OFF — bot will post regardless of stream status.`;
    }

    if (cmd === "greeter") {
      state.greeterEnabled = !state.greeterEnabled;
      saveState();
      return state.greeterEnabled
        ? `👋 First-message greeter enabled.`
        : `🔕 First-message greeter disabled.`;
    }

    if (cmd === "join") {
      const target = normalise(args[0]);
      if (!target) return `⚠️ Usage: ${PREFIX}join <channel>`;
      if (state.postChannels.includes(target)) return `Already posting in #${target}.`;
      if (!state.channelSettings[target]) state.channelSettings[target] = {};
      state.channelSettings[target].paused    = true;
      state.channelSettings[target].onlineOnly = true;
      state.channelSettings[target].intervalMs = 3_600_000;
      joinChannel(target);
      state.postChannels.push(target);
      saveState();
      return `✅ Joined #${target} — paused by default. Use ${PREFIX}start to begin posting.`;
    }

    if (cmd === "leave") {
      const target = normalise(args[0]);
      if (!target) return `⚠️ Usage: ${PREFIX}leave <channel>`;
      const idx = state.postChannels.indexOf(target);
      if (idx === -1) return `Not currently posting in #${target}.`;
      leaveChannel(target);
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

    if (cmd === "users") {
      const list = (state.allowedUsers || []).join(", ") || "(none)";
      return `👥 Owner: ${OWNER} | Allowed users: ${list}`;
    }

    if (cmd === "channels") {
      const postList   = state.postChannels.join(", ")          || "(none)";
      const manualList = (state.manualChannels || []).join(", ") || "(none)";
      const learnList  = state.learnChannels.join(", ")          || "(none)";
      return `📡 Auto-posting: ${postList} | Manual-only: ${manualList} | Learning: ${learnList}`;
    }

    if (cmd === "removeme") {
      const inPost   = state.postChannels.indexOf(ch);
      const inManual = (state.manualChannels || []).indexOf(ch);
      const inLearn  = state.learnChannels.indexOf(ch);
      if (inPost === -1 && inManual === -1 && inLearn === -1) return `Bot is not active in #${ch}.`;
      if (inPost   !== -1) state.postChannels.splice(inPost, 1);
      if (inManual !== -1) state.manualChannels.splice(inManual, 1);
      if (inLearn  !== -1) state.learnChannels.splice(inLearn, 1);
      saveState();
      setTimeout(() => leaveChannel(ch), 800);
      return `👋 Bot is leaving #${ch}.`;
    }

    if (cmd === "notify") {
      const VALID_EVENTS = ["live", "offline", "category"];
      const sub   = (args[0] || "").toLowerCase();
      const onOff = (args[1] || "").toLowerCase();
      const user  = (tags.username || "").toLowerCase();
      if (VALID_EVENTS.includes(sub) && (onOff === "on" || onOff === "off")) {
        if (!state.notifyUsers) state.notifyUsers = {};
        if (!state.notifyUsers[ch]) state.notifyUsers[ch] = {};
        if (!state.notifyUsers[ch][sub]) state.notifyUsers[ch][sub] = [];
        if (onOff === "on") {
          if (state.notifyUsers[ch][sub].includes(user)) return `@${user} Already subscribed to ${sub} notifications for #${ch}.`;
          state.notifyUsers[ch][sub].push(user);
          saveState();
          const label = sub === "live" ? "goes live" : sub === "offline" ? "goes offline" : "changes category";
          return `@${user} ✅ You'll be pinged when #${ch} ${label}!`;
        } else {
          const idx = state.notifyUsers[ch][sub].indexOf(user);
          if (idx === -1) return `@${user} Not subscribed to ${sub} notifications for #${ch}.`;
          state.notifyUsers[ch][sub].splice(idx, 1);
          saveState();
          return `@${user} 🔕 Unsubscribed from ${sub} notifications for #${ch}.`;
        }
      }
      if (sub === "list") {
        const chUsers = (state.notifyUsers && state.notifyUsers[ch]) || {};
        return `🔔 #${ch} — 🔴 live: ${(chUsers.live||[]).length} | ⚫ offline: ${(chUsers.offline||[]).length} | 🎮 category: ${(chUsers.category||[]).length}`;
      }
      return `Usage: ${PREFIX}notify live/offline/category on/off | ${PREFIX}notify list`;
    }

    // Fall through to public commands for anything not matched above
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PUBLIC COMMANDS — open to every viewer ────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (cmd === "help") {
    if (hasAnyAccess(tags, state)) {
      return (
        `🔧 Mod/Broadcaster (?): ` +
        `say | markov | dadjoke | gpt | song | 8ball <q> | mock | story | compliment | remind | ` +
        `forsen | copypasta | monka | iq | clip | urban | translate | weather | watchtime | ` +
        `roll | choose | coinflip | bancheck | botcheck | forsenalert | forsenrun | lines | followage | top | status | commands | notify | ` +
        `start | stop | interval | cooldown | minlines | onlineonly | greeter | join | leave | removeme | channels`
      );
    }
    return (
      `Commands (?): ` +
      `say | markov | dadjoke | gpt | song | 8ball <q> | mock | story | compliment | remind | ` +
      `forsen | copypasta | monka | iq | clip | urban | translate | weather | watchtime | ` +
      `roll | choose | coinflip | bancheck | botcheck | forsenalert | forsenrun | lines | followage | top | status | commands | ` +
      `notify live/offline/category on/off`
    );
  }

  if (cmd === "say") {
    const SAY_COOLDOWN_MS = 5 * 60 * 1000;
    const user = (tags.username || "").toLowerCase();
    if (!hasAnyAccess(tags, state)) {
      const last = ctx.sayCooldowns[user] || 0;
      const remaining = SAY_COOLDOWN_MS - (Date.now() - last);
      if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        const mins = Math.floor(secs / 60);
        const s    = secs % 60;
        return `@${user} ⏳ You can use ${PREFIX}say again in ${mins}m ${s}s.`;
      }
      ctx.sayCooldowns[user] = Date.now();
    }
    const result = postNow(channel, true);
    if (typeof result === "string") {
      if (result === "corpus_small") return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — need more chat messages.`;
      if (result === "cooldown") return `⚠️ Cooldown active — need more chat messages between bot posts.`;
      if (result === "filtered") return `⚠️ Couldn't generate a clean message right now.`;
      return `⚠️ Could not post.`;
    }
    return null;
  }

  if (cmd === "markov") {
    const seed = args.join(" ").trim();
    if (!seed) return `⚠️ Usage: ${PREFIX}markov <seed text>`;
    if (markov.size < state.minCorpus) return `📚 Corpus too small (${markov.size}/${state.minCorpus}).`;
    const sentence = markov.generateSeeded(seed, { minWords: 6, maxWords: 28 });
    if (!sentence) return `⚠️ Couldn't generate a sentence from that seed.`;
    return sentence;
  }

  if (cmd === "remind") {
    const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    const text   = args.slice(1).join(" ").trim();
    if (!target || !text) return `⚠️ Usage: ${PREFIX}remind <user> <message>`;
    const from = (tags.username || "").toLowerCase();
    if (!ctx.reminders[target]) ctx.reminders[target] = [];
    ctx.reminders[target].push({ from, text, when: Date.now(), channel });
    return `✅ @${from} I'll remind ${target} when they next chat!`;
  }

  if (cmd === "dadjoke") {
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    Promise.resolve().then(async () => {
      try {
        const res = await fetch("https://icanhazdadjoke.com/", {
          headers: { "Accept": "application/json", "User-Agent": "TwitchMarkovBot/2.0" }
        });
        const data = await res.json();
        client.say(replyTo, data && data.joke ? `🥁 ${data.joke}` : "⚠️ Couldn't fetch a dad joke.").catch(() => {});
      } catch (e) {
        client.say(replyTo, "⚠️ Couldn't reach the dad joke server.").catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "song" || cmd === "music") { handleSongCommand(channel, ch, tags, ctx); return null; }

  if (cmd === "8ball") {
    const RESPONSES = [
      "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
      "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.",
      "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
      "Better not tell you now.", "Cannot predict now.", "Don't count on it.",
      "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
    ];
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

  if (cmd === "compliment") {
    const target = (args[0] || "").toLowerCase().trim();
    if (!target) return `⚠️ Usage: ${PREFIX}compliment <username>`;
    if (markov.size < state.minCorpus) return `⚠️ Corpus too small to generate a compliment yet.`;
    const sentence = markov.generate({ minWords: 5, maxWords: 20 });
    if (!sentence) return `⚠️ Couldn't generate a compliment right now.`;
    return `@${target} ${sentence}`;
  }

  if (cmd === "lines") {
    return `📚 Lines: ${markov.size} trained.`;
  }

  if (cmd === "followage") {
    const target   = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    const lookupCh = (args[1] || ch).toLowerCase().replace(/^#/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}followage <username> [channel]`;
    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;
    Promise.resolve().then(async () => {
      const { client } = ctx;
      const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
      try {
        const [bcData, userData] = await Promise.all([
          helixGet(`users?login=${encodeURIComponent(lookupCh)}`),
          helixGet(`users?login=${encodeURIComponent(target)}`),
        ]);
        const broadcasterId = bcData.data?.[0]?.id;
        const userId        = userData.data?.[0]?.id;
        if (!broadcasterId) return client.say(replyTo, `⚠️ Channel #${lookupCh} not found on Twitch.`);
        if (!userId)        return client.say(replyTo, `⚠️ User ${target} not found on Twitch.`);
        const followData = await helixGet(`channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`);
        if (!followData.data?.length) return client.say(replyTo, `📊 ${target} is not following #${lookupCh}.`);
        const followedAt = new Date(followData.data[0].followed_at);
        const diffMs = new Date() - followedAt;
        const days   = Math.floor(diffMs / 86_400_000);
        const years  = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        const remDays = days % 30;
        const parts = [];
        if (years)   parts.push(`${years} year${years   !== 1 ? "s" : ""}`);
        if (months)  parts.push(`${months} month${months !== 1 ? "s" : ""}`);
        if (remDays || parts.length === 0) parts.push(`${remDays} day${remDays !== 1 ? "s" : ""}`);
        client.say(replyTo, `📅 ${target} has been following #${lookupCh} for ${parts.join(", ")} (since ${followedAt.toLocaleDateString("en-GB")}).`);
      } catch (err) {
        client.say(replyTo, `⚠️ Followage lookup failed: ${err.message}`).catch(() => {});
      }
    });
    return `🔍 Checking followage for ${target}...`;
  }

  if (cmd === "top") {
    if (markov.size === 0) return `📚 Corpus is empty.`;
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
    return `🔤 Top words in corpus: ${top || "(not enough data)"}.`;
  }

  if (cmd === "status") {
    const paused     = !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
    const onlineOnly = !!(state.channelSettings[ch] && state.channelSettings[ch].onlineOnly);
    const active     = !paused;
    const intervalSecs = getChannelInterval(ch) / 1000;
    const cooldown     = getChannelCooldown(ch);
    const cdInfo       = cooldown > 0 ? `${cooldown}` : "none";
    return (
      `📊 #${ch}: ${active ? "▶ posting" : "⏸ paused"} | ` +
      `Every: ${intervalSecs}s | Min messages: ${cdInfo} | ` +
      `Corpus: ${markov.size.toLocaleString()} lines | ` +
      `Online-only: ${onlineOnly ? "on" : "off"}`
    );
  }

  if (cmd === "notify") {
    const VALID_EVENTS = ["live", "offline", "category"];
    const sub   = (args[0] || "").toLowerCase();
    const onOff = (args[1] || "").toLowerCase();
    const user  = (tags.username || "").toLowerCase();
    if (VALID_EVENTS.includes(sub) && (onOff === "on" || onOff === "off")) {
      if (!state.notifyUsers) state.notifyUsers = {};
      if (!state.notifyUsers[ch]) state.notifyUsers[ch] = {};
      if (!state.notifyUsers[ch][sub]) state.notifyUsers[ch][sub] = [];
      if (onOff === "on") {
        if (state.notifyUsers[ch][sub].includes(user)) return `@${user} Already subscribed to ${sub} notifications for #${ch}.`;
        state.notifyUsers[ch][sub].push(user);
        saveState();
        const label = sub === "live" ? "goes live" : sub === "offline" ? "goes offline" : "changes category";
        return `@${user} ✅ You'll be pinged when #${ch} ${label}!`;
      } else {
        const idx = state.notifyUsers[ch][sub].indexOf(user);
        if (idx === -1) return `@${user} Not subscribed to ${sub} notifications for #${ch}.`;
        state.notifyUsers[ch][sub].splice(idx, 1);
        saveState();
        return `@${user} 🔕 Unsubscribed from ${sub} notifications for #${ch}.`;
      }
    }
    if (sub === "list") {
      const chUsers = (state.notifyUsers && state.notifyUsers[ch]) || {};
      return `🔔 #${ch} — 🔴 live: ${(chUsers.live||[]).length} | ⚫ offline: ${(chUsers.offline||[]).length} | 🎮 category: ${(chUsers.category||[]).length}`;
    }
    return `Usage: ${PREFIX}notify live/offline/category on/off | ${PREFIX}notify list`;
  }

  if (cmd === "gpt") {
    const question = args.join(" ").trim();
    if (!question) return `⚠️ Usage: ${PREFIX}gpt <question>`;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return `⚠️ GROQ_API_KEY not set — ?gpt is disabled.`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: "You are a helpful Twitch chat assistant. Answer in 2-3 short sentences max. Be concise and casual. No markdown, no bullet points." },
              { role: "user",   content: question },
            ],
            max_tokens: 120,
          }),
        });
        const data = await res.json();
        if (data.error) return client.say(replyTo, `⚠️ Groq error: ${data.error.message}`).catch(() => {});
        const answer = data?.choices?.[0]?.message?.content?.trim();
        if (!answer) return client.say(replyTo, "⚠️ Groq returned no answer.").catch(() => {});
        client.say(replyTo, `@${user} ${answer}`.slice(0, 490)).catch(() => {});
      } catch (e) {
        client.say(replyTo, `⚠️ Groq request failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "forsen") {
    return FORSEN_LINES[Math.floor(Math.random() * FORSEN_LINES.length)];
  }

  if (cmd === "copypasta") {
    return COPYPASTAS[Math.floor(Math.random() * COPYPASTAS.length)].slice(0, 499);
  }

  if (cmd === "monka") {
    return MONKA_LINES[Math.floor(Math.random() * MONKA_LINES.length)];
  }

  if (cmd === "iq") {
    const target = (args[0] || tags.username || "").toLowerCase().replace(/^@/, "").trim();
    let hash = 0;
    for (let i = 0; i < target.length; i++) hash = (hash * 31 + target.charCodeAt(i)) >>> 0;
    const iq = 50 + (hash % 101);
    const label =
      iq >= 140 ? "galaxy brain 5Head" :
      iq >= 120 ? "pretty smart ngl" :
      iq >= 100 ? "average chat member" :
      iq >= 80  ? "slightly below average Pepega" :
                  "Pepega Clap";
    return `🧠 ${target}'s IQ is ${iq} — ${label}`;
  }

  if (cmd === "clip") {
    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const bcData = await helixGet(`users?login=${encodeURIComponent(ch)}`);
        const broadcasterId = bcData.data?.[0]?.id;
        if (!broadcasterId) return client.say(replyTo, `⚠️ Channel #${ch} not found on Twitch.`).catch(() => {});
        const clipData = await helixGet(`clips?broadcaster_id=${broadcasterId}&first=1`);
        const clip = clipData.data?.[0];
        if (!clip) return client.say(replyTo, `@${user} 🎬 No clips found for #${ch}.`).catch(() => {});
        client.say(replyTo, `@${user} 🎬 Latest clip: "${clip.title}" by ${clip.creator_name} — ${clip.url}`).catch(() => {});
      } catch (err) {
        client.say(replyTo, `@${user} ⚠️ Clip lookup failed: ${err.message}`).catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "commands") {
    const user = (tags.username || "").toLowerCase();
    return `@${user} Commands (?): say | markov | dadjoke | gpt | song | 8ball | mock | story | compliment | remind | forsen | copypasta | monka | iq | clip | urban | translate | weather | watchtime | followage | roll | choose | coinflip | forsenalert | forsenrun | bancheck | botcheck | ping | quote | offliners | logs | linecount | loseroftheday | lastline | firstline | lastseen | isdown | stock | crypto | user | isbanned | founders | namecheck | randomclip | notify | lines | top | status | help`;
  }

  if (cmd === "howtoadd") {
    const user = (tags.username || "").toLowerCase();
    return `@${user} 👋 Want to add the bot to your channel? Type ${PREFIX}join in @shlbez's channel!`;
  }

  if (cmd === "howtoremove") {
    const user = (tags.username || "").toLowerCase();
    return `@${user} 👋 Want to remove the bot? Type ${PREFIX}removeme in your own channel.`;
  }

  if (cmd === "watchtime") {
    const user = (tags.username || "").toLowerCase();
    // ?watchtime <user1> <user2>  → how long user1 watched user2's channel
    // ?watchtime <user>           → how long user watched current channel
    if (args.length >= 2) {
      const watcher  = args[0].toLowerCase().replace(/^@/, "").trim();
      const streamer = args[1].toLowerCase().replace(/^@/, "").trim();
      const wt = (ctx.watchtime && ctx.watchtime[streamer] && ctx.watchtime[streamer][watcher]) || 0;
      if (wt === 0) return `👁️ ${watcher} has no watchtime recorded in #${streamer}.`;
      const totalMins = Math.floor(wt / 60);
      const hours = Math.floor(totalMins / 60);
      const mins  = totalMins % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return `👁️ ${watcher} has watched #${streamer} for ${timeStr}.`;
    } else {
      const target = (args[0] || user).toLowerCase().replace(/^@/, "").trim();
      const wt = (ctx.watchtime && ctx.watchtime[ch] && ctx.watchtime[ch][target]) || 0;
      if (wt === 0) return `👁️ ${target} has no watchtime recorded yet in #${ch}.`;
      const totalMins = Math.floor(wt / 60);
      const hours = Math.floor(totalMins / 60);
      const mins  = totalMins % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return `👁️ ${target} has been watching #${ch} for ${timeStr}.`;
    }
  }

  if (cmd === "urban") {
    const term = args.join(" ").trim();
    if (!term) return `⚠️ Usage: ${PREFIX}urban <word>`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const res  = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
        const data = await res.json();
        const entry = data?.list?.[0];
        if (!entry) return client.say(replyTo, `@${user} ⚠️ No definition found for "${term}".`).catch(() => {});
        const def = entry.definition.replace(/[\[\]]/g, "").replace(/\r?\n/g, " ").trim();
        client.say(replyTo, `@${user} 📖 ${term}: ${def}`.slice(0, 490)).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Urban Dictionary lookup failed.`).catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "translate") {
    // Usage: ?translate <text>              — auto-detect to English
    //        ?translate <lang_code> <text>  — explicit source lang (e.g. ?translate fr bonjour)
    if (args.length === 0) return `⚠️ Usage: ${PREFIX}translate <text>  OR  ${PREFIX}translate <lang> <text>`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();

    let sourceLang = "autodetect";
    let textToTranslate;
    // Detect if first arg is a language code (2–5 chars, letters only, e.g. "fr", "zh-CN")
    if (args.length >= 2 && /^[a-zA-Z]{2}(-[a-zA-Z]{2})?$/.test(args[0])) {
      sourceLang    = args[0].toLowerCase();
      textToTranslate = args.slice(1).join(" ").trim();
    } else {
      textToTranslate = args.join(" ").trim();
    }

    Promise.resolve().then(async () => {
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=${sourceLang}|en`;
        const res  = await fetch(url);
        const data = await res.json();
        const translated = data?.responseData?.translatedText;
        // MyMemory returns the original text back when it can't translate
        if (!translated || translated.toLowerCase() === textToTranslate.toLowerCase()) {
          return client.say(replyTo, `@${user} ⚠️ Couldn't translate that. Try specifying the language: ${PREFIX}translate fr <text>`).catch(() => {});
        }
        // Try to show the detected language even in auto mode
        let langTag = "";
        if (sourceLang !== "autodetect") {
          langTag = ` (${sourceLang} → en)`;
        } else {
          // MyMemory returns detected language in responseDetails or match field
          const detected = data?.responseData?.match
            ? null  // not reliable
            : (data?.responseDetails || "").match(/([a-z]{2})/i)?.[1]?.toLowerCase();
          // Also check if first arg looked like a language we didn't recognise
          if (detected && detected !== "en") langTag = ` (${detected} → en)`;
        }
        client.say(replyTo, `@${user} 🌐${langTag} ${translated}`.slice(0, 490)).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Translation failed.`).catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "weather") {
    const city = args.join(" ").trim();
    if (!city) return `⚠️ Usage: ${PREFIX}weather <city>`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const geoRes  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
        const geoData = await geoRes.json();
        const loc = geoData?.results?.[0];
        if (!loc) return client.say(replyTo, `@${user} ⚠️ City "${city}" not found.`).catch(() => {});
        const { latitude, longitude, name, country } = loc;
        const wxRes  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&forecast_days=1`);
        const wxData = await wxRes.json();
        const wx = wxData?.current_weather;
        if (!wx) return client.say(replyTo, `@${user} ⚠️ Couldn't fetch weather for ${name}.`).catch(() => {});
        const humidity = wxData?.hourly?.relativehumidity_2m?.[0] ?? "?";
        const desc = wx.weathercode <= 1 ? "☀️ Clear" : wx.weathercode <= 3 ? "⛅ Cloudy" : wx.weathercode <= 67 ? "🌧️ Rain" : wx.weathercode <= 77 ? "❄️ Snow" : "⛈️ Storm";
        client.say(replyTo, `@${user} 🌍 ${name}, ${country}: ${desc} | 🌡️ ${wx.temperature}°C | 💨 ${wx.windspeed} km/h | 💧 ${humidity}% humidity`).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Weather lookup failed.`).catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "roll") {
    const input = (args[0] || "1d6").toLowerCase().trim();
    let numDice, numSides;
    const ndnMatch  = input.match(/^(\d+)d(\d+)$/);
    const plainMatch = input.match(/^(\d+)$/);
    if (ndnMatch) {
      numDice  = Math.min(parseInt(ndnMatch[1]), 20);
      numSides = Math.min(parseInt(ndnMatch[2]), 1000);
    } else if (plainMatch) {
      numDice  = 1;
      numSides = Math.min(parseInt(plainMatch[1]), 1000);
    } else {
      return `⚠️ Usage: ${PREFIX}roll <sides>  or  ${PREFIX}roll <NdN>  e.g. ?roll 20 or ?roll 2d6`;
    }
    if (numDice < 1 || numSides < 2) return `⚠️ Need at least 1 die with 2+ sides.`;
    const rolls  = Array.from({ length: numDice }, () => Math.floor(Math.random() * numSides) + 1);
    const total  = rolls.reduce((a, b) => a + b, 0);
    const detail = numDice > 1 ? ` (${rolls.join(" + ")})` : "";
    const user   = (tags.username || "").toLowerCase();
    return `🎲 @${user} rolled ${numDice}d${numSides}: ${total}${detail}`;
  }

  if (cmd === "choose") {
    const text = args.join(" ").trim();
    if (!text) return `⚠️ Usage: ${PREFIX}choose <a> or <b>`;
    const options = text.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
    if (options.length < 2) return `⚠️ Separate choices with "or" — e.g. ${PREFIX}choose forsen or xqc`;
    const pick = options[Math.floor(Math.random() * options.length)];
    const user = (tags.username || "").toLowerCase();
    return `🤔 @${user} I choose: ${pick}`;
  }

  if (cmd === "coinflip") {
    const user = (tags.username || "").toLowerCase();
    return `@${user} ${Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!"}`;
  }

  if (cmd === "forsenalert") {
    const user = (tags.username || "").toLowerCase();
    const sub  = (args[0] || "").toLowerCase();
    if (!state.forsenAlertChannels) state.forsenAlertChannels = {};
    if (!state.forsenAlertChannels[ch]) state.forsenAlertChannels[ch] = [];

    // Owner-only: ?forsenalert add <user> [channel]
    if (sub === "add" && isOwner(tags)) {
      const target  = (args[1] || "").toLowerCase().replace(/^@/, "").trim();
      const targetCh = args[2] ? args[2].toLowerCase().replace(/^#/, "").trim() : ch;
      if (!target) return `⚠️ Usage: ${PREFIX}forsenalert add <user> [channel]`;
      if (!state.forsenAlertChannels[targetCh]) state.forsenAlertChannels[targetCh] = [];
      if (state.forsenAlertChannels[targetCh].includes(target)) return `@${user} ${target} is already subscribed in #${targetCh}.`;
      state.forsenAlertChannels[targetCh].push(target);
      saveState();
      return `@${user} ✅ Added ${target} to forsen alerts in #${targetCh}.`;
    }

    // Owner-only: ?forsenalert remove <user> [channel]
    if (sub === "remove" && isOwner(tags)) {
      const target   = (args[1] || "").toLowerCase().replace(/^@/, "").trim();
      const targetCh = args[2] ? args[2].toLowerCase().replace(/^#/, "").trim() : ch;
      if (!target) return `⚠️ Usage: ${PREFIX}forsenalert remove <user> [channel]`;
      const list = state.forsenAlertChannels[targetCh] || [];
      const idx  = list.indexOf(target);
      if (idx === -1) return `@${user} ${target} is not subscribed in #${targetCh}.`;
      list.splice(idx, 1);
      saveState();
      return `@${user} ✅ Removed ${target} from forsen alerts in #${targetCh}.`;
    }

    // Owner-only: ?forsenalert list [channel]
    if (sub === "list" && isOwner(tags)) {
      const targetCh = args[1] ? args[1].toLowerCase().replace(/^#/, "").trim() : ch;
      const list = (state.forsenAlertChannels[targetCh] || []);
      return `@${user} forsenE #${targetCh} alert subs (${list.length}): ${list.join(", ") || "(none)"}`;
    }

    const list = state.forsenAlertChannels[ch];
    const idx  = list.indexOf(user);

    if (sub === "off") {
      if (idx === -1) return `@${user} You're not subscribed to forsen alerts in #${ch}.`;
      list.splice(idx, 1);
      saveState();
      return `@${user} 🔕 Unsubscribed from forsen MC run alerts in #${ch}.`;
    }

    // No arg or anything else = subscribe
    if (idx === -1) {
      list.push(user);
      saveState();
      return `@${user} forsenE You're subscribed to forsen MC god run alerts in #${ch}! Type ?forsenalert off to unsubscribe.`;
    } else {
      return `@${user} You're already subscribed in #${ch}. Type ?forsenalert off to unsubscribe.`;
    }
  }

  if (cmd === "forsenrun") {
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();

    const isLive        = ctx.isForsenLive && ctx.isForsenLive();
    const isMinecraft   = ctx.isForsenPlayingMinecraft && ctx.isForsenPlayingMinecraft();
    const lastRunSecs   = ctx.getForsenLastRunSecs ? ctx.getForsenLastRunSecs() : 0;

    function fmtSecs(s) {
      const totalSecs = Math.floor(s);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const sec = totalSecs % 60;
      if (h > 0) return `${h}h ${m}m ${sec}s`;
      if (m > 0) return `${m}m ${sec}s`;
      return `${sec}s`;
    }

    const lastRunPart = lastRunSecs > 0
      ? ` | Last run: ${fmtSecs(lastRunSecs)}`
      : "";

    // ── Case 1: forsen is offline ──────────────────────────────────────────
    if (!isLive) {
      // Check if it's between 16:30 and 22:00 CEST (UTC+2 in summer, UTC+1 in winter)
      // Use UTC+2 as forsen's typical streaming timezone (CEST)
      const nowUtc    = new Date();
      const cestOffset = 2 * 60; // CEST = UTC+2 (covers most of forsen's streaming season)
      const cestMins  = (nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + cestOffset) % (24 * 60);
      const streamWindow = cestMins >= (16 * 60 + 30) && cestMins < (22 * 60);
      if (streamWindow) {
        return `@${user} forsenSleeper Forsen is taking today off.${lastRunPart}`;
      }
      return `@${user} forsenSleeper forsen is offline right now.${lastRunPart}`;
    }

    // ── Case 2: forsen is live but not playing Minecraft ─────────────────
    if (!isMinecraft) {
      const currentCategory = ctx.getForsenCategory ? ctx.getForsenCategory() : null;
      const categoryPart    = currentCategory ? ` instead he is playing ${currentCategory}` : "";
      return `@${user} forsenDank forsen is not speedrunning Minecraft today,${categoryPart}.${lastRunPart}`;
    }

    // ── Case 3: live + Minecraft — fetch current run data ─────────────────
    Promise.resolve().then(async () => {
      try {
        const URLS = [
          "https://forsenmc.piggeywig2000.dev/api/time/latest?streamer=forsen",
          "https://forsenmc.piggeywig2000.dev/api/times/latest?streamer=forsen",
          "https://forsenmc.piggeywig2000.dev/api/Times/latest?streamer=forsen",
        ];

        let entry = ctx.forsenMcLatestData && ctx.forsenMcLatestData();

        if (!entry) {
          for (const url of URLS) {
            try {
              const res = await fetch(url, { headers: { "User-Agent": "shibez-bot/1.0" } });
              if (!res.ok) continue;
              const json = await res.json();
              entry = Array.isArray(json) ? json[json.length - 1] : json;
              if (entry) break;
            } catch (_) { continue; }
          }
        }

        if (!entry) {
          return client.say(replyTo,
            `@${user} forsenE forsen is playing Minecraft but no run timer detected yet.${lastRunPart}`
          ).catch(() => {});
        }

        // igt field is seconds (e.g. 572.4) based on Railway logs
        const igtSecs = entry.igt != null ? parseFloat(entry.igt) :
                        entry.gameTime != null ? parseFloat(entry.gameTime) :
                        entry.game_time != null ? parseFloat(entry.game_time) : null;

        if (!igtSecs || igtSecs === 0) {
          return client.say(replyTo,
            `@${user} forsenE forsen is playing Minecraft — timer at 0 or not started yet.${lastRunPart}`
          ).catch(() => {});
        }

        const igtStr = fmtSecs(igtSecs);
        client.say(replyTo,
          `@${user} 🎮 forsen MC — ⏱️ IGT: ${igtStr} | twitch.tv/forsen`
        ).catch(() => {});

      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ forsenrun lookup failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

    if (cmd === "bancheck") {
    const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}bancheck <username>`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    Promise.resolve().then(async () => {
      try {
        // Check if the user is a Twitch partner (if API keys available)
        let isPartner = false;
        if (helixGet) {
          try {
            const userData = await helixGet(`users?login=${encodeURIComponent(target)}`);
            const userInfo = userData?.data?.[0];
            isPartner = userInfo?.broadcaster_type === "partner";
          } catch (_) {}
        }

        if (isPartner) {
          // Partners → scrape streamerbans.com which has historical data
          await checkStreamerBans(target, replyTo, client);
        } else {
          // Affiliates and others → use betterbanned.com API
          await checkBetterBanned(target, replyTo, client);
        }
      } catch (e) {
        client.say(replyTo, `⚠️ Ban lookup failed for ${target}: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  if (cmd === "botcheck") {
    const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}botcheck <channel>`;
    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();

    if (!ctx.botcheckCooldowns) ctx.botcheckCooldowns = {};
    const lastBc = ctx.botcheckCooldowns[target] || 0;
    const bcRemaining = 60_000 - (Date.now() - lastBc);
    if (bcRemaining > 0) return `@${user} ⏳ ?botcheck on cooldown for ${Math.ceil(bcRemaining / 1000)}s.`;
    ctx.botcheckCooldowns[target] = Date.now();

    Promise.resolve().then(async () => {
      try {
        // Get stream data and channel user info in parallel
        const [streamData, userData] = await Promise.all([
          helixGet(`streams?user_login=${encodeURIComponent(target)}`),
          helixGet(`users?login=${encodeURIComponent(target)}`),
        ]);

        const stream = streamData.data?.[0];
        if (!stream) {
          return client.say(replyTo, `@${user} ⚠️ #${target} is not live right now.`).catch(() => {});
        }

        const broadcasterId = userData.data?.[0]?.id;
        const createdAt     = userData.data?.[0]?.created_at;
        const viewerCount   = stream.viewer_count;

        // Get follower count
        const followerData  = await helixGet(`channels/followers?broadcaster_id=${broadcasterId}&first=1`);
        const followerCount = followerData?.total ?? 0;

        // Compute signals
        const channelAgeDays = createdAt
          ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
          : 9999;
        const ratio = followerCount > 0 ? (viewerCount / followerCount).toFixed(2) : "∞";

        // Verdict — high viewer:follower ratio on a newer channel is the main signal
        let verdict;
        if (followerCount > 0 && viewerCount > followerCount * 0.5 && channelAgeDays < 180) {
          verdict = "🚨 SUSPICIOUS — very high viewer/follower ratio on a new channel";
        } else if (followerCount > 0 && viewerCount > followerCount * 2) {
          verdict = "⚠️ Unusual viewer/follower ratio";
        } else {
          verdict = "✅ Looks normal";
        }

        client.say(replyTo,
          `@${user} 🤖 #${target}: ${viewerCount.toLocaleString()} viewers | ` +
          `${followerCount.toLocaleString()} followers | ratio ${ratio} | ` +
          `channel age: ${channelAgeDays}d | ${verdict}`
        ).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Botcheck failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── NEW PUBLIC COMMANDS ───────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // ?ping — bot status
  if (cmd === "ping") {
    const uptimeMs = Date.now() - ctx.botStart;
    const h   = Math.floor(uptimeMs / 3_600_000);
    const m   = Math.floor((uptimeMs % 3_600_000) / 60_000);
    const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const totalChs = [...new Set([
      ...state.postChannels,
      ...(state.manualChannels || []),
      ...state.learnChannels,
    ])].length;
    return `🏓 Pong! ● Uptime: ${h}h ${m}m ● Channels: ${totalChs} ● Memory: ${memMB}MB ● Corpus: ${markov.size.toLocaleString()} lines`;
  }

  // ?quote — daily motivational quote via ZenQuotes
  if (cmd === "quote") {
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const res  = await fetch("https://zenquotes.io/api/today", { headers: { "User-Agent": "shibez-bot/1.0" } });
        const data = await res.json();
        const q = data?.[0];
        if (!q) return client.say(replyTo, `@${user} ⚠️ Couldn't fetch a quote right now.`).catch(() => {});
        client.say(replyTo, `@${user} 💬 "${q.q}" — ${q.a}`).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Quote fetch failed.`).catch(() => {});
      }
    });
    return null;
  }

  // ?offliners — link to y_exp's offliners site
  if (cmd === "offliners") {
    const user = (tags.username || "").toLowerCase();
    return `@${user} 💤 Offliners: https://twitch.yexp.dev/offliners/`;
  }

  // ?logs <channel> <user> — best-logs link via ZonianMidian + Supelle's frontend
  if (cmd === "logs") {
    const user       = (tags.username || "").toLowerCase();
    const targetCh   = (args[0] || ch).replace(/^#/, "").toLowerCase().trim();
    const targetUser = (args[1] || "").toLowerCase().replace(/^@/, "").trim();
    if (!targetUser) return `⚠️ Usage: ${PREFIX}logs <channel> <user>`;
    return `@${user} 📋 Logs for @${targetUser} in #${targetCh}: https://logs.zonian.dev/rdr/${targetCh}/${targetUser}?pretty=true`;
  }

  // ?linecount [user] [-global] [-alltime] [days:1]
  if (cmd === "linecount") {
    const user        = (tags.username || "").toLowerCase();
    const isGlobal    = args.includes("-global");
    const daysArg     = args.find(a => a.startsWith("days:"));
    const days        = daysArg ? parseInt(daysArg.split(":")[1]) : null;
    const targetUser  = args.find(a => !a.startsWith("-") && !a.startsWith("days:"))
      ?.toLowerCase().replace(/^@/, "") || user;
    const { linecount, dailyCount } = ctx;

    if (isGlobal) {
      let total = 0;
      for (const chData of Object.values(linecount || {})) total += (chData[targetUser] || 0);
      return `@${user} 📊 ${targetUser} — ${total.toLocaleString()} messages tracked globally.`;
    }
    if (days === 1) {
      const count = dailyCount?.[ch]?.[targetUser] || 0;
      return `@${user} 📊 ${targetUser} — ${count.toLocaleString()} messages in #${ch} today.`;
    }
    const total = linecount?.[ch]?.[targetUser] || 0;
    return `@${user} 📊 ${targetUser} — ${total.toLocaleString()} messages in #${ch} (all-time).`;
  }

  // ?loseroftheday / ?lotd / ?lotw / ?lotm / ?loty
  if (["loseroftheday", "lotd", "lotw", "lotm", "loty"].includes(cmd)) {
    const user = (tags.username || "").toLowerCase();
    const { linecount, dailyCount } = ctx;
    const isDaily = cmd === "loseroftheday" || cmd === "lotd";
    const data    = isDaily ? (dailyCount?.[ch] || {}) : (linecount?.[ch] || {});
    const label   = isDaily ? "today" : "all-time";
    const entries = Object.entries(data).filter(([, n]) => n > 0);
    if (entries.length === 0) return `@${user} 📊 No message data yet for #${ch}.`;
    entries.sort((a, b) => b[1] - a[1]);
    const [winner, count] = entries[0];
    const top3 = entries.slice(0, 3).map(([u, n], i) => `${i + 1}. ${u} (${n.toLocaleString()})`).join(" | ");
    return `@${user} OMEGALUL Loser of the ${isDaily ? "day" : "week/month/year (all-time)"} in #${ch}: @${winner} (${count.toLocaleString()} msgs ${label}) — ${top3}`;
  }

  // ?lastline <user> [channel]
  if (cmd === "lastline") {
    const target   = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}lastline <user> [channel]`;
    const user     = (tags.username || "").toLowerCase();
    const targetCh = args[1] ? args[1].replace(/^#/, "").toLowerCase().trim() : ch;
    const last     = ctx.lastMessage?.[targetCh]?.[target];
    if (!last) return `@${user} 🔍 No messages from ${target} recorded in #${targetCh} this session.`;
    return `@${user} 💬 ${target}'s last line in #${targetCh}: "${last}"`;
  }

  // ?firstline <user> [channel]
  if (cmd === "firstline") {
    const target   = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}firstline <user> [channel]`;
    const user     = (tags.username || "").toLowerCase();
    const targetCh = args[1] ? args[1].replace(/^#/, "").toLowerCase().trim() : ch;
    const first    = ctx.firstline?.[targetCh]?.[target];
    if (!first) return `@${user} 🔍 No first-message data for ${target} in #${targetCh}.`;
    const when = new Date(first.at).toLocaleDateString("en-GB");
    return `@${user} 💬 ${target}'s first line in #${targetCh} (${when}): "${first.text}"`;
  }

  // ?lastseen <user>
  if (cmd === "lastseen") {
    const target = (args[0] || "").toLowerCase().replace(/^@/, "").trim();
    if (!target) return `⚠️ Usage: ${PREFIX}lastseen <user>`;
    const user = (tags.username || "").toLowerCase();
    const seen = ctx.lastseen?.[target];
    if (!seen) return `@${user} 🔍 ${target} hasn't been seen in any tracked channel.`;
    const ago = cmdFormatAgo(Date.now() - seen.at);
    return `@${user} 👁️ ${target} was last seen in #${seen.channel} ${ago} ago.`;
  }

  // ?isdown <domain or URL>
  if (cmd === "isdown") {
    const raw = (args[0] || "").trim();
    if (!raw) return `⚠️ Usage: ${PREFIX}isdown <domain or URL>`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    const url  = raw.startsWith("http") ? raw : `https://${raw}`;
    let hostname;
    try { hostname = new URL(url).hostname; } catch { hostname = raw; }
    Promise.resolve().then(async () => {
      try {
        const start = Date.now();
        const res   = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000), redirect: "follow" });
        client.say(replyTo, `@${user} 🌐 ${hostname} — ✅ UP | Status: ${res.status} | Response time: ${Date.now() - start}ms`).catch(() => {});
      } catch (e) {
        const reason = (e.name === "TimeoutError" || e.name === "AbortError")
          ? "timed out after 8s" : e.message;
        client.say(replyTo, `@${user} 🌐 ${hostname} — ❌ DOWN (${reason})`).catch(() => {});
      }
    });
    return null;
  }

  // ?stock <ticker>
  if (cmd === "stock") {
    const ticker = (args[0] || "").toUpperCase().trim();
    if (!ticker) return `⚠️ Usage: ${PREFIX}stock <ticker> (e.g. ?stock AAPL)`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const res  = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        const data   = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return client.say(replyTo, `@${user} ⚠️ Ticker "${ticker}" not found.`).catch(() => {});
        const meta   = result.meta;
        const price  = meta.regularMarketPrice;
        const prev   = meta.previousClose || meta.chartPreviousClose;
        const change = price - prev;
        const pct    = ((change / prev) * 100).toFixed(2);
        const sign   = change >= 0 ? "+" : "";
        const name   = meta.longName || meta.shortName || ticker;
        client.say(replyTo,
          `@${user} ${change >= 0 ? "📈" : "📉"} ${name} (${meta.symbol}) | ${price.toFixed(2)} ${meta.currency || "USD"} | ${sign}${change.toFixed(2)} (${sign}${pct}%)`
        ).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Stock lookup failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ?crypto <symbol>
  if (cmd === "crypto") {
    const symbol = (args[0] || "").toUpperCase().trim();
    if (!symbol) return `⚠️ Usage: ${PREFIX}crypto <symbol> (e.g. ?crypto BTC)`;
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    const user = (tags.username || "").toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const res  = await fetch(
          `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${encodeURIComponent(symbol)}&tsyms=USD`,
          { headers: { "User-Agent": "shibez-bot/1.0" } }
        );
        const data = await res.json();
        const raw  = data?.RAW?.[symbol]?.USD;
        if (!raw) return client.say(replyTo, `@${user} ⚠️ Crypto "${symbol}" not found.`).catch(() => {});
        const chg  = raw.CHANGEPCT24HOUR ?? 0;
        const sign = chg >= 0 ? "+" : "";
        client.say(replyTo,
          `@${user} ${chg >= 0 ? "📈" : "📉"} ${symbol} | $${raw.PRICE.toLocaleString("en-US", { maximumFractionDigits: 6 })} USD | ${sign}${chg.toFixed(2)}% (24h)`
        ).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Crypto lookup failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ?user [username or ID]
  if (cmd === "user") {
    const raw  = (args[0] || "").trim();
    const user = (tags.username || "").toLowerCase();
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    let target, lookupUrl;
    if (!raw) {
      target = user; lookupUrl = `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(user)}`;
    } else if (/^\d+$/.test(raw)) {
      target = raw;  lookupUrl = `https://api.ivr.fi/v2/twitch/user?id=${raw}`;
    } else {
      target = raw.replace(/^@/, "").toLowerCase();
      lookupUrl = `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(target)}`;
    }
    Promise.resolve().then(async () => {
      try {
        const res = await fetch(lookupUrl, { headers: { "User-Agent": "shibez-bot/1.0" } });
        const data = await res.json();
        const u = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data);
        if (!u?.login) return client.say(replyTo, `@${user} ⚠️ User "${target}" not found on Twitch.`).catch(() => {});
        const created  = u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "?";
        const lastLive = u.lastBroadcast?.startedAt
          ? new Date(u.lastBroadcast.startedAt).toLocaleDateString("en-GB") : "never";
        const followers = u.followers != null ? Number(u.followers).toLocaleString() : "?";
        const roles = [];
        if (u.roles?.isAffiliate) roles.push("Affiliate");
        if (u.roles?.isPartner)   roles.push("Partner");
        const roleStr = roles.length ? ` | ${roles.join(", ")}` : "";
        const banned  = u.banned ? " | 🔨 SUSPENDED" : "";
        client.say(replyTo,
          `@${user} 👤 ${u.displayName} (${u.login}) | ID: ${u.id} | Created: ${created} | Followers: ${followers} | Last live: ${lastLive}${roleStr}${banned}`
        ).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ User lookup failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ?isbanned <username>
  if (cmd === "isbanned") {
    const target = (args[0] || "").replace(/^@/, "").toLowerCase().trim();
    if (!target) return `⚠️ Usage: ${PREFIX}isbanned <username>`;
    const user = (tags.username || "").toLowerCase();
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    Promise.resolve().then(async () => {
      try {
        const res  = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(target)}`, {
          headers: { "User-Agent": "shibez-bot/1.0" },
        });
        const data = await res.json();
        const u    = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data);
        if (!u?.login) {
          return client.say(replyTo, `@${user} 🔍 "${target}" — not found (may be suspended or never existed).`).catch(() => {});
        }
        if (u.banned) {
          const since   = u.bannedAt   ? ` since ${new Date(u.bannedAt).toLocaleDateString("en-GB")}` : "";
          const reason  = u.banReason  ? ` | Reason: ${u.banReason}` : " | Reason: not publicly available";
          const expires = u.banExpires ? ` | Expires: ${new Date(u.banExpires).toLocaleDateString("en-GB")}` : " | Duration: permanent";
          return client.say(replyTo,
            `@${user} 🔨 ${u.displayName} IS suspended from Twitch${since}${reason}${expires}`
          ).catch(() => {});
        }
        client.say(replyTo, `@${user} ✅ ${u.displayName} is NOT banned from Twitch.`).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Ban check failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ?founders <channel>
  if (cmd === "founders") {
    const targetCh = (args[0] || ch).replace(/^#/, "").toLowerCase().trim();
    const user = (tags.username || "").toLowerCase();
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    Promise.resolve().then(async () => {
      try {
        const res = await fetch(`https://api.ivr.fi/v2/twitch/founders/${encodeURIComponent(targetCh)}`, {
          headers: { "User-Agent": "shibez-bot/1.0" },
        });
        if (!res.ok) {
          return client.say(replyTo,
            `@${user} ⚠️ Founders data for #${targetCh} is unavailable — Twitch requires broadcaster auth to access this.`
          ).catch(() => {});
        }
        const data     = await res.json();
        const founders = Array.isArray(data) ? data : (data?.founders ?? data?.data ?? []);
        if (!founders.length) return client.say(replyTo, `@${user} 🏅 No founders found for #${targetCh}.`).catch(() => {});
        const names = founders.map(f => f.login || f.displayName || "?");
        // Split into chunks of 20 names to stay well under 500 char limit
        const CHUNK = 20;
        for (let i = 0; i < names.length; i += CHUNK) {
          const slice    = names.slice(i, i + CHUNK);
          const isFirst  = i === 0;
          const part     = Math.floor(i / CHUNK) + 1;
          const total    = Math.ceil(names.length / CHUNK);
          const prefix   = isFirst
            ? `@${user} 🏅 Founders of #${targetCh} (${names.length})${total > 1 ? ` [${part}/${total}]` : ""}: `
            : `🏅 [${part}/${total}]: `;
          setTimeout(() => {
            client.say(replyTo, (prefix + slice.join(", ")).slice(0, 499)).catch(() => {});
          }, i / CHUNK * 600);
        }
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Founders lookup failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ?namecheck <username>
  if (cmd === "namecheck") {
    const target = (args[0] || "").replace(/^@/, "").toLowerCase().trim();
    if (!target) return `⚠️ Usage: ${PREFIX}namecheck <username>`;
    const user = (tags.username || "").toLowerCase();
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    if (!/^[a-z0-9_]{1,25}$/.test(target))
      return `@${user} ⚠️ "${target}" is not a valid Twitch username (alphanumeric + underscore, max 25 chars).`;
    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;
    Promise.resolve().then(async () => {
      try {
        const data = await helixGet(`users?login=${encodeURIComponent(target)}`);
        if (data.data?.length) {
          // Account exists and is active
          const u = data.data[0];
          return client.say(replyTo,
            `@${user} ❌ "${target}" is taken — registered to ${u.display_name} (created ${new Date(u.created_at).toLocaleDateString("en-GB")}).`
          ).catch(() => {});
        }
        // Helix returns nothing for suspended accounts too — cross-check with IVR
        const ivrRes  = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(target)}`, {
          headers: { "User-Agent": "shibez-bot/1.0" },
        });
        const ivrData = await ivrRes.json();
        const u = Array.isArray(ivrData) ? ivrData[0] : (ivrData?.data?.[0] ?? ivrData);
        if (u?.login) {
          // Account exists but is suspended — name is NOT available
          return client.say(replyTo,
            `@${user} ❌ "${target}" is not available — account exists but is currently suspended.`
          ).catch(() => {});
        }
        client.say(replyTo, `@${user} ✅ "${target}" appears to be available on Twitch!`).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Name check failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ?randomclip <channel> [game:<game>] [-day|-week|-month|-year]
  if (cmd === "randomclip") {
    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;
    const user = (tags.username || "").toLowerCase();
    const { client } = ctx;
    const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
    // First arg is channel only if it doesn't look like a flag or game: arg
    const hasChArg = args[0] && !args[0].startsWith("-") && !args[0].startsWith("game:");
    const targetCh = hasChArg ? args[0].replace(/^#/, "").toLowerCase() : ch;
    const restArgs = hasChArg ? args.slice(1) : args;
    const gameArg  = restArgs.find(a => a.startsWith("game:"))?.slice(5)?.trim() || null;
    const period   = restArgs.find(a => ["-day","-week","-month","-year"].includes(a)) || null;
    Promise.resolve().then(async () => {
      try {
        const bcData        = await helixGet(`users?login=${encodeURIComponent(targetCh)}`);
        const broadcasterId = bcData.data?.[0]?.id;
        if (!broadcasterId) return client.say(replyTo, `@${user} ⚠️ Channel #${targetCh} not found.`).catch(() => {});
        const qp = [`broadcaster_id=${broadcasterId}`, `first=100`];
        if (period) {
          const ms = { "-day": 86_400_000, "-week": 604_800_000, "-month": 2_592_000_000, "-year": 31_536_000_000 };
          qp.push(`started_at=${new Date(Date.now() - ms[period]).toISOString()}`);
        }
        if (gameArg) {
          const gd = await helixGet(`games?name=${encodeURIComponent(gameArg)}`);
          if (gd.data?.[0]?.id) qp.push(`game_id=${gd.data[0].id}`);
        }
        const clips = (await helixGet(`clips?${qp.join("&")}`)).data || [];
        if (!clips.length) {
          const pLabel = period ? ` in the last ${period.slice(1)}` : "";
          return client.say(replyTo, `@${user} 🎬 No clips found for #${targetCh}${pLabel}.`).catch(() => {});
        }
        const clip = clips[Math.floor(Math.random() * clips.length)];
        client.say(replyTo,
          `@${user} 🎬 "${clip.title}" by ${clip.creator_name} (${clip.view_count.toLocaleString()} views) | ${clip.url}`
        ).catch(() => {});
      } catch (e) {
        client.say(replyTo, `@${user} ⚠️ Clip lookup failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ELEVATED ACCESS — mods / VIPs / broadcaster only ─────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (!hasAnyAccess(tags, state)) return null;

  if (cmd === "channels") {
    const postList   = state.postChannels.join(", ")          || "(none)";
    const manualList = (state.manualChannels || []).join(", ") || "(none)";
    const learnList  = state.learnChannels.join(", ")          || "(none)";
    return `📡 Auto-posting: ${postList} | Manual-only: ${manualList} | Learning: ${learnList}`;
  }

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

  if (cmd === "onlineonly") {
    const current = !!(state.channelSettings[ch] && state.channelSettings[ch].onlineOnly);
    setChannelSetting(ch, "onlineOnly", !current);
    saveState();
    return !current
      ? `📴 [#${ch}] Online-only mode ON — bot will only post when stream is live.`
      : `📡 [#${ch}] Online-only mode OFF — bot will post regardless of stream status.`;
  }

  if (cmd === "greeter") {
    state.greeterEnabled = !state.greeterEnabled;
    saveState();
    return state.greeterEnabled
      ? `👋 First-message greeter enabled.`
      : `🔕 First-message greeter disabled.`;
  }

  if (cmd === "join") {
    if (state.postChannels.includes(ch)) return `Already posting in #${ch}.`;
    if (!state.channelSettings[ch]) state.channelSettings[ch] = {};
    state.channelSettings[ch].paused    = true;
    state.channelSettings[ch].onlineOnly = true;
    state.channelSettings[ch].intervalMs = 3_600_000;
    joinChannel(ch);
    state.postChannels.push(ch);
    saveState();
    return `✅ Joined #${ch} — paused by default. Use ${PREFIX}start to begin posting.`;
  }

  if (cmd === "leave") {
    const idx = state.postChannels.indexOf(ch);
    if (idx === -1) return `Not currently posting in #${ch}.`;
    leaveChannel(ch);
    state.postChannels.splice(idx, 1);
    saveState();
    return `👋 Left #${ch}.`;
  }

  if (cmd === "removeme") {
    const inPost   = state.postChannels.indexOf(ch);
    const inManual = (state.manualChannels || []).indexOf(ch);
    const inLearn  = state.learnChannels.indexOf(ch);
    if (inPost === -1 && inManual === -1 && inLearn === -1) return `Bot is not active in #${ch}.`;
    if (inPost   !== -1) state.postChannels.splice(inPost, 1);
    if (inManual !== -1) state.manualChannels.splice(inManual, 1);
    if (inLearn  !== -1) state.learnChannels.splice(inLearn, 1);
    saveState();
    setTimeout(() => leaveChannel(ch), 800);
    return `👋 Bot is leaving #${ch}. The owner can re-add it with ${PREFIX}join.`;
  }

  return null;
}


// ── bancheck helpers ──────────────────────────────────────────────────────────

async function checkStreamerBans(target, replyTo, client) {
  // streamerbans.com tracks partners — scrape their user page
  const res = await fetch(`https://streamerbans.com/user/${encodeURIComponent(target)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TwitchBot/2.0)", "Accept": "text/html" },
  });
  if (!res.ok) {
    // Fall back to betterbanned if streamerbans fails
    return checkBetterBanned(target, replyTo, client);
  }
  const html = await res.text();

  // Parse ban count from page
  const banCountMatch = html.match(/(\d+)\s*(?:time|ban)/i);
  const banCount = banCountMatch ? parseInt(banCountMatch[1]) : null;

  // Parse most recent ban date, duration, reason
  const dateMatch     = html.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\w+ \d+,?\s*\d{4})/);
  const durationMatch = html.match(/(\d+\s*(?:day|hour|week|month|year|perm)[a-z]*)/i);
  const reasonMatch   = html.match(/[Rr]eason[:\s]+([^<]{5,80})/i);

  if (!banCount && !durationMatch) {
    // Nothing found — try betterbanned as fallback
    return checkBetterBanned(target, replyTo, client);
  }

  const parts = [`🔨 ${target} (partner)`];
  if (banCount)        parts.push(`${banCount} ban${banCount !== 1 ? "s" : ""}`);
  if (durationMatch)   parts.push(`last: ${durationMatch[1].trim()}`);
  if (reasonMatch)     parts.push(`reason: ${reasonMatch[1].trim().slice(0, 60)}`);
  parts.push(`🔗 streamerbans.com/user/${target}`);
  client.say(replyTo, parts.join(" | ").slice(0, 499)).catch(() => {});
}

async function checkBetterBanned(target, replyTo, client) {
  const res = await fetch(
    `https://betterbanned.com/api/trpc/streamer.getStreamerByName?input=${encodeURIComponent(JSON.stringify({ json: target }))}`,
    { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
  );
  if (!res.ok) throw new Error(`BetterBanned HTTP ${res.status}`);
  const data = await res.json();
  const streamer = data?.result?.data?.json;

  if (!streamer) {
    return client.say(replyTo, `🔍 ${target} — not found on record. Check: betterbanned.com/en/streamer/${target}`).catch(() => {});
  }

  const totalBans = streamer.totalBans ?? streamer.bans?.length ?? 0;
  if (totalBans === 0) {
    return client.say(replyTo, `✅ ${target} — no bans on record.`).catch(() => {});
  }

  const bans     = streamer.bans || [];
  const lastBan  = bans[0];
  const banDate  = lastBan?.bannedAt ? new Date(lastBan.bannedAt).toLocaleDateString("en-GB") : "unknown";
  const reason   = lastBan?.reason   || "unknown";
  const duration = lastBan?.duration || (lastBan?.unbannedAt ? "temporary" : "permanent");

  client.say(replyTo,
    `🔨 ${target} — ${totalBans} ban${totalBans !== 1 ? "s" : ""} | Last: ${banDate} | Reason: ${reason} | Duration: ${duration}`
  ).catch(() => {});
}

function normalise(ch) {
  if (!ch) return null;
  return ch.replace(/^#/, "").toLowerCase().trim();
}

// ── Forsen one-liners ─────────────────────────────────────────────────────────
const FORSEN_LINES = [
  "forsenScoots he knows forsenScoots",
  "NA education LULW",
  "its joever for forsen residents OMEGALUL",
  "bajs rise up forsenCD",
  "forsen never fails to disappoint LULW",
  "W forsen W",
  "forsen mentioned LULW get in here bajs",
  "forsenE he's been sitting like that for 4 hours",
  "forsen is literally me fr fr",
  "this is a forsen moment forsenScoots",
  "no forsen no life forsenCD",
  "LULW just LULW",
  "he really said forsenE and walked away",
  "chat malding forsen chilling LULW",
  "forsen diff OMEGALUL",
];

// ── Classic Twitch copypastas ─────────────────────────────────────────────────
const COPYPASTAS = [
  "Kripp is such a casual. He plays Path of Exile on STANDARD. What a noob. I bet he has never even played Hardcore. What a waste of a player.",
  "I used to be a real ad. \u{E0000}",
  "gachiGASM MY BROTHER gachiGASM WE ARE FAMILY gachiGASM I LOVE YOU gachiGASM",
  "ATTENTION CHAT. This is now a Pogchamp only zone. Any non-Pogchamp emotes will be met with a 600 second timeout. Thank you for your cooperation.",
  "monkaS guys... monkaS chat... monkaS I don't feel so good monkaS",
  "This guy is actually insane. Like genuinely one of the best to ever do it. I'm not even joking. Top 5 easily. Maybe top 3. Possibly number 1.",
  "Pepega AND I'M LIKE Pepega BABY Pepega WHAT ARE YOU DOING Pepega",
  "FeelsWeirdMan something feels off about today chat FeelsWeirdMan",
  "Clap GOOD STREAM Clap GOOD STREAM Clap GOOD STREAM Clap",
  "PogChamp THE MOMENT PogChamp WE'VE ALL PogChamp BEEN WAITING PogChamp FOR PogChamp",
  "5Head actually quite a trivial solution if you think about it for more than 2 seconds 5Head",
  "OMEGALUL HE FELL OMEGALUL HE ACTUALLY FELL OMEGALUL",
  "chat is this real? is this actually happening right now? I can't believe what I'm seeing. This is insane. Pog",
  "This stream has changed my life. I was failing school, my girlfriend left me, my dog died. Then I found this stream. Now I'm still failing school but at least I'm here.",
];

// ── Monka responses ───────────────────────────────────────────────────────────
const MONKA_LINES = [
  "monkaS what was that",
  "monkaW bro...",
  "monkaHmm something's not right chat",
  "monkaGIGA he's here",
  "monkaS I don't like this chat",
  "monkaW the tension in this stream right now",
  "monkaS guys did you hear that",
  "monkaHmm chat are we safe",
  "monkaW this is NOT okay",
  "monkaS it's getting worse",
  "monkaGIGA chat run",
  "monkaS I'm scared chat monkaS",
];

// ── ?song — per-channel cooldown (30s) ───────────────────────────────────────
const songCooldowns  = {};
const SONG_COOLDOWN_MS = 30_000;

function handleSongCommand(channel, ch, tags, ctx) {
  const { client } = ctx;
  const target = channel.startsWith("#") ? channel : `#${channel}`;
  const user = (tags.username || "").toLowerCase();

  if (!process.env.GROQ_API_KEY) {
    client.say(target, `@${user} ⚠️ ?song is not configured — GROQ_API_KEY is missing.`).catch(() => {});
    return;
  }

  const last = songCooldowns[ch] || 0;
  const remaining = SONG_COOLDOWN_MS - (Date.now() - last);
  if (remaining > 0) {
    client.say(target, `@${user} ⏳ ?song is on cooldown for ${Math.ceil(remaining / 1000)}s.`).catch(() => {});
    return;
  }
  songCooldowns[ch] = Date.now();

  client.say(target, `@${user} 🎵 Listening to the stream, one sec...`).catch(() => {});

  song.identify(ch).then((result) => {
    if (!result) {
      client.say(target, `@${user} 🎵 Couldn't identify the song — no music detected or not enough audio.`).catch(() => {});
    } else {
      client.say(target, `@${user} 🎵 Now playing: ${result.title} by ${result.artist}`).catch(() => {});
    }
  }).catch((err) => {
    console.warn(`⚠️  [?song] ${err.message}`);
    client.say(target, `@${user} ⚠️ Song lookup failed: ${err.message}`).catch(() => {});
  });
}

module.exports = { handle, isOwner, isModOrVip, isBroadcaster, PREFIX };

// ── Local helper — mirrors formatAgo from index.js ───────────────────────────
function cmdFormatAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
