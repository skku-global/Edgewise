/**
 * Zero-dependency Claude proxy for the Chat tab.
 *
 * The point is to keep ANTHROPIC_API_KEY on a machine the user controls rather
 * than inside the app bundle, where every EXPO_PUBLIC_ value ends up in plain
 * text. The app posts the same body it would send to Anthropic; this adds the
 * key and forwards it.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/claude-proxy.mjs
 *   # then set EXPO_PUBLIC_CLAUDE_PROXY_URL=http://localhost:8788
 *
 * This is a development helper: it trusts any caller that can reach the port.
 * Put real authentication in front of it before exposing it beyond localhost.
 */

import { Buffer } from "node:buffer";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8788);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const UPSTREAM = "https://api.anthropic.com/v1/messages";

if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  console.error("Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/claude-proxy.mjs");
  process.exit(1);
}

/** Metro serves the app from a different origin, so the browser preflights. */
function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
}

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: Buffer.concat(chunks),
    });

    const body = await upstream.text();
    console.log(`${upstream.status} ${upstream.statusText}`);
    res.writeHead(upstream.status, { "content-type": "application/json" });
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: { message: `Proxy could not reach Anthropic: ${error.message}` } }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`Claude proxy on http://localhost:${PORT}`);
  console.log(`Set EXPO_PUBLIC_CLAUDE_PROXY_URL=http://localhost:${PORT}`);
});
