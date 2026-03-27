/**
 * commands.js — All bot commands
 *
 * Auth tiers:
 *   1. OWNER ("shlbez") — separate block at the top, all commands, no restrictions
 *   2. Everyone else   — public commands open to all, elevated commands gated to
 *                        mods / VIPs / allowedUsers / broadcaster
 */

const PREFIX   = "?";
const PREFIXES = new Set(["?"]);
const OWNER    = "shlbez";

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

function isBroadcaster(tags) {
  const badges = tags.badges || {};
  return !!badges.broadcaster;
}

function hasAnyAccess(tags, state) {
  return isOwner(tags) || isAllowedUser(tags, state) || isModOrVip(tags) || isBroadcaster(tags);
}

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
  // ── OWNER BLOCK — shlbez has full access to everything, from any channel ──
  // ═══════════════════════════════════════════════════════════════════════════

  if (isOwner(tags)) {

    if (cmd === "help") {
      return (
        `👑 Owner (${PREFIX}): ` +
        `say | markov <seed> | remind <user> <msg> | dadjoke | 8ball | mock <u> | story | compliment <u> | ` +
        `start | stop | status | interval <s> | cooldown <n> | minlines <n> | onlineonly | greeter | ` +
        `join <ch> | leave <ch> | manual <ch> | unmanual <ch> | addlearn <ch> | removelearn <ch> | ` +
        `adduser <u> | removeuser <u> | users | channels | lines | followage <u> | top | notify | remind | removeme`
      );
    }

    if (cmd === "say") {
      const result = postNow(channel);
      if (!result) return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — add more seed data or wait for chat.`;
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
      const target = channel.startsWith("#") ? channel : `#${channel}`;
      Promise.resolve().then(async () => {
        try {
          const res = await fetch("https://icanhazdadjoke.com/", {
            headers: { "Accept": "application/json", "User-Agent": "TwitchMarkovBot/2.0" }
          });
          const data = await res.json();
          client.say(target, data && data.joke ? `🥁 ${data.joke}` : "⚠️ Couldn't fetch a dad joke.").catch(() => {});
        } catch (e) {
          client.say(target, "⚠️ Couldn't reach the dad joke server.").catch(() => {});
        }
      });
      return null;
    }

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
      const paused       = !!(state.channelSettings[ch] && state.channelSettings[ch].paused);
      const onlineOnly   = !!(state.channelSettings[ch] && state.channelSettings[ch].onlineOnly);
      const channelActive = state.active && !paused;
      const intervalSecs = getChannelInterval(ch) / 1000;
      const cooldown     = getChannelCooldown(ch);
      const cdInfo       = cooldown > 0 ? `${cooldown} msgs` : "none";
      return (
        `📊 #${ch}: ${channelActive ? "▶ posting" : "⏸ paused"} | ` +
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
      state.channelSettings[target].paused     = true;
      state.channelSettings[target].onlineOnly  = true;
      state.channelSettings[target].intervalMs  = 3_600_000;
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

    if (cmd === "lines") {
      return `📚 Lines: ${markov.size} trained (min to post: ${state.minCorpus}).`;
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

    if (cmd === "followage") {
      const target = (args[0] || "").toLowerCase().trim();
      if (!target) return `⚠️ Usage: ${PREFIX}followage <username>`;
      if (!helixGet) return `⚠️ Twitch API not configured.`;
      Promise.resolve().then(async () => {
        const { client } = ctx;
        const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
        try {
          const [bcData, userData] = await Promise.all([
            helixGet(`users?login=${encodeURIComponent(ch)}`),
            helixGet(`users?login=${encodeURIComponent(target)}`),
          ]);
          const broadcasterId = bcData.data?.[0]?.id;
          const userId        = userData.data?.[0]?.id;
          if (!broadcasterId) return client.say(replyTo, `⚠️ Channel #${ch} not found on Twitch.`);
          if (!userId)        return client.say(replyTo, `⚠️ User ${target} not found on Twitch.`);
          const followData = await helixGet(`channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`);
          if (!followData.data?.length) return client.say(replyTo, `📊 ${target} is not following #${ch}.`);
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
          client.say(replyTo, `📅 ${target} has been following #${ch} for ${parts.join(", ")} (since ${followedAt.toLocaleDateString("en-GB")}).`);
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
      return `🔤 Top words in corpus: ${top || "(not enough data)"}`;
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

    // Unknown command — owner typed something with ? prefix but it's not a real command
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PUBLIC COMMANDS — open to every viewer ────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (cmd === "help") {
    if (!hasAnyAccess(tags, state)) {
      return `Commands (${PREFIX}): say | markov <seed> | dadjoke | remind <user> <msg> | notify live/offline/category on/off | 8ball | mock <u> | story`;
    }
    if (isBroadcaster(tags)) {
      return (
        `📺 Broadcaster/Mod (${PREFIX}): say | markov <seed> | dadjoke | remind | 8ball | mock <u> | story | compliment <u> | ` +
        `start | stop | status | interval <s> | cooldown <n> | minlines <n> | onlineonly | greeter | ` +
        `join | leave | manual | unmanual | adduser <u> | removeuser <u> | users | channels | lines | removeme | followage <u> | top | notify`
      );
    }
    return (
      `🔧 Mod/VIP (${PREFIX}): say | markov <seed> | dadjoke | remind | 8ball | mock <u> | story | compliment <u> | ` +
      `start | stop | status | interval <s> | cooldown <n> | onlineonly | greeter | ` +
      `adduser <u> | users | channels | lines | followage <u> | top | notify`
    );
  }

  if (cmd === "say") {
    const SAY_COOLDOWN_MS = 5 * 60 * 1000;
    const user = (tags.username || "").toLowerCase();
    const last = ctx.sayCooldowns[user] || 0;
    const remaining = SAY_COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      const secs = Math.ceil(remaining / 1000);
      const mins = Math.floor(secs / 60);
      const s    = secs % 60;
      return `@${user} ⏳ You can use ${PREFIX}say again in ${mins}m ${s}s.`;
    }
    const result = postNow(channel);
    if (!result) return `⚠️ Corpus too small (${markov.size}/${state.minCorpus}) — add more seed data or wait for chat.`;
    ctx.sayCooldowns[user] = Date.now();
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
    const target = channel.startsWith("#") ? channel : `#${channel}`;
    Promise.resolve().then(async () => {
      try {
        const res = await fetch("https://icanhazdadjoke.com/", {
          headers: { "Accept": "application/json", "User-Agent": "TwitchMarkovBot/2.0" }
        });
        const data = await res.json();
        client.say(target, data && data.joke ? `🥁 ${data.joke}` : "⚠️ Couldn't fetch a dad joke.").catch(() => {});
      } catch (e) {
        client.say(target, "⚠️ Couldn't reach the dad joke server.").catch(() => {});
      }
    });
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ELEVATED ACCESS — mods / VIPs / allowedUsers / broadcaster ───────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (cmd === 'gpt') {
    const question = args.join(' ').trim();
    if (!question) return `⚠️ Usage: ${PREFIX}gpt <question>`;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return `⚠️ GEMINI_API_KEY not set in .env`;
    const { client } = ctx;
    const replyTo = channel.startsWith('#') ? channel : `#${channel}`;
    const user = (tags.username || '').toLowerCase();
    Promise.resolve().then(async () => {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: 'You are a helpful Twitch chat assistant. Answer in 2-3 short sentences max. Be concise and casual. No markdown, no bullet points.' }] },
              contents: [{ parts: [{ text: question }] }],
              generationConfig: { maxOutputTokens: 120 },
            }),
          }
        );
        const data = await res.json();
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!answer) return client.say(replyTo, '⚠️ Gemini did not respond.').catch(() => {});
        const reply = `@${user} ${answer}`.slice(0, 490);
        client.say(replyTo, reply).catch(() => {});
      } catch (e) {
        client.say(replyTo, `⚠️ Gemini request failed: ${e.message}`).catch(() => {});
      }
    });
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ELEVATED ACCESS — mods / VIPs / allowedUsers / broadcaster ───────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (!hasAnyAccess(tags, state)) return null;

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

  if (cmd === "channels") {
    const postList   = state.postChannels.join(", ")          || "(none)";
    const manualList = (state.manualChannels || []).join(", ") || "(none)";
    const learnList  = state.learnChannels.join(", ")          || "(none)";
    return `📡 Auto-posting: ${postList} | Manual-only: ${manualList} | Learning: ${learnList}`;
  }

  if (cmd === "lines") {
    return `📚 Lines: ${markov.size} trained (min to post: ${state.minCorpus}).`;
  }

  if (cmd === "users") {
    const list = (state.allowedUsers || []).join(", ") || "(none)";
    return `👥 Owner: ${OWNER} | Allowed users: ${list} | Mods/VIPs can use ${PREFIX}say + basic commands`;
  }

  if (cmd === "followage") {
    const target = (args[0] || "").toLowerCase().trim();
    if (!target) return `⚠️ Usage: ${PREFIX}followage <username>`;
    if (!helixGet) return `⚠️ Twitch API not configured (missing TWITCH_CLIENT_ID/SECRET).`;
    Promise.resolve().then(async () => {
      const { client } = ctx;
      const replyTo = channel.startsWith("#") ? channel : `#${channel}`;
      try {
        const [bcData, userData] = await Promise.all([
          helixGet(`users?login=${encodeURIComponent(ch)}`),
          helixGet(`users?login=${encodeURIComponent(target)}`),
        ]);
        const broadcasterId = bcData.data?.[0]?.id;
        const userId        = userData.data?.[0]?.id;
        if (!broadcasterId) return client.say(replyTo, `⚠️ Channel #${ch} not found on Twitch.`);
        if (!userId)        return client.say(replyTo, `⚠️ User ${target} not found on Twitch.`);
        const followData = await helixGet(`channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`);
        if (!followData.data?.length) return client.say(replyTo, `📊 ${target} is not following #${ch}.`);
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
        client.say(replyTo, `📅 ${target} has been following #${ch} for ${parts.join(", ")} (since ${followedAt.toLocaleDateString("en-GB")}).`);
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
    return `🔤 Top words in corpus: ${top || "(not enough data)"}`;
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
    const cdInfo        = cooldown > 0 ? `${cooldown} msgs` : "none";
    return (
      `📊 #${ch}: ${channelActive ? "▶ posting" : "⏸ paused"} | ` +
      `Every: ${intervalSecs}s | Min messages: ${cdInfo} | ` +
      `Corpus: ${markov.size.toLocaleString()} lines`
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

  // join / leave / manual / unmanual — scoped to the channel the command is typed in
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

  if (cmd === "manual") {
    if (state.postChannels.includes(ch)) return `#${ch} is already a full post channel. Use ${PREFIX}leave first.`;
    if (state.manualChannels.includes(ch)) return `Already in manual mode for #${ch}.`;
    if (state.learnChannels.includes(ch)) {
      state.learnChannels.splice(state.learnChannels.indexOf(ch), 1);
    } else {
      joinChannel(ch);
    }
    state.manualChannels.push(ch);
    saveState();
    return `✅ #${ch} set to manual mode — won't auto-post. Use ${PREFIX}say to post.`;
  }

  if (cmd === "unmanual") {
    const idx = state.manualChannels.indexOf(ch);
    if (idx === -1) return `#${ch} is not in manual mode.`;
    leaveChannel(ch);
    state.manualChannels.splice(idx, 1);
    saveState();
    return `👋 Left manual channel #${ch}.`;
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

function normalise(ch) {
  if (!ch) return null;
  return ch.replace(/^#/, "").toLowerCase().trim();
}

module.exports = { handle, isOwner, isAllowedUser, isModOrVip, isBroadcaster, PREFIX };
