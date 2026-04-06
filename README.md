# 🤖 Twitch Bot (Shibez_bot)

A Twitch bot that blends in as a viewer by posting Markov-generated chat messages,
with a full live command system and fun other features!

---

## Commands

All commands use the `?` prefix.

---

### 👁️ Anyone (no access required)

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
| `?forsenalert` | Subscribe to forsen MC god run pings — bot @-mentions you when forsen hits a good run |
| `?forsenalert off` | Unsubscribe from forsen MC god run pings |
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
| `?forsenalert add <user> [channel]` | Add a user to forsen alert subscribers in a channel (defaults to current channel) |
| `?forsenalert remove <user> [channel]` | Remove a user from forsen alert subscribers |
| `?forsenalert list [channel]` | List all forsen alert subscribers in a channel |
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
?roll 20                    → 🎲 @shlbez rolled 1d20: 17
?roll 2d6                   → 🎲 @shlbez rolled 2d6: 9 (4 + 5)
?choose forsen or xqc       → 🤔 @shlbez I choose: xqc
?coinflip                   → @shlbez 🪙 Heads!
?translate fr bonjour       → @shlbez 🌐 (fr → en) Hello
?translate como estas       → @shlbez 🌐 how are you
?watchtime shlbez           → 👁️ shlbez has been watching #shlbez for 12h 30m.
?watchtime viewer1 shlbez   → 👁️ viewer1 has watched #shlbez for 5h 20m.
?forsenalert             → forsenE You're subscribed to forsen MC god run alerts in #shlbez! Type ?forsenalert off to unsubscribe.
?forsenalert off         → 🔕 Unsubscribed from forsen MC run alerts in #shlbez.
?forsenalert add viewer1          → ✅ Added viewer1 to forsen alerts in #shlbez.
?forsenalert add viewer1 jaskuz   → ✅ Added viewer1 to forsen alerts in #jaskuz.
?forsenalert remove viewer1       → ✅ Removed viewer1 from forsen alerts in #shlbez.
?forsenalert list                 → forsenE #shlbez alert subs (2): bolsogoat, viewer1
?forsenalert list jaskuz          → forsenE #jaskuz alert subs (1): koljake
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
├── learned_corpus.txt  # Auto-generated: chat lines learned live (capped at 50k)
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
