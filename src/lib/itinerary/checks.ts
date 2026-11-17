import { hhmm } from "./group";
import type { Item } from "./types";

/**
 * Things the app can see are off about a day without asking anyone: plans whose
 * times clash. They are shown on the day and given to the chat agent, which is
 * better at wording a fix than at noticing that 13:00 comes before 13:30.
 */
export type DayCheck = {
  kind: "overlap" | "same-start";
  /** The two items involved, earlier first. */
  itemIds: [string, string];
  message: string;
};

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** An end at or before the start means the plan runs past midnight. */
const endMinutes = (item: Item) => {
  const start = minutes(item.start_time!);
  const end = minutes(item.end_time!);
  return end > start ? end : end + 24 * 60;
};

/** Where you sleep and notes to self sit alongside the day rather than in it. */
const occupiesTime = (item: Item) => item.start_time !== null && item.type !== "stay" && item.type !== "note";

export function checkDay(items: Item[]): DayCheck[] {
  const timed = items.filter(occupiesTime).sort((a, b) => a.start_time!.localeCompare(b.start_time!) || a.position - b.position);
  const checks: DayCheck[] = [];
  for (const [i, first] of timed.entries()) {
    for (const second of timed.slice(i + 1)) {
      const start = hhmm(second.start_time)!;
      if (second.start_time === first.start_time) {
        checks.push({ kind: "same-start", itemIds: [first.id, second.id], message: `${first.title} and ${second.title} both start at ${start}.` });
      } else if (first.end_time && minutes(second.start_time!) < endMinutes(first)) {
        checks.push({
          kind: "overlap",
          itemIds: [first.id, second.id],
          message: `${first.title} runs until ${hhmm(first.end_time)}, but ${second.title} starts at ${start}.`,
        });
      }
    }
  }
  return checks;
}
