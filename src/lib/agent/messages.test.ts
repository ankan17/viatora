import { describe, expect, it } from "vitest";
import { fromRow, toHistory, toParts, type ChatMessage } from "./messages";

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
    expect(fromRow({ id: "m", role: "user", parts: [{ type: "image" }], change_batch_id: null, batch: null })).toMatchObject({ text: "", edits: [] });
  });
});

describe("history sent to the model", () => {
  const message = (o: Partial<ChatMessage>): ChatMessage => ({ id: "m", role: "user", text: "", edits: [], batchId: null, undone: false, ...o });

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
});
