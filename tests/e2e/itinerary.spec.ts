import { expect, test, type Page } from "@playwright/test";
import { createTrip, signInNewUser } from "./mail";

/** The full itinerary: the side panel on desktop, the full sheet on phone. */
async function openItinerary(page: Page, isPhone: boolean) {
  if (!isPhone) return page.getByRole("complementary", { name: "Itinerary" });
  await page.getByRole("button", { name: /Show itinerary/ }).click();
  await page.getByRole("button", { name: "Open full itinerary" }).click();
  return page.getByRole("dialog", { name: "Full itinerary" });
}

const toast = (page: Page) => page.getByRole("status");

test("plan a day by hand, and undo", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Kyoto week", { destination: "Kyoto", startDate: "2027-04-05", days: 3 });
  const it = await openItinerary(page, isPhone);
  await expect(it.getByRole("heading", { name: "Day 1 · Mon 5 Apr" })).toBeVisible();

  // Add an item to the morning.
  await it.getByRole("button", { name: "Add to Day 1" }).click();
  const editor = page.getByRole("dialog", { name: "Add to the day" });
  await editor.getByLabel("What").fill("Fushimi Inari");
  await editor.getByRole("radio", { name: "Morning" }).check();
  await editor.getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Added “Fushimi Inari” to Day 1");
  const morning = it.locator("div", { has: page.getByRole("heading", { name: "Morning" }) }).last();
  await expect(morning.getByRole("button", { name: /Fushimi Inari/ })).toBeVisible();

  // Move it to the evening, then undo.
  await it.getByRole("button", { name: /Fushimi Inari/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit plan" });
  await edit.getByRole("radio", { name: "Evening" }).check();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toContainText("Moved “Fushimi Inari” to the evening");
  await expect(it.getByRole("heading", { name: "Evening" })).toBeVisible();
  await expect(it.getByRole("heading", { name: "Morning" })).toBeHidden();

  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(it.getByRole("heading", { name: "Morning" })).toBeVisible();
  await expect(it.getByRole("heading", { name: "Evening" })).toBeHidden();

  // A timed item, with a cost.
  await it.getByRole("button", { name: "Add to Day 1" }).click();
  await editor.getByLabel("What").fill("Lunch at Nishiki");
  await editor.getByLabel("Kind").selectOption("food");
  await editor.getByRole("radio", { name: "At a time" }).check();
  await editor.getByLabel("Starts").fill("12:30");
  await editor.getByLabel("Cost").fill("40");
  await editor.getByRole("button", { name: "Add" }).click();
  await expect(it.getByRole("button", { name: /Lunch at Nishiki.*Food · 12:30 · US\$40/ })).toBeVisible();
  await expect(it.getByRole("heading", { name: "Afternoon" })).toBeVisible();
});

test("ideas, days and trip details", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  await signInNewUser(page);
  await createTrip(page, "Lisbon long weekend", { days: 3 });
  const it = await openItinerary(page, isPhone);

  // An idea goes onto Day 2.
  await it.getByRole("button", { name: "Add an idea" }).click();
  const editor = page.getByRole("dialog", { name: "Add an idea" });
  await editor.getByLabel("What").fill("Tram 28");
  await editor.getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Added “Tram 28” to ideas");
  await it.getByRole("button", { name: "Add Tram 28 to a day" }).click();
  await page.getByRole("dialog", { name: "Add to a day" }).getByRole("button", { name: "Day 2" }).click();
  await expect(toast(page)).toContainText("Moved “Tram 28” to Day 2");
  await it.getByRole("button", { name: "Day 2", exact: true }).click();
  await expect(it.getByRole("button", { name: /Tram 28/ })).toBeVisible();

  // Remove Day 2: its plans go to ideas, and undo brings the day back.
  await it.getByRole("button", { name: "Day 2 settings" }).click();
  await page.getByRole("dialog", { name: "Day 2" }).getByRole("button", { name: "Remove day" }).click();
  await expect(toast(page)).toContainText("Removed Day 2 and moved 1 item to ideas");
  await expect(it.getByRole("button", { name: "Day 3", exact: true })).toHaveCount(0);
  await expect(it.getByRole("button", { name: "Add Tram 28 to a day" })).toBeVisible();
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(it.getByRole("button", { name: "Day 3", exact: true })).toBeVisible();
  await it.getByRole("button", { name: "Day 2", exact: true }).click();
  await expect(it.getByRole("button", { name: /Tram 28/ })).toBeVisible();

  // Name a day's city, then set dates.
  await it.getByRole("button", { name: "Day 2 settings" }).click();
  const day2 = page.getByRole("dialog", { name: "Day 2" });
  await day2.getByLabel("Staying in").fill("Sintra");
  await day2.getByRole("button", { name: "Save" }).click();
  await expect(it.getByRole("heading", { name: "Day 2 · Sintra" })).toBeVisible();

  await page.getByRole("button", { name: "Trip details" }).click();
  const details = page.getByRole("dialog", { name: "Trip details" });
  await details.getByLabel("First day").fill("2027-05-14");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toContainText("Set the trip dates");
  await expect(it.getByRole("heading", { name: "Day 2 · Sat 15 May · Sintra" })).toBeVisible();
});

test("the phone sheet peeks the day and closes back to chat", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await signInNewUser(page);
  await createTrip(page, "Peek test", { days: 2 });
  await page.getByRole("button", { name: /Show itinerary/ }).click();
  const sheet = page.getByRole("dialog", { name: "Itinerary" });
  await expect(sheet.getByRole("heading", { name: "Day 1" })).toBeVisible();
  await sheet.getByRole("button", { name: "Day 2", exact: true }).click();
  await expect(sheet.getByRole("heading", { name: "Day 2" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // The bar now shows the day in scope.
  await expect(page.getByRole("button", { name: /Peek test, Day 2\. Show itinerary/ })).toBeVisible();
});

// Reopen the editor in the same tick it closes, as a fast double action would.
test("reopening a dialog right after it closes keeps it open", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await signInNewUser(page);
  await createTrip(page, "Race", { days: 1 });
  const it = page.getByRole("complementary", { name: "Itinerary" });
  await it.getByRole("button", { name: "Add to Day 1" }).click();
  const d = page.getByRole("dialog", { name: "Add to the day" });
  await d.getByLabel("What").fill("First");
  // Click Add, then click "Add to Day 1" from page JS as soon as the dialog closes.
  await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")!;
    const reopen = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Add to Day 1"))!.click();
    new MutationObserver((_, obs) => {
      if (!dialog.open) {
        obs.disconnect();
        reopen();
      }
    }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Add")!.click();
  });
  await expect(page.getByRole("status")).toContainText("First");
  await page.waitForTimeout(500);
  await expect(d).toBeVisible();
  await expect(d.getByLabel("What")).toHaveValue("");
});
