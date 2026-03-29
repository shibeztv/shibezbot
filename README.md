# 🤖 Twitch Markov Bot v2

A Twitch bot that blends in as a viewer by posting Markov-generated chat messages,
with a full live command system controllable from Twitch chat.

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
| `?gpt <question>` | Ask Gemini AI a question (2–3 sentence answer) |
| `?song` | Identify the song currently playing on stream |
| `?8ball` | Ask the magic 8-ball (sometimes answers with Markov chaos) |
| `?mock <user>` | Repeat a user's last message in SpOnGeBoB case |
| `?story` | Generate a 3-sentence Markov story |
| `?compliment <user>` | Send a Markov-generated compliment at someone |
| `?forsen` | Post a random forsen-related one-liner |
| `?copypasta` | Post a random classic Twitch copypasta |
| `?monka` | Post a random monka emote + uneasy phrase |
| `?iq <user>` | Check a user's IQ (consistent per username) |
| `?clip` | Show the most recent clip from this channel |
| `?lines` | Show current corpus line count |
| `?followage <user>` | Show how long a user has been following this channel |
| `?top` | Show the top 8 most common words in the corpus |
| `?status` | Show the bot's current status in this channel |
| `?remind <user> <message>` | Remind someone the next time they type in chat |
| `?notify live on/off` | Subscribe/unsubscribe to go-live pings |
| `?notify offline on/off` | Subscribe/unsubscribe to offline pings |
| `?notify category on/off` | Subscribe/unsubscribe to game/category change pings |

---

### 🔧 Mods / VIPs / Allowed Users / Broadcaster

Everything above, plus:

| Command | What it does |
|---|---|
| `?notify list` | Show subscriber counts and active notification events |
| `?start` | Resume auto-posting in this channel |
| `?stop` | Pause auto-posting in this channel |
| `?interval <seconds>` | Change how often the bot posts (min 30s) |
| `?cooldown <n>` | Require N other-user messages between bot posts (0 = off) |
| `?minlines <n>` | Set minimum corpus lines before bot starts posting |
| `?onlineonly` | Toggle online-only mode (only post while stream is live) |
| `?greeter` | Toggle the first-message greeter on/off |
| `?join` | Add this channel to the bot's auto-post list (own channel only) |
| `?leave` | Remove this channel from the bot's auto-post list (own channel only) |
| `?manual` | Set this channel to manual mode — no auto-posts (own channel only) |
| `?unmanual` | Remove this channel from manual mode (own channel only) |
| `?removeme` | Remove the bot from this channel entirely |
| `?adduser <user>` | Grant a user elevated bot access |
| `?removeuser <user>` | Revoke a user's elevated access |
| `?users` | List the owner, allowed users, and access tiers |
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

---

## Examples

```
?say                      → forces a bot message right now
?markov forsen            → generates a sentence containing "forsen"
?gpt why is forsen good   → Gemini answers in 2-3 sentences
?song                     → 🎵 Now playing: Blinding Lights by The Weeknd
?remind someguy hey you're live! → pings someguy next time they chat
?8ball will I win today?  → 🎱 Without a doubt.
?mock username            → spOnGeBoB mocking of their last message
?followage username       → 📅 following for 2 years, 3 months
?top                      → 🔤 Top words: bro (412), lmao (388), chat (301)...
?status                   → 📊 #shlbez: ▶ posting | Every: 60m | Min messages: none | Corpus: 351,959 lines | Online-only: on
?lines                    → 📚 Lines: 351959 trained
?interval 120             → post every 2 minutes
?cooldown 5               → wait for 5 other messages before posting again
?cooldown 0               → disable message cooldown
?stop                     → pause auto-posts
?start                    → resume auto-posts
?minlines 200             → don't post until 200+ lines learned
?onlineonly               → toggle online-only posting mode
?notify live on           → get pinged when this channel goes live
?join xqc                 → also post in xQc's chat (owner only)
?addlearn hasanabi        → learn from hasanabi's chat silently (owner only)
```

---

## How it works

1. **Seed file** (`seed.txt`) — pre-loaded at startup so the bot can post right away.
2. **Live learning** — reads every chat message from all joined channels and trains the Markov chain.
3. **Learn-only channels** — `?addlearn` silently lurks in big channels to absorb vocabulary without posting.
4. **Persistent state** — all settings saved to `bot_state.json` and restored on restart.
5. **Persistent corpus** — learned lines auto-saved to `learned_corpus.txt` every 60s and reloaded on startup.
6. **Live notifications** — polls Twitch every 2 minutes and pings subscribed users on live/offline/category changes.
7. **First-message greeter** — when enabled with `?greeter`, welcomes first-time chatters with a Markov message.
8. **Online-only mode** — when enabled with `?onlineonly`, skips auto-posts while the stream is offline.
9. **Gemini AI** — `?gpt` uses Google's free Gemini API to answer questions in chat.
10. **Song recognition** — `?song` captures live stream audio and identifies the track via AudD.
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
├── Dockerfile          # For Railway — installs ffmpeg + streamlink
├── bot_state.json      # Auto-generated: saved settings
├── learned_corpus.txt  # Auto-generated: chat lines learned live
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
| `TWITCH_CLIENT_ID` | Optional | Enables `?followage`, live notifications, online-only mode |
| `TWITCH_CLIENT_SECRET` | Optional | Same as above |
| `GEMINI_API_KEY` | Optional | Enables `?gpt` — free key at aistudio.google.com/apikey |
| `AUDD_API_KEY` | Optional | Enables `?song` — free key at dashboard.audd.io (300/day free) |

---

## Tips

- `?addlearn` on a popular channel with similar chat culture is great for bulk-learning vocabulary fast.
- Set `?minlines 200` for noticeably better sentence quality.
- Use `?stop` to silence the bot during a stream moment, then `?start` to resume.
- The bot ignores its own messages and common bot accounts automatically.

---

> Make sure the bot follows [Twitch's Terms of Service](https://www.twitch.tv/p/legal/terms-of-service/).
> Always get permission before running the bot in someone else's channel.
