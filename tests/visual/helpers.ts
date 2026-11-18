import { expect, type Page } from "@playwright/test";
import { newUser, type Client } from "../db/helpers";
import { signIn } from "../e2e/mail";

/**
 * Compares the page with the stored screenshot, in the light theme and then the
 * dark one. Soft, so one run reports every shot that changed.
 */
export async function shot(page: Page, name: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect.soft(page).toHaveScreenshot(`${name}-${colorScheme}.png`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** A new account, signed in in the browser, plus a database client for seeding its trips. */
export async function signedInUser(page: Page): Promise<Client> {
  const user = await newUser();
  await signIn(page, user.email);
  return user.client;
}

function ok<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error || res.data == null) throw res.error ?? new Error("No rows returned");
  return res.data;
}

/** A three-day trip with nothing on it and no dates. */
export async function seedEmptyTrip(db: Client): Promise<string> {
  return ok(await db.rpc("create_trip", { p_name: "Lisbon long weekend", p_day_count: 3 }));
}

/**
 * A four-day Kyoto trip. Day 1 has every kind of card (part of day, timed, cost,
 * each status, a stay); the other days are empty; two ideas wait in the backlog.
 */
export async function seedPlannedTrip(db: Client): Promise<string> {
  const tripId = ok(
    await db.rpc("create_trip", { p_name: "Kyoto in spring", p_destination: "Kyoto", p_start_date: "2027-04-05", p_day_count: 4 }),
  );
  const days = ok(await db.from("days").select("id, number").eq("trip_id", tripId).order("number"));
  const day1 = days[0].id;
  ok(await db.from("days").update({ base_city: "Kyoto" }).eq("id", day1).select("id"));

  const items = [
    { day_id: day1, title: "Fushimi Inari Shrine", type: "sight", slot: "morning", status: "planned" },
    {
      day_id: day1,
      title: "Lunch at Nishiki Market",
      type: "food",
      start_time: "12:30",
      end_time: "13:30",
      status: "planned",
      cost_amount: 40,
      cost_currency: "USD",
    },
    {
      day_id: day1,
      title: "Kiyomizu-dera",
      type: "sight",
      slot: "afternoon",
      status: "booked",
      cost_amount: 4.5,
      cost_currency: "USD",
      notes: "Tickets are on the phone. Go in by the west gate.",
    },
    { day_id: day1, title: "Evening walk through Gion", type: "activity", slot: "evening", status: "idea" },
    { day_id: day1, title: "Machiya guesthouse", type: "stay", status: "booked", cost_amount: 180, cost_currency: "USD" },
    { day_id: null, title: "Arashiyama bamboo grove", type: "sight", status: "idea" },
    { day_id: null, title: "Tea ceremony", type: "activity", status: "idea" },
  ] as const;
  ok(
    await db
      .from("items")
      .insert(
        items.map((item, i) => ({ ...item, trip_id: tripId, position: i + 1 })),
        { defaultToNull: false },
      )
      .select("id"),
  );
  return tripId;
}
