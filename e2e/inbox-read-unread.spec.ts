import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

// A known active location with the default operator PIN — used to test the
// PIN/operator auth path that previously blocked automated verification.
const OPERATOR_LOCATION_CODE = process.env.E2E_OPERATOR_CODE || "#4";
const OPERATOR_PIN = process.env.E2E_OPERATOR_PIN || "1234";

const RUN_TAG = `e2eReadUnread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const SENDER_EMAIL = `${RUN_TAG.toLowerCase()}@e2e.test`;
const SENDER_NAME = "E2E ReadUnread Sender";
const SUBJECT = `${RUN_TAG} Read Unread Spec`;

async function loginAsAdmin(api: APIRequestContext): Promise<void> {
  const res = await api.post("/api/login", {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `admin login failed (${res.status()})`).toBeTruthy();
}

async function seedContactMessage(api: APIRequestContext): Promise<number> {
  const res = await api.post("/api/contact", {
    data: {
      name: SENDER_NAME,
      email: SENDER_EMAIL,
      subject: SUBJECT,
      message: `Test body for read/unread spec. Tag: ${RUN_TAG}`,
    },
  });
  expect(res.ok(), "seed POST /api/contact failed").toBeTruthy();
  const json = await res.json();
  return json.id as number;
}

async function resetToUnread(api: APIRequestContext, id: number): Promise<void> {
  const res = await api.patch(`/api/contact/${id}`, {
    data: { isRead: false },
  });
  expect(res.ok(), `reset to unread failed for id=${id} (${res.status()})`).toBeTruthy();
}

async function cleanupContact(api: APIRequestContext, id: number): Promise<void> {
  await api.delete(`/api/contact/${id}`).catch(() => undefined);
}

// ─── Auth-path tests ───────────────────────────────────────────────────────
// These tests verify the two distinct authentication paths that can be used
// before accessing the inbox area, addressing the PIN auth blocker from Task #57.

test.describe("admin inbox — authentication paths (Task #61)", () => {
  test("operator PIN login via /auth UI redirects to operator dashboard, not admin inbox", async ({ page }) => {
    // Navigate to the /auth page (which shows the operator PIN tab by default)
    await page.goto("/auth");
    await expect(page.locator("text=Location Code").or(page.locator("label[for='locationCode']"))).toBeVisible({ timeout: 10_000 });

    // Fill in locationCode and PIN in the operator login form
    await page.locator("#locationCode").fill(OPERATOR_LOCATION_CODE);
    await page.locator("#pin").fill(OPERATOR_PIN);

    // Submit the operator login form
    await page.getByRole("button", { name: /login|sign in/i }).first().click();

    // Operator PIN login should redirect to /operator/dashboard, NOT to /admin/inbox
    await expect(page).toHaveURL(/\/operator(\/dashboard)?/, { timeout: 15_000 });
  });

  test("operator PIN session is blocked from /admin/inbox and redirected to auth", async ({ page }) => {
    // Authenticate as operator via the API (PIN-based session)
    const loginRes = await page.request.post("/api/operator/login", {
      data: { locationCode: OPERATOR_LOCATION_CODE, pin: OPERATOR_PIN },
    });
    expect(loginRes.ok(), `operator login failed (${loginRes.status()})`).toBeTruthy();

    // Set localStorage so the operator dashboard doesn't prompt again
    await page.addInitScript((locationData: string) => {
      try {
        window.localStorage.setItem("operatorLocation", locationData);
      } catch {
        // ignore
      }
    }, JSON.stringify({ code: OPERATOR_LOCATION_CODE }));

    // Attempt to access the admin-only inbox page
    await page.goto("/admin/inbox");

    // Should be redirected away since operator PIN doesn't grant admin role
    // The ProtectedRoute sends non-admin users to /auth or /
    await expect(page).not.toHaveURL(/\/admin\/inbox/, { timeout: 10_000 });
  });

  test("admin credentials via /auth UI (username+password tab) grant access to /admin/inbox", async ({ page }) => {
    // Navigate to /auth and switch to the admin login tab
    await page.goto("/auth");

    // The auth page has two tabs: "Operator" (default) and "Admin" — click the Admin tab
    // The tab triggers are shadcn TabsTrigger components with role="tab"
    await page.locator('[role="tab"]').filter({ hasText: "Admin" }).click();

    // Fill in admin credentials (react-hook-form controlled inputs with name attributes)
    await page.locator('input[name="username"]').fill(ADMIN_USERNAME);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();

    // After admin login, navigate to the admin inbox
    await page.goto("/admin/inbox");

    // Admin should be able to reach the inbox (search input is the loading sentinel)
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 20_000 });
  });
});

// ─── Core read/unread flow tests ─────────────────────────────────────────────

test.describe("admin inbox — mark as read / mark as unread (Task #61)", () => {
  let api: APIRequestContext;
  let contactId: number;

  test.beforeAll(async ({ playwright }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:5000";
    api = await pwRequest.newContext({ baseURL });
    await loginAsAdmin(api);
    contactId = await seedContactMessage(api);
  });

  test.afterAll(async () => {
    if (api) {
      await loginAsAdmin(api).catch(() => undefined);
      await cleanupContact(api, contactId);
      await api.dispose();
    }
  });

  test("inbox list renders items and source/read filter toggles work", async ({ page }) => {
    const loginRes = await page.request.post("/api/login", {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Ensure message starts unread for this test
    await resetToUnread(api, contactId);

    await page.goto("/admin/inbox");
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 15_000 });

    // Filter to our seeded message so assertions are deterministic
    await page.getByTestId("input-search").fill(RUN_TAG);

    const rowButtons = page.locator('[data-testid^="row-"][data-testid$="-button"]');
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    // Source filter: "Form" keeps it, "Email" hides it (seeded via form)
    await page.getByTestId("filter-source-form").click();
    await expect(rowButtons).toHaveCount(1, { timeout: 10_000 });

    await page.getByTestId("filter-source-email").click();
    await expect(rowButtons).toHaveCount(0, { timeout: 10_000 });

    // Reset source filter
    await page.getByTestId("filter-source-all").click();
    await expect(rowButtons).toHaveCount(1, { timeout: 10_000 });

    // Read filter: "Unread" shows it (seeded message is unread), "Read" hides it
    await page.getByTestId("filter-read-unread").click();
    await expect(rowButtons).toHaveCount(1, { timeout: 10_000 });

    await page.getByTestId("filter-read-read").click();
    await expect(rowButtons).toHaveCount(0, { timeout: 10_000 });

    // Reset to default
    await page.getByTestId("filter-read-all").click();
    await expect(rowButtons).toHaveCount(1, { timeout: 10_000 });
  });

  test("opening an unread item auto-marks it read and shows 'Mark as Unread' button", async ({ page }) => {
    const loginRes = await page.request.post("/api/login", {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Ensure the message is unread before this test
    await resetToUnread(api, contactId);

    await page.goto("/admin/inbox");
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("input-search").fill(RUN_TAG);

    const rowButtons = page.locator('[data-testid^="row-"][data-testid$="-button"]');
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    // Row should have the data-unread="true" attribute when the thread is unread
    await expect(rowButtons.first()).toHaveAttribute("data-unread", "true", { timeout: 5_000 });

    // Click to open the item — auto-marks as read
    await rowButtons.first().click();

    // Detail view: toggle button should now say "Mark as Unread" (item is read after opening)
    const toggleBtn = page.getByTestId("button-toggle-read");
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await expect(toggleBtn).toContainText("Mark as Unread");
  });

  test("clicking 'Mark as Unread' flips button to 'Mark as Read' and restores unread indicator in list", async ({ page }) => {
    const loginRes = await page.request.post("/api/login", {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Start in unread state
    await resetToUnread(api, contactId);

    await page.goto("/admin/inbox");
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("input-search").fill(RUN_TAG);

    const rowButtons = page.locator('[data-testid^="row-"][data-testid$="-button"]');
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    // Open item — auto-marks as read
    await rowButtons.first().click();

    const toggleBtn = page.getByTestId("button-toggle-read");
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await expect(toggleBtn).toContainText("Mark as Unread");

    // Click "Mark as Unread" — button should flip to "Mark as Read"
    await toggleBtn.click();
    await expect(toggleBtn).toContainText("Mark as Read", { timeout: 10_000 });

    // Go back to the inbox list
    await page.getByTestId("button-back-to-inbox").click();
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 10_000 });

    // Re-apply search so the row is visible
    await page.getByTestId("input-search").fill(RUN_TAG);
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    // The row should have data-unread="true" now that we marked it unread
    await expect(rowButtons.first()).toHaveAttribute("data-unread", "true", { timeout: 10_000 });
  });

  test("reply flow: reply UI renders, textarea accepts input, and send button is present", async ({ page }) => {
    const loginRes = await page.request.post("/api/login", {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Reset to unread so opening does not require extra steps
    await resetToUnread(api, contactId);

    await page.goto("/admin/inbox");
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("input-search").fill(RUN_TAG);

    const rowButtons = page.locator('[data-testid^="row-"][data-testid$="-button"]');
    await expect(rowButtons).toHaveCount(1, { timeout: 15_000 });

    // Open the item
    await rowButtons.first().click();

    // Wait for the detail view to load
    await expect(page.getByTestId("panel-thread-transcript")).toBeVisible({ timeout: 10_000 });

    // Reply textarea and send button must be visible
    const replyTextarea = page.getByTestId("textarea-reply-body");
    await expect(replyTextarea).toBeVisible({ timeout: 10_000 });

    const sendBtn = page.getByTestId("button-send-reply");
    await expect(sendBtn).toBeVisible();

    // Type a reply message
    const replyText = `Automated test reply — ${RUN_TAG}`;
    await replyTextarea.fill(replyText);
    await expect(replyTextarea).toHaveValue(replyText);

    // Click Send Reply — verify the button is interactive (it may show an error if Gmail is
    // not configured, but the UI action itself should fire without crashing the page).
    await sendBtn.click();

    // The page should remain on the detail view without crashing — thread transcript still visible
    await expect(page.getByTestId("panel-thread-transcript")).toBeVisible({ timeout: 10_000 });
  });
});
