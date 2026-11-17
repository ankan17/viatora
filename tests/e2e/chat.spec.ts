import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createTrip, openItinerary, signInNewUser } from "./mail";

// The model is the scripted stand-in in tests/fake-model/server.mjs. If a reply
// here isn't the scripted one, the app isn't pointed at it: stop your dev server
// and let Playwright start it, or start it with `pnpm dev:test`.

const chat = (page: Page) => page.getByRole("region", { name: "Chat" });
const card = (page: Page) => chat(page).getByRole("group", { name: "Changes to the plan" });

async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

/** The day on show: the side panel on desktop, the peek sheet on phone. */
async function showDay(page: Page, isPhone: boolean) {
  if (!isPhone) return page.getByRole("complementary", { name: "Itinerary" });
  await page.getByRole("button", { name: /Show itinerary/ }).click();
  return page.getByRole("dialog", { name: "Itinerary" });
}
const backToChat = (page: Page, isPhone: boolean) => (isPhone ? page.keyboard.press("Escape") : Promise.resolve());

test("ask for a change, see it on the itinerary, and undo it", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Kyoto week", { destination: "Kyoto", days: 3 });
  await expect(chat(page).getByRole("heading", { name: "Let's plan Kyoto" })).toBeVisible();

  await ask(page, "Add a ramen dinner to day 1");
  await expect(chat(page).getByText("Add a ramen dinner to day 1")).toBeVisible();
  await expect(chat(page).getByText("Ichiran ramen is on Day 1 for the evening.")).toBeVisible();
  await expect(card(page)).toContainText("Changed the plan");
  await expect(card(page)).toContainText("Added “Ichiran ramen” to Day 1");
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("");

  let day = await showDay(page, isPhone);
  await expect(day.getByRole("button", { name: /Ichiran ramen, Food, planned/ })).toBeVisible();
  await expect(day.getByRole("heading", { name: "Evening" })).toBeVisible();
  await backToChat(page, isPhone);

  await card(page).getByRole("button", { name: "Undo" }).click();
  await expect(card(page)).toContainText("Undone");
  await expect(card(page).getByRole("button", { name: "Undo" })).toHaveCount(0);
  day = await showDay(page, isPhone);
  await expect(day.getByText("Nothing planned yet.")).toBeVisible();

  // The conversation is still there after a reload, with the card still undone.
  await page.reload();
  await expect(chat(page).getByText("Ichiran ramen is on Day 1 for the evening.")).toBeVisible();
  await expect(card(page)).toContainText("Undone");
});

test("one reply can make several changes, and they undo together", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Lisbon long weekend", { days: 3 });

  // An idea added by hand: the model must see it to move it.
  let it = await openItinerary(page, isPhone);
  await it.getByRole("button", { name: "Add an idea" }).click();
  const editor = page.getByRole("dialog", { name: "Add an idea" });
  await editor.getByLabel("What").fill("Tram 28");
  await editor.getByRole("button", { name: "Add" }).click();
  await expect(it.getByRole("button", { name: "Add Tram 28 to a day" })).toBeVisible();
  if (isPhone) await it.getByRole("button", { name: "Back to chat" }).click();

  await ask(page, "Put Tram 28 on day 2 and give us a spare day");
  await expect(chat(page).getByText("Tram 28 is on Day 2 in the morning")).toBeVisible();
  await expect(card(page)).toContainText("2 changes to the plan");
  await expect(card(page)).toContainText("Moved “Tram 28” to Day 2");
  await expect(card(page)).toContainText("Added Day 4");

  it = await openItinerary(page, isPhone);
  await expect(it.getByRole("button", { name: "Day 4", exact: true })).toBeVisible();
  await it.getByRole("button", { name: "Day 2", exact: true }).click();
  await expect(it.getByRole("button", { name: /Tram 28/ })).toBeVisible();
  if (isPhone) await it.getByRole("button", { name: "Back to chat" }).click();

  await card(page).getByRole("button", { name: "Undo all" }).click();
  await expect(card(page)).toContainText("Undone");
  it = await openItinerary(page, isPhone);
  await expect(it.getByRole("button", { name: "Day 4", exact: true })).toHaveCount(0);
  await expect(it.getByRole("button", { name: "Add Tram 28 to a day" })).toBeVisible();
});

test("answers without changes, and reports problems", async ({ page }) => {
  await signInNewUser(page);
  await createTrip(page, "Quiet trip", { days: 2 });

  // A suggestion sends itself.
  await chat(page).getByRole("button", { name: "What should we sort out first?" }).click();
  await expect(chat(page).getByText("Keep the first day light, then build up.")).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  // A tool call that fails makes no card; the model explains instead.
  await ask(page, "Remove day 9");
  await expect(chat(page).getByText("There's no Day 9 on this trip")).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  // The model failing is said plainly, and the chat is ready for another try.
  await ask(page, "Is anything out of order?");
  await expect(chat(page).getByRole("alert")).toContainText("Something went wrong on my side. Try again.");
  await expect(chat(page).getByText("Is anything out of order?")).toBeVisible();
  await ask(page, "Thanks anyway");
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
  await expect(chat(page).getByText("Keep the first day light, then build up.")).toHaveCount(2);
});

test("a turn can take several steps, and ends cleanly when it can't finish", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the loop is the same on both; once is enough");
  await signInNewUser(page);
  await createTrip(page, "Edge cases", { days: 3 });
  const it = page.getByRole("complementary", { name: "Itinerary" });
  const lastCard = () => card(page).last();

  // The second edit needs the day the first one made.
  await ask(page, "Add a day for Nara");
  await expect(chat(page).getByText("There's a new last day with the deer park on it.")).toBeVisible();
  await expect(lastCard()).toContainText("2 changes to the plan");
  await expect(lastCard()).toContainText("Added Day 4");
  await expect(lastCard()).toContainText("Added “Nara deer park” to Day 4");
  await it.getByRole("button", { name: "Day 4", exact: true }).click();
  await expect(it.getByRole("button", { name: /Nara deer park/ })).toBeVisible();

  // A tool that doesn't exist is answered with an error the model can read, not a crash.
  await ask(page, "Teleport us to Osaka");
  await expect(chat(page).getByText("That isn't something I can do here.")).toBeVisible();
  await expect(card(page)).toHaveCount(1);

  // The model says nothing at all.
  await ask(page, "Say nothing");
  await expect(chat(page).getByText("I don't have anything to add to that.")).toBeVisible();

  // The model is cut off mid-sentence.
  await ask(page, "Give me the long answer");
  await expect(chat(page).getByText(/and then\s+I ran out of room there\. Ask me to continue\./)).toBeVisible();

  // The model never stops calling tools: the turn ends at the step limit and says so.
  await ask(page, "Keep going with ideas");
  await expect(chat(page).getByText("That's as far as I can go in one reply.")).toBeVisible({ timeout: 30_000 });
  await expect(lastCard()).toContainText("12 changes to the plan");
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
});

test("only people on a trip can chat on it", async ({ page }) => {
  await signInNewUser(page);
  const res = await page.request.post(`/api/trips/${randomUUID()}/chat`, { data: { text: "Add ramen" } });
  expect(await res.text()).toBe('{"type":"error","message":"We can\'t find that trip."}\n{"type":"done","message":null}\n');
  const invalid = await page.request.post("/api/trips/not-a-trip/chat", { data: { text: "" } });
  expect(invalid.status()).toBe(400);
});

test("what the group says about itself is saved and sent with later turns", async ({ page, request }) => {
  const name = `Profile ${randomUUID().slice(0, 8)}`;
  await signInNewUser(page);
  await createTrip(page, name, { days: 2 });

  await ask(page, "We're all vegetarian");
  await expect(chat(page).getByText("I'll keep the food vegetarian from here on.")).toBeVisible();
  await expect(card(page)).toContainText("Updated the trip profile");

  await ask(page, "Thanks");
  await expect(chat(page).getByText("Keep the first day light, then build up.")).toBeVisible();

  // The next request to the model carries the saved profile and the earlier turns.
  const sent = (await (await request.get("http://127.0.0.1:3199/requests")).json()) as { messages: { role: string; content: unknown }[] }[];
  const last = sent.findLast((r) => JSON.stringify(r.messages).includes(name))!;
  const prompt = JSON.stringify(last.messages);
  expect(prompt).toContain("Dietary: vegetarian");
  expect(prompt).toContain("We're all vegetarian");
  expect(prompt).toContain("You: Updated the trip profile");
});

test("a reply can be stopped, and what arrived is kept", async ({ page }) => {
  await signInNewUser(page);
  await createTrip(page, "Slow trip", { days: 2 });

  await ask(page, "Tell me slowly");
  await expect(chat(page).getByText(/One thing at a time\. First/)).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
  // It stays on screen while the stored copy takes its place.
  await page.waitForTimeout(3_000);
  await expect(chat(page).getByText(/One thing at a time\. First/)).toHaveCount(1);
  await expect(chat(page).getByText("after that we rest")).toHaveCount(0);

  // The part that arrived is stored (a moment after the stop reaches the server); the rest never came.
  await expect(async () => {
    await page.reload();
    await expect(chat(page).getByText(/One thing at a time\. First/)).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await expect(chat(page).getByText("Tell me slowly")).toBeVisible();
  await expect(chat(page).getByText("after that we rest")).toHaveCount(0);
});

test("looks places and weather up, and pins an item to a real place", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Kyoto week", { destination: "Kyoto", startDate: "2027-04-05", days: 2 });

  await ask(page, "Find a ramen place for dinner");
  await expect(chat(page).getByText("Pinned Ichiran to Day 1.")).toBeVisible();
  await expect(card(page)).toContainText("Added “Ichiran Kyoto” to Day 1");
  const day = await openItinerary(page, isPhone);
  // The card shows the place the item is pinned to.
  await expect(day.getByRole("button", { name: /Ichiran Kyoto, Food · Ichiran Kyoto/ })).toBeVisible();
  if (isPhone) await day.getByRole("button", { name: "Back to chat" }).click();

  // Too far ahead for a forecast, so it says what the week is usually like.
  await ask(page, "What's the weather like on day 1?");
  await expect(chat(page).getByText(/typically 19°C by day and 9°C at night, with rain on about 3 days in 10/)).toBeVisible();
  await expect(chat(page).getByText(/Source: Open-Meteo historical data/)).toBeVisible();
});

test("days with clashing times say so", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Clash", { days: 1 });
  const it = await openItinerary(page, isPhone);
  const timed = async (what: string, start: string, end: string) => {
    await it.getByRole("button", { name: "Add to Day 1" }).click();
    const editor = page.getByRole("dialog", { name: "Add to the day" });
    await editor.getByLabel("What").fill(what);
    await editor.getByRole("radio", { name: "At a time" }).check();
    await editor.getByLabel("Starts").fill(start);
    await editor.getByLabel("Ends").fill(end);
    await editor.getByRole("button", { name: "Add" }).click();
    await expect(it.getByRole("button", { name: new RegExp(what) })).toBeVisible();
  };
  await timed("Museum", "10:00", "12:00");
  await expect(it.getByRole("list", { name: "Worth a look" })).toHaveCount(0);
  await timed("Lunch", "11:30", "12:30");
  await expect(it.getByRole("list", { name: "Worth a look" })).toContainText("Museum runs until 12:00, but Lunch starts at 11:30.");
});
