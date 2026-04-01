/**
 * song.js — Live stream song recognition via Groq Whisper + LLaMA
 *
 * Flow:
 *   1. yt-dlp  → gets direct HLS stream URL from Twitch
 *   2. ffmpeg  → captures 20s of audio as WAV (16kHz mono, ~640KB)
 *   3. Whisper → transcribes audio to lyrics/text
 *   4. LLaMA   → identifies song from the transcription
 *
 * Retries once with a fresh audio segment if the first transcript is too short.
 * Only requires GROQ_API_KEY — same key as ?gpt, no extra signup needed.
 */

const { execFile, spawn } = require("child_process");
const https               = require("https");

const CAPTURE_SECS     = 20;   // 20s gives Whisper more lyrics to work with
const MIN_TRANSCRIPT   = 5;    // chars — below this we assume no clear vocals

async function identify(channel) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set — needed for ?song.");

  // Step 1: get stream URL once, reuse for both attempts
  const streamUrl = await getStreamUrl(channel);
  console.log(`🎵 [song] Got stream URL for #${channel}`);

  // Steps 2+3: try up to 2 segments in case Whisper catches an instrumental break
  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`🎵 [song] Attempt ${attempt}: capturing audio...`);
    const audioBuffer = await captureFromUrl(streamUrl);
    console.log(`🎵 [song] Attempt ${attempt}: captured ${audioBuffer.length} bytes`);

    const transcript = await transcribeAudio(audioBuffer, GROQ_API_KEY);
    const trimmed = (transcript || "").trim();
    console.log(`🎵 [song] Attempt ${attempt} transcript (${trimmed.length} chars): "${trimmed.slice(0, 150)}"`);

    if (trimmed.length < MIN_TRANSCRIPT) {
      console.log(`🎵 [song] Attempt ${attempt}: transcript too short, ${attempt < 2 ? "retrying..." : "giving up."}`);
      continue;
    }

    // Step 4: identify from transcript
    const result = await identifySong(trimmed, GROQ_API_KEY);
    if (result) {
      console.log(`🎵 [song] Identified: ${result.title} by ${result.artist}`);
      return result;
    }
    console.log(`🎵 [song] Attempt ${attempt}: LLaMA couldn't identify song from transcript.`);
  }

  return null;
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
      "-reconnect",           "1",
      "-reconnect_streamed",  "1",
      "-reconnect_delay_max", "5",
      "-i",   url,
      "-t",   String(CAPTURE_SECS),
      "-vn",
      "-f",   "wav",
      "-ar",  "16000",  // 16kHz mono — Whisper's native rate, keeps file ~640KB
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
      settle(reject, new Error("Audio capture timed out after 40s."));
    }, 40_000);
  });
}

// ── Step 3: Groq Whisper transcription ───────────────────────────────────────

function transcribeAudio(audioBuffer, apiKey) {
  return new Promise((resolve, reject) => {
    const boundary = "----GroqWhisper" + Math.random().toString(36).slice(2);

    // Adding a prompt biases Whisper toward transcribing sung lyrics
    // rather than treating everything as speech
    const promptText = "Song lyrics:";

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
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `en\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        `${promptText}\r\n` +
        `--${boundary}--\r\n`
      ),
    ]);

    const options = {
      method:   "POST",
      hostname: "api.groq.com",
      path:     "/openai/v1/audio/transcriptions",
      headers: {
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Type":   `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        console.log(`🎵 [song] Whisper status=${res.statusCode}`);
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
      `The following text was transcribed from about 20 seconds of audio from a live stream. ` +
      `It may contain song lyrics, partial lyrics, or speech near music.\n\n` +
      `Transcription:\n"${transcript}"\n\n` +
      `If you can identify the song, reply in this exact format:\n` +
      `TITLE: <song title>\nARTIST: <artist name>\n\n` +
      `If you are not confident, reply exactly: UNKNOWN`;

    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",  // larger model = better music knowledge
      messages: [
        {
          role:    "system",
          content: "You are a music expert who identifies songs from partial lyric transcriptions. Only identify a song if you are confident. Never guess.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens:  80,
      temperature: 0.1,
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

          console.log(`🎵 [song] LLaMA answer: "${answer}"`);

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
