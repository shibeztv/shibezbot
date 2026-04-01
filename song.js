/**
 * song.js — Live stream song recognition via Groq Whisper + LLaMA
 *
 * Flow:
 *   1. yt-dlp  → gets the direct HLS stream URL from Twitch
 *   2. ffmpeg  → captures ~15s of audio as WAV (16kHz mono, ~480KB)
 *   3. Whisper → transcribes the audio to text (lyrics / speech)
 *   4. LLaMA   → identifies the song from the transcription
 *
 * Only requires GROQ_API_KEY (same key used by ?gpt). No extra API keys.
 */

const { execFile, spawn } = require("child_process");
const https               = require("https");

const CAPTURE_SECS = 15;  // 15s gives Whisper enough lyric content to work with

async function identify(channel) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set — needed for ?song.");

  // Step 1: get HLS stream URL from Twitch
  const streamUrl = await getStreamUrl(channel);
  console.log(`🎵 [song] Got stream URL for #${channel}`);

  // Step 2: capture audio
  const audioBuffer = await captureFromUrl(streamUrl);
  console.log(`🎵 [song] Captured ${audioBuffer.length} bytes of audio`);

  // Step 3: transcribe with Groq Whisper
  const transcript = await transcribeAudio(audioBuffer, GROQ_API_KEY);
  console.log(`🎵 [song] Transcript: "${(transcript || "").slice(0, 120)}"`);

  if (!transcript || transcript.trim().length < 8) {
    console.log("🎵 [song] Transcript too short — no audible lyrics/speech detected.");
    return null;
  }

  // Step 4: identify song from transcript using LLaMA
  return await identifySong(transcript, GROQ_API_KEY);
}

// ── Step 1: yt-dlp --get-url ──────────────────────────────────────────────────

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
      // Twitch requires auth as a cookie, not an Authorization header
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
      if (!url) return reject(new Error("yt-dlp returned no URL — is the channel live?"));
      resolve(url);
    });
  });
}

// ── Step 2: ffmpeg captures audio ────────────────────────────────────────────

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
      "-reconnect",          "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max","5",
      "-i",   url,
      "-t",   String(CAPTURE_SECS),
      "-vn",
      "-f",   "wav",
      "-ar",  "16000",   // 16kHz mono — Whisper's native rate, keeps file ~480KB
      "-ac",  "1",
      "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const chunks    = [];
    const errChunks = [];
    ffmpeg.stdout.on("data", c => chunks.push(c));
    ffmpeg.stderr.on("data", c => errChunks.push(c));

    ffmpeg.on("close", () => {
      if (chunks.length === 0) {
        const log = Buffer.concat(errChunks).toString().slice(-300);
        console.error(`🎵 [song] ffmpeg produced no audio. log: ${log}`);
        settle(reject, new Error("ffmpeg produced no audio output."));
      } else {
        settle(resolve, Buffer.concat(chunks));
      }
    });

    ffmpeg.on("error", err => settle(reject, new Error(`ffmpeg error: ${err.message}`)));

    const timer = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      settle(reject, new Error("Audio capture timed out after 35s."));
    }, 35_000);
  });
}

// ── Step 3: Groq Whisper transcription ───────────────────────────────────────

function transcribeAudio(audioBuffer, apiKey) {
  return new Promise((resolve, reject) => {
    // Build multipart/form-data body manually — no external deps needed
    const boundary = "----GroqWhisper" + Math.random().toString(36).slice(2);

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`
      ),
      audioBuffer,
      Buffer.from(
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-large-v3-turbo\r\n` +
        `--${boundary}--\r\n`
      ),
    ]);

    const options = {
      method:   "POST",
      hostname: "api.groq.com",
      path:     "/openai/v1/audio/transcriptions",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        console.log(`🎵 [song] Whisper status=${res.statusCode} body=${data.slice(0, 200)}`);
        if (res.statusCode !== 200) {
          return reject(new Error(`Whisper HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve(json.text || null);
        } catch (e) {
          reject(new Error(`Whisper parse error: ${e.message}`));
        }
      });
    });

    req.on("error", err => reject(new Error(`Whisper request error: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

// ── Step 4: Groq LLaMA song identification ────────────────────────────────────

function identifySong(transcript, apiKey) {
  return new Promise((resolve, reject) => {
    const prompt =
      `The following text was transcribed from about 15 seconds of audio from a live stream. ` +
      `It may contain song lyrics, partial lyrics, or speech near music. ` +
      `Identify the song title and artist.\n\n` +
      `Transcription:\n"${transcript}"\n\n` +
      `Reply in this exact format and nothing else:\n` +
      `TITLE: <song title>\nARTIST: <artist name>\n\n` +
      `If you cannot identify a specific song with confidence, reply exactly: UNKNOWN`;

    const body = JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role:    "system",
          content: "You are a music expert. Identify songs from lyrics or partial transcriptions. Be concise and accurate. Never guess if unsure.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens:  60,
      temperature: 0,  // deterministic — we want the single most likely answer
    });

    const options = {
      method:   "POST",
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      headers: {
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        console.log(`🎵 [song] LLaMA status=${res.statusCode} body=${data.slice(0, 300)}`);
        if (res.statusCode !== 200) {
          return reject(new Error(`LLaMA HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const json   = JSON.parse(data);
          const answer = (json?.choices?.[0]?.message?.content || "").trim();

          if (!answer || answer.toUpperCase().startsWith("UNKNOWN")) {
            return resolve(null);
          }

          const titleMatch  = answer.match(/TITLE:\s*(.+)/i);
          const artistMatch = answer.match(/ARTIST:\s*(.+)/i);

          if (titleMatch && artistMatch) {
            return resolve({
              title:  titleMatch[1].trim(),
              artist: artistMatch[1].trim(),
            });
          }

          // LLaMA gave something but didn't follow the format — treat as unknown
          resolve(null);
        } catch (e) {
          reject(new Error(`LLaMA parse error: ${e.message}`));
        }
      });
    });

    req.on("error", err => reject(new Error(`LLaMA request error: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { identify };
