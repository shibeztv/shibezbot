/**
 * song.js — Live stream song recognition via ACRCloud
 *
 * Flow:
 *   1. streamlink grabs the live Twitch stream and pipes audio
 *   2. ffmpeg extracts ~8 seconds of audio and converts to WAV
 *   3. WAV is sent to ACRCloud music recognition API with HMAC-SHA1 auth
 *   4. Returns { title, artist, album } or null
 *
 * Requires on the system: ffmpeg, streamlink (installed via Dockerfile)
 * Requires env:
 *   ACRCLOUD_HOST        — e.g. identify-eu-west-1.acrcloud.com
 *   ACRCLOUD_ACCESS_KEY  — from console.acrcloud.com
 *   ACRCLOUD_ACCESS_SECRET
 *
 * Free tier: 100 recognitions/day at console.acrcloud.com
 */

const { spawn }  = require("child_process");
const https      = require("https");
const crypto     = require("crypto");

const CAPTURE_SECS = 8;
const TIMEOUT_MS   = 25_000;

/**
 * Capture audio from a live Twitch stream and identify the song.
 * @param {string} channel — Twitch channel name (no #)
 * @returns {Promise<{title:string, artist:string, album?:string}|null>}
 */
async function identify(channel) {
  const host   = process.env.ACRCLOUD_HOST;
  const key    = process.env.ACRCLOUD_ACCESS_KEY;
  const secret = process.env.ACRCLOUD_ACCESS_SECRET;

  if (!host || !key || !secret) {
    throw new Error("ACRCLOUD_HOST, ACRCLOUD_ACCESS_KEY, and ACRCLOUD_ACCESS_SECRET must be set in .env");
  }

  const audioBuffer = await captureStreamAudio(channel);
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Could not capture stream audio. Is the channel live?");
  }

  return await queryACRCloud(audioBuffer, host, key, secret);
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

    const streamUrl  = `https://www.twitch.tv/${channel}`;
    const rawToken   = (process.env.OAUTH_TOKEN || "").replace(/^oauth:/i, "");
    const slArgs     = ["--stdout", "--quiet", streamUrl, "best"];
    if (rawToken) {
      slArgs.splice(2, 0, "--twitch-api-header", `Authorization=OAuth ${rawToken}`);
    }

    const streamlink = spawn("streamlink", slArgs);
    const ffmpeg     = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-t", String(CAPTURE_SECS),
      "-vn",
      "-f", "wav",
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

    ffmpeg.on("error",      (err) => { streamlink.kill("SIGKILL"); settle(reject, new Error(`ffmpeg error: ${err.message}`)); });
    streamlink.on("error",  (err) => { ffmpeg.kill("SIGKILL");     settle(reject, new Error(`streamlink error: ${err.message}`)); });

    const timer = setTimeout(() => {
      streamlink.kill("SIGKILL");
      ffmpeg.kill("SIGKILL");
      settle(reject, new Error("Stream capture timed out — channel may be offline"));
    }, TIMEOUT_MS);
  });
}

// ── Step 2: query ACRCloud ────────────────────────────────────────────────────

function queryACRCloud(audioBuffer, host, accessKey, accessSecret) {
  return new Promise((resolve, reject) => {
    const timestamp      = Math.floor(Date.now() / 1000).toString();
    const httpMethod     = "POST";
    const httpUri        = "/v1/identify";
    const dataType       = "audio";
    const signatureVersion = "1";

    const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join("\n");
    const signature    = crypto.createHmac("sha1", accessSecret).update(stringToSign).digest("base64");

    // Build multipart/form-data manually
    const boundary = "----ACRCloudBoundary" + Date.now();
    const CRLF     = "\r\n";

    function field(name, value) {
      return (
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      );
    }

    const preamble = Buffer.from(
      field("access_key",        accessKey) +
      field("sample_bytes",      audioBuffer.length.toString()) +
      field("timestamp",         timestamp) +
      field("signature",         signature) +
      field("data_type",         dataType) +
      field("signature_version", signatureVersion) +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="sample"; filename="audio.wav"${CRLF}` +
      `Content-Type: audio/wav${CRLF}${CRLF}`
    );
    const postamble = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const body      = Buffer.concat([preamble, audioBuffer, postamble]);

    const options = {
      hostname: host,
      path:     httpUri,
      method:   httpMethod,
      headers:  {
        "Content-Type":   `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.status?.code === 0 && json.metadata?.music?.length > 0) {
            const track = json.metadata.music[0];
            resolve({
              title:  track.title          || "Unknown",
              artist: track.artists?.[0]?.name || "Unknown",
              album:  track.album?.name    || null,
            });
          } else {
            // No match (code 1001 = no result)
            resolve(null);
          }
        } catch (e) {
          reject(new Error(`ACRCloud response parse error: ${e.message}`));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`ACRCloud request error: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { identify };
