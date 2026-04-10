# 🤖 Shibez_bot

A Twitch bot that blends in as a viewer by posting Markov-generated chat messages,
with a full live command system and fun other features!

---

## Commands

All commands use the `?` prefix.

---

### 👁️ Anyone no access required 
(bot has to join channel first with "?join" command)

| Command | What it does |
|---|---|
| `?help` | Show available commands for your access level |
| `?say` | Force the bot to post a Markov message (5 min cooldown per user) |
| `?markov <word>` | Generate a Markov sentence seeded from a word or phrase |
| `?dadjoke` | Fetch and post a random dad joke |
| `?gpt <question>` | Ask Groq AI a question (2–3 sentence answer) |
| `?song` | Identify the song currently playing on stream |
| `?8ball <question>` | Ask the magic 8-ball (sometimes answers with Markov chaos) |
| `?mock <user>` | Repeat a user's last message in SpOnGeBoB case |
| `?story` | Generate a 3-sentence Markov story |
| `?compliment <user>` | Send a Markov-generated compliment at someone |
| `?forsen` | Post a random forsen-related one-liner |
| `?copypasta` | Post a random classic Twitch copypasta |
| `?monka` | Post a random monka emote + uneasy phrase |
| `?iq <user>` | Check a user's IQ (consistent per username) |
| `?clip` | Show the most recent clip from this channel |
| `?urban <word>` | Look up a word on Urban Dictionary |
| `?translate <text>` | Translate any text to English (auto-detects language) |
| `?translate <lang> <text>` | Translate from a specific language, e.g. `?translate fr bonjour` |
| `?weather <city>` | Current weather for any city |
| `?watchtime <user>` | How long a user has been watching this channel |
| `?watchtime <user1> <user2>` | How long user1 has watched user2's channel |
| `?roll <sides>` | Roll a die — e.g. `?roll 20` rolls 1d20, `?roll 2d6` rolls two 6-sided dice |
| `?choose <a> or <b>` | Bot picks one option randomly from a list separated by "or" |
| `?coinflip` | Flip a coin |
| `?forsenalert` | Subscribe/unsubscribe to forsen MC god run pings — bot @-mentions you when forsen hits a good run |
| `?forsenrun` | Show forsen's current Minecraft speedrun time and structure (only works when forsen is live) |
| `?bancheck <user>` | Look up a user's ban history on betterbanned.com |
| `?botcheck <channel>` | Check a live channel's viewer/follower ratio for bot activity |
| `?lines` | Show current corpus line count |
| `?followage <user>` | Show how long a user has been following this channel |
| `?top` | Show the top 8 most common words in the corpus |
| `?status` | Show the bot's current status in this channel |
| `?remind <user> <message>` | Remind someone the next time they type in chat |
| `?commands` | List all available commands |
| `?notify live on/off` | Subscribe/unsubscribe to go-live pings |
| `?notify offline on/off` | Subscribe/unsubscribe to offline pings |
| `?notify category on/off` | Subscribe/unsubscribe to game/category change pings |
| `?notify list` | Show subscriber counts for each notification type |
| `?ping` | Bot status: uptime, memory, channels, corpus size |
| `?quote` | Get today's motivational quote |
| `?news <topic>` | Top 3 current news headlines for any search term |
| `?coolfact <topic>` | Get a surprising fact about any word, country, or topic |
| `?offliners` | Link to y_exp's Offliners site |
| `?logs <channel> <user>` | Link to chatlogs via ZonianMidian's best-logs + Supelle's frontend |
| `?linecount [user] [-global] [days:1]` | How many messages a user has sent in this channel or globally |
| `?loseroftheday` / `?lotd` | Top chatter today in this channel |
| `?lotw` / `?lotm` / `?loty` | Top chatter all-time (aliases) |
| `?lastline <user> [channel]` | Last message a user sent (current session) |
| `?firstline <user> [channel]` | First message a user ever sent in a channel |
| `?lastseen <user>` | When and where a user was last seen |
| `?isdown <domain>` | Check if a website is up or down |
| `?stock <ticker>` | Current stock price and daily change (e.g. `?stock AAPL`) |
| `?crypto <symbol>` | Current crypto price and 24h change (e.g. `?crypto BTC`) |
| `?user [username]` | Twitch user info — creation date, followers, last live, partner/affiliate status |
| `?isbanned <username>` | Check if a Twitch account is banned/suspended, with reason and duration if available |
| `?founders <channel>` | List the founders of a channel |
| `?namecheck <username>` | Check if a Twitch username is available (also catches suspended accounts) |
| `?randomclip <channel> [game:<game>] [-day\|-week\|-month\|-year]` | Random clip from a channel |
| `?trumptweet` | Latest post from Trump's Truth Social |
| `?forsentweet` | forsen's latest tweet from X |
| `?randomemote` / `?ra` | Post a random emote from this channel (7TV, BTTV, FFZ) |

---

### 🔧 Mods / VIPs / Broadcaster

Everything above, plus:

| Command | What it does |
|---|---|
| `?start` | Resume auto-posting in this channel |
| `?stop` | Pause auto-posting in this channel |
| `?interval <seconds>` | Change how often the bot posts (min 30s) |
| `?cooldown <n>` | Require N other-user messages between bot posts (0 = off) |
| `?minlines <n>` | Set minimum corpus lines before bot starts posting |
| `?onlineonly` | Toggle online-only mode (only post while stream is live) |
| `?greeter` | Toggle the first-message greeter on/off |
| `?join` | Add this channel to the bot's auto-post list (own channel only) |
| `?leave` | Remove this channel from the bot's auto-post list (own channel only) |
| `?removeme` | Remove the bot from this channel entirely |
| `?channels` | List all post, manual, and learn channels |

---

### 👑 Owner (shlbez only)

Everything above, plus cross-channel control:

| Command | What it does |
|---|---|
| `?join <channel>` | Join any channel and auto-post there |
| `?leave <channel>` | Leave any post channel |
| `?manual <channel>` | Join any channel in manual mode (no auto-posting) |
| `?unmanual <channel>` | Leave any manual channel |
| `?addlearn <channel>` | Silently lurk and learn from a channel (no posting) |
| `?removelearn <channel>` | Stop learning from a channel |
| `?adduser <user>` | Grant a user elevated bot access |
| `?removeuser <user>` | Revoke a user's elevated access |
| `?users` | List the owner and allowed users |

---

## Notes

**`?status` and online-only mode:** When online-only is enabled and the stream is offline, the status shows `▶ posting` because the bot's timer is still running — it just silently skips posts until the stream goes live. This is expected. Use `?stop` if you want to fully pause it.

---

## Examples

```
?say                        → forces a bot message right now
?markov forsen              → generates a sentence containing "forsen"
?gpt why is forsen good     → Groq AI answers in 2-3 sentences
?song                       → 🎵 Now playing: Blinding Lights by The Weeknd
?8ball will I win today?    → 🎱 Without a doubt.
?mock username              → spOnGeBoB mocking of their last message
?followage username         → 📅 following for 2 years, 3 months
?top                        → 🔤 Top words: bro (412), lmao (388), chat (301).
?status                     → 📊 #shlbez: ▶ posting | Every: 60s | Min messages: none | Corpus: 50,000 lines | Online-only: on
?lines                      → 📚 Lines: 50000 trained.
?interval 120               → post every 2 minutes
?cooldown 5                 → wait for 5 other messages before posting again
?cooldown 0                 → disable message cooldown
?stop                       → pause auto-posts
?start                      → resume auto-posts
?minlines 200               → don't post until 200+ lines learned
?onlineonly                 → toggle online-only posting mode
?notify live on             → get pinged when this channel goes live
?notify list                → 🔔 #shlbez — 🔴 live: 3 | ⚫ offline: 1 | 🎮 category: 2
?ping                   → 🏓 Pong! ● Uptime: 9h 14m ● Channels: 5 ● Memory: 82.3MB ● Corpus: 100,000 lines
?quote                  → 💬 "The only way to do great work is to love what you do." — Steve Jobs
?news finland           → 📰 News — finland: 1. Finland joins NATO exercise (Reuters) | 2. Finnish PM visits US (BBC) | 3. Helsinki hosts summit (AP)
?news xqc               → 📰 News — xqc: 1. xQc signs new streaming deal (Dexerto) | ...
?coolfact finland       → 💡 Finland has more saunas than cars — roughly 3 million saunas for 5.5 million people.
?coolfact sharks        → 💡 Sharks are older than trees — they've existed for ~450 million years, while trees appeared ~350 million years ago.
?offliners              → 💤 Offliners: https://twitch.yexp.dev/offliners/
?logs shlbez xqc        → 📋 Logs for @xqc in #shlbez: https://logs.zonian.dev/rdr/shlbez/xqc?pretty=true
?linecount              → 📊 shlbez — 4,201 messages in #shlbez (all-time).
?linecount viewer1 -global → 📊 viewer1 — 12,500 messages tracked globally.
?linecount days:1       → 📊 shlbez — 42 messages in #shlbez today.
?loseroftheday          → OMEGALUL Loser of the day in #shlbez: @viewer1 (412 msgs today)
?lastline viewer1           → 💬 viewer1's last line in #shlbez: "this run is insane bro"
?lastline viewer1 forsen    → 💬 viewer1's last line in #forsen: "monkaS"
?firstline viewer1          → 💬 viewer1's first line in #shlbez (01/01/2024): "hello chat"
?lastseen viewer1       → 👁️ viewer1 was last seen in #shlbez 3h ago.
?isdown twitch.tv       → 🌐 twitch.tv — ✅ UP | Status: 200 | Response time: 142ms
?stock AAPL             → 📈 Apple Inc. (AAPL) | 204.10 USD | +2.38 (+1.18%)
?crypto BTC             → 📈 BTC | $65,432 USD | +2.50% (24h)
?user xqc               → 👤 xQc (xqc) | ID: 71092938 | Created: 12/01/2018 | Followers: 11,200,000 | Partner
?isbanned someguy       → 🔨 someguy IS suspended from Twitch | Reason: not publicly available | Duration: permanent
?namecheck coolname     → ✅ "coolname" appears to be available on Twitch!
?namecheck shibez       → ❌ "shibez" is not available — account exists but is currently suspended.
?founders shlbez        → 🏅 Founders of #shlbez (3): viewer1, viewer2, viewer3
?randomclip forsen -week → 🎬 "insane run" by clipperguy (4,201 views) | https://clips.twitch.tv/...
?trumptweet             → 🇺🇸 Trump (08/04/2026): MAKE AMERICA GREAT AGAIN! | https://truthsocial.com/...
?forsentweet            → 🐦 forsen (07/04/2026): forsenE | https://x.com/forsen/status/...
?randomemote / ?ra      → Pepega
?roll 20                    → 🎲 @shlbez rolled 1d20: 17
?roll 2d6                   → 🎲 @shlbez rolled 2d6: 9 (4 + 5)
?choose forsen or xqc       → 🤔 @shlbez I choose: xqc
?coinflip                   → @shlbez 🪙 Heads!
?translate fr bonjour       → @shlbez 🌐 (fr → en) Hello
?translate como estas       → @shlbez 🌐 how are you
?watchtime shlbez           → 👁️ shlbez has been watching #shlbez for 12h 30m.
?watchtime viewer1 shlbez   → 👁️ viewer1 has watched #shlbez for 5h 20m.
?forsenalert             → forsenE You're subscribed to forsen MC god run alerts!
?forsenrun               → 🎮 forsen MC run — ⏱️ 9m 32s | Real: 10m 1s | 📍 Nether
?bancheck xqc               → 🔨 xqc — 3 bans | Last: 12/01/2024 | Reason: hateful conduct | Duration: 30 days
?botcheck suspiciousguy     → 🤖 #suspiciousguy: 1,840 viewers | 120 followers | ratio 15.33 | channel age: 14d | 🚨 SUSPICIOUS
?join xqc                   → also post in xQc's chat (owner only)
?addlearn hasanabi          → learn from hasanabi's chat silently (owner only)
```

---

## How it works

1. **Seed file** (`seed.txt`) — pre-loaded at startup so the bot can post right away.
2. **Live learning** — reads every chat message from all joined channels and trains the Markov chain.
3. **Learn-only channels** — `?addlearn` silently lurks in big channels to absorb vocabulary without posting.
4. **Persistent state** — all settings saved to `bot_state.json` and restored on restart.
5. **Persistent corpus** — learned lines auto-saved to `learned_corpus.txt` every 60s and reloaded on startup (capped at 50k lines to prevent OOM crashes).
6. **Live notifications** — polls Twitch every 2 minutes and pings subscribed users on live/offline/category changes.
7. **First-message greeter** — when enabled with `?greeter`, welcomes first-time chatters with a Markov message.
8. **Online-only mode** — when enabled with `?onlineonly`, skips auto-posts while the stream is offline.
9. **Groq AI** — `?gpt` uses Groq's free API (LLaMA 3.1) to answer questions in chat.
10. **Song recognition** — `?song` captures live stream audio, transcribes it with Groq Whisper, then identifies the song using Groq LLaMA. No extra API key needed — uses the same `GROQ_API_KEY` as `?gpt`.
11. **Fresh channel defaults** — new channels start paused with online-only on and a 1-hour interval. Streamer types `?start` to activate.

---

## Getting good seed data

**Where to get chat logs:**
- **https://rustlog.com** — search any channel's history
- **https://overrustlelogs.net** — another archive
- **Chatterino** — export from your own local logs

Paste lines into `seed.txt`, one per line. Aim for **500–2000 lines** for good output quality.

---

## File structure

```
twitch-markov-bot/
├── index.js            # Main bot + Twitch IRC client
├── markov.js           # Markov chain engine
├── commands.js         # All ?commands
├── filter.js           # Twitch TOS safety filter
├── song.js             # Live stream song recognition
├── state.js            # Persistent settings manager
├── seed.txt            # Your seed corpus
├── Dockerfile          # For Railway — installs ffmpeg + yt-dlp
├── bot_state.json      # Auto-generated: saved settings
├── learned_corpus.txt  # Auto-generated: chat lines learned live (capped at 100k)
├── .env                # Your secrets (never commit this)
├── .env.example        # Config template
└── package.json
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BOT_USERNAME` | ✅ | Bot's Twitch username |
| `OAUTH_TOKEN` | ✅ | `oauth:xxxxx` from twitchtokengenerator.com |
| `CHANNEL` | ✅ | Your channel name (no #) |
| `TWITCH_CLIENT_ID` | Optional | Enables `?followage`, `?clip`, `?botcheck`, live notifications, online-only mode |
| `TWITCH_CLIENT_SECRET` | Optional | Same as above — create an app at dev.twitch.tv/console/apps |
| `GROQ_API_KEY` | Optional | Enables `?gpt` and `?song` — free key at console.groq.com |

---

## Tips

- `?addlearn` on a popular channel with similar chat culture is great for bulk-learning vocabulary fast.
- Set `?minlines 200` for noticeably better sentence quality.
- Use `?stop` to silence the bot during a stream moment, then `?start` to resume.
- The bot ignores its own messages and common bot accounts automatically.

---

> Make sure the bot follows [Twitch's Terms of Service](https://www.twitch.tv/p/legal/terms-of-service/).
> Always get permission before running the bot in someone else's channel.
