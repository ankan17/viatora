import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTrip, openItinerary, signInNewUser } from "./mail";

// Packing, bookings and budget. The model is the scripted stand-in in tests/fake-model/server.mjs.

const chat = (page: Page) => page.getByRole("region", { name: "Chat" });
const card = (page: Page) => chat(page).getByRole("group", { name: "Changes to the plan" });

async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

/** The trip's lists, opened on one tab. On phone they live in the full itinerary. */
async function openTab(page: Page, isPhone: boolean, tab: "Packing" | "Bookings" | "Budget") {
  const open = page.getByRole("dialog", { name: "Full itinerary" });
  const it = isPhone && (await open.isVisible()) ? open : await openItinerary(page, isPhone);
  await it.getByRole("tab", { name: tab }).click();
  return it;
}
const backToChat = async (it: Locator, isPhone: boolean) => {
  if (isPhone) await it.getByRole("button", { name: "Back to chat" }).click();
};

test("pack, book and budget by hand", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Porto weekend", { destination: "Porto", days: 3 });

  // Packing: add, tick, give it a reason.
  let it = await openTab(page, isPhone, "Packing");
  await expect(it.getByText("Nothing to pack yet.")).toBeVisible();
  await it.getByLabel("Add something").fill("Sun hat");
  await it.getByRole("button", { name: "Add to the packing list" }).click();
  await expect(it.getByRole("button", { name: "Sun hat. Edit" })).toBeVisible();
  await expect(it.getByText("0 of 1 packed")).toBeVisible();
  await it.getByRole("checkbox", { name: "Packed: Sun hat" }).click();
  await expect(it.getByText("1 of 1 packed")).toBeVisible();
  await expect(it.getByRole("checkbox", { name: "Packed: Sun hat" })).toHaveAttribute("aria-checked", "true");

  await it.getByRole("button", { name: "Sun hat. Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit packing item" });
  await dialog.getByLabel("Why").fill("Sunny on day 2");
  await dialog.getByLabel("Group").fill("Clothes");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(it.getByRole("region", { name: "Clothes" }).getByText("Sunny on day 2")).toBeVisible();

  // Bookings: add one with a confirmation number and a link.
  it = await openTab(page, isPhone, "Bookings");
  await expect(it.getByText("Nothing here yet.")).toBeVisible();
  await it.getByRole("button", { name: "Add a booking" }).click();
  const booking = page.getByRole("dialog", { name: "Add a booking" });
  await booking.getByLabel("What").fill("Flight LHR to OPO");
  await booking.getByLabel("Kind").selectOption("flight");
  await booking.getByRole("radio", { name: "Confirmed" }).check();
  await booking.getByLabel("Confirmation number").fill("QX81ZT");
  await booking.getByLabel("Starts").fill("2027-05-07T09:15");
  await booking.getByLabel("Cost").fill("120");
  await booking.getByLabel("Link").fill("https://example.com/trip/QX81ZT");
  await booking.getByRole("button", { name: "Add", exact: true }).click();
  await expect(it.getByText("Flight LHR to OPO")).toBeVisible();
  await expect(it.getByText("QX81ZT")).toBeVisible();
  await expect(it.getByText("2027-05-07 09:15")).toBeVisible();
  const link = it.getByRole("link", { name: "Open the page for Flight LHR to OPO" });
  await expect(link).toHaveAttribute("href", "https://example.com/trip/QX81ZT");
  await expect(link).toHaveAttribute("rel", /noopener/);

  // Budget: the booking counts, a budget says what is left.
  it = await openTab(page, isPhone, "Budget");
  await expect(it.getByRole("region", { name: "Totals" })).toContainText("US$120");
  await it.getByLabel("Budget in USD").fill("500");
  await it.getByRole("button", { name: "Save" }).click();
  await expect(it.getByRole("region", { name: "Totals" })).toContainText("Left");

  // It's all still there after a reload.
  await page.reload();
  it = await openTab(page, isPhone, "Packing");
  await expect(it.getByRole("button", { name: "Sun hat. Edit" })).toBeVisible();
  it = await openTab(page, isPhone, "Bookings");
  await expect(it.getByText("QX81ZT")).toBeVisible();
});

test("the chat packs, records bookings, and remembers what's ruled out", async ({ page, request }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  const name = `Kyoto spring ${randomUUID()}`;
  await createTrip(page, name, { destination: "Kyoto", days: 3 });

  await ask(page, "Make us a packing list");
  await expect(chat(page).getByText("I've added a rain jacket and passports to the packing list.")).toBeVisible();
  await expect(card(page)).toContainText("Added 2 things to the packing list");
  let it = await openTab(page, isPhone, "Packing");
  await expect(it.getByText("Showers are likely in the first week")).toBeVisible();
  await expect(it.getByRole("button", { name: "Passport, 2. Edit" })).toBeVisible();
  await backToChat(it, isPhone);

  await ask(page, "I booked the hotel in Gion");
  await expect(chat(page).getByText("I've kept the Hotel Gion booking")).toBeVisible();
  it = await openTab(page, isPhone, "Bookings");
  await expect(it.getByText("Hotel Gion")).toBeVisible();
  await expect(it.getByText("GX-4471")).toBeVisible();
  await expect(it.getByText("2027-04-05 15:00 to 2027-04-08 11:00")).toBeVisible();
  it = await openTab(page, isPhone, "Budget");
  await expect(it.getByRole("region", { name: "Totals" })).toContainText("540");
  await backToChat(it, isPhone);

  // A link that isn't a web address is refused, and the model is told so.
  await ask(page, "Save the hotel with a javascript link");
  await expect(chat(page).getByText("That link wasn't accepted, so nothing was saved.")).toBeVisible();
  it = await openTab(page, isPhone, "Bookings");
  await expect(it.getByText("Odd hotel")).toHaveCount(0);
  await backToChat(it, isPhone);

  // What's ruled out goes back to the model with the next message.
  await ask(page, "We're not interested in Universal Studios");
  await expect(chat(page).getByText("Understood, no Universal Studios.")).toBeVisible();
  await ask(page, "Thanks");
  await expect(chat(page).getByText("Keep the first day light, then build up.")).toBeVisible();
  const all = (await (await request.get("http://127.0.0.1:3199/requests")).json()) as { messages: unknown[] }[];
  const sent = all.filter((r) => JSON.stringify(r.messages).includes(name));
  const snapshot = JSON.stringify(sent.at(-1)!.messages.at(-1));
  expect(snapshot).toContain("Ruled out by the group");
  expect(snapshot).toContain("Universal Studios (Too crowded)");
  expect(snapshot).toContain("Rain jacket");
  // Confirmation numbers and links stay out of the trip snapshot the model is sent.
  expect(snapshot).toContain("Hotel Gion");
  expect(snapshot).toContain("has a confirmation number");
  expect(snapshot).not.toContain("GX-4471");

  // The whole turn undoes, lists included.
  await card(page).first().getByRole("button", { name: "Undo" }).click();
  await expect(card(page).first()).toContainText("Undone");
  it = await openTab(page, isPhone, "Packing");
  await expect(it.getByText("Nothing to pack yet.")).toBeVisible();
});
