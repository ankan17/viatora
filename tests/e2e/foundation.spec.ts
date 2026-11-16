import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { latestSignInEmail } from "./mail";

const freshEmail = () => `e2e-${randomUUID().slice(0, 8)}@example.test`;

async function requestCode(page: Page, email: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`We sent a sign-in link and a code to ${email}`)).toBeVisible();
}

test("sign in with a code, start a trip, and open it", async ({ page }, info) => {
  const email = freshEmail();
  await requestCode(page, email);

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();

  const { code } = await latestSignInEmail(email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByRole("heading", { name: "Where to first?" })).toBeVisible();
  await page.getByRole("link", { name: "Start a trip" }).click();

  await page.getByLabel("Trip name").fill("Summer in Portugal");
  await page.getByLabel("Where to").fill("Lisbon");
  await page.getByLabel("First day").fill("2027-07-30");
  await page.getByLabel("Days").fill("4");
  await page.getByRole("button", { name: "Start planning" }).click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Summer in Portugal")).toBeVisible();
  await expect(page.getByText("Day 1 · Fri 30 Jul").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Let's plan Lisbon" })).toBeVisible();

  const itinerary = page.getByRole("complementary", { name: "Itinerary" });
  if (info.project.name === "desktop") {
    await expect(itinerary.getByRole("button", { name: "Day 4" })).toBeVisible();
    await expect(itinerary.getByRole("heading", { name: "Day 1 · Fri 30 Jul" })).toBeVisible();
  } else {
    await expect(itinerary).toBeHidden();
  }

  await page.getByRole("link", { name: "Your trips" }).click();
  await expect(page.getByRole("link", { name: /Summer in Portugal\s*Lisbon · 30 Jul – 2 Aug/ })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the email link signs you in", async ({ page }) => {
  const email = freshEmail();
  await requestCode(page, email);
  const { link } = await latestSignInEmail(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/trips$/);

  // A used link can't be replayed.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/trips/new");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftrips%2Fnew$/);
});

test("other people's trips are not found", async ({ page }) => {
  const email = freshEmail();
  await requestCode(page, email);
  const { code } = await latestSignInEmail(email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/trips$/);

  await page.goto(`/trips/${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "We can't find that" })).toBeVisible();
});
