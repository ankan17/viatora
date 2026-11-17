/** Booking times are stored as typed, with no timezone: "2027-04-03T14:30:00+00:00" reads "2027-04-03 14:30". */
export const stamp = (t: string | null) =>
  t
    ? t
        .slice(0, 16)
        .replace("T", " ")
        .replace(/ 00:00$/, "")
    : null;

/** The value a date-time input takes. */
export const toInput = (t: string | null) => (t ? t.slice(0, 16) : "");
