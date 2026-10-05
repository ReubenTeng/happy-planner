import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { fixture } from "../fixtures";
import { testDatabase } from "../support/config";
import { db } from "../../src/lib/server/db";
import { createTrip, savePlan } from "../../src/lib/server/store";

process.env.DATABASE_URL = testDatabase;
let owner: string;
let state: Awaited<ReturnType<BrowserContext["storageState"]>>;
const email = `traveler-${randomUUID()}@example.test`;
test.beforeAll(async ({ browser, request }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  let messageId = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(
          "http://127.0.0.1:8025/api/v1/messages",
        );
        const data = await response.json();
        messageId =
          data.messages.find((m: { To: { Address: string }[] }) =>
            m.To.some((t) => t.Address === email),
          )?.ID ?? "";
        return messageId;
      },
      { timeout: 20000 },
    )
    .not.toBe("");
  const message = await (
    await request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`)
  ).json();
  const link = (message.HTML as string)
    .match(/href="([^"]+)"/)?.[1]
    .replaceAll("&amp;", "&");
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:9998\/auth\/v1\/verify/);
  await page.goto(link!);
  await expect(page).toHaveURL(/\/trips$/);
  await expect(
    page.getByRole("heading", { name: "Your journeys." }),
  ).toBeVisible();
  owner = (await db().query("SELECT id FROM users WHERE email=$1", [email]))
    .rows[0].id;
  state = await context.storageState();
  await context.close();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(state.cookies);
});
test.afterAll(async () => {
  if (owner) {
    await db().query(
      "DELETE FROM bookings WHERE trip_id IN(SELECT id FROM trips WHERE user_id=$1)",
      [owner],
    );
    await db().query("DELETE FROM users WHERE id=$1", [owner]);
    await db().query("DELETE FROM auth.users WHERE id=$1", [owner]);
  }
  await db().end();
});
async function seed() {
  const f = fixture();
  return {
    ...f,
    id: await createTrip(owner, f.request, f.plan, f.offers, f.trip.warnings),
  };
}

test("landing page renders without browser errors and scales to mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less planning. More possibility." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("travel preferences persist across refreshes", async ({ page }) => {
  await page.goto("/preferences");
  await page.getByRole("button", { name: "hiking", exact: true }).click();
  await page
    .getByLabel("Anything else we should know?")
    .fill("Vegetarian; prefer quiet mornings.");
  await page.getByRole("button", { name: "Save my travel style" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "hiking", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Anything else we should know?")).toHaveValue(
    "Vegetarian; prefer quiet mornings.",
  );
});
test("approval, private confirmation, sharing and revocation work together", async ({
  page,
  browser,
}) => {
  const f = await seed();
  await page.goto(`/trips/${f.id}`);
  await page.getByRole("tab", { name: "Booking checklist" }).click();
  await expect(
    page.getByRole("button", { name: "Review with provider" }).first(),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Approve this itinerary" }).click();
  await expect(
    page.getByRole("button", { name: "I’ve booked this" }).first(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "I’ve booked this" }).first().click();
  await page.getByLabel("Confirmation number").fill("PRIVATE-CONF-123");
  await page.getByLabel("Booking email").fill("private@example.test");
  await page.getByLabel("Final paid price (SGD)").fill("255.50");
  await page.getByRole("button", { name: "Save as booked" }).click();
  await expect(page.getByText("PRIVATE-CONF-123")).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create share link" }).click();
  const url = await page.getByLabel("Read-only trip link").inputValue();
  const publicContext = await browser.newContext();
  const shared = await publicContext.newPage();
  await shared.goto(url);
  await expect(
    shared.getByRole("heading", { name: f.plan.title }),
  ).toBeVisible();
  await expect(shared.locator("body")).not.toContainText("PRIVATE-CONF-123");
  await expect(shared.locator("body")).not.toContainText(
    "private@example.test",
  );
  await expect(
    shared.getByRole("button", { name: "Approve this itinerary" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Disable sharing" }).click();
  await expect(page.getByRole("status")).toContainText("Sharing is disabled");
  await shared.reload();
  await expect(
    shared.getByRole("heading", { name: "This path ends here." }),
  ).toBeVisible();
  await publicContext.close();
});
test("history restores an earlier version and mobile itinerary fits the viewport", async ({
  page,
}) => {
  const f = await seed();
  const changed = structuredClone(f.plan);
  changed.days[1].items[0].title = "A riverside walk";
  await savePlan(owner, f.id, changed, 1, "A little more nature");
  await page.goto(`/trips/${f.id}`);
  await expect(
    page.getByRole("heading", { name: "A riverside walk" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Explore the neighborhood" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/itinerary-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: "test-results/itinerary-mobile.png",
    fullPage: true,
  });
});
test("unauthenticated requests cannot read a private trip and cross-origin writes fail", async ({
  page,
  request,
}) => {
  const f = await seed();
  const response = await request.get(`/api/trips/${f.id}`);
  expect(response.status()).toBe(401);
  const status = await page.request.post(`/api/trips/${f.id}/approve`, {
    data: { version: 1 },
    headers: { origin: "https://evil.example" },
  });
  expect(status.status()).toBe(403);
});
test("missing AI credentials produce an honest failure without saving a fake trip", async ({
  page,
}) => {
  await page.goto("/trips/new");
  await page.getByLabel("Origin city").fill("Singapore");
  await page.getByLabel("Departure airport code").fill("SIN");
  await page.getByLabel("City or region").fill("Tokyo");
  await page.getByLabel("Arrival airport").fill("NRT");
  await page.getByLabel("Departure date", { exact: true }).fill("2027-03-05");
  await page.getByLabel("Return date", { exact: true }).fill("2027-03-07");
  await page.getByLabel("Total trip budget").fill("1500");
  await page.getByRole("button", { name: "Bring my journey to life" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "not configured" }),
  ).toBeVisible();
});
