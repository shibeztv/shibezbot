# 🤖 Twitch Markov Bot v2

A Twitch bot that blends in as a viewer by posting Markov-generated chat messages —
with a full live command system so you can control everything from Twitch chat.


Get your OAuth token at **https://twitchapps.com/tmi/**

---

## Commands

All commands use the `$` prefix by default (change with `CMD_PREFIX` in `.env`).

**Who can use them:** only `shlbez` (hardcoded in `commands.js` — change `OWNER` there if needed).

| Command | What it does |
|---|---|
| `$help` | List all commands |
| `$start` | Start auto-posting |
| `$stop` | Pause auto-posting |
| `$status` | Show interval, cooldown, line count, channels |
| `$say` | Force one Markov message right now |
| `$interval <seconds>` | Change how often the bot posts (min 30s) |
| `$cooldown <n>` | Require N other-user messages between bot posts (0 = off) |
| `$minlines <n>` | Set how many lines needed before posting |
| `$join <channel>` | Join another channel and post there too |
| `$leave <channel>` | Leave a post channel |
| `$addlearn <channel>` | Join a channel to learn from (no posting) |
| `$removelearn <channel>` | Stop learning from a channel |
| `$channels` | List all post channels and learn channels |
| `$lines` | Show current line count |

### Examples

```
$interval 120        → post every 2 minutes
$cooldown 5          → wait for 5 other messages before posting again
$cooldown 0          → disable cooldown
$say                 → send one message immediately
$join xqc            → also post in xQc's chat
$leave xqc           → stop posting there
$addlearn hasanabi   → learn from hasanabi's chat silently
$removelearn hasanabi
$stop                → pause all auto-posts
$start               → resume
$minlines 200        → don't post until 200+ lines learned
$lines               → 📚 Lines: 842 trained (min to post: 50)
$status              → 📊 Status: ▶ running | Interval: 300s | Cooldown: 5 msgs | ...
```

---

## How it works

1. **Seed file** (`seed.txt`) — pre-loaded at startup so the bot can post right away.
2. **Live learning** — reads every chat message from all joined channels and trains the Markov chain.
3. **Learn-only channels** — use `$addlearn` to silently lurk in big channels and absorb vocabulary without posting there.
4. **Persistent state** — all settings (interval, channels, active status) are saved to `bot_state.json` and restored on restart.
5. **Persistent corpus** — learned lines are auto-saved to `learned_corpus.txt` every 60 seconds and reloaded on startup.

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
├── commands.js         # All $commands
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

- Run `$stop` during your stream if you want the bot quiet, then `$start` later.
- `$addlearn` on a popular channel with similar chat culture is great for bulk-learning vocabulary fast.
- Set `$mincorpus 200` for noticeably better sentence quality before it starts posting.
- The bot ignores its own messages and common bot accounts automatically.

---

> Make sure the bot follows [Twitch's Terms of Service](https://www.twitch.tv/p/legal/terms-of-service/).
> Always get the channel owner's permission before running a bot in their chat.
