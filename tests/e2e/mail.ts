import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
process.loadEnvFile(".env.local");
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";

type Message = { code: string; link: string };

/** Wait for the newest sign-in email to `email` in the local Mailpit inbox. */
export async function latestSignInEmail(email: string, timeoutMs = 15_000): Promise<Message> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string };
      const code = msg.HTML.match(/<strong>(\d{6})<\/strong>/)?.[1];
      const link = msg.HTML.match(/href="([^"]+\/auth\/confirm[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
      if (code && link) return { code, link };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No sign-in email for ${email}`);
}


/** Signs in with the emailed code. The account is created if `email` is new. */
export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const { code } = await latestSignInEmail(email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Generous: on a cold dev server this is the first time /trips is compiled.
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 });
}

/** Signs a brand-new user in with the emailed code. */
export async function signInNewUser(page: Page): Promise<string> {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  await signIn(page, email);
  return email;
}

export async function createTrip(page: Page, name: string, opts: { destination?: string; startDate?: string; days?: number } = {}) {
  await page.goto("/trips/new");
  await page.getByLabel("Trip name").fill(name);
  if (opts.destination) await page.getByLabel("Where to").fill(opts.destination);
  if (opts.startDate) await page.getByLabel("First day").fill(opts.startDate);
  await page.getByLabel("Days").fill(String(opts.days ?? 3));
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
}

/** The full itinerary: the side panel on desktop, the full sheet on phone. */
export async function openItinerary(page: Page, isPhone: boolean) {
  if (!isPhone) return page.getByRole("complementary", { name: "Itinerary" });
  await page.getByRole("button", { name: /Show itinerary/ }).click();
  await page.getByRole("button", { name: "Open full itinerary" }).click();
  return page.getByRole("dialog", { name: "Full itinerary" });
}
