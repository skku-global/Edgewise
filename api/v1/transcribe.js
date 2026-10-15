/**
 * Vercel Serverless Function proxying voice audio to Gemini for speech-to-text.
 * Deployed automatically on Vercel at /api/v1/transcribe.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const API_KEY = process.env.GEMINI_API_KEY;
const UPSTREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readStream(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  if (!API_KEY) {
    res.status(500).json({
      error: { message: "GEMINI_API_KEY is not configured in Vercel project environment variables." },
    });
    return;
  }

  try {
    let mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (mime === "audio/mp4") mime = "audio/m4a";
    if (!mime.startsWith("audio/")) {
      res.status(400).json({ error: { message: `Expected an audio content-type, got "${mime || "none"}"` } });
      return;
    }

    let audio;
    if (Buffer.isBuffer(req.body)) {
      audio = req.body;
    } else if (typeof req.body === "string") {
      audio = Buffer.from(req.body, "binary");
    } else {
      audio = await readStream(req);
    }

    if (!audio || audio.length === 0) {
      res.status(400).json({ error: { message: "Empty audio recording" } });
      return;
    }

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Write down exactly what is said in this audio, in the language it is spoken " +
                  "(English, Nigerian Pidgin, or a mix). Do not summarise, translate, or add any " +
                  "commentary. Output only the spoken words. If there is no speech, output nothing.",
              },
              { inline_data: { mime_type: mime, data: audio.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    res.status(200).json({ text });
  } catch (error) {
    res.status(502).json({ error: { message: `Voice transcribe error: ${error.message}` } });
  }
}
