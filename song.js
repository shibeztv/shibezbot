/**
 * song.js — Live stream song recognition via Shazam (RapidAPI)
 */

const { execFile, spawn } = require("child_process");
const https               = require("https");

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "shazam.p.rapidapi.com";
const CAPTURE_SECS  = 10;

async function identify(channel) {
  if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not set in environment.");

  // Step 1: get direct stream URL via streamlink
  const streamUrl = await getStreamUrl(channel);
  console.log(`🎵 [song] Got stream URL for #${channel}`);

  // Step 2: capture audio from that URL via ffmpeg
  const audioBuffer = await captureFromUrl(streamUrl);
  console.log(`🎵 [song] Captured ${audioBuffer.length} bytes of audio`);

  // Step 3: identify via Shazam
  return await queryShazam(audioBuffer);
}

// ── Step 1: yt-dlp --get-url ──────────────────────────────────────────────────
// Twitch's metadata endpoint requires auth as a cookie (auth-token), NOT as an
// Authorization header. Passing --add-header "Cookie:auth-token=TOKEN" is the
// correct way to authenticate with yt-dlp for Twitch streams.

function getStreamUrl(channel) {
  return new Promise((resolve, reject) => {
    const rawToken = (process.env.OAUTH_TOKEN || "").replace(/^oauth:/i, "");
    const args = [
      "--quiet",
      "--no-warnings",
      "--format", "best",
      "--get-url",
    ];
    if (rawToken) {
      // Pass token as a cookie — this is what Twitch's API actually checks
      args.push("--add-header", `Cookie:auth-token=${rawToken}`);
    }
    args.push(`https://www.twitch.tv/${channel}`);

    console.log(`🎵 [song] Running: yt-dlp https://www.twitch.tv/${channel}`);

    execFile("yt-dlp", args, { timeout: 20_000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`🎵 [song] yt-dlp error: ${stderr.trim() || err.message}`);
        return reject(new Error(`yt-dlp failed: ${stderr.trim() || err.message}`));
      }
      const url = stdout.trim();
      if (!url) {
        console.error(`🎵 [song] yt-dlp returned empty URL. stderr: ${stderr.trim()}`);
        return reject(new Error("yt-dlp returned no URL — is the channel live?"));
      }
      resolve(url);
    });
  });
}

// ── Step 2: ffmpeg reads HLS URL directly ────────────────────────────────────

function captureFromUrl(url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function settle(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    }

    const ffmpeg = spawn("ffmpeg", [
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-i", url,
      "-t", String(CAPTURE_SECS),
      "-vn",
      "-f", "wav",       // WAV container — Shazam needs headers, not raw PCM
      "-ar", "22050",    // 22kHz mono × 8s ≈ 352KB — safely under Shazam's 1MB cap
      "-ac", "1",
      "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const chunks = [];
    const errChunks = [];
    ffmpeg.stdout.on("data", chunk => chunks.push(chunk));
    ffmpeg.stderr.on("data", chunk => errChunks.push(chunk));

    ffmpeg.on("close", () => {
      const ffmpegLog = Buffer.concat(errChunks).toString().slice(-300);
      if (chunks.length === 0) {
        console.error(`🎵 [song] ffmpeg produced no audio. log: ${ffmpegLog}`);
        settle(reject, new Error("ffmpeg produced no audio output."));
      } else {
        settle(resolve, Buffer.concat(chunks));
      }
    });

    ffmpeg.on("error", err => {
      settle(reject, new Error(`ffmpeg error: ${err.message}`));
    });

    const timer = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      settle(reject, new Error("Audio capture timed out after 30s."));
    }, 30_000);
  });
}

// ── Step 3: Shazam via RapidAPI ───────────────────────────────────────────────

function queryShazam(audioBuffer) {
  return new Promise((resolve, reject) => {
    const options = {
      method:   "POST",
      hostname: RAPIDAPI_HOST,
      path:     "/songs/detect",
      headers: {
        "content-type":   "application/octet-stream",  // raw binary, not base64 text
        "content-length": audioBuffer.length,
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
    };

    const req = https.request(options, res => {
      // Handle gzip / brotli compressed responses from RapidAPI
      let stream = res;
      const encoding = res.headers["content-encoding"];
      if (encoding === "gzip" || encoding === "br") {
        const zlib = require("zlib");
        stream = encoding === "gzip"
          ? res.pipe(zlib.createGunzip())
          : res.pipe(zlib.createBrotliDecompress());
      }

      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("end", () => {
        const data = Buffer.concat(chunks).toString("utf8");
        console.log(`🎵 [song] Shazam status=${res.statusCode} body=${data.slice(0, 300)}`);

        // 204 = Shazam heard audio but found no match — not an error
        if (res.statusCode === 204 || !data.trim()) {
          return resolve(null);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Shazam HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }

        try {
          const json = JSON.parse(data);
          const track = json?.track;
          if (track && track.title) {
            resolve({ title: track.title, artist: track.subtitle || "Unknown" });
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(new Error(`Shazam parse error: ${e.message} — raw: ${data.slice(0, 200)}`));
        }
      });

      stream.on("error", err => reject(new Error(`Shazam stream error: ${err.message}`)));
    });

    req.on("error", err => reject(new Error(`Shazam request error: ${err.message}`)));
    req.write(audioBuffer);  // send raw buffer directly
    req.end();
  });
}

module.exports = { identify };
