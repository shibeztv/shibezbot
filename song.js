/**
 * song.js — Live stream song recognition
 *
 * Flow:
 *   1. streamlink grabs the live Twitch stream (best quality, audio only piped)
 *   2. ffmpeg extracts ~8 seconds of audio and converts to WAV
 *   3. WAV is base64-encoded and sent to AudD music recognition API
 *   4. Returns { title, artist, album, label } or null
 *
 * Requires on the system: ffmpeg, streamlink (installed via Dockerfile)
 * Requires env: AUDD_API_KEY
 */

const { spawn }  = require("child_process");
const https      = require("https");
const url        = require("url");

const AUDD_API_KEY  = process.env.AUDD_API_KEY || "";
const AUDD_ENDPOINT = "https://api.audd.io/";
const CAPTURE_SECS  = 8;   // seconds of audio to capture
const TIMEOUT_MS    = 30_000; // max wait before giving up

/**
 * Capture audio from a live Twitch stream and identify the song.
 * @param {string} channel  — Twitch channel name (no #)
 * @returns {Promise<{title:string, artist:string, album?:string}|null>}
 */
async function identify(channel) {
  if (!AUDD_API_KEY) throw new Error("AUDD_API_KEY is not set in environment.");

  const audioBuffer = await captureStreamAudio(channel);
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Could not capture stream audio. Is the channel live?");
  }

  return await queryAudd(audioBuffer);
}

// ── Step 1: capture audio ──────────────────────────────────────────────────────

function captureStreamAudio(channel) {
  return new Promise((resolve, reject) => {
    const streamUrl = `https://www.twitch.tv/${channel}`;

    // streamlink pipes the best stream to stdout
    const streamlink = spawn("streamlink", [
      "--stdout",
      "--twitch-disable-ads",
      "--quiet",
      streamUrl,
      "best",
    ]);

    // ffmpeg reads from stdin, extracts CAPTURE_SECS seconds of mono WAV
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",           // read from stdin
      "-t", String(CAPTURE_SECS),
      "-vn",                    // no video
      "-f", "wav",
      "-ar", "44100",
      "-ac", "1",               // mono
      "pipe:1",                 // output to stdout
    ], { stdio: ["pipe", "pipe", "ignore"] });

    // Pipe streamlink → ffmpeg
    streamlink.stdout.pipe(ffmpeg.stdin);

    const chunks = [];
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));

    ffmpeg.on("close", (code) => {
      streamlink.kill("SIGKILL");
      if (chunks.length === 0) {
        reject(new Error("ffmpeg produced no audio output."));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    ffmpeg.on("error", (err) => {
      streamlink.kill("SIGKILL");
      reject(new Error(`ffmpeg error: ${err.message}`));
    });

    streamlink.on("error", (err) => {
      ffmpeg.kill("SIGKILL");
      reject(new Error(`streamlink error: ${err.message} — is streamlink installed?`));
    });

    // Hard timeout — kill both processes if they hang
    const timer = setTimeout(() => {
      streamlink.kill("SIGKILL");
      ffmpeg.kill("SIGKILL");
      reject(new Error("Stream capture timed out."));
    }, TIMEOUT_MS);

    ffmpeg.on("close", () => clearTimeout(timer));
  });
}

// ── Step 2: query AudD ────────────────────────────────────────────────────────

function queryAudd(audioBuffer) {
  return new Promise((resolve, reject) => {
    const base64Audio = audioBuffer.toString("base64");

    // AudD accepts multipart/form-data or JSON with base64 audio
    const body = JSON.stringify({
      api_token: AUDD_API_KEY,
      audio:     base64Audio,
      return:    "apple_music,spotify",
    });

    const options = {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const parsed = url.parse(AUDD_ENDPOINT);
    options.hostname = parsed.hostname;
    options.path     = parsed.path;

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.status === "success" && json.result) {
            resolve({
              title:  json.result.title  || "Unknown",
              artist: json.result.artist || "Unknown",
              album:  json.result.album  || null,
              label:  json.result.label  || null,
            });
          } else {
            // No match found
            resolve(null);
          }
        } catch (e) {
          reject(new Error(`AudD response parse error: ${e.message}`));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`AudD request error: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { identify };
