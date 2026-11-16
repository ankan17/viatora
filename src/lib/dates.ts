/** Dates are plain calendar dates ("YYYY-MM-DD"); no time zones involved. */

export function dayDate(startDate: string | null, dayNumber: number): string | null {
  if (!startDate) return null;
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dayNumber - 1));
  return date.toISOString().slice(0, 10);
}

const short = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Mon 3 Mar" */
export function formatDay(isoDate: string): string {
  return short.format(new Date(`${isoDate}T00:00:00Z`));
}

/** "Day 2 · Tue 4 Mar", or "Day 2" when the trip has no dates yet. */
export function dayLabel(startDate: string | null, dayNumber: number): string {
  const date = dayDate(startDate, dayNumber);
  return date ? `Day ${dayNumber} · ${formatDay(date)}` : `Day ${dayNumber}`;
}

/** "3–7 Mar", "3 Mar – 2 Apr", or "4 days" without dates. */
export function tripSpan(startDate: string | null, dayCount: number): string {
  if (!startDate || dayCount < 1) return dayCount === 1 ? "1 day" : `${dayCount} days`;
  const end = dayDate(startDate, dayCount)!;
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  if (dayCount === 1) return fmt(startDate, { day: "numeric", month: "short" });
  if (startDate.slice(0, 7) === end.slice(0, 7)) {
    return `${fmt(startDate, { day: "numeric" })}–${fmt(end, { day: "numeric", month: "short" })}`;
  }
  return `${fmt(startDate, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short" })}`;
}
