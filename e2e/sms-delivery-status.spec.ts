import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// ─── Constants ───────────────────────────────────────────────────────────────

const OPERATOR_LOCATION_CODE = process.env.E2E_OPERATOR_CODE || "#4";
const OPERATOR_PIN           = process.env.E2E_OPERATOR_PIN  || "1234";

const RUN_TAG = `e2eSmsStatus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface OperatorLoginResult {
  locationId: number;
  locationJson: string; // full location object serialised as JSON (for localStorage)
}

/**
 * Logs in as operator via the API.
 * Returns the locationId plus the raw location JSON needed to prime localStorage
 * so the React frontend's useOperatorAuth hook can recognise the session.
 */
async function operatorLogin(api: APIRequestContext): Promise<OperatorLoginResult> {
  const res = await api.post("/api/operator/login", {
    data: { locationCode: OPERATOR_LOCATION_CODE, pin: OPERATOR_PIN },
  });
  expect(res.ok(), `operator login failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return {
    locationId: json.location.id as number,
    locationJson: JSON.stringify(json.location),
  };
}

/** Seeds a transaction + reminder event via the test-only endpoint. */
async function seedReminderEvent(
  api: APIRequestContext,
  locationId: number,
  opts: {
    borrowerName: string;
    twilioSid: string;
    deliveryStatus: string;
    deliveryErrorCode?: string;
    channel?: string;
  },
): Promise<number> {
  const res = await api.post("/api/test/seed-reminder-event", {
    data: {
      locationId,
      borrowerName: opts.borrowerName,
      twilioSid: opts.twilioSid,
      deliveryStatus: opts.deliveryStatus,
      channel: opts.channel ?? "sms",
      ...(opts.deliveryErrorCode ? { deliveryErrorCode: opts.deliveryErrorCode } : {}),
    },
  });
  expect(res.ok(), `seed reminder event failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const json = await res.json();
  return json.transactionId as number;
}

/** Marks the test transaction as returned so it disappears from dashboards. */
async function cleanup(api: APIRequestContext, transactionId: number): Promise<void> {
  await api.delete(`/api/test/transaction/${transactionId}`).catch(() => undefined);
}

/**
 * Navigates to the operator dashboard with a valid operator session.
 *
 * Two things are needed:
 * 1. A server-side session cookie – set by posting to /api/operator/login.
 * 2. The `operatorLocation` key in localStorage – the React hook reads this
 *    synchronously to decide whether to show the dashboard or redirect to /auth.
 *
 * We prime localStorage via page.addInitScript (which fires before the page JS
 * runs) and then do the server-side login so both checks pass.
 */
async function loginAndGoDashboard(
  page: Parameters<Parameters<typeof test>[2]>[0],
  locationJson: string,
  locationId: number,
): Promise<void> {
  // Set localStorage before ANY navigation so useOperatorAuth sees it immediately.
  // Also suppress the default-PIN change prompt (pinIsDefault=true for test locations
  // that use PIN "1234"), otherwise the modal blocks tab interaction.
  await page.addInitScript(({ locJson, locId }: { locJson: string; locId: number }) => {
    try {
      window.localStorage.setItem("operatorLocation", locJson);
      window.localStorage.setItem(`pinPromptSuppressed:${locId}`, "1");
    } catch { /* ignore */ }
  }, { locJson: locationJson, locId: locationId });

  // Server-side session cookie (required for API calls the dashboard makes)
  const loginRes = await page.request.post("/api/operator/login", {
    data: { locationCode: OPERATOR_LOCATION_CODE, pin: OPERATOR_PIN },
  });
  expect(loginRes.ok(), `page-level operator login failed: ${loginRes.status()}`).toBeTruthy();

  // Navigate to the dashboard
  await page.goto("/operator/dashboard");
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe("SMS delivery status timeline — Task #77", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: "Delivered" badge renders in the reminder history timeline
  // ──────────────────────────────────────────────────────────────────────────
  test("shows Delivered badge in reminder history when deliveryStatus=delivered", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:5000";
    const api = await pwRequest.newContext({ baseURL });

    const { locationId, locationJson } = await operatorLogin(api);
    const borrowerName = `E2E Delivered ${RUN_TAG}`;
    const twilioSid    = `SM_DELIVERED_${RUN_TAG}`;

    const transactionId = await seedReminderEvent(api, locationId, {
      borrowerName,
      twilioSid,
      deliveryStatus: "delivered",
    });

    try {
      await loginAndGoDashboard(page, locationJson, locationId);

      // Navigate to the Return tab of the operator dashboard
      const returnTab = page.locator('[role="tab"]').filter({ hasText: /return/i }).first();
      await expect(returnTab).toBeVisible({ timeout: 15_000 });
      await returnTab.click();

      // Step 1 of ReturnWizard: search for the test transaction by borrower name
      const searchInput = page.getByTestId("return-wizard-search");
      await expect(searchInput).toBeVisible({ timeout: 10_000 });
      await searchInput.fill(borrowerName);

      // Click the transaction row to select it
      const txRow = page.locator("button").filter({ hasText: borrowerName }).first();
      await expect(txRow).toBeVisible({ timeout: 10_000 });
      await txRow.click();

      // Click Next to advance to step 2 where the ReminderHistoryTimeline renders
      await page.getByRole("button", { name: /next/i }).click();

      // The DeliveryStatusBadge should show "delivered"
      const deliveredBadge = page.locator('[data-testid="reminder-delivery-status-delivered"]');
      await expect(deliveredBadge).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup(api, transactionId);
      await api.dispose();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Opted-out warning banner renders when deliveryStatus=opted_out
  // ──────────────────────────────────────────────────────────────────────────
  test("shows opted-out warning banner in reminder history when deliveryStatus=opted_out", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:5000";
    const api = await pwRequest.newContext({ baseURL });

    const { locationId, locationJson } = await operatorLogin(api);
    const borrowerName = `E2E OptOut ${RUN_TAG}`;
    const twilioSid    = `SM_OPTOUT_${RUN_TAG}`;

    const transactionId = await seedReminderEvent(api, locationId, {
      borrowerName,
      twilioSid,
      deliveryStatus: "opted_out",
      deliveryErrorCode: "21610",
    });

    try {
      await loginAndGoDashboard(page, locationJson, locationId);

      // Go to the Return tab
      const returnTab = page.locator('[role="tab"]').filter({ hasText: /return/i }).first();
      await expect(returnTab).toBeVisible({ timeout: 15_000 });
      await returnTab.click();

      // Search for the test transaction
      const searchInput = page.getByTestId("return-wizard-search");
      await expect(searchInput).toBeVisible({ timeout: 10_000 });
      await searchInput.fill(borrowerName);

      const txRow = page.locator("button").filter({ hasText: borrowerName }).first();
      await expect(txRow).toBeVisible({ timeout: 10_000 });
      await txRow.click();

      // Advance to step 2
      await page.getByRole("button", { name: /next/i }).click();

      // The opted-out warning banner must be visible in the timeline
      const optedOutWarning = page.locator(`[data-testid="reminder-opted-out-warning-${transactionId}"]`);
      await expect(optedOutWarning).toBeVisible({ timeout: 10_000 });

      // The opted_out status badge must also be rendered
      const optedOutBadge = page.locator('[data-testid="reminder-delivery-status-opted_out"]');
      await expect(optedOutBadge).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanup(api, transactionId);
      await api.dispose();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Twilio status-callback webhook updates the database row
  // ──────────────────────────────────────────────────────────────────────────
  test("POST /api/webhooks/twilio/status updates deliveryStatus in the database", async ({}, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:5000";
    const api = await pwRequest.newContext({ baseURL });

    const { locationId } = await operatorLogin(api);
    const borrowerName = `E2E Webhook ${RUN_TAG}`;
    const twilioSid    = `SM_WEBHOOK_${RUN_TAG}`;

    // Seed a reminder event with initial status=sent
    const transactionId = await seedReminderEvent(api, locationId, {
      borrowerName,
      twilioSid,
      deliveryStatus: "sent",
    });

    try {
      // Confirm the initial status is 'sent'
      const beforeRes = await api.get(`/api/test/reminder-event-by-sid/${encodeURIComponent(twilioSid)}`);
      expect(beforeRes.ok(), `pre-webhook GET failed: ${beforeRes.status()}`).toBeTruthy();
      const beforeEvent = await beforeRes.json();
      expect(beforeEvent.deliveryStatus).toBe("sent");

      // POST a fake Twilio delivery-status callback (no signature required in dev mode)
      const webhookRes = await api.post("/api/webhooks/twilio/status", {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: `MessageSid=${encodeURIComponent(twilioSid)}&MessageStatus=delivered`,
      });
      expect(
        webhookRes.status(),
        `webhook POST returned unexpected status ${webhookRes.status()}`,
      ).toBe(204);

      // Re-fetch and confirm the status was updated to 'delivered'
      const afterRes = await api.get(`/api/test/reminder-event-by-sid/${encodeURIComponent(twilioSid)}`);
      expect(afterRes.ok(), `post-webhook GET failed: ${afterRes.status()}`).toBeTruthy();
      const afterEvent = await afterRes.json();
      expect(afterEvent.deliveryStatus).toBe("delivered");
    } finally {
      await cleanup(api, transactionId);
      await api.dispose();
    }
  });
});
