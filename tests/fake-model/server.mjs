#!/usr/bin/env node
// A stand-in for the Anthropic Messages API, for end-to-end and visual tests.
// The app talks to it when ANTHROPIC_BASE_URL points here (playwright.config.ts
// sets that). It answers from the scripts below, picked by what the traveller
// wrote, and streams the reply the way the real API does.
import http from "node:http";

const PORT = Number(process.env.FAKE_MODEL_PORT ?? 3199);

/** The id of the item with this title, read from the trip snapshot in the prompt. */
const itemId = (snapshot, title) => snapshot.match(new RegExp(`^- ${title} .*\\[item:([0-9a-f-]{36})\\]`, "m"))?.[1] ?? "00000000-0000-4000-8000-000000000000";

// `first` is the model's first step (text and tool calls); `then` is what it says once the tools have run.
const scripts = [
  {
    match: /ramen/i,
    first: () => [
      { text: "Good call." },
      { tool: "add_item", input: { title: "Ichiran ramen", kind: "food", day: 1, part_of_day: "evening" } },
    ],
    then: "Ichiran ramen is on Day 1 for the evening. Want something for the morning too?",
  },
  {
    match: /tram 28/i,
    first: (snapshot) => [
      { tool: "update_item", input: { item_id: itemId(snapshot, "Tram 28"), day: 2, part_of_day: "morning" } },
      { tool: "add_day", input: {} },
    ],
    then: "Tram 28 is on Day 2 in the morning, and there's a spare day at the end.",
  },
  {
    match: /vegetarian/i,
    first: () => [{ tool: "update_profile", input: { dietary: ["vegetarian"] } }],
    then: "Noted. I'll keep the food vegetarian from here on.",
  },
  {
    match: /day 9/i,
    first: () => [{ tool: "remove_day", input: { day: 9 } }],
    then: "There's no Day 9 on this trip, so I've left everything as it is.",
  },
  { match: /out of order/i, status: 400 },
  {
    // Slow enough for a test to press Stop part-way through.
    match: /slowly/i,
    pause: 250,
    first: () => [{ text: "One thing at a time. First the temples, then the food, then the long walk by the river, and after that we rest." }],
  },
  { match: /./, first: () => [{ text: "Keep the first day light, then build up.\n\nTell me what you'd like to do and I'll add it." }] },
];

const requests = [];

function reply(body) {
  const turns = body.messages.filter((m) => m.role === "user");
  const afterTools = Array.isArray(turns.at(-1)?.content) && turns.at(-1).content.some((b) => b.type === "tool_result");
  const asked = turns.findLast((m) => typeof m.content === "string" || m.content.some((b) => b.type === "text"));
  const texts = typeof asked.content === "string" ? [asked.content] : asked.content.filter((b) => b.type === "text").map((b) => b.text);
  const script = scripts.find((s) => s.match.test(texts.at(-1)));
  if (script.status) return { status: script.status };
  return { blocks: afterTools ? [{ text: script.then }] : script.first(texts[0]), pause: script.pause ?? 0 };
}

async function stream(res, blocks, pause) {
  const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  const wait = () => (pause ? new Promise((r) => setTimeout(r, pause)) : null);
  const usage = { input_tokens: 10, output_tokens: 10 };
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  send({
    type: "message_start",
    message: { id: `msg_fake_${Date.now()}`, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage },
  });
  for (const [index, block] of blocks.entries()) {
    if (block.tool) {
      send({ type: "content_block_start", index, content_block: { type: "tool_use", id: `toolu_fake_${Date.now()}_${index}`, name: block.tool, input: {} } });
      send({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    } else {
      send({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      // A few deltas, as the real stream sends them.
      for (const piece of block.text.match(/\S+\s*/g) ?? []) {
        if (res.destroyed) return; // the app stopped listening
        send({ type: "content_block_delta", index, delta: { type: "text_delta", text: piece } });
        await wait();
      }
    }
    send({ type: "content_block_stop", index });
  }
  send({ type: "message_delta", delta: { stop_reason: blocks.some((b) => b.tool) ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  send({ type: "message_stop" });
  res.end();
}

http
  .createServer((req, res) => {
    // What the app sent, for tests that check the prompt.
    if (req.method === "GET" && req.url === "/requests") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(requests.slice(-20)));
    }
    if (req.method === "GET") return res.writeHead(200).end("fake model");
    if (!req.url.startsWith("/v1/messages")) return res.writeHead(404).end();

    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const out = reply(body);
      if (out.status) {
        res.writeHead(out.status, { "content-type": "application/json" });
        return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "The fake model is out of order." } }));
      }
      stream(res, out.blocks, out.pause);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake model on http://127.0.0.1:${PORT}`));
