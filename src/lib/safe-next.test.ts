import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("allows same-site paths", () => expect(safeNext("/trips/abc")).toBe("/trips/abc"));
  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "trips"])("rejects %s", (v) =>
    expect(safeNext(v)).toBe("/trips"),
  );
});
