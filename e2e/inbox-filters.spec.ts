import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

const RUN_TAG = `e2eFilter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const SENDER_EMAIL = `${RUN_TAG.toLowerCase()}@e2e.test`;
const SENDER_NAME = "E2E Filter Sender";
const BASE_SUBJECT = `${RUN_TAG} Filter Spec`;
// A unique token that appears ONLY in the body of the OLDEST message — used to
// prove the search now scans every message in a thread, not just the latest.
const DEEP_BODY_TOKEN = `deepneedle-${RUN_TAG}`.toLowerCase();

const SEED_MESSAGES: Array<{ subject: string; body: string }> = [
  { subject: BASE_SUBJECT, body: `First message — contains the deep token: ${DEEP_BODY_TOKEN}.` },
  { subject: `Re: ${BASE_SUBJECT}`, body: "Second reply — generic content." },
  { subject: `Fwd: ${BASE_SUBJECT}`, body: "Third forwarded — generic content." },
];

async function seedContactMessages(api: APIRequestContext): Promise<void> {
  for (const m of SEED_MESSAGES) {
    const res = await api.post("/api/contact", {
      data: {
        name: SENDER_NAME,
        email: SENDER_EMAIL,
        subject: m.subject,
        message: m.body,
      },
    });
    expect(res.ok(), `seed failed for "${m.subject}"`).toBeTruthy();
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function loginAsAdmin(api: APIRequestContext): Promise<void> {
  const res = await api.post("/api/login", {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `admin login failed (${res.status()})`).toBeTruthy();
}

async function cleanup(api: APIRequestContext): Promise<void> {
  try {
    const res = await api.get("/api/admin/contacts/threads");
    if (!res.ok()) return;
    const json = await res.json();
    const groups = (json?.threads ?? []) as Array<{
      memberIds: number[];
      latest: { email: string };
    }>;
    const ours = groups.find((g) => (g.latest?.email || "").toLowerCase() === SENDER_EMAIL);
    for (const id of ours?.memberIds || []) {
      await api.delete(`/api/contact/${id}`).catch(() => undefined);
    }
  } catch {
    // best-effort
  }
}

test.describe("admin inbox — thread search & reply filter (Task #31)", () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:5000";
    api = await pwRequest.newContext({ baseURL });
    await seedContactMessages(api);
  });

  test.afterAll(async () => {
    if (api) {
      await loginAsAdmin(api).catch(() => undefined);
      await cleanup(api);
      await api.dispose();
    }
  });

  test("search matches text from any message in a thread; count badge stays full", async ({ page }) => {
    const loginRes = await page.request.post("/api/login", {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto("/admin/inbox");
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 15_000 });

    // Search for a token that ONLY exists in the OLDEST message's body. Before
    // this task, the per-item filter would have hidden the thread (because
    // the latest message — the row that's actually rendered — doesn't contain
    // the token). After the change, the search runs at the thread level so
    // the row should still appear, with its full "{N} messages" badge intact.
    await page.getByTestId("input-search").fill(DEEP_BODY_TOKEN);

    const rowButtons = page.locator('[data-testid^="row-"][data-testid$="-button"]');
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    const threadCountBadges = page.locator('[data-testid^="badge-thread-count-"]');
    await expect(threadCountBadges).toHaveCount(1);
    // Badge must reflect the TOTAL message count for the thread (3), not the
    // number of messages that matched the search (1).
    await expect(threadCountBadges.first()).toHaveText(String(SEED_MESSAGES.length));
  });

  test('"Needs reply" filter shows un-replied threads and "Replied" hides them', async ({ page }) => {
    const loginRes = await page.request.post("/api/login", {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto("/admin/inbox");
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("input-search").fill(RUN_TAG);

    // Sanity: with the "All" reply filter the seeded thread is visible.
    const rowButtons = page.locator('[data-testid^="row-"][data-testid$="-button"]');
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    // The seeded thread has never been replied to → "Needs reply" should
    // still show it.
    await page.getByTestId("filter-reply-unreplied").click();
    await expect(rowButtons).toHaveCount(1);

    // Switching to "Replied" should hide it (no reply has ever been sent).
    await page.getByTestId("filter-reply-replied").click();
    await expect(rowButtons).toHaveCount(0, { timeout: 10_000 });

    // Reset via the clear-filters button.
    await page.getByTestId("button-clear-filters").click();
    await page.getByTestId("input-search").fill(RUN_TAG);
    await expect(rowButtons).toHaveCount(1);
  });
});
