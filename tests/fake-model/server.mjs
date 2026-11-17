#!/usr/bin/env node
// A stand-in for the Anthropic Messages API and the lookup services (place
// search, city lookup, weather), for end-to-end and visual tests.
// The app talks to it when ANTHROPIC_BASE_URL points here (playwright.config.ts
// sets that). It answers from the scripts below, picked by what the traveller
// wrote, and streams the reply the way the real API does. It also rejects
// requests the real API would reject for their shape, so a broken tool loop
// fails a test instead of passing quietly.
import http from "node:http";

const PORT = Number(process.env.FAKE_MODEL_PORT ?? 3199);

/** The id of the item with this title, read from the trip snapshot in the prompt. */
const itemId = (snapshot, title) => snapshot.match(new RegExp(`^- ${title} .*\\[item:([0-9a-f-]{36})\\]`, "m"))?.[1] ?? "00000000-0000-4000-8000-000000000000";
const dayCount = (snapshot) => Number(snapshot.match(/^Dates: .*?(\d+) days?$/m)?.[1] ?? 1);

// Each script is the model's steps for one turn: step 0 answers the traveller,
// step 1 answers the first round of tool results, and so on. A step is a list
// of text and tool calls. `loop` repeats the last step for as long as it is asked.
const scripts = [
  {
    // Search, then pin the first result to a new item using the place_id the tool returned.
    match: /find .*ramen/i,
    steps: [
      () => [{ tool: "search_places", input: { query: "ramen" } }],
      (_, __, body) => [{ tool: "add_item", input: { title: "Ichiran Kyoto", kind: "food", day: 1, part_of_day: "evening", place_id: lastToolResult(body).match(/\[place_id:([0-9a-f-]{36})\]/)?.[1] } }],
      () => [{ text: "Pinned Ichiran to Day 1." }],
    ],
  },
  {
    match: /weather/i,
    steps: [() => [{ tool: "get_weather", input: { day: 1 } }], (_, __, body) => [{ text: `Here is what I found: ${lastToolResult(body)}` }]],
  },
  {
    match: /ramen/i,
    steps: [
      () => [{ text: "Good call." }, { tool: "add_item", input: { title: "Ichiran ramen", kind: "food", day: 1, part_of_day: "evening" } }],
      () => [{ text: "Ichiran ramen is on Day 1 for the evening. Want something for the morning too?" }],
    ],
  },
  {
    match: /tram 28/i,
    steps: [
      (snapshot) => [
        { tool: "update_item", input: { item_id: itemId(snapshot, "Tram 28"), day: 2, part_of_day: "morning" } },
        { tool: "add_day", input: {} },
      ],
      () => [{ text: "Tram 28 is on Day 2 in the morning, and there's a spare day at the end." }],
    ],
  },
  {
    match: /vegetarian/i,
    steps: [() => [{ tool: "update_profile", input: { dietary: ["vegetarian"] } }], () => [{ text: "Noted. I'll keep the food vegetarian from here on." }]],
  },
  {
    match: /day 9/i,
    steps: [() => [{ tool: "remove_day", input: { day: 9 } }], () => [{ text: "There's no Day 9 on this trip, so I've left everything as it is." }]],
  },
  {
    // Three steps: the second edit depends on the first.
    match: /nara/i,
    steps: [
      () => [{ text: "Let me make room." }, { tool: "add_day", input: {} }],
      (snapshot) => [{ tool: "add_item", input: { title: "Nara deer park", kind: "sight", day: dayCount(snapshot) + 1, part_of_day: "morning" } }],
      () => [{ text: "There's a new last day with the deer park on it." }],
    ],
  },
  {
    match: /teleport/i,
    steps: [() => [{ tool: "teleport", input: { to: "Osaka" } }], () => [{ text: "That isn't something I can do here." }]],
  },
  { match: /say nothing/i, steps: [() => []] },
  { match: /long answer/i, stop: "max_tokens", steps: [() => [{ text: "It starts with the temples in the east, and then" }]] },
  {
    // Never stops calling tools, to reach the limit on steps in a turn.
    match: /keep going/i,
    loop: true,
    steps: [(_, step) => [{ tool: "add_item", input: { title: `Idea ${step + 1}` } }]],
  },
  { match: /out of order/i, status: 400 },
  {
    // Slow enough for a test to press Stop part-way through.
    match: /slowly/i,
    pause: 250,
    steps: [() => [{ text: "One thing at a time. First the temples, then the food, then the long walk by the river, and after that we rest." }]],
  },
  { match: /./, steps: [() => [{ text: "Keep the first day light, then build up.\n\nTell me what you'd like to do and I'll add it." }]] },
];

const requests = [];

const lastToolResult = (body) => {
  const last = body.messages.at(-1).content.find((b) => b.type === "tool_result");
  return typeof last?.content === "string" ? last.content : "";
};

/** What the real API would refuse outright. */
function problem(req, body) {
  const { messages = [], tools = [] } = body;
  if (!/server-side-fallback/.test(req.headers["anthropic-beta"] ?? "")) return "fallbacks needs its beta header";
  if (messages[0]?.role !== "user") return "the first message must be from the user";
  if (tools.length === 0 || tools.some((t) => !t.name || t.input_schema?.type !== "object")) return "every tool needs a name and an object schema";
  for (const [i, message] of messages.entries()) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const calls = message.content.filter((b) => b.type === "tool_use").map((b) => b.id);
    if (calls.length === 0) continue;
    const next = messages[i + 1];
    const answered = next?.role === "user" && Array.isArray(next.content) ? next.content.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [];
    if (calls.some((id) => !answered.includes(id))) return "tool_use ids were found without tool_result blocks immediately after";
  }
  return null;
}

const isToolResults = (m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result");

function reply(body) {
  const asked = body.messages.findLastIndex((m) => m.role === "user" && !isToolResults(m));
  const content = body.messages[asked].content;
  const texts = typeof content === "string" ? [content] : content.filter((b) => b.type === "text").map((b) => b.text);
  const script = scripts.find((s) => s.match.test(texts.at(-1)));
  if (script.status) return { status: script.status };
  // One round of tool results per step so far.
  const step = body.messages.slice(asked + 1).filter(isToolResults).length;
  const run = script.steps[script.loop ? Math.min(step, script.steps.length - 1) : step];
  const blocks = run ? run(texts[0], step, body) : [{ text: "That's everything." }];
  return { blocks, pause: script.pause ?? 0, stop: script.stop ?? (blocks.some((b) => b.tool) ? "tool_use" : "end_turn") };
}

async function stream(res, { blocks, pause, stop }) {
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
  send({ type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 10 } });
  send({ type: "message_stop" });
  res.end();
}

http
  .createServer((req, res) => {
    // What the app sent, for tests that check the prompt.
    if (req.method === "GET" && req.url === "/requests") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(requests.slice(-200)));
    }
    const url = new URL(req.url, "http://fake");
    const json = (body) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
    // The lookup services, with fixed answers.
    if (url.pathname === "/api") {
      const place = (id, name, value, lat, lon) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { osm_id: id, osm_type: "N", osm_key: "amenity", osm_value: value, name, street: "Kawaramachi-dori", city: "Kyoto", country: "Japan" } });
      return json({ features: [place(1001, "Ichiran Kyoto", "restaurant", 35.0045, 135.7685), place(1002, "Menya Inoichi", "restaurant", 35.0182, 135.7541)] });
    }
    if (url.pathname === "/v1/search") return json({ results: [{ name: "Kyoto", latitude: 35.0116, longitude: 135.7681, country: "Japan" }] });
    if (url.pathname === "/v1/forecast") return json({ daily: { time: [url.searchParams.get("start_date")], temperature_2m_max: [21.4], temperature_2m_min: [11.2], precipitation_probability_max: [30], weather_code: [2] } });
    if (url.pathname === "/v1/archive") {
      const days = 7;
      return json({ daily: { temperature_2m_max: Array(days).fill(19), temperature_2m_min: Array(days).fill(9), precipitation_sum: [0, 0, 2, 0, 0, 3, 0] } });
    }
    if (req.method === "GET") return res.writeHead(200).end("fake model");
    if (!req.url.startsWith("/v1/messages")) return res.writeHead(404).end();

    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const invalid = problem(req, body);
      const out = invalid ? { status: 400 } : reply(body);
      if (out.status) {
        res.writeHead(out.status, { "content-type": "application/json" });
        return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: invalid ?? "The fake model is out of order." } }));
      }
      stream(res, out);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake model on http://127.0.0.1:${PORT}`));
