import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { setupVite, serveStatic, log } from "./vite.js";
import { runStartupChecks } from "./startup-checks.js";

const app = express();

// Gzip/deflate every text-like response (HTML, JS, CSS, JSON). Keeps the
// landing page payload small without changing any markup. Express picks the
// best encoding the client's Accept-Encoding supports.
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      // Stripe webhook needs the raw body — don't ever transform it.
      if (req.path === "/api/stripe/webhook") return false;
      return compression.filter(req, res);
    },
  }),
);

// Cache headers for fingerprinted Vite assets. Anything served out of /assets/
// has a content-hash in the filename, so we can mark it immutable and let the
// browser keep it for a year. Plain non-hashed files (index.html, sw, …) keep
// the default no-cache behaviour.
app.use((req, res, next) => {
  if (req.method === "GET" && req.path.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  next();
});

(async () => {
  // Validate environment configuration FIRST, before importing any module
  // that touches env-derived clients (db, openai, stripe, twilio, …).
  // Several of those modules construct clients at import time and would
  // crash with a low-level "Missing credentials" error before this
  // checker could log a useful report. Importing them dynamically below
  // ensures runStartupChecks() always speaks first.
  await runStartupChecks();

  const { registerRoutes } = await import("./routes.js");
  const { WebhookHandlers } = await import("./webhookHandlers.js");
  const { startRefundReconciliation } = await import("./refund-reconciliation.js");
  const { backfillPendingCashPayments } = await import("./backfill-cash-payments.js");
  const { startSchemaSnapshotCron } = await import("./schema-snapshot.js");

  // CRITICAL: Register Stripe webhook route BEFORE express.json()
  // This is required because Stripe webhooks need the raw Buffer body
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }

      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;

        if (!Buffer.isBuffer(req.body)) {
          console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        await WebhookHandlers.processWebhook(req.body as Buffer, sig);

        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  // Now apply JSON middleware for all other routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    startRefundReconciliation();
    void backfillPendingCashPayments();
    // Task #177 — weekly schema-snapshot drift check; emails admin if the
    // live DB diverges from drizzle/schema-snapshot.sql.
    startSchemaSnapshotCron();
  });
})();
