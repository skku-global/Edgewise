/**
 * Vercel Serverless Function proxying trade screenshot images to Gemini.
 * Deployed automatically on Vercel at /api/v1/extract-trade.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const API_KEY = process.env.GEMINI_API_KEY;
const UPSTREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

const EXTRACT_PROMPT =
  "You are an OCR and trade extraction tool for MT4 / MT5 / cTrader / TradingView screenshots.\n" +
  "Read the screenshot carefully. Return a single JSON object with these keys (null if missing or unclear):\n" +
  "- pair: standard symbol like EURUSD, XAUUSD, NAS100, BTCUSD (all caps)\n" +
  "- direction: 'buy' or 'sell' (lowercase)\n" +
  "- planned_entry: number (the open/entry price shown)\n" +
  "- stop_loss: number or null\n" +
  "- take_profit: number or null\n" +
  "- size: number (lots) or null\n" +
  "- result_pl: number (profit/loss) or null\n" +
  "Output valid JSON only, no markdown, no comments, no explanation.";

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
    if (mime === "image/jpg") mime = "image/jpeg";
    if (!IMAGE_MIMES.has(mime)) {
      res.status(400).json({ error: { message: `Use a PNG, JPEG or WebP screenshot (got "${mime || "none"}")` } });
      return;
    }

    let image;
    if (Buffer.isBuffer(req.body)) {
      image = req.body;
    } else if (typeof req.body === "string") {
      image = Buffer.from(req.body, "binary");
    } else {
      image = await readStream(req);
    }

    if (!image || image.length === 0) {
      res.status(400).json({ error: { message: "Empty image" } });
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
              { text: EXTRACT_PROMPT },
              { inline_data: { mime_type: mime, data: image.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
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
    res.status(502).json({ error: { message: `Image extraction error: ${error.message}` } });
  }
}
