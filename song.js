/**
 * song.js — Live stream song recognition via Shazam (RapidAPI)
 *
 * Flow:
 *   1. yt-dlp grabs the live Twitch stream audio pipe
 *   2. ffmpeg extracts ~5 seconds, converts to raw PCM (s16le, 16kHz, mono)
 *   3. PCM is base64-encoded and sent to Shazam via RapidAPI
 *   4. Returns { title, artist } or null if no match
 *
 * Requires on the system: ffmpeg, yt-dlp (installed via Dockerfile)
 * Requires env: RAPIDAPI_KEY
 */

const { spawn } = require("child_process");
const https     = require("https");

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "shazam.p.rapidapi.com";
const CAPTURE_SECS  = 5;
const TIMEOUT_MS    = 30_000;

/**
 * Capture audio from a live Twitch stream and identify the song.
 * @param {string} channel — Twitch channel name (no #)
 * @returns {Promise<{title:string, artist:string}|null>}
 */
async function identify(channel) {
  if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not set in environment.");

  const audioBuffer = await captureStreamAudio(channel);
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Could not capture stream audio. Is the channel live?");
  }

  return await queryShazam(audioBuffer);
}

// ── Step 1: capture audio via yt-dlp ─────────────────────────────────────────

function captureStreamAudio(channel) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function settle(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    }

    const streamUrl = `https://www.twitch.tv/${channel}`;
    const rawToken  = (process.env.OAUTH_TOKEN || "").replace(/^oauth:/i, "");

    // yt-dlp: pipe best audio to stdout
    const ytdlpArgs = [
      "--quiet",
      "--no-warnings",
      "--format", "best",
      "-o", "-",           // output to stdout
    ];
    if (rawToken) {
      ytdlpArgs.push("--add-header", `Authorization:OAuth ${rawToken}`);
    }
    ytdlpArgs.push(streamUrl);

    const ytdlp = spawn("yt-dlp", ytdlpArgs);

    // ffmpeg reads from stdin, extracts CAPTURE_SECS of mono 16kHz PCM
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-t", String(CAPTURE_SECS),
      "-vn",
      "-f", "s16le",
      "-ar", "16000",
      "-ac", "1",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });

    ytdlp.stdout.pipe(ffmpeg.stdin);

    // If yt-dlp errors, log it but don't crash — ffmpeg will just get no data
    ytdlp.stderr.on("data", data => {
      const msg = data.toString().trim();
      if (msg) console.warn(`[yt-dlp] ${msg}`);
    });

    const chunks = [];
    ffmpeg.stdout.on("data", chunk => chunks.push(chunk));

    ffmpeg.on("close", () => {
      ytdlp.kill("SIGKILL");
      if (chunks.length === 0) {
        settle(reject, new Error("No audio captured — is the channel live and is yt-dlp working?"));
      } else {
        settle(resolve, Buffer.concat(chunks));
      }
    });

    ffmpeg.on("error", err => {
      ytdlp.kill("SIGKILL");
      settle(reject, new Error(`ffmpeg error: ${err.message}`));
    });

    ytdlp.on("error", err => {
      ffmpeg.kill("SIGKILL");
      settle(reject, new Error(`yt-dlp error: ${err.message} — is yt-dlp installed?`));
    });

    const timer = setTimeout(() => {
      ytdlp.kill("SIGKILL");
      ffmpeg.kill("SIGKILL");
      settle(reject, new Error("Stream capture timed out — channel may be offline"));
    }, TIMEOUT_MS);
  });
}

// ── Step 2: query Shazam via RapidAPI ────────────────────────────────────────

function queryShazam(audioBuffer) {
  return new Promise((resolve, reject) => {
    const base64Audio = audioBuffer.toString("base64");

    const options = {
      method:   "POST",
      hostname: RAPIDAPI_HOST,
      path:     "/songs/detect",
      headers: {
        "content-type":    "text/plain",
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const track = json?.track;
          if (track && track.title) {
            resolve({
              title:  track.title,
              artist: track.subtitle || "Unknown",
            });
          } else {
            resolve(null); // no match
          }
        } catch (e) {
          reject(new Error(`Shazam response parse error: ${e.message}`));
        }
      });
    });

    req.on("error", err => reject(new Error(`Shazam request error: ${err.message}`)));
    req.write(base64Audio);
    req.end();
  });
}

module.exports = { identify };
