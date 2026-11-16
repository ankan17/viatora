import { describe, expect, it } from "vitest";
import { readTripProfile } from "./trip-profile";

describe("readTripProfile", () => {
  it("fills defaults for an empty profile", () => {
    expect(readTripProfile({})).toEqual({ interests: [], dietary: [], preferences: [] });
    expect(readTripProfile(null)).toEqual({ interests: [], dietary: [], preferences: [] });
  });

  it("keeps a valid profile", () => {
    const p = readTripProfile({ travellers: { adults: 2, childAges: [4, 9] }, pace: "relaxed", preferences: ["No early starts"] });
    expect(p.travellers).toEqual({ adults: 2, childAges: [4, 9] });
    expect(p.pace).toBe("relaxed");
  });

  it("falls back instead of throwing on bad data", () => {
    expect(readTripProfile({ pace: "frantic" })).toEqual({ interests: [], dietary: [], preferences: [] });
  });
});
