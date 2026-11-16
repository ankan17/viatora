import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { seedEmptyTrip, seedPlannedTrip, shot, signedInUser } from "./helpers";

// Every screen and dialog built so far, on phone and desktop, light and dark.
// Screenshots live in tests/visual/screenshots. After an intended change to the
// look, run `pnpm test:visual --update-snapshots` and commit the new images.

test("sign-in", async ({ page }, info) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  await shot(page, "sign-in");

  await page.goto("/sign-in?error=link");
  await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
  await shot(page, "sign-in-link-expired");

  // The address is shown on the next step, so it has to be the same on every run.
  await page.getByLabel("Email").fill(`visual-${info.project.name}@example.test`);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  await shot(page, "sign-in-code");

  await page.getByLabel("6-digit code").fill("12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter the 6-digit code from the email.")).toBeVisible();
  await shot(page, "sign-in-code-error");
});

test("trips list, new trip, and an empty trip", async ({ page }, info) => {
  const db = await signedInUser(page);
  await expect(page.getByRole("heading", { name: "Where to first?" })).toBeVisible();
  await shot(page, "trips-empty");

  await page.goto("/trips/new");
  await expect(page.getByLabel("Trip name")).toBeVisible();
  await shot(page, "trip-new");

  await page.goto(`/trips/${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "We can't find that" })).toBeVisible();
  await shot(page, "not-found");

  const emptyTrip = await seedEmptyTrip(db);
  await seedPlannedTrip(db);
  await page.goto("/trips");
  await expect(page.getByRole("link", { name: /Kyoto in spring/ })).toBeVisible();
  await shot(page, "trips-list");

  await page.goto(`/trips/${emptyTrip}`);
  await expect(page.getByRole("heading", { name: "Let's plan this trip" })).toBeVisible();
  await shot(page, "trip-empty");
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: /Show itinerary/ }).click();
    await expect(page.getByRole("dialog", { name: "Itinerary" }).getByText("Nothing planned yet.")).toBeVisible();
    await shot(page, "trip-empty-peek");
  }
});

test("a planned trip and its dialogs", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  const db = await signedInUser(page);
  await page.goto(`/trips/${await seedPlannedTrip(db)}`);
  await expect(page.getByRole("heading", { name: "Let's plan Kyoto" })).toBeVisible();
  await shot(page, "trip");

  // The full itinerary: beside the chat on desktop, behind the pinned bar on phone.
  let it = page.getByRole("complementary", { name: "Itinerary" });
  if (isPhone) {
    await page.getByRole("button", { name: /Show itinerary/ }).click();
    await expect(page.getByRole("dialog", { name: "Itinerary" }).getByRole("button", { name: /Fushimi Inari Shrine/ })).toBeVisible();
    await shot(page, "trip-peek");
    await page.getByRole("button", { name: "Open full itinerary" }).click();
    it = page.getByRole("dialog", { name: "Full itinerary" });
    await expect(it.getByRole("tab", { name: "Itinerary" })).toBeVisible();
    await shot(page, "trip-full");
  }

  const ideas = it.getByRole("region", { name: "Ideas" });
  await ideas.getByRole("button", { name: "Add an idea" }).scrollIntoViewIfNeeded();
  await shot(page, "trip-ideas");

  await it.getByRole("button", { name: "Day 2", exact: true }).click();
  await expect(it.getByText("Nothing planned yet.")).toBeVisible();
  await shot(page, "day-empty");

  await it.getByRole("tab", { name: "Packing" }).click();
  await expect(it.getByText(/Packing lists/)).toBeVisible();
  await shot(page, "tab-packing");
  await it.getByRole("tab", { name: "Itinerary" }).click();
  await it.getByRole("button", { name: "Day 1", exact: true }).click();

  await it.getByRole("button", { name: "Add to Day 1" }).click();
  const add = page.getByRole("dialog", { name: "Add to the day" });
  await expect(add.getByLabel("What")).toBeVisible();
  await shot(page, "item-new");
  await add.getByRole("radio", { name: "At a time" }).check();
  await expect(add.getByLabel("Starts")).toBeVisible();
  await shot(page, "item-new-timed");
  await closeDialog(page);

  await it.getByRole("button", { name: /Kiyomizu-dera/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit plan" }).getByLabel("What")).toHaveValue("Kiyomizu-dera");
  await shot(page, "item-edit");
  await closeDialog(page);

  await it.getByRole("button", { name: "Day 1 settings" }).click();
  await expect(page.getByRole("dialog", { name: "Day 1" }).getByLabel("Staying in")).toHaveValue("Kyoto");
  await shot(page, "day-settings");
  await closeDialog(page);

  await ideas.getByRole("button", { name: "Add Tea ceremony to a day" }).click();
  await expect(page.getByRole("dialog", { name: "Add to a day" }).getByRole("button", { name: "Day 4" })).toBeVisible();
  await shot(page, "idea-place");
  await closeDialog(page);

  await page.getByRole("button", { name: "Trip details" }).click();
  await expect(page.getByRole("dialog", { name: "Trip details" }).getByLabel("Trip name")).toHaveValue("Kyoto in spring");
  await shot(page, "trip-details");
  await closeDialog(page);

  // After an edit: the undo toast, and the changed card marked "just now". Both
  // clear on timers, so stop the page's clock while the pictures are taken.
  await page.clock.install();
  await it.getByRole("button", { name: "Add to Day 1" }).click();
  await add.getByLabel("What").fill("Philosopher's Path");
  await add.getByRole("radio", { name: "Morning" }).check();
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("status")).toContainText("Added “Philosopher's Path” to Day 1");
  await expect(it.getByRole("button", { name: /Philosopher's Path/ })).toContainText("just now");
  await it.getByRole("tabpanel").evaluate((panel) => panel.scrollTo(0, 0));
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await shot(page, "item-added");
});

async function closeDialog(page: Page) {
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
}
