# 🤖 Twitch Markov Bot v2

A Twitch bot that blends in as a viewer by posting Markov-generated chat messages —
with a full live command system so you can control everything from Twitch chat.

---

## Commands

All commands use the `?` prefix. Commands are split by who can use them.

---

### 👁️ Anyone (no access required)

| Command | What it does |
|---|---|
| `?help` | Show available commands for your access level |
| `?say` | Force the bot to post a Markov message (5 min cooldown per user) |
| `?markov <word>` | Generate a Markov sentence seeded from a word or phrase |
| `?dadjoke` | Fetch and post a random dad joke |
| `?notify live on/off` | Subscribe/unsubscribe to go-live pings for this channel |
| `?notify offline on/off` | Subscribe/unsubscribe to offline pings |
| `?notify category on/off` | Subscribe/unsubscribe to game/category change pings |
| `?notify list` | Show subscriber counts and active notification events |
| `?remind <user> <message>` | Remind someone when they next chat in this channel |

---

### 🔧 Mods / VIPs / Allowed Users

Everything above, plus:

| Command | What it does |
|---|---|
| `?8ball <question>` | Ask the magic 8-ball (sometimes answers with Markov) |
| `?mock <user>` | Repeat a user's last message in SpOnGeBoB case |
| `?story` | Generate a 3-sentence Markov story |
| `?compliment <user>` | Send a Markov-generated compliment at someone |
| `?followage <user>` | Show how long a user has been following this channel |
| `?top` | Show the top 8 most common words in the corpus |
| `?channels` | List all post, manual, and learn channels |
| `?lines` | Show current corpus line count |
| `?users` | List the owner, allowed users, and access tiers |
| `?adduser <user>` | Grant a user elevated bot access |

---

### 📺 Broadcaster (in their own channel only)

Everything above, plus:

| Command | What it does |
|---|---|
| `?start` | Resume auto-posting in this channel |
| `?stop` | Pause auto-posting in this channel |
| `?status` | Show interval, cooldown, line count for this channel |
| `?interval <seconds>` | Change how often the bot posts (min 30s) |
| `?cooldown <n>` | Require N other messages between bot posts (0 = off) |
| `?minlines <n>` | Set minimum corpus size before bot starts posting |
| `?removeme` | Remove the bot from this channel entirely |

---

### 👑 Owner (shlbez only)

Everything above, plus:

| Command | What it does |
|---|---|
| `?join <channel>` | Join a channel and auto-post there |
| `?leave <channel>` | Leave a post channel |
| `?manual <channel>` | Join a channel in manual mode (no auto-posting) |
| `?unmanual <channel>` | Leave a manual channel |
| `?addlearn <channel>` | Silently lurk and learn from a channel (no posting) |
| `?removelearn <channel>` | Stop learning from a channel |
| `?removeuser <user>` | Revoke a user's elevated access |
| `?greeter` | Toggle the first-message greeter on/off |

---

## Examples

```
?markov forsen       → generates a sentence containing the word "forsen"
?interval 120        → post every 2 minutes
?cooldown 5          → wait for 5 other messages before posting again
?cooldown 0          → disable cooldown
?say                 → send one message immediately
?join xqc            → also post in xQc's chat
?leave xqc           → stop posting there
?addlearn hasanabi   → learn from hasanabi's chat silently
?stop                → pause auto-posts
?start               → resume
?minlines 200        → don't post until 200+ lines learned
?lines               → 📚 Lines: 842 trained (min to post: 50)
?status              → 📊 Status: ▶ running | Interval: 300s | Cooldown: 5 msgs | ...
?notify live on      → get pinged when this channel goes live
?dadjoke             → 🥁 Why don't scientists trust atoms? Because they make up everything.
```

---

## How it works

1. **Seed file** (`seed.txt`) — pre-loaded at startup so the bot can post right away.
2. **Live learning** — reads every chat message from all joined channels and trains the Markov chain.
3. **Learn-only channels** — use `?addlearn` to silently lurk in big channels and absorb vocabulary without posting there.
4. **Persistent state** — all settings (interval, channels, active status) are saved to `bot_state.json` and restored on restart.
5. **Persistent corpus** — learned lines are auto-saved to `learned_corpus.txt` every 60 seconds and reloaded on startup.
6. **Live notifications** — the bot polls Twitch every 2 minutes and pings subscribed users when a channel goes live, offline, or changes category.
7. **First-message greeter** — when enabled with `?greeter`, the bot welcomes first-time chatters with a Markov message (uses Twitch's native first-message tag).

---

## Getting good seed data

The quality of output depends entirely on the corpus. More data = better sentences.

**Where to get chat logs:**
- **https://rustlog.com** — search any channel's history
- **https://overrustlelogs.net** — another archive
- **Chatterino** — export from your own local logs

Paste the lines into `seed.txt`, one message per line. Aim for **500–2000 lines** from the same channel or community for the most authentic-sounding output.

---

## File structure

```
twitch-markov-bot/
├── index.js            # Main bot + Twitch IRC client
├── markov.js           # Markov chain engine
├── commands.js         # All ?commands
├── filter.js           # Twitch TOS safety filter
├── state.js            # Persistent settings manager
├── seed.txt            # Your seed corpus
├── bot_state.json      # Auto-generated: saved settings
├── learned_corpus.txt  # Auto-generated: chat lines learned live
├── .env                # Your secrets (never commit this)
├── .env.example        # Config template
└── package.json
```

---

## Tips

- Run `?stop` during your stream if you want the bot quiet, then `?start` later.
- `?addlearn` on a popular channel with similar chat culture is great for bulk-learning vocabulary fast.
- Set `?minlines 200` for noticeably better sentence quality before it starts posting.
- The bot ignores its own messages and common bot accounts automatically.
- Live notifications require `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` to be set in `.env`.

---

> Make sure the bot follows [Twitch's Terms of Service](https://www.twitch.tv/p/legal/terms-of-service/).
> Always get the channel owner's permission before running a bot in their chat.
