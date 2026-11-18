import type { Msg, Provider, StepResult } from "../types";

/**
 * A scripted stand-in that costs nothing and always answers correctly. Run it
 * after changing a scenario or a check: if the mock fails one, the check is
 * wrong, not a model. It says nothing about any real model.
 */
export function mockProvider(): Provider {
  let n = 0;
  const reply = (text: string, calls: StepResult["calls"] = []): StepResult => ({
    text,
    calls,
    raw: null,
    usage: { input: 9000, cachedInput: calls.length ? 0 : 7000, cacheWrite: 0, output: 300, reasoning: 0 },
    stop: calls.length ? "tool" : "end",
  });
  const call = (name: string, input: unknown) => reply("", [{ id: `mock_${++n}`, name, input }]);
  /** The id in "[item:…]" on the snapshot line for this title. */
  const itemId = (text: string, title: string) => new RegExp(`${title}[^\\n]*\\[item:([0-9a-f-]{36})\\]`, "i").exec(text)?.[1];

  return {
    id: "mock:scripted",
    async step({ messages }: { messages: Msg[] }) {
      const last = messages.at(-1)!;
      const text = last.role === "user" ? last.text : "";
      const asked = messages.findLast((m) => m.role === "user");
      const prompt = asked?.role === "user" ? asked.text : "";
      // Calls made so far in this turn, to decide what comes next.
      const made = messages.flatMap((m) => (m.role === "assistant" ? m.calls : []));
      const toolText = last.role === "tool" ? last.results.map((r) => r.content).join("\n") : "";
      const done = (words = "Done. It's all in the plan now.") => reply(words);

      if (/plan day 1 for us/i.test(prompt)) {
        const plan = [
          ["Ryoan-ji", "sight", "09:00", "10:30"],
          ["Lunch at Nishiki Market", "food", "12:00", "13:00"],
          ["Philosopher's Path", "activity", "14:00", "15:30"],
          ["Dinner in Pontocho", "food", "18:30", "20:00"],
        ] as const;
        if (made.length < plan.length) {
          const [title, kind, start_time, end_time] = plan[made.length];
          return call("add_item", { title, kind, day: 1, start_time, end_time });
        }
        return made.some((c) => c.name === "update_profile")
          ? done()
          : call("update_profile", { pace: "relaxed", interests: ["food", "quiet temples"] });
      }
      if (/move lunch at nishiki/i.test(prompt))
        return last.role === "user"
          ? call("update_item", { item_id: itemId(text, "Lunch at Nishiki Market"), day: 2, start_time: "12:30" })
          : done();
      if (/day 2 looks wrong/i.test(prompt)) {
        const fixes = [
          ["Tea ceremony", "12:00", "13:00"],
          ["Lunch at Nishiki Market", "13:30", "14:30"],
        ] as const;
        if (made.length < fixes.length) {
          const [title, start_time, end_time] = fixes[made.length];
          return call("update_item", { item_id: itemId(prompt, title), start_time, end_time });
        }
        return done();
      }
      if (/dinner at ichiran/i.test(prompt)) {
        if (made.length === 0) return call("search_places", { query: "Ichiran", near: "Kyoto" });
        const placeId = /place_id:([0-9a-f-]{36})/.exec(toolText)?.[1];
        return made.length === 1
          ? call("add_item", { title: "Dinner at Ichiran", kind: "food", day: 1, part_of_day: "evening", place_id: placeId })
          : done();
      }
      if (/what should we pack/i.test(prompt))
        return last.role === "user"
          ? call("add_packing_items", {
              items: ["Umbrella", "Light layers", "Power adapter", "Comfortable socks", "Sunscreen"].map((label) => ({
                label,
                reason: `Useful in Kyoto in April: ${label}`,
              })),
            })
          : done();
      if (/booked Hotel Gion/i.test(prompt))
        return last.role === "user"
          ? call("add_booking", {
              kind: "stay",
              title: "Hotel Gion Nanba",
              confirmation_ref: "HGN-7731",
              cost: 540,
              starts_at: "2027-04-05T15:00",
              ends_at: "2027-04-08T11:00",
              status: "confirmed",
            })
          : done("Recorded it. I can only keep the details, not book anything.");
      if (/book me a flight/i.test(prompt)) return reply("I can't book flights. I can keep a record once you've booked one.");
      if (/what time does kiyomizu/i.test(prompt))
        return reply("I don't have opening hours or ticket prices. Worth checking the official site before you go.");
      if (/not into temples/i.test(prompt))
        return last.role === "user" ? call("rule_out", { label: "Temples and shrines", reason: "The group isn't into them" }) : done();
      if (/plan day 2 for us/i.test(prompt)) {
        const plan = [
          ["Nishiki Market lunch", "food", "12:00", "13:00"],
          ["Pottery class", "activity", "14:00", "16:00"],
          ["Dinner in Pontocho", "food", "18:30", "20:00"],
        ] as const;
        if (made.length < plan.length) {
          const [title, kind, start_time, end_time] = plan[made.length];
          return call("add_item", { title, kind, day: 2, start_time, end_time });
        }
        return done();
      }
      if (/three of us/i.test(prompt))
        return last.role === "user"
          ? call("update_profile", { travellers: { adults: 2, child_ages: [4] }, dietary: ["vegetarian"], pace: "relaxed" })
          : done();
      if (/left on the packing list/i.test(prompt))
        return reply("Rain jacket, walking shoes and passport are on it, and nothing is ticked off yet.");
      if (/sunset walk still/i.test(prompt)) return reply("It's no longer on day 3. It looks like it was removed.");
      if (/sunset walk along/i.test(prompt))
        return last.role === "user"
          ? call("add_item", { title: "Sunset walk along the Kamo river", kind: "activity", day: 3, part_of_day: "evening" })
          : done();
      if (/more relaxed/i.test(prompt))
        return reply("Which would you like to drop? Kiyomizu-dera and the guesthouse are booked, so I'd keep those.");
      if (/how much have we got planned/i.test(prompt)) {
        const m = /Planned ([^\s]+?) of ([^\s;]+); ([^\s]+) left/.exec(prompt);
        return reply(`You have ${m?.[1]} planned of ${m?.[2]}, so ${m?.[3]} is left.`);
      }
      if (/swap days 3 and 4/i.test(prompt)) return last.role === "user" ? call("move_day", { day: 3, to: 4 }) : done();
      return reply("Sure, tell me a little more about what you'd like.");
    },
  };
}
