/**
 * song.js — Live stream song recognition via Shazam (RapidAPI)
 *
 * Flow:
 *   1. streamlink grabs the live Twitch stream and pipes audio
 *   2. ffmpeg extracts ~8 seconds of audio and converts to raw PCM
 *   3. PCM audio is sent to the Shazam RapidAPI endpoint
 *   4. Returns { title, artist, album } or null
 *
 * Requires on the system: ffmpeg, streamlink (installed via Dockerfile)
 * Requires env:
 *   RAPIDAPI_KEY — from rapidapi.com (subscribe to "Shazam" API, free 500/month)
 *
 * Sign up: https://rapidapi.com/apidojo/api/shazam
 */

const { spawn } = require("child_process");
const https     = require("https");

const CAPTURE_SECS = 8;
const TIMEOUT_MS   = 25_000;

/**
 * Capture audio from a live Twitch stream and identify the song.
 * @param {string} channel — Twitch channel name (no #)
 * @returns {Promise<{title:string, artist:string, album?:string}|null>}
 */
async function identify(channel) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not set in .env");

  const audioBuffer = await captureStreamAudio(channel);
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Could not capture stream audio. Is the channel live?");
  }

  return await queryShazam(audioBuffer, apiKey);
}

// ── Step 1: capture audio ─────────────────────────────────────────────────────

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
    const slArgs    = ["--stdout", "--quiet", streamUrl, "best"];
    if (rawToken) {
      slArgs.splice(2, 0, "--twitch-api-header", `Authorization=OAuth ${rawToken}`);
    }

    const streamlink = spawn("streamlink", slArgs);

    // Shazam expects raw signed 16-bit little-endian PCM at 44100 Hz mono
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-t", String(CAPTURE_SECS),
      "-vn",
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "1",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });

    streamlink.stdout.pipe(ffmpeg.stdin);

    const chunks = [];
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));

    ffmpeg.on("close", () => {
      streamlink.kill("SIGKILL");
      if (chunks.length === 0) {
        settle(reject, new Error("No audio captured — is the channel live?"));
      } else {
        settle(resolve, Buffer.concat(chunks));
      }
    });

    ffmpeg.on("error",     (err) => { streamlink.kill("SIGKILL"); settle(reject, new Error(`ffmpeg error: ${err.message}`)); });
    streamlink.on("error", (err) => { ffmpeg.kill("SIGKILL");     settle(reject, new Error(`streamlink error: ${err.message}`)); });

    const timer = setTimeout(() => {
      streamlink.kill("SIGKILL");
      ffmpeg.kill("SIGKILL");
      settle(reject, new Error("Stream capture timed out — channel may be offline"));
    }, TIMEOUT_MS);
  });
}

// ── Step 2: query Shazam ──────────────────────────────────────────────────────

function queryShazam(audioBuffer, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      method:   "POST",
      hostname: "shazam.p.rapidapi.com",
      path:     "/songs/v2/detect?timezone=Europe%2FLondon&locale=en-US",
      headers:  {
        "content-type":    "text/plain",
        "x-rapidapi-host": "shazam.p.rapidapi.com",
        "x-rapidapi-key":  apiKey,
        "content-length":  audioBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json  = JSON.parse(data);
          const track = json?.track;
          if (!track) {
            resolve(null); // no match
            return;
          }
          resolve({
            title:  track.title    || "Unknown",
            artist: track.subtitle || "Unknown",
            album:  track.sections
              ?.find(s => s.type === "SONG")
              ?.metadata?.find(m => m.title === "Album")
              ?.text || null,
          });
        } catch (e) {
          reject(new Error(`Shazam response parse error: ${e.message}`));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`Shazam request error: ${err.message}`)));
    req.write(audioBuffer);
    req.end();
  });
}

module.exports = { identify };
