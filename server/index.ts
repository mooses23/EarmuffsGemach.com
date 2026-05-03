import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import zlib from "node:zlib";
import { setupVite, serveStatic, log } from "./vite.js";
import { runStartupChecks } from "./startup-checks.js";

const app = express();

// --- Response compression -----------------------------------------------
// Per request we pick the best encoding the client supports:
//   * Brotli  (Accept-Encoding: br)  — implemented inline below
//   * Gzip    (everything else that compression() supports)
// The Stripe webhook path is always passthrough so the raw body stays intact
// for signature verification.
const COMPRESSIBLE_TYPE = /\b(text|json|javascript|css|svg|xml|html|wasm)\b/i;
const MIN_BYTES_FOR_BROTLI = 1024;

// Node's res.write/end accept (chunk, encoding?, cb?) where chunk may be
// string | Buffer | Uint8Array and the optional second arg may be either
// a BufferEncoding or a callback. These narrow types describe exactly that
// surface so we don't have to fall back to `any`.
type ChunkInput = string | Buffer | Uint8Array | null | undefined;
type WriteEncOrCb = BufferEncoding | ((err?: Error | null) => void) | undefined;
type WriteCb = ((err?: Error | null) => void) | undefined;

function toBuffer(chunk: ChunkInput, encOrCb: WriteEncOrCb): Buffer | undefined {
  if (chunk == null) return undefined;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === "string") {
    const enc: BufferEncoding = typeof encOrCb === "string" ? encOrCb : "utf8";
    return Buffer.from(chunk, enc);
  }
  return Buffer.from(chunk);
}

function brotliMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === "HEAD" || req.method === "OPTIONS") return next();

  const stream = zlib.createBrotliCompress({
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
    },
  });
  const _write = res.write.bind(res);
  const _end = res.end.bind(res);
  let initialized = false;
  let passthrough = false;
  let buffered = 0;

  const init = (sample?: Buffer) => {
    if (initialized) return;
    initialized = true;
    const ct = String(res.getHeader("content-type") || "");
    const existing = res.getHeader("content-encoding");
    const tooSmall = sample ? sample.length < MIN_BYTES_FOR_BROTLI : false;
    if (existing || !COMPRESSIBLE_TYPE.test(ct) || tooSmall) {
      passthrough = true;
      return;
    }
    res.setHeader("Content-Encoding", "br");
    res.setHeader("Vary", "Accept-Encoding");
    res.removeHeader("Content-Length");
    stream.on("data", (d: Buffer) => _write(d));
    stream.on("end", () => _end());
  };

  const wrappedWrite = function (
    chunk: ChunkInput,
    encOrCb?: WriteEncOrCb,
    cb?: WriteCb,
  ): boolean {
    const buf = toBuffer(chunk, encOrCb);
    init(buf);
    if (passthrough) return _write(chunk as Parameters<typeof _write>[0], encOrCb as Parameters<typeof _write>[1], cb);
    if (buf) {
      buffered += buf.length;
      return stream.write(buf, typeof encOrCb === "function" ? encOrCb : cb);
    }
    return true;
  };
  res.write = wrappedWrite as typeof res.write;

  const wrappedEnd = function (
    chunk?: ChunkInput,
    encOrCb?: WriteEncOrCb,
    cb?: WriteCb,
  ): Response {
    const buf = toBuffer(chunk, encOrCb);
    init(buf);
    if (passthrough) return _end(chunk as Parameters<typeof _end>[0], encOrCb as Parameters<typeof _end>[1], cb);
    if (buf) {
      buffered += buf.length;
      stream.write(buf);
    }
    if (buffered === 0) {
      // Nothing to compress; drop brotli headers and end cleanly.
      res.removeHeader("Content-Encoding");
      stream.removeAllListeners();
      stream.end();
      return _end();
    }
    stream.end();
    return res;
  };
  res.end = wrappedEnd as typeof res.end;

  next();
}

const gzipMiddleware = compression({
  threshold: MIN_BYTES_FOR_BROTLI,
  filter: (req, res) => {
    if (req.path === "/api/stripe/webhook") return false;
    return compression.filter(req, res);
  },
});

app.use((req, res, next) => {
  if (req.path === "/api/stripe/webhook") return next();
  const accept = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b/i.test(accept)) return brotliMiddleware(req, res, next);
  return gzipMiddleware(req, res, next);
});

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
