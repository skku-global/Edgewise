/**
 * Vercel Serverless Function proxying Anthropic-style chat calls to Gemini.
 * Deployed automatically on Vercel at /api/v1/messages.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const API_KEY = process.env.GEMINI_API_KEY;
const UPSTREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function toGeminiBody(appBody) {
  return {
    systemInstruction: { parts: [{ text: appBody.system ?? "" }] },
    contents: (appBody.messages ?? []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: appBody.max_tokens ?? 1000 },
  };
}

function toAppResponse(geminiData) {
  const candidate = geminiData.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  let stopReason = "end_turn";
  const finish = candidate?.finishReason;
  if (finish === "MAX_TOKENS") stopReason = "max_tokens";
  if (geminiData.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(finish)) {
    stopReason = "refusal";
  }

  return { content: [{ type: "text", text }], stop_reason: stopReason };
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
      error: {
        message: "GEMINI_API_KEY is not configured in Vercel project environment variables.",
      },
    });
    return;
  }

  try {
    const appBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify(toGeminiBody(appBody)),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.status(200).json(toAppResponse(data));
  } catch (error) {
    res.status(502).json({ error: { message: `Proxy error: ${error.message}` } });
  }
}
