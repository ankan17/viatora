import { describe, expect, it } from "vitest";
import { appendMessage, fromRow, mergeMessages, toHistory, toParts, type ChatMessage } from "./messages";
import { HISTORY_MESSAGE_LENGTH } from "./model";

describe("stored messages", () => {
  it("keep a reply's text and its edits in order", () => {
    expect(toParts("  Done.  ", [{ summary: "Added “Ramen” to Day 1" }])).toEqual([
      { type: "text", text: "Done." },
      { type: "edit", summary: "Added “Ramen” to Day 1" },
    ]);
    expect(toParts("   ")).toEqual([]);
  });

  it("read back into what the chat shows", () => {
    const row = {
      id: "m1",
      role: "assistant" as const,
      parts: [
        { type: "text", text: "Good call." },
        { type: "edit", summary: "Added “Ramen” to Day 1" },
        { type: "text", text: "Anything else?" },
      ],
      change_batch_id: "b1",
      batch: { undone_at: "2027-01-01T00:00:00Z" },
    };
    expect(fromRow(row)).toEqual({
      id: "m1",
      role: "assistant",
      text: "Good call.\n\nAnything else?",
      edits: [{ summary: "Added “Ramen” to Day 1" }],
      batchId: "b1",
      undone: true,
    });
  });

  it("show nothing for parts they don't understand, rather than failing the page", () => {
    expect(fromRow({ id: "m", role: "user", parts: [{ type: "image" }], change_batch_id: null, batch: null })).toMatchObject({
      text: "",
      edits: [],
    });
  });
});

const message = (o: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  role: "user",
  text: "",
  edits: [],
  batchId: null,
  undone: false,
  ...o,
});

describe("history sent to the model", () => {
  it("is words only, and skips replies that were edits with no text", () => {
    expect(
      toHistory([
        message({ text: "Add ramen" }),
        message({ role: "assistant", text: "Added.", edits: [{ summary: "Added “Ramen” to Day 1" }] }),
        message({ role: "assistant", text: "", edits: [{ summary: "Added Day 4" }] }),
      ]),
    ).toEqual([
      { role: "user", content: "Add ramen" },
      { role: "assistant", content: "Added." },
    ]);
  });

  it("starts with the traveller, even when the window opens on a reply", () => {
    expect(toHistory([message({ role: "assistant", text: "Earlier reply" }), message({ text: "Next" })])).toEqual([
      { role: "user", content: "Next" },
    ]);
  });

  it("cuts a very long message and says so", () => {
    const [turn] = toHistory([message({ text: "x".repeat(HISTORY_MESSAGE_LENGTH + 500) })]);
    expect(turn.content).toHaveLength(HISTORY_MESSAGE_LENGTH + "\n[…the rest of this message was left out]".length);
    expect(turn.content).toMatch(/left out\]$/);
  });
});

describe("joining the stored list with this session's messages", () => {
  const ids = (list: ChatMessage[]) => list.map((m) => m.id);
  const stored = (n: number, from = 1) =>
    Array.from({ length: n }, (_, i) => message({ id: `m${from + i}`, role: (from + i) % 2 ? "user" : "assistant" }));

  it("keeps messages that arrived over the stream until the server has them", () => {
    const local = [...stored(2), message({ id: "u3" }), message({ id: "a4", role: "assistant" })];
    expect(ids(mergeMessages([...stored(2), message({ id: "u3" })], local, new Set(["u3", "a4"])))).toEqual(["m1", "m2", "u3", "a4"]);
  });

  it("lets go of old messages that have left the server's window, instead of moving them to the end", () => {
    // The page loaded m1..m4; after a new message the server's window is m2..m5.
    expect(ids(mergeMessages(stored(4, 2), [...stored(4), message({ id: "m5" })], new Set(["m5"])))).toEqual(["m2", "m3", "m4", "m5"]);
  });

  it("shows a stopped reply's local copy until the stored reply arrives", () => {
    const local = [message({ id: "u1" }), message({ id: "local-1", role: "assistant", text: "One thing" })];
    // A refresh that only has the traveller's message so far.
    expect(ids(mergeMessages([message({ id: "u1" })], local, new Set(["u1"])))).toEqual(["u1", "local-1"]);
    // The stored reply takes its place.
    expect(ids(mergeMessages([message({ id: "u1" }), message({ id: "a2", role: "assistant" })], local, new Set(["u1"])))).toEqual([
      "u1",
      "a2",
    ]);
  });

  it("never adds the same message twice", () => {
    const list = [message({ id: "u1" })];
    expect(appendMessage(list, message({ id: "u1" }))).toBe(list);
    expect(ids(appendMessage(list, message({ id: "a2" })))).toEqual(["u1", "a2"]);
  });
});
