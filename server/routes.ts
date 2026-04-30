import { randomUUID } from 'crypto';
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import * as _http from 'http';
import * as _https from 'https';
import * as _dns from 'dns';
import { storage } from "./storage.js";
import { PaymentSyncService } from "./payment-sync.js";
import { DepositSyncService } from "./deposit-sync.js";
import { DepositRefundService } from "./deposit-refund.js";
import { EmailNotificationService, sendOperatorWelcomeEmail, sendReturnReminderEmail, sendApplicationConfirmationEmail, sendAdminNewApplicationAlert } from "./email-notifications.js";
import { ensureSchemaUpgrades } from "./databaseStorage.js";
import { AuditTrailService } from "./audit-trail.js";
import { PaymentAnalyticsEngine } from "./analytics-engine.js";
import { DepositDetectionService } from "./deposit-detection.js";
import { DepositService, type UserRole } from "./depositService.js";
import { PayLaterService, prepareBorrowerStatusToken, commitBorrowerStatusToken, getMaxCardAgeDays, setMaxCardAgeDays, getRequirePreChargeNotification, setRequirePreChargeNotification } from "./payLaterService.js";
import { computeFeeForPaymentMethod } from "./depositFees.js";
import { buildCanonicalConsentText, resolveConsentLocale } from "./consentHelper.js";
import { getStripePublishableKey, getStripeClient } from "./stripeClient.js";
import { listEmails, listEmailThreads, getEmail, getThreadMessages, listSentThreadIds, markAsRead, markAsUnread, archiveEmail, unarchiveEmail, trashEmail, untrashEmail, markAsSpam, unmarkSpam, getLabelCounts, sendReply, sendNewEmail, getGmailConfigStatus, markThreadAsRead, markThreadAsUnread, archiveThread, unarchiveThread, trashThread, untrashThread, markThreadAsSpam, unmarkThreadSpam, type GmailListMode } from "./gmail-client.js";
import { getTwilioConfigStatus, sendReturnReminderSMS, normalizePhoneForSms, validateTwilioSignature } from "./twilio-client.js";
import {
  buildWelcomePreview,
  getOnboardingTwilioStatus,
  sendWelcomeForLocation,
  sendWelcomeForLocations,
  summarizeResults,
  ingestTwilioStatusCallback,
} from "./operatorOnboardingService.js";
import { OPERATOR_WELCOME_CHANNELS, OPERATOR_CONTACT_PREFERENCES, type PayLaterStatus } from "../shared/schema.js";
import { buildScenariosSeedBody, SCENARIOS_RESETTABLE_TITLES } from "../shared/scenarios-content.js";
import { scoreContactSpam } from "./spam-heuristic.js";
import { groupContactsByThread } from "./inbox-threading.js";
import {
  generateEmailResponse, translateText, generateWelcomeOpener,
  reindexFact, reindexFaq, reindexDoc, reindexReplyExample, backfillEmbeddings, seedKnowledgeDocs,
  migrateDomainInKnowledgeBase,
} from "./openai-client.js";
import { z } from "zod";
import { computeReplyWasEdited } from "./reply-edit-detection.js";

// Utility function to detect card brand
function detectCardBrand(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\D/g, '');
  const firstDigit = cleanNumber.charAt(0);
  const firstTwo = cleanNumber.substring(0, 2);
  const firstFour = cleanNumber.substring(0, 4);
  
  if (firstDigit === '4') return 'Visa';
  if (firstTwo >= '51' && firstTwo <= '55') return 'Mastercard';
  if (['34', '37'].includes(firstTwo)) return 'American Express';
  if (firstFour === '6011' || firstTwo === '65') return 'Discover';
  return 'Unknown';
}
import { 
  insertLocationSchema,
  insertRegionSchema,
  insertGemachApplicationSchema,
  insertContactSchema,
  insertTransactionSchema,
  insertPaymentSchema,
  insertPaymentMethodSchema,
  insertLocationPaymentMethodSchema,
  insertCityCategorySchema,
  insertReplyExampleSchema,
  insertFaqEntrySchema,
  insertKnowledgeDocSchema,
  operatorLoginSchema,
  HEADBAND_COLORS,
  APPLICATION_STATUSES,
  type InsertReplyExample,
  type Contact,
  type Location as LocationRow,
  type Transaction,
} from "../shared/schema.js";
import { setupAuth, requireRole, requireOperatorForLocation, createTestUsers } from "./auth.js";

// Per-transaction in-process mutex: serializes concurrent /refund-pay-later
// requests on the same transaction so they cannot both pass remaining-amount
// validation and both create Stripe refunds (over-refund). Single-process only.
const refundLocks = new Map<number, Promise<void>>();
async function withRefundLock<T>(transactionId: number, fn: () => Promise<T>): Promise<T> {
  while (refundLocks.has(transactionId)) {
    try { await refundLocks.get(transactionId); } catch { /* predecessor failed — proceed */ }
  }
  let release!: () => void;
  const lock = new Promise<void>((resolve) => { release = resolve; });
  refundLocks.set(transactionId, lock);
  try {
    return await fn();
  } finally {
    refundLocks.delete(transactionId);
    release();
  }
}

// Same in-process serialization for cash recording. Without this, two operators
// tapping "record cash" at the same instant could both pass the
// existingCash-check inside DepositService.initiateCashPayment and create
// duplicate completed cash payments. Single-process only — a multi-instance
// deploy still needs a DB-level partial unique index for full safety.
const cashLocks = new Map<number, Promise<void>>();
async function withCashLock<T>(transactionId: number, fn: () => Promise<T>): Promise<T> {
  while (cashLocks.has(transactionId)) {
    try { await cashLocks.get(transactionId); } catch { /* predecessor failed — proceed */ }
  }
  let release!: () => void;
  const lock = new Promise<void>((resolve) => { release = resolve; });
  cashLocks.set(transactionId, lock);
  try {
    return await fn();
  } finally {
    cashLocks.delete(transactionId);
    release();
  }
}

// Domains that should never appear in admin replies. Catches the old/incorrect
// gemach domain plus common misspellings/TLD swaps of the official gemach
// domain so that a typo doesn't get sent to recipients as a dead link.
//
// Scope note: this list is intentionally limited to GEMACH-related lookalikes
// (variants of babybanzgemach.com and earmuffsgemach.com). The "Baby Banz"
// brand site (babybanz.com) is NOT blocked — admins may legitimately link to
// the manufacturer.
//
// The list can be extended at runtime via the BLOCKED_DOMAINS_EXTRA env var,
// e.g.
//   BLOCKED_DOMAINS_EXTRA="example.com, evil.org; spam.net"
// Separators: comma, semicolon, or whitespace. Each entry is normalised to a
// bare lowercase hostname (scheme and leading "www." stripped, anything after
// the first "/" / "?" / "#" discarded) and must look like a hostname (a-z, 0-9,
// hyphen, dot, with a TLD of 2+ letters). Entries with ports (e.g.
// "evil.com:8080") or non-http schemes are intentionally skipped — to block
// those, list the bare hostname only. Subdomains of any blocked domain are
// also blocked automatically.
const HARDCODED_BLOCKED_DOMAINS: readonly string[] = [
  // Original incident: an obsolete domain that no longer belongs to the gemach.
  "babybanzgemach.com",
  // Plausible variants/misspellings of the obsolete domain.
  "babybanzgemach.org",
  "babybanzgemach.net",
  "babybanzgemach.co",
  "babybanzgmach.com",     // dropped "e"
  "babybanzgemmach.com",   // doubled "m"
  "babybanzgemache.com",   // trailing "e"
  "babybanzgemachs.com",   // pluralised
  "baby-banz-gemach.com",  // hyphenated
  // Plausible misspellings / TLD swaps of the OFFICIAL domain
  // (earmuffsgemach.com). The real domain itself is intentionally NOT on
  // this list — only typos that would land a recipient on a dead site.
  "earmuffsgemach.org",
  "earmuffsgemach.net",
  "earmuffsgemach.co",
  "earmuffgemach.com",     // missing trailing "s" on "earmuffs"
  "earmufsgemach.com",     // single "f"
  "earmuffsgmach.com",     // dropped "e" in "gemach"
  "earmuffsgemmach.com",   // doubled "m"
  "earmuffsgemache.com",   // trailing "e"
  "earmuffsgemachs.com",   // pluralised
  "ear-muffs-gemach.com",  // hyphenated
  "earmuff-gemach.com",
];

let cachedBlockedDomains: string[] | null = null;
let cachedBlockedDomainsKey = "";

function normalizeBlockedDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  // Bare hostname only — must contain a dot and no whitespace/invalid chars.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  return d;
}

function getBlockedDomains(): string[] {
  const extraRaw = process.env.BLOCKED_DOMAINS_EXTRA ?? "";
  if (cachedBlockedDomains && cachedBlockedDomainsKey === extraRaw) return cachedBlockedDomains;
  const extras = extraRaw
    .split(/[\s,;]+/)
    .map(normalizeBlockedDomain)
    .filter((d): d is string => d !== null);
  const merged = Array.from(new Set([...HARDCODED_BLOCKED_DOMAINS, ...extras]));
  cachedBlockedDomains = merged;
  cachedBlockedDomainsKey = extraRaw;
  return merged;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Create test users for demonstration
  await createTestUsers();

  // Apply lightweight schema upgrades (idempotent)
  await ensureSchemaUpgrades();
  // Idempotent: seeds /rules + common scenarios docs on first boot so the AI
  // has authoritative long-form context out of the box. Safe to call every start.
  // Chain migrateDomainInKnowledgeBase immediately after so any newly-created
  // docs are also covered by the domain replacement pass.
  seedKnowledgeDocs()
    .then(() => migrateDomainInKnowledgeBase())
    .catch(() => {});

  // Helper to check operator authorization - supports both Passport auth and PIN-based session
  function getOperatorLocationId(req: any): number | null {
    // First check Passport authentication
    if (req.isAuthenticated()) {
      const user = req.user as Express.User;
      if (user.isAdmin) return -1; // -1 indicates admin access
      if (user.role === 'operator' && user.locationId) return user.locationId;
    }
    // Then check PIN-based session
    const sessionLocationId = (req.session as any)?.operatorLocationId;
    if (sessionLocationId) return sessionLocationId;
    return null;
  }

  // HEALTH CHECK ENDPOINT (for Vercel monitoring)
  app.get("/api/health", async (req, res) => {
    try {
      await storage.getRegion(1);
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
        version: "1.0.0"
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: "Database connection failed"
      });
    }
  });

  // REGIONS ROUTES
  app.get("/api/regions", async (req, res) => {
    try {
      const regions = await storage.getAllRegions();
      res.json(regions);
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ message: "Failed to fetch regions" });
    }
  });

  app.post("/api/regions", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const parseResult = insertRegionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid region data", errors: parseResult.error.issues });
      }
      const region = await storage.createRegion(parseResult.data);
      res.status(201).json(region);
    } catch (error) {
      console.error("Error creating region:", error);
      res.status(500).json({ message: "Failed to create region" });
    }
  });

  app.patch("/api/regions/:id", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid region id" });
      const parseResult = insertRegionSchema.partial().safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid region data", errors: parseResult.error.issues });
      }
      const region = await storage.updateRegion(id, parseResult.data);
      res.json(region);
    } catch (error) {
      console.error("Error updating region:", error);
      res.status(500).json({ message: "Failed to update region" });
    }
  });

  // CITY CATEGORIES ROUTES
  app.get("/api/city-categories", async (req, res) => {
    try {
      const cityCategories = await storage.getAllCityCategories();
      res.json(cityCategories);
    } catch (error) {
      console.error("Error fetching city categories:", error);
      res.status(500).json({ message: "Failed to fetch city categories" });
    }
  });

  app.get("/api/regions/:regionId/city-categories", async (req, res) => {
    try {
      const regionId = parseInt(req.params.regionId, 10);
      const cityCategories = await storage.getCityCategoriesByRegionId(regionId);
      res.json(cityCategories);
    } catch (error) {
      console.error("Error fetching city categories by region:", error);
      res.status(500).json({ message: "Failed to fetch city categories" });
    }
  });

  app.post("/api/city-categories", async (req, res) => {
    try {
      const categoryData = insertCityCategorySchema.parse(req.body);
      const cityCategory = await storage.createCityCategory(categoryData);
      res.status(201).json(cityCategory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid city category data", errors: error.errors });
      }
      console.error("Error creating city category:", error);
      res.status(500).json({ message: "Failed to create city category" });
    }
  });

  // LOCATIONS ROUTES
  // Strip secrets from location rows for callers who aren't admins. Admin
  // sessions get the full row (status fields, defaults, contact prefs, etc.)
  // while everyone else (public site, operator dashboard) is shielded from
  // claim tokens, raw PIN, and per-channel error strings.
  function sanitizeLocationForViewer(loc: any, isAdmin: boolean) {
    if (isAdmin) return loc;
    const { claimToken, claimTokenCreatedAt, operatorPin, welcomeSmsError, welcomeWhatsappError, ...safe } = loc || {};
    return safe;
  }
  function viewerIsAdmin(req: any): boolean {
    return !!(req.isAuthenticated && req.isAuthenticated() && req.user?.isAdmin);
  }

  app.get("/api/locations", async (req, res) => {
    try {
      const locations = await storage.getAllLocations();
      const admin = viewerIsAdmin(req);
      res.json(locations.map((l) => sanitizeLocationForViewer(l, admin)));
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get("/api/regions/:slug/locations", async (req, res) => {
    try {
      const { slug } = req.params;
      const region = await storage.getRegionBySlug(slug);
      
      if (!region) {
        return res.status(404).json({ message: "Region not found" });
      }
      
      const locations = await storage.getLocationsByRegionId(region.id);
      const admin = viewerIsAdmin(req);
      res.json(locations.map((l) => sanitizeLocationForViewer(l, admin)));
    } catch (error) {
      console.error("Error fetching locations by region:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const locationData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(locationData);
      res.status(201).json(location);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid location data", errors: error.errors });
      }
      console.error("Error creating location:", error);
      res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.get("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const location = await storage.getLocation(id);
      
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      res.json(sanitizeLocationForViewer(location, viewerIsAdmin(req)));
    } catch (error) {
      console.error("Error fetching location:", error);
      res.status(500).json({ message: "Failed to fetch location" });
    }
  });

  app.patch("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const location = await storage.getLocation(id);
      
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      // Drizzle timestamp columns require Date objects, not ISO strings.
      // Convert any known timestamp fields that arrive as strings from JSON.
      const body = { ...req.body };
      const timestampFields = ["onboardedAt", "welcomeSentAt", "contactPreferenceSetAt"] as const;
      for (const field of timestampFields) {
        if (field in body) {
          body[field] = body[field] === null ? null : new Date(body[field]);
        }
      }

      const updatedLocation = await storage.updateLocation(id, body);
      res.json(updatedLocation);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const location = await storage.getLocation(id);
      
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      // Check if location has active transactions
      const transactions = await storage.getTransactionsByLocation(id);
      const activeTransactions = transactions.filter(t => !t.isReturned);
      
      if (activeTransactions.length > 0) {
        return res.status(400).json({ 
          message: `Cannot delete location with ${activeTransactions.length} active transactions. Please complete or transfer them first.` 
        });
      }
      
      await storage.deleteLocation(id);
      res.json({ message: "Location deleted successfully" });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  app.get("/api/locations/:locationId/transactions", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      
      if (isNaN(locationId)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }
      
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Admin (-1) can access any location, operators can only access their location
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const transactions = await storage.getTransactionsByLocation(locationId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching location transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Search transactions by phone number for quick borrower lookup
  app.get("/api/locations/:locationId/transactions/search", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const phone = req.query.phone as string;
      
      if (isNaN(locationId)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }
      
      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }
      
      const transactions = await storage.getTransactionByPhone(locationId, phone);
      res.json(transactions);
    } catch (error) {
      console.error("Error searching transactions:", error);
      res.status(500).json({ message: "Failed to search transactions" });
    }
  });

  // INVENTORY MANAGEMENT ROUTES
  // Get inventory for a location
  app.get("/api/locations/:locationId/inventory", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      
      if (isNaN(locationId)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const inventory = await storage.getInventoryByLocation(locationId);
      const total = await storage.getInventoryTotal(locationId);
      res.json({ inventory, total });
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  // Add stock by color
  app.post("/api/locations/:locationId/inventory", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const { color, quantity } = req.body;
      
      if (isNaN(locationId)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }
      
      if (!color || typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ message: "Color and positive quantity are required" });
      }
      
      if (!HEADBAND_COLORS.includes(color as any)) {
        return res.status(400).json({ message: `Invalid color. Must be one of: ${HEADBAND_COLORS.join(', ')}` });
      }
      
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const inventoryItem = await storage.adjustInventory(locationId, color, quantity);
      res.json(inventoryItem);
    } catch (error) {
      console.error("Error adding stock:", error);
      res.status(500).json({ message: "Failed to add stock" });
    }
  });

  // Remove stock by color (for lending or adjustment)
  app.delete("/api/locations/:locationId/inventory", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const { color, quantity } = req.body;
      
      if (isNaN(locationId)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }
      
      if (!color || typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ message: "Color and positive quantity are required" });
      }
      
      if (!HEADBAND_COLORS.includes(color as any)) {
        return res.status(400).json({ message: `Invalid color. Must be one of: ${HEADBAND_COLORS.join(', ')}` });
      }
      
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const inventoryItem = await storage.adjustInventory(locationId, color, -quantity);
      res.json(inventoryItem);
    } catch (error: any) {
      console.error("Error removing stock:", error);
      if (error.message?.includes("Insufficient stock")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to remove stock" });
    }
  });

  // Set inventory for a specific color (for adjustments)
  app.put("/api/locations/:locationId/inventory", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const { color, quantity } = req.body;
      
      if (isNaN(locationId)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }
      
      if (!color || typeof quantity !== 'number' || quantity < 0) {
        return res.status(400).json({ message: "Color and non-negative quantity are required" });
      }
      
      if (!HEADBAND_COLORS.includes(color as any)) {
        return res.status(400).json({ message: `Invalid color. Must be one of: ${HEADBAND_COLORS.join(', ')}` });
      }
      
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const inventoryItem = await storage.setInventoryItem(locationId, color, quantity);
      res.json(inventoryItem);
    } catch (error) {
      console.error("Error updating inventory:", error);
      res.status(500).json({ message: "Failed to update inventory" });
    }
  });

  // OPERATOR LOGIN ROUTE
  app.post("/api/operator/login", async (req, res) => {
    try {
      const validationResult = operatorLoginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid login data", errors: validationResult.error.errors });
      }
      
      const { locationCode, pin } = validationResult.data;
      
      const location = await storage.getLocationByCode(locationCode);
      
      if (!location) {
        return res.status(401).json({ message: "Invalid location code or PIN" });
      }
      
      if ((location.operatorPin || '1234') !== pin) {
        return res.status(401).json({ message: "Invalid location code or PIN" });
      }
      
      if (!location.isActive) {
        return res.status(403).json({ message: "This location is not active" });
      }
      
      // Store operator location in session for server-side auth
      (req.session as any).operatorLocationId = location.id;
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed - session error" });
        }
        
        const { operatorPin, ...locationWithoutPin } = location;
        res.json({ 
          success: true, 
          location: { ...locationWithoutPin, pinIsDefault: !operatorPin || operatorPin === '1234' }
        });
      });
    } catch (error) {
      console.error("Operator login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // OPERATOR LOGOUT ROUTE
  app.post("/api/operator/logout", (req, res) => {
    (req.session as any).operatorLocationId = undefined;
    res.json({ success: true });
  });

  // OPERATOR PIN CHANGE ROUTE (session-scoped, requires current PIN)
  app.patch("/api/operator/pin", async (req, res) => {
    try {
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId || operatorLocationId === -1) {
        return res.status(401).json({ message: "Operator authentication required" });
      }

      const pinChangeSchema = z.object({
        currentPin: z.string().min(4).max(6),
        newPin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be digits only"),
        confirmPin: z.string().min(4).max(6),
      });

      const parseResult = pinChangeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.errors });
      }

      const { currentPin, newPin, confirmPin } = parseResult.data;

      if (newPin !== confirmPin) {
        return res.status(400).json({ message: "New PIN and confirmation do not match" });
      }

      const location = await storage.getLocation(operatorLocationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      if ((location.operatorPin || '1234') !== currentPin) {
        return res.status(401).json({ message: "Current PIN is incorrect" });
      }

      await storage.updateLocation(operatorLocationId, { operatorPin: newPin });
      res.json({ success: true, message: "PIN updated successfully" });
    } catch (error) {
      console.error("Error changing operator PIN:", error);
      res.status(500).json({ message: "Failed to change PIN" });
    }
  });

  // ADMIN PIN CHANGE ROUTE (admin-only, no current PIN required)
  app.patch("/api/admin/locations/:id/pin", async (req, res) => {
    try {
      // Check admin authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Admin authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid location ID" });
      }

      const pinSchema = z.object({
        newPin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be digits only"),
        confirmPin: z.string().min(4).max(6),
      });

      const parseResult = pinSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.errors });
      }

      const { newPin, confirmPin } = parseResult.data;

      if (newPin !== confirmPin) {
        return res.status(400).json({ message: "PIN and confirmation do not match" });
      }

      const location = await storage.getLocation(id);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      await storage.updateLocation(id, { operatorPin: newPin });
      res.json({ success: true, message: "PIN updated successfully" });
    } catch (error) {
      console.error("Error changing admin PIN:", error);
      res.status(500).json({ message: "Failed to change PIN" });
    }
  });

  // Send operator welcome / setup email for a single location
  app.post("/api/admin/locations/:id/send-welcome", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid location ID" });

      const location = await storage.getLocation(id);
      if (!location) return res.status(404).json({ message: "Location not found" });
      if (!location.email) return res.status(400).json({ message: "Location has no email on file" });
      if (!location.locationCode) return res.status(400).json({ message: "Location has no location code" });

      const baseUrl = process.env.APP_URL || process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
      const dashboardUrl = `${baseUrl.replace(/\/$/, '')}/operator/login`;
      const opener = await generateWelcomeOpener({
        locationName: location.name,
        operatorName: location.contactPerson || '',
        city: location.address || '',
      });
      await sendOperatorWelcomeEmail({
        locationName: location.name,
        locationCode: location.locationCode,
        operatorName: location.contactPerson || '',
        operatorEmail: location.email,
        dashboardUrl,
        defaultPin: location.operatorPin || '1234',
        opener,
      });
      res.json({ success: true, sentTo: location.email });
    } catch (error: any) {
      console.error("Error sending welcome email:", error);
      res.status(500).json({ message: error.message || "Failed to send welcome email" });
    }
  });

  // Bulk-send welcome emails to all active locations with email + code
  app.post("/api/admin/locations/send-welcome-all", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const locations = await storage.getAllLocations();
      const baseUrl = process.env.APP_URL || process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
      const dashboardUrl = `${baseUrl.replace(/\/$/, '')}/operator/login`;
      const results: { id: number; name: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }[] = [];
      for (const loc of locations) {
        if ((loc as any).isActive === false) {
          results.push({ id: loc.id, name: loc.name, status: 'skipped', reason: 'inactive' });
          continue;
        }
        if (!loc.email || !loc.locationCode) {
          results.push({ id: loc.id, name: loc.name, status: 'skipped', reason: 'missing email or code' });
          continue;
        }
        try {
          const opener = await generateWelcomeOpener({
            locationName: loc.name,
            operatorName: loc.contactPerson || '',
            city: loc.address || '',
          });
          await sendOperatorWelcomeEmail({
            locationName: loc.name,
            locationCode: loc.locationCode,
            operatorName: loc.contactPerson || '',
            operatorEmail: loc.email,
            dashboardUrl,
            defaultPin: loc.operatorPin || '1234',
            opener,
          });
          results.push({ id: loc.id, name: loc.name, status: 'sent' });
        } catch (err: any) {
          results.push({ id: loc.id, name: loc.name, status: 'failed', reason: err?.message || 'send error' });
        }
      }
      const sent = results.filter(r => r.status === 'sent').length;
      const skipped = results.filter(r => r.status === 'skipped').length;
      const failed = results.filter(r => r.status === 'failed').length;
      res.json({ success: true, sent, skipped, failed, results });
    } catch (error: any) {
      console.error("Error bulk-sending welcome emails:", error);
      res.status(500).json({ message: error.message || "Failed to bulk-send welcome emails" });
    }
  });

  // ===== Operator onboarding (Task #35) =====
  // SMS + WhatsApp welcome flow. Routes are admin-gated except the public
  // /api/welcome/:token claim/complete endpoints.

  function requireOnboardingAdmin(req: Request, res: Response): boolean {
    if (!req.isAuthenticated || !req.isAuthenticated() || !(req.user as { isAdmin?: boolean } | undefined)?.isAdmin) {
      res.status(403).json({ message: "Admin access required" });
      return false;
    }
    return true;
  }

  function getOnboardingBaseUrl(req: Request): string {
    return process.env.APP_URL || process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  }
  function getOnboardingStatusCallbackUrl(req: Request): string {
    return `${getOnboardingBaseUrl(req).replace(/\/$/, '')}/api/twilio/onboarding-status`;
  }
  /**
   * Personal sign-off appended to operator welcome messages. The spec calls
   * for a heimish, named-human voice (e.g. "— Chaya, Earmuffs Gemach").
   * Configurable via env so the gemach owner can update without a redeploy;
   * if unset we fall back to "Chaya, Earmuffs Gemach" (the gemach owner's
   * name) instead of the generic org name.
   */
  function getOperatorWelcomeSigner(): string {
    const fromEnv = (process.env.OPERATOR_WELCOME_SIGNER || '').trim();
    return fromEnv || 'Chaya, Earmuffs Gemach';
  }

  const onboardingChannelSchema = z.enum(OPERATOR_WELCOME_CHANNELS);

  // Twilio status callback (delivered / undelivered / failed). Twilio POSTs
  // form-encoded bodies; we map them to the per-channel status fields. We
  // always reply 200 so Twilio doesn't retry storms — failures are logged.
  app.post('/api/twilio/onboarding-status', async (req, res) => {
    try {
      // Verify Twilio's HMAC-SHA1 signature so attackers can't forge status
      // updates and poison admin delivery visibility. We always reply 200
      // so Twilio doesn't enter retry storms even when we reject.
      const sigStatus = validateTwilioSignature(req, getOnboardingStatusCallbackUrl(req));
      if (sigStatus === 'invalid' || sigStatus === 'missing') {
        // In production with TWILIO_AUTH_TOKEN configured, missing/invalid
        // signature means the caller isn't Twilio. Drop silently with 200.
        if (process.env.NODE_ENV === 'production') {
          console.warn('[twilio-status] dropping unsigned/forged callback:', sigStatus, 'sid:', req.body?.MessageSid);
          return res.status(200).send('');
        }
        // Dev: log but accept so local Twilio CLI replays still work.
        console.warn('[twilio-status] signature', sigStatus, '(dev mode, accepting)');
      }
      const result = await ingestTwilioStatusCallback(req.body || {});
      if (!result.matched) {
        // Could be a status callback for a non-onboarding message, or an
        // SID we don't track yet. Still return 200 so Twilio is happy.
        console.log('[twilio-status] no row matched for sid:', req.body?.MessageSid);
      }
      res.status(200).end();
    } catch (e: any) {
      console.error('[twilio-status] handler failed:', e);
      res.status(200).end();
    }
  });

  // Twilio config status (admin), so the UI can disable channels and explain why.
  app.get('/api/admin/twilio-status', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;
    res.json(await getOnboardingTwilioStatus());
  });

  // Live message preview (EN + HE) before sending. GET is intentional —
  // this is a read-only computation off of the location row.
  app.get('/api/admin/locations/:id/onboarding-preview', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid location ID' });
      const loc = await storage.getLocation(id);
      if (!loc) return res.status(404).json({ message: 'Location not found' });
      const baseUrl = getOnboardingBaseUrl(req);
      res.json(await buildWelcomePreview(loc, baseUrl, getOperatorWelcomeSigner()));
    } catch (e: any) {
      res.status(500).json({ message: e?.message || 'Failed to build preview' });
    }
  });

  // Single location onboarding send.
  app.post('/api/admin/locations/:id/send-onboarding-welcome', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid location ID' });
      const parsed = z.object({
        channel: onboardingChannelSchema,
        rememberAsDefault: z.boolean().optional(),
        messageBody: z.string().optional(),
        customMessage: z.boolean().optional(),
      }).safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
      }
      const baseUrl = getOnboardingBaseUrl(req);
      const sentByUserId = (req.user as any)?.id ?? undefined;
      const result = await sendWelcomeForLocation(id, {
        channel: parsed.data.channel,
        baseUrl,
        rememberAsDefault: parsed.data.rememberAsDefault,
        statusCallbackUrl: getOnboardingStatusCallbackUrl(req),
        signOff: getOperatorWelcomeSigner(),
        messageBody: parsed.data.messageBody,
        customMessage: parsed.data.customMessage,
        sentByUserId,
      });
      res.json({
        success: result.ok,
        results: {
          sms: result.sms,
          whatsapp: result.whatsapp,
          email: result.email,
          anySuccess: !!(result.sms?.ok || result.whatsapp?.ok || result.email?.ok),
        },
        location: { id: result.locationId, name: result.locationName },
      });
    } catch (e: any) {
      console.error('[onboarding] single send failed:', e);
      res.status(500).json({ message: e?.message || 'Send failed' });
    }
  });

  // Bulk send to a hand-picked list of location ids. Accepts either
  // `locationIds` (preferred, matches the admin UI) or legacy `ids`.
  app.post('/api/admin/locations/onboarding/send-bulk', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;
    try {
      const parsed = z.object({
        locationIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
        ids: z.array(z.number().int().positive()).min(1).max(200).optional(),
        channel: onboardingChannelSchema,
        rememberAsDefault: z.boolean().optional(),
        messageBody: z.string().optional(),
        customMessage: z.boolean().optional(),
      }).safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
      }
      const ids = parsed.data.locationIds ?? parsed.data.ids;
      if (!ids || ids.length === 0) {
        return res.status(400).json({ message: 'locationIds is required' });
      }
      const baseUrl = getOnboardingBaseUrl(req);
      const batchId = randomUUID();
      const sentByUserId = (req.user as any)?.id ?? undefined;
      const results = await sendWelcomeForLocations(ids, {
        channel: parsed.data.channel,
        baseUrl,
        rememberAsDefault: parsed.data.rememberAsDefault,
        statusCallbackUrl: getOnboardingStatusCallbackUrl(req),
        signOff: getOperatorWelcomeSigner(),
        messageBody: parsed.data.messageBody,
        customMessage: parsed.data.customMessage,
        batchId,
        sentByUserId,
      });
      res.json({ success: true, summary: summarizeResults(results), results });
    } catch (e: any) {
      console.error('[onboarding] bulk send failed:', e);
      res.status(500).json({ message: e?.message || 'Bulk send failed' });
    }
  });

  // SSE streaming variant of send-bulk — emits one progress event per location.
  app.post('/api/admin/locations/onboarding/send-bulk-stream', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;

    const parsed = z.object({
      locationIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
      ids: z.array(z.number().int().positive()).min(1).max(200).optional(),
      channel: onboardingChannelSchema,
      rememberAsDefault: z.boolean().optional(),
      messageBody: z.string().optional(),
      customMessage: z.boolean().optional(),
    }).safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
    }
    const ids = parsed.data.locationIds ?? parsed.data.ids;
    if (!ids || ids.length === 0) {
      return res.status(400).json({ message: 'locationIds is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      const total = ids.length;
      emit({ type: 'start', total });

      const batchId = randomUUID();
      const sentByUserId = (req.user as any)?.id ?? undefined;
      const options = {
        channel: parsed.data.channel,
        baseUrl: getOnboardingBaseUrl(req),
        rememberAsDefault: parsed.data.rememberAsDefault,
        statusCallbackUrl: getOnboardingStatusCallbackUrl(req),
        signOff: getOperatorWelcomeSigner(),
        messageBody: parsed.data.messageBody,
        customMessage: parsed.data.customMessage,
        batchId,
        sentByUserId,
      };

      const results: Awaited<ReturnType<typeof sendWelcomeForLocation>>[] = [];
      for (let i = 0; i < ids.length; i++) {
        const locId = ids[i];
        let r: Awaited<ReturnType<typeof sendWelcomeForLocation>>;
        try {
          r = await sendWelcomeForLocation(locId, options);
        } catch (e: any) {
          console.error(`[onboarding] unexpected error for location ${locId}:`, e?.message);
          r = {
            locationId: locId,
            locationName: `Location ${locId}`,
            channel: options.channel,
            ok: false,
            sms: options.channel !== 'email' ? { ok: false, error: e?.message || 'Unexpected error' } : undefined,
            email: options.channel === 'email' ? { ok: false, error: e?.message || 'Unexpected error' } : undefined,
          };
        }
        results.push(r);
        const locName = r.locationName ?? `Location ${locId}`;
        const errorMsg = !r.ok && !r.skipped
          ? (r.sms?.error || r.whatsapp?.error || r.email?.error || 'Send failed')
          : undefined;
        emit({ type: 'progress', n: i + 1, total, name: locName, ok: r.ok, skipped: !!r.skipped, error: errorMsg });
        if (i < ids.length - 1) await new Promise((resolve) => setTimeout(resolve, 200));
      }

      emit({ type: 'done', summary: summarizeResults(results), results });
      res.end();
    } catch (e: any) {
      console.error('[onboarding] send-bulk-stream failed:', e);
      emit({ type: 'error', message: e?.message || 'Bulk send failed' });
      res.end();
    }
  });

  // Send to every active, not-yet-onboarded location.
  app.post('/api/admin/locations/onboarding/send-all', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;
    try {
      const parsed = z.object({
        channel: onboardingChannelSchema,
        rememberAsDefault: z.boolean().optional(),
        messageBody: z.string().optional(),
        customMessage: z.boolean().optional(),
      }).safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
      }
      const all = await storage.getAllLocations();
      // Filter eligible locations based on channel requirements.
      // SMS needs a phone; Email needs an email address.
      const ch = parsed.data.channel;
      const candidateIds = all
        .filter((loc) => {
          if (loc.isActive === false || loc.onboardedAt) return false;
          if (ch === 'sms') return !!loc.phone;
          if (ch === 'whatsapp') return !!loc.phone;
          if (ch === 'email') return !!loc.email;
          // 'both': at least one channel must be available
          return !!loc.phone || !!loc.email;
        })
        .map((loc) => loc.id);
      if (candidateIds.length === 0) {
        return res.json({ success: true, eligible: 0, summary: { sent: 0, failed: 0, skipped: 0, total: 0 }, results: [] });
      }
      const baseUrl = getOnboardingBaseUrl(req);
      const batchId = randomUUID();
      const sentByUserId = (req.user as any)?.id ?? undefined;
      const results = await sendWelcomeForLocations(candidateIds, {
        channel: parsed.data.channel,
        baseUrl,
        rememberAsDefault: parsed.data.rememberAsDefault,
        statusCallbackUrl: getOnboardingStatusCallbackUrl(req),
        signOff: getOperatorWelcomeSigner(),
        messageBody: parsed.data.messageBody,
        customMessage: parsed.data.customMessage,
        batchId,
        sentByUserId,
      });
      res.json({ success: true, eligible: candidateIds.length, summary: summarizeResults(results), results });
    } catch (e: any) {
      console.error('[onboarding] send-all failed:', e);
      res.status(500).json({ message: e?.message || 'Send-all failed' });
    }
  });

  // SSE streaming variant — emits one progress event per location so the UI
  // can show a live log bar without polling.
  app.post('/api/admin/locations/onboarding/send-all-stream', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;

    const parsed = z.object({
      channel: onboardingChannelSchema,
      rememberAsDefault: z.boolean().optional(),
      messageBody: z.string().optional(),
      customMessage: z.boolean().optional(),
    }).safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      const all = await storage.getAllLocations();
      const ch = parsed.data.channel;
      const candidates = all.filter((loc) => {
        if (loc.isActive === false || loc.onboardedAt) return false;
        if (ch === 'sms') return !!loc.phone;
        if (ch === 'whatsapp') return !!loc.phone;
        if (ch === 'email') return !!loc.email;
        return !!loc.phone || !!loc.email;
      });

      const total = candidates.length;
      if (total === 0) {
        emit({ type: 'done', eligible: 0, summary: { sent: 0, failed: 0, skipped: 0, total: 0 }, results: [] });
        res.end();
        return;
      }

      emit({ type: 'start', total });

      const batchId = randomUUID();
      const sentByUserId = (req.user as any)?.id ?? undefined;
      const options = {
        channel: parsed.data.channel,
        baseUrl: getOnboardingBaseUrl(req),
        rememberAsDefault: parsed.data.rememberAsDefault,
        statusCallbackUrl: getOnboardingStatusCallbackUrl(req),
        signOff: getOperatorWelcomeSigner(),
        messageBody: parsed.data.messageBody,
        customMessage: parsed.data.customMessage,
        batchId,
        sentByUserId,
      };

      const results: Awaited<ReturnType<typeof sendWelcomeForLocation>>[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const loc = candidates[i];
        let r: Awaited<ReturnType<typeof sendWelcomeForLocation>>;
        try {
          r = await sendWelcomeForLocation(loc.id, options);
        } catch (e: any) {
          console.error(`[onboarding] unexpected error for location ${loc.id}:`, e?.message);
          r = {
            locationId: loc.id,
            locationName: loc.name,
            channel: options.channel,
            ok: false,
            sms: options.channel !== 'email' ? { ok: false, error: e?.message || 'Unexpected error' } : undefined,
            email: options.channel === 'email' ? { ok: false, error: e?.message || 'Unexpected error' } : undefined,
          };
        }
        results.push(r);
        const errorMsg = !r.ok && !r.skipped
          ? (r.sms?.error || r.whatsapp?.error || r.email?.error || 'Send failed')
          : undefined;
        emit({ type: 'progress', n: i + 1, total, name: loc.name, ok: r.ok, skipped: !!r.skipped, error: errorMsg });
        if (i < candidates.length - 1) await new Promise((resolve) => setTimeout(resolve, 200));
      }

      emit({ type: 'done', eligible: total, summary: summarizeResults(results), results });
      res.end();
    } catch (e: any) {
      console.error('[onboarding] send-all-stream failed:', e);
      emit({ type: 'error', message: e?.message || 'Send-all failed' });
      res.end();
    }
  });

  // GET /api/admin/message-send-logs — persistent send history (admin only)
  app.get('/api/admin/message-send-logs', async (req, res) => {
    if (!requireOnboardingAdmin(req, res)) return;
    try {
      const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : 500;
      const logs = await storage.getMessageSendLogs({ locationId, limit });
      res.json(logs);
    } catch (e: any) {
      console.error('[message-send-logs] fetch failed:', e);
      res.status(500).json({ message: e?.message || 'Failed to fetch send logs' });
    }
  });

  // Public: resolve a claim token to a (sanitized) location and onboarding state.
  app.get('/api/welcome/:token', async (req, res) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) return res.status(400).json({ message: 'Missing token' });
      const loc = await storage.getLocationByClaimToken(token);
      if (!loc) return res.status(404).json({ message: 'This link is no longer valid.' });
      // Per spec, welcome links don't expire and stay reusable. The page
      // short-circuits to "already onboarded → go to dashboard" when the
      // location is already onboarded.
      const { operatorPin, claimToken, claimTokenCreatedAt, welcomeSmsError, welcomeWhatsappError, ...safe } = loc as LocationRow;
      res.json({
        location: {
          ...safe,
          pinIsDefault: (operatorPin || '') === '1234' || !operatorPin,
        },
        alreadyOnboarded: !!loc.onboardedAt,
      });
    } catch (e: any) {
      console.error('[onboarding] welcome resolve failed:', e);
      res.status(500).json({ message: 'Could not load this welcome link.' });
    }
  });

  // Public: re-entry auto-login for an already-onboarded location.
  // Tokens are durable+reusable per spec, so opening the welcome link from
  // any device for an onboarded location should drop the operator straight
  // into their dashboard. Establishes the same server session that
  // /api/operator/login and /api/welcome/:token/complete do.
  app.post('/api/welcome/:token/session', async (req, res) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) return res.status(400).json({ message: 'Missing token' });
      const loc = await storage.getLocationByClaimToken(token);
      if (!loc) return res.status(404).json({ message: 'This link is no longer valid.' });
      if (!loc.onboardedAt) {
        // Not onboarded yet — caller must run the full /complete flow first.
        return res.status(409).json({ message: 'This location has not completed onboarding yet.' });
      }
      (req.session as any).operatorLocationId = loc.id;
      req.session.save((err) => {
        if (err) {
          console.error('[onboarding] re-entry session save failed:', err);
          return res.status(500).json({ message: 'Could not establish your session.' });
        }
        const { operatorPin, claimToken, claimTokenCreatedAt, welcomeSmsError, welcomeWhatsappError, ...safe } = loc as LocationRow;
        res.json({ success: true, location: { ...safe, pinIsDefault: (operatorPin || '') === '1234' || !operatorPin } });
      });
    } catch (e: any) {
      console.error('[onboarding] welcome re-entry session failed:', e);
      res.status(500).json({ message: 'Could not establish your session.' });
    }
  });

  // Public: complete the welcome flow (name, email, contact pref, new PIN)
  // and auto-login the operator into the dashboard.
  app.post('/api/welcome/:token/complete', async (req, res) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) return res.status(400).json({ message: 'Missing token' });
      const parsed = z.object({
        contactPerson: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(200),
        contactPreference: z.enum(OPERATOR_CONTACT_PREFERENCES),
        newPin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
        confirmPin: z.string().regex(/^\d{4,6}$/, 'Confirm PIN must be 4-6 digits'),
      }).safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: 'Please review the form.', errors: parsed.error.errors });
      }
      if (parsed.data.newPin !== parsed.data.confirmPin) {
        return res.status(400).json({ message: 'PIN and confirmation do not match.' });
      }
      if (parsed.data.newPin === '1234') {
        return res.status(400).json({ message: 'Please choose a PIN other than 1234.' });
      }
      // Pre-check (for clean error messages) — but the actual write below is
      // a single atomic UPDATE conditioned on (claimToken matches AND not yet
      // onboarded), so concurrent /complete calls with the same token cannot
      // both succeed.
      const loc = await storage.getLocationByClaimToken(token);
      if (!loc) return res.status(404).json({ message: 'This link is no longer valid.' });
      if (loc.onboardedAt) {
        return res.status(409).json({ message: 'This location has already been onboarded. Please log in with your code and PIN.' });
      }

      const updated = await storage.completeOperatorOnboardingByToken(token, {
        contactPerson: parsed.data.contactPerson,
        email: parsed.data.email,
        operatorPin: parsed.data.newPin,
        contactPreference: parsed.data.contactPreference,
      });
      if (!updated) {
        return res.status(409).json({ message: 'This location has just been onboarded from another device. Please log in with your code and PIN.' });
      }

      // Auto-login: same session shape as /api/operator/login.
      (req.session as any).operatorLocationId = updated.id;
      req.session.save((err) => {
        if (err) {
          console.error('[onboarding] session save failed:', err);
          return res.status(500).json({ message: 'Saved your details, but login failed. Please log in manually.' });
        }
        const { operatorPin, claimToken, ...safe } = updated as any;
        res.json({ success: true, location: { ...safe, pinIsDefault: false } });
      });
    } catch (e: any) {
      console.error('[onboarding] complete failed:', e);
      res.status(500).json({ message: e?.message || 'Could not save your details.' });
    }
  });

  // APPLICATIONS ROUTES
  // Admin-only — applicant rows contain PII (name, email, phone, address,
  // free-text message). Public form posts are still allowed below.
  app.get("/api/applications", requireRole(["admin"]), async (req, res) => {
    try {
      const applications = await storage.getAllApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  app.post("/api/applications", async (req, res) => {
    try {
      const applicationData = insertGemachApplicationSchema.parse(req.body);
      const application = await storage.createApplication(applicationData);
      res.status(201).json(application);

      // Fire emails asynchronously so they never block the response.
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      sendApplicationConfirmationEmail({
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        city: application.city,
        state: application.state,
        country: application.country,
        community: application.community,
      }).then(() => {
        storage.updateApplication(application.id, { confirmationEmailSentAt: new Date() }).catch((e) =>
          console.error("Failed to record confirmationEmailSentAt:", e)
        );
      }).catch((e) => console.error("Application confirmation email failed:", e));

      getAdminNotificationEmail()
        .then((adminEmail) => {
          if (!adminEmail) return;
          return sendAdminNewApplicationAlert({
            adminEmail,
            applicantFirstName: application.firstName,
            applicantLastName: application.lastName,
            applicantEmail: application.email,
            applicantPhone: application.phone,
            city: application.city,
            state: application.state,
            country: application.country,
            community: application.community,
            message: application.message,
            applicationsUrl: `${baseUrl}/admin/applications`,
          });
        })
        .catch((e) => console.error("Admin new-application alert failed:", e));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid application data", errors: error.errors });
      }
      console.error("Error creating application:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });

  // Admin-only update for an application. Body is restricted to a small
  // allow-list so a forgotten/over-broad PATCH cannot silently rewrite
  // applicant data. Status transitions are recorded in the audit log so
  // we can always trace who changed what — and recover from mistakes.
  const patchApplicationBodySchema = z.object({
    status: z.enum(APPLICATION_STATUSES).optional(),
  }).strict();

  app.patch("/api/applications/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid application id" });
      }

      const parsedBody = patchApplicationBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          message: "Invalid update payload",
          errors: parsedBody.error.errors,
        });
      }
      const updates = parsedBody.data;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields provided" });
      }

      const application = await storage.getApplication(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      const previousStatus = application.status;
      const updatedApplication = await storage.updateApplication(id, updates);

      if (updates.status && updates.status !== previousStatus) {
        try {
          await storage.recordApplicationStatusChange({
            applicationId: id,
            previousStatus,
            newStatus: updates.status,
            source: "patch",
            changedByUserId: req.user?.id ?? null,
            changedByUsername: req.user?.username ?? null,
          });
        } catch (auditErr) {
          // Don't fail the request if audit logging fails — but make it loud.
          console.error("Failed to record application status change:", auditErr);
        }
      }

      res.json(updatedApplication);
    } catch (error) {
      console.error("Error updating application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Admin-only: read the audit trail of status changes for a single application.
  app.get("/api/applications/:id/status-changes", requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid application id" });
      }
      const changes = await storage.getApplicationStatusChanges(id);
      res.json(changes);
    } catch (error) {
      console.error("Error fetching application status changes:", error);
      res.status(500).json({ message: "Failed to fetch status changes" });
    }
  });

  // Resend application confirmation email (admin only)
  app.post("/api/applications/:id/resend-confirmation", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const application = await storage.getApplication(id);

      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      await sendApplicationConfirmationEmail({
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        city: application.city,
        state: application.state,
        country: application.country,
        community: application.community,
      });

      await storage.updateApplication(id, { confirmationEmailSentAt: new Date() });

      res.json({ message: "Confirmation email resent successfully" });
    } catch (error) {
      console.error("Error resending application confirmation email:", error);
      res.status(500).json({ message: "Failed to resend confirmation email" });
    }
  });

  // Approve application and create location
  app.post("/api/applications/:id/approve-with-location", requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const application = await storage.getApplication(id);
      
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      if (application.status !== "pending") {
        return res.status(400).json({ message: "Application is not pending" });
      }
      const previousStatus = application.status;

      // Validate regionId exists
      const region = await storage.getRegion(req.body.regionId);
      if (!region) {
        return res.status(400).json({ message: "Invalid region selected" });
      }

      // Generate sequential location code (#1, #2, #3, etc.)
      const nextLocationCode = await storage.getNextLocationCode();
      
      // Generate random alphanumeric code for invite codes
      const generateCode = (length: number): string => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      // Create location data with sequential code and ensure cityCategoryId is passed
      const locationDataWithCode = {
        ...req.body,
        locationCode: nextLocationCode,
      };

      const locationData = insertLocationSchema.parse(locationDataWithCode);
      
      // Create the location
      const location = await storage.createLocation(locationData);
      
      // Generate invite code for new operator
      const inviteCodeStr = `INV-${generateCode(8)}`;
      const inviteCode = await storage.createInviteCode({
        code: inviteCodeStr,
        locationId: location.id,
        applicationId: id
      });
      
      // Update application status to approved
      const updatedApplication = await storage.updateApplication(id, { status: "approved" });

      try {
        await storage.recordApplicationStatusChange({
          applicationId: id,
          previousStatus,
          newStatus: "approved",
          source: "approve_with_location",
          changedByUserId: req.user?.id ?? null,
          changedByUsername: req.user?.username ?? null,
        });
      } catch (auditErr) {
        console.error("Failed to record application status change (approve-with-location):", auditErr);
      }

      res.status(201).json({ 
        application: updatedApplication, 
        location,
        inviteCode: inviteCode.code 
      });

      // Auto-fire welcome email asynchronously (no-op if email unconfigured).
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      sendWelcomeForLocation(location.id, {
        channel: "email",
        baseUrl,
      }).then((result) => {
        if (!result.ok && !result.skipped) {
          const emailErr = result.email?.error;
          console.error("Auto-welcome email on approval failed:", emailErr || "unknown error");
        }
      }).catch((e) => console.error("Auto-welcome email on approval failed:", e));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid location data", errors: error.errors });
      }
      console.error("Error approving application:", error);
      res.status(500).json({ message: "Failed to approve application and create location" });
    }
  });

  // TRANSACTIONS ROUTES
  app.get("/api/transactions", async (req, res) => {
    try {
      const transactions = await storage.getAllTransactions();
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      // Handle expectedReturnDate conversion if needed
      if (req.body.expectedReturnDate && typeof req.body.expectedReturnDate === 'string') {
        req.body.expectedReturnDate = new Date(req.body.expectedReturnDate);
      }
      
      const transactionData = insertTransactionSchema.parse(req.body);
      const transaction = await storage.createTransaction(transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transaction data", errors: error.errors });
      }
      console.error("Error creating transaction:", error);
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  app.patch("/api/transactions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const transaction = await storage.getTransaction(id);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      const updatedTransaction = await storage.updateTransaction(id, req.body);
      res.json(updatedTransaction);
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({ message: "Failed to update transaction" });
    }
  });

  // Require authentication for returning transactions
  app.patch("/api/transactions/:id/return", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { refundAmount } = req.body;
      const transaction = await storage.getTransaction(id);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required to process returns" });
      }
      
      // Admin can return any transaction, operators can only process their location's returns
      if (operatorLocationId !== -1 && operatorLocationId !== transaction.locationId) {
        return res.status(403).json({ 
          message: "You don't have permission to process returns for this location" 
        });
      }
      
      // Check if there's a Stripe payment that needs to be refunded
      const payments = await storage.getAllPayments();
      const stripePayment = payments.find(p => 
        p.transactionId === id && 
        p.paymentMethod === 'stripe' && 
        p.status === 'completed'
      );
      
      let refundProcessed = false;
      
      if (stripePayment) {
        // Process Stripe refund
        const userRole: UserRole = operatorLocationId === -1 ? 'admin' : 'operator';
        const refundResult = await DepositService.refundDeposit(
          id,
          0, // userId not needed for operator PIN auth
          userRole,
          refundAmount,
          operatorLocationId // Pass operatorLocationId for PIN-based auth
        );
        
        if (!refundResult.success) {
          return res.status(400).json({ 
            message: refundResult.error || "Failed to process Stripe refund" 
          });
        }
        refundProcessed = true;
      }
      
      // Mark transaction as returned
      const updatedTransaction = await storage.markTransactionReturned(id);
      
      res.json({ 
        transaction: updatedTransaction,
        refundProcessed,
        refundAmount: refundAmount || transaction.depositAmount
      });
    } catch (error) {
      console.error("Error processing return:", error);
      res.status(500).json({ message: "Failed to process return" });
    }
  });

  // Operator-specific routes
  app.get("/api/operator/transactions", async (req, res) => {
    try {
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // If admin (-1), get all transactions; if operator, get only their location's transactions
      let transactions;
      if (operatorLocationId === -1) {
        transactions = await storage.getAllTransactions();
      } else {
        transactions = await storage.getTransactionsByLocation(operatorLocationId);
      }
      
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching operator transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });
  
  // Get operator's location info
  app.get("/api/operator/location", async (req, res) => {
    try {
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // For admins, return a summary location for mass management
      if (operatorLocationId === -1) {
        const allLocations = await storage.getAllLocations();
        let totalInventory = 0;
        for (const loc of allLocations) {
          totalInventory += await storage.getInventoryTotal(loc.id);
        }
        return res.json({
          id: 0,
          name: "All Locations",
          locationCode: "ADMIN",
          totalInventory: totalInventory,
          isActive: true,
          locationCount: allLocations.length
        });
      }
      
      // For operators, return their specific location
      const location = await storage.getLocation(operatorLocationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const { operatorPin, ...locationWithoutPin } = location;
      res.json({ ...locationWithoutPin, pinIsDefault: operatorPin === '1234' });
    } catch (error) {
      console.error("Error fetching operator location:", error);
      res.status(500).json({ message: "Failed to fetch location" });
    }
  });
  
  // Get operator's payments (filtered by location)
  app.get("/api/operator/payments", async (req, res) => {
    try {
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get all payments and transactions
      const allPayments = await storage.getAllPayments();
      const allTransactions = await storage.getAllTransactions();
      
      // Create a map of transaction IDs to location IDs
      const transactionLocationMap = new Map(
        allTransactions.map(t => [t.id, t.locationId])
      );
      
      // Filter payments by location (admin gets all)
      let payments;
      if (operatorLocationId === -1) {
        payments = allPayments;
      } else {
        payments = allPayments.filter(p => {
          const locationId = transactionLocationMap.get(p.transactionId);
          return locationId === operatorLocationId;
        });
      }
      
      res.json(payments);
    } catch (error) {
      console.error("Error fetching operator payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });
  
  // CONTACT ROUTES
  app.get("/api/contact", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(contactData);
      // Auto-tag obvious spam so it's pre-filtered out of the admin's main inbox
      try {
        const spam = scoreContactSpam(contactData);
        if (spam.isSpam) {
          await storage.updateContact(contact.id, { isSpam: true });
          contact.isSpam = true;
          console.log(`[contact ${contact.id}] auto-tagged as spam (score=${spam.score}): ${spam.reasons.join('; ')}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Spam-scoring error (non-fatal):", msg);
      }
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid contact data", errors: error.errors });
      }
      console.error("Error creating contact:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.patch("/api/contact/:id/read", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id, 10);
      const contact = await storage.getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const updatedContact = await storage.markContactRead(id);
      res.json(updatedContact);
    } catch (error) {
      console.error("Error marking contact as read:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.patch("/api/contact/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id, 10);
      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const { subject, message, isRead, isArchived, isSpam } = req.body;
      const updateData: Partial<Pick<Contact, 'subject' | 'message' | 'isRead' | 'isArchived' | 'isSpam'>> = {};
      if (typeof subject === 'string') updateData.subject = subject;
      if (typeof message === 'string') updateData.message = message;
      if (typeof isRead === 'boolean') updateData.isRead = isRead;
      if (typeof isArchived === 'boolean') updateData.isArchived = isArchived;
      if (typeof isSpam === 'boolean') updateData.isSpam = isSpam;
      const updatedContact = await storage.updateContact(id, updateData);
      res.json(updatedContact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.delete("/api/contact/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id, 10);
      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      await storage.deleteContact(id);
      res.json({ message: "Contact deleted successfully" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.post("/api/contact/:id/respond", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id, 10);
      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const { replyText, replySubject: customSubject, aiDraft, classification, matchedLocationId } = req.body as {
        replyText?: string; replySubject?: string;
        aiDraft?: string; classification?: string; matchedLocationId?: number;
      };
      if (!replyText || typeof replyText !== 'string' || !replyText.trim()) {
        return res.status(400).json({ message: "Reply text is required" });
      }
      const sanitize = (s: string) => s.replace(/[\r\n]/g, ' ');
      const baseSubject = (typeof customSubject === 'string' && customSubject.trim())
        ? customSubject.trim()
        : contact.subject;
      const replySubject = baseSubject.startsWith('Re:') ? baseSubject : `Re: ${baseSubject}`;
      await sendNewEmail(sanitize(contact.email), sanitize(replySubject), replyText.trim());
      await storage.markContactRead(id);

      try {
        const language: 'en' | 'he' = /[\u0590-\u05FF]/.test(`${contact.subject} ${contact.message}`) ? 'he' : 'en';
        const wasEdited = computeReplyWasEdited(aiDraft, replyText);
        const parsed = insertReplyExampleSchema.parse({
          sourceType: 'form',
          sourceRef: String(contact.id),
          senderEmail: contact.email,
          senderName: contact.name,
          incomingSubject: contact.subject,
          incomingBody: contact.message,
          sentReply: replyText.trim(),
          classification: classification || null,
          language,
          matchedLocationId: matchedLocationId ?? null,
          wasEdited,
        } satisfies InsertReplyExample);
        const example = await storage.createReplyExample(parsed);
        reindexReplyExample(example).catch((e: Error) =>
          console.warn('reindexReplyExample failed:', e?.message));
      } catch (capErr) {
        console.warn('Failed to capture contact reply example (non-fatal):',
          capErr instanceof Error ? capErr.message : String(capErr));
      }
      res.json({ message: "Reply sent successfully" });
    } catch (error) {
      console.error("Error responding to contact:", error);
      res.status(500).json({ message: "Failed to send reply" });
    }
  });

  // PAYMENT ROUTES
  app.get("/api/payments", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const payments = await storage.getAllPayments();
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/payments/transaction/:transactionId", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId, 10);
      const payments = await storage.getPaymentsByTransaction(transactionId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments for transaction:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const paymentData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment(paymentData);
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payment data", errors: error.errors });
      }
      console.error("Error creating payment:", error);
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  app.patch("/api/payments/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status, paymentData } = req.body;
      
      const payment = await storage.updatePaymentStatus(id, status, paymentData);
      res.json(payment);
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  // Payment confirmation routes
  app.post("/api/payments/:id/confirm", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const paymentId = parseInt(req.params.id);
      const { confirmationCode, notes, confirmed } = req.body;
      
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      if (payment.status !== "confirming" && payment.status !== "pending") {
        return res.status(400).json({ message: "Payment cannot be confirmed in current status" });
      }

      const paymentData = payment.paymentData ? JSON.parse(payment.paymentData) : {};
      const updatedPaymentData = {
        ...paymentData,
        confirmationCode,
        confirmationNotes: notes,
        confirmedAt: new Date().toISOString(),
        confirmedBy: req.user?.username || "system"
      };

      const updatedPayment = await storage.updatePaymentStatus(
        paymentId,
        confirmed ? "completed" : "failed",
        updatedPaymentData
      );

      // Sync deposit confirmation across the system
      await DepositSyncService.syncDepositConfirmation(
        paymentId, 
        confirmed ? "completed" : "failed", 
        updatedPaymentData
      );

      // Log audit trail
      await AuditTrailService.logDepositConfirmation(
        req.user.id,
        req.user.username,
        paymentId,
        "confirming",
        confirmed ? "completed" : "failed",
        updatedPaymentData,
        { ipAddress: req.ip, userAgent: req.get('User-Agent') }
      );

      // Send email notifications
      if (confirmed) {
        const transaction = await storage.getTransaction(payment.transactionId);
        await EmailNotificationService.notifyDepositConfirmed(updatedPayment, transaction);
      } else {
        const transaction = await storage.getTransaction(payment.transactionId);
        await EmailNotificationService.notifyFailedDeposit(updatedPayment, transaction, await getAdminNotificationEmail());
      }

      res.json(updatedPayment);
    } catch (error) {
      console.error("Payment confirmation error:", error);
      res.status(500).json({ message: "Error confirming payment" });
    }
  });

  app.post("/api/payments/:id/reject", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const paymentId = parseInt(req.params.id);
      const { notes } = req.body;
      
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      const paymentData = payment.paymentData ? JSON.parse(payment.paymentData) : {};
      const updatedPaymentData = {
        ...paymentData,
        rejectionNotes: notes,
        rejectedAt: new Date().toISOString(),
        rejectedBy: req.user?.username || "system"
      };

      const updatedPayment = await storage.updatePaymentStatus(
        paymentId,
        "failed",
        updatedPaymentData
      );

      res.json(updatedPayment);
    } catch (error) {
      console.error("Payment rejection error:", error);
      res.status(500).json({ message: "Error rejecting payment" });
    }
  });

  // Bulk deposit operations for operators
  app.post("/api/deposits/bulk-confirm", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { paymentIds } = req.body;
      if (!Array.isArray(paymentIds)) {
        return res.status(400).json({ message: "paymentIds must be an array" });
      }

      const result = await DepositSyncService.bulkConfirmDeposits(
        paymentIds, 
        req.user.id
      );

      res.json({
        success: result.success,
        failed: result.failed,
        total: paymentIds.length,
        message: `Successfully confirmed ${result.success} deposits${result.failed > 0 ? `, ${result.failed} failed` : ''}`
      });
    } catch (error) {
      console.error("Bulk confirmation error:", error);
      res.status(500).json({ message: "Error processing bulk confirmation" });
    }
  });

  // Deposit analytics endpoint
  app.get("/api/deposits/analytics", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const analytics = await DepositSyncService.generateDepositAnalytics(locationId);

      res.json(analytics);
    } catch (error) {
      console.error("Analytics generation error:", error);
      res.status(500).json({ message: "Error generating analytics" });
    }
  });

  // Item return and refund processing
  app.patch("/api/transactions/:id/return", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      // Check authentication
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Determine user role and explicitly block borrowers
      let userRole: UserRole = 'borrower';
      let userId = 0;
      
      if (req.isAuthenticated()) {
        const user = req.user as Express.User;
        userId = user.id;
        if (user.isAdmin) {
          userRole = 'admin';
        } else if (user.role === 'operator') {
          userRole = 'operator';
        } else {
          userRole = 'borrower';
        }
      } else if (operatorLocationId) {
        // PIN-based session - treat as operator
        userRole = 'operator';
      }
      
      // Explicitly block borrowers from processing refunds
      if (userRole === 'borrower') {
        return res.status(403).json({ message: "Borrowers cannot process refunds" });
      }
      
      // Admin (-1) can process any return, operators can only process their location's returns
      if (operatorLocationId !== -1 && operatorLocationId !== transaction.locationId) {
        return res.status(403).json({ message: "Not authorized for this location's returns" });
      }

      const { condition, returnNotes, refundAmount } = req.body;

      const result = await DepositRefundService.processItemReturn(
        transactionId,
        {
          actualReturnDate: new Date(),
          returnNotes,
          condition,
          refundAmount
        },
        userRole,
        userId,
        operatorLocationId === -1 ? undefined : operatorLocationId
      );

      // Log refund in audit trail (use session user if available)
      const auditUserId = req.isAuthenticated() ? req.user.id : userId;
      const username = req.isAuthenticated() ? req.user.username : `operator_location_${operatorLocationId}`;
      await AuditTrailService.logRefundProcessing(
        auditUserId,
        username,
        transactionId,
        result.refundAmount,
        condition || 'good',
        { ipAddress: req.ip, userAgent: req.get('User-Agent') }
      );

      // Send refund notification
      if (result.refundAmount > 0) {
        await EmailNotificationService.notifyRefundProcessed(
          result.refundAmount,
          result.transaction
        );
      }

      res.json(result);
    } catch (error) {
      console.error("Return processing error:", error);
      res.status(500).json({ message: "Error processing return" });
    }
  });

  // Payment method analytics
  app.get("/api/analytics/payment-methods", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;

      const analytics = await PaymentAnalyticsEngine.generatePaymentMethodAnalytics(
        locationId,
        dateRange
      );

      res.json(analytics);
    } catch (error) {
      console.error("Payment analytics error:", error);
      res.status(500).json({ message: "Error generating payment analytics" });
    }
  });

  // Deposit reconciliation report
  app.get("/api/reports/reconciliation", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;

      const report = await PaymentAnalyticsEngine.generateDepositReconciliation(
        locationId,
        dateRange
      );

      res.json(report);
    } catch (error) {
      console.error("Reconciliation report error:", error);
      res.status(500).json({ message: "Error generating reconciliation report" });
    }
  });

  // Audit trail access
  app.get("/api/audit-trail", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const entries = await AuditTrailService.getRecentAuditEntries(limit);

      res.json(entries);
    } catch (error) {
      console.error("Audit trail error:", error);
      res.status(500).json({ message: "Error retrieving audit trail" });
    }
  });

  // WEBHOOK ENDPOINTS FOR REAL-TIME PAYMENT STATUS DETECTION
  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      const { id, object, type, data } = req.body;
      
      if (type === 'payment_intent.succeeded') {
        await DepositDetectionService.processPaymentStatusUpdate(
          data.object.id,
          'accepted',
          {
            stripe_payment_intent_id: data.object.id,
            amount_received: data.object.amount_received,
            currency: data.object.currency,
            payment_method: data.object.payment_method
          },
          'stripe_webhook'
        );
      } else if (type === 'payment_intent.payment_failed') {
        await DepositDetectionService.processPaymentStatusUpdate(
          data.object.id,
          'declined',
          {
            stripe_payment_intent_id: data.object.id,
            failure_code: data.object.last_payment_error?.code,
            failure_message: data.object.last_payment_error?.message
          },
          'stripe_webhook'
        );
      } else if (type === 'setup_intent.succeeded') {
        // Handle card setup completion for pay-later flow
        const setupIntentId = data.object.id;
        const paymentMethodId = data.object.payment_method;
        if (setupIntentId && paymentMethodId) {
          await PayLaterService.handleSetupIntentSucceeded(setupIntentId, paymentMethodId);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook error:", error);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  });

  app.post("/api/webhooks/paypal", async (req, res) => {
    try {
      const { event_type, resource } = req.body;
      
      if (event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        await DepositDetectionService.processPaymentStatusUpdate(
          resource.id,
          'accepted',
          {
            paypal_capture_id: resource.id,
            amount: resource.amount,
            status: resource.status
          },
          'paypal_webhook'
        );
      } else if (event_type === 'PAYMENT.CAPTURE.DENIED') {
        await DepositDetectionService.processPaymentStatusUpdate(
          resource.id,
          'declined',
          {
            paypal_capture_id: resource.id,
            reason_code: resource.reason_code
          },
          'paypal_webhook'
        );
      }

      res.json({ received: true });
    } catch (error) {
      console.error("PayPal webhook error:", error);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  });

  // MANUAL PAYMENT STATUS CHECKING
  app.get("/api/payments/status-check", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      await DepositDetectionService.monitorPendingPayments();
      res.json({ message: "Payment status monitoring completed" });
    } catch (error) {
      console.error("Payment status check error:", error);
      res.status(500).json({ message: "Error checking payment status" });
    }
  });

  // DEPOSIT DETECTION ANALYTICS
  app.get("/api/analytics/deposit-detection", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;

      const analytics = await DepositDetectionService.generateDetectionAnalytics(dateRange);
      res.json(analytics);
    } catch (error) {
      console.error("Detection analytics error:", error);
      res.status(500).json({ message: "Error generating detection analytics" });
    }
  });

  // REAL-TIME STATUS ENDPOINT FOR DASHBOARD
  app.get("/api/realtime-status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const payments = await storage.getAllPayments();
      const transactions = await storage.getAllTransactions();

      // Get recent payments (last 2 hours)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const recentPayments = payments
        .filter(p => p.createdAt && new Date(p.createdAt) > twoHoursAgo)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 10)
        .map(payment => {
          const transaction = transactions.find(t => t.id === payment.transactionId);
          return {
            id: payment.id,
            amount: payment.totalAmount,
            status: payment.status,
            method: payment.paymentMethod,
            timestamp: payment.createdAt || new Date().toISOString(),
            borrowerName: transaction?.borrowerName || 'Unknown'
          };
        });

      const pendingCount = payments.filter(p => ['pending', 'confirming'].includes(p.status)).length;
      const completedCount = payments.filter(p => p.status === 'completed').length;
      const successRate = payments.length > 0 ? (completedCount / payments.length) * 100 : 0;

      res.json({
        recentPayments,
        pendingCount,
        successRate,
        lastUpdateTime: new Date().toISOString()
      });
    } catch (error) {
      console.error("Real-time status error:", error);
      res.status(500).json({ message: "Error fetching real-time status" });
    }
  });

  // STRIPE PAYMENT PROCESSING
  app.post("/api/stripe-payment", async (req, res) => {
    try {
      const { transactionId, paymentMethod, paymentProvider, depositAmount, totalAmount, cardDetails } = req.body;

      // Create payment record with confirming status
      const payment = await storage.createPayment({
        transactionId,
        paymentMethod,
        paymentProvider,
        depositAmount,
        totalAmount,
        status: "confirming",
        externalPaymentId: `stripe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });

      // In a real implementation, you would process the card payment here
      // For now, we'll simulate successful processing
      const processedPayment = await storage.updatePaymentStatus(
        payment.id,
        "completed",
        {
          cardLast4: cardDetails.number.slice(-4),
          cardBrand: detectCardBrand(cardDetails.number),
          processedAt: new Date().toISOString()
        }
      );

      res.json(processedPayment);
    } catch (error) {
      console.error("Stripe payment error:", error);
      res.status(500).json({ message: "Error processing credit card payment" });
    }
  });

  // PAYPAL PAYMENT PROCESSING
  app.post("/api/paypal-payment", async (req, res) => {
    try {
      const { transactionId, paymentMethod, paymentProvider, depositAmount, totalAmount, paypalEmail } = req.body;

      // Create payment record with confirming status
      const payment = await storage.createPayment({
        transactionId,
        paymentMethod,
        paymentProvider,
        depositAmount,
        totalAmount,
        status: "confirming",
        externalPaymentId: `paypal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });

      // In a real implementation, you would process PayPal payment here
      // For now, we'll simulate successful processing
      const processedPayment = await storage.updatePaymentStatus(
        payment.id,
        "completed",
        {
          paypalEmail,
          processedAt: new Date().toISOString()
        }
      );

      res.json(processedPayment);
    } catch (error) {
      console.error("PayPal payment error:", error);
      res.status(500).json({ message: "Error processing PayPal payment" });
    }
  });

  // CASH PAYMENT PROCESSING
  app.post("/api/cash-payment", async (req, res) => {
    try {
      // Accept either Passport (admin/operator) or PIN-based (operator) auth.
      const operatorLocationId = getOperatorLocationId(req);
      if (operatorLocationId === null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const transactionIdRaw = req.body?.transactionId;
      const locationIdRaw = req.body?.locationId;
      const transactionId = typeof transactionIdRaw === "number" ? transactionIdRaw : parseInt(transactionIdRaw, 10);
      const locationId = typeof locationIdRaw === "number" ? locationIdRaw : parseInt(locationIdRaw, 10);
      if (!Number.isFinite(transactionId) || !Number.isFinite(locationId)) {
        return res.status(400).json({ message: "transactionId and locationId are required" });
      }

      // Resolve actor identity for audit + role.
      let role: UserRole;
      let userId: number | undefined;
      if (req.isAuthenticated()) {
        const user = req.user as Express.User;
        userId = user.id;
        if (user.isAdmin) {
          role = 'admin';
        } else if (user.role === 'operator') {
          role = 'operator';
        } else {
          // Passport-authenticated borrowers (or other roles) must not record cash.
          return res.status(403).json({ message: "Only operators and admins can record cash payments" });
        }
      } else {
        // PIN session = operator scoped to that location.
        role = 'operator';
      }

      const result = await withCashLock(transactionId, () =>
        DepositService.initiateCashPayment(transactionId, locationId, {
          userId,
          role,
          operatorLocationId,
          ipAddress: req.ip,
        })
      );

      if (!result.success) {
        // Map authorization-style errors to 403, validation-style to 400.
        const msg = result.error || "Failed to record cash payment";
        const status =
          msg.includes('not authorized') || msg.includes('Borrowers cannot') ? 403 :
          msg.includes('not found') || msg.includes('does not belong') ? 400 :
          400;
        return res.status(status).json({ message: msg });
      }

      const location = await storage.getLocation(locationId);
      const depositAmount = location?.depositAmount || 20;

      res.json({
        paymentId: result.paymentId,
        status: "completed",
        amount: depositAmount * 100,
        message: "Cash deposit recorded",
      });
    } catch (error) {
      console.error("Error processing cash payment:", error);
      res.status(500).json({ message: "Failed to process cash payment" });
    }
  });

  // PAYMENT METHOD MANAGEMENT ROUTES (Admin only)
  app.get("/api/payment-methods", async (req, res) => {
    try {
      const paymentMethods = await storage.getAllPaymentMethods();
      res.json(paymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.post("/api/payment-methods", requireRole(["admin"]), async (req, res) => {
    try {
      const methodData = insertPaymentMethodSchema.parse(req.body);
      const method = await storage.createPaymentMethod(methodData);
      
      // Sync changes across all locations
      await PaymentSyncService.syncPaymentMethodChanges(method);
      
      res.status(201).json(method);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payment method data", errors: error.errors });
      }
      console.error("Error creating payment method:", error);
      res.status(500).json({ message: "Failed to create payment method" });
    }
  });

  app.patch("/api/payment-methods/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updateData = req.body;
      const method = await storage.updatePaymentMethod(id, updateData);
      
      // Sync changes across all locations when admin updates payment methods
      await PaymentSyncService.syncPaymentMethodChanges(method);
      
      res.json(method);
    } catch (error) {
      console.error("Error updating payment method:", error);
      res.status(500).json({ message: "Failed to update payment method" });
    }
  });

  app.delete("/api/payment-methods/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deletePaymentMethod(id);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ message: "Failed to delete payment method" });
    }
  });

  // Configure API credentials for payment methods
  app.post("/api/payment-methods/:id/configure", requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { apiKey, apiSecret, webhookSecret } = req.body;
      
      // Validate and activate payment method with API credentials
      const success = await PaymentSyncService.validateAndActivatePaymentMethod(id, {
        apiKey,
        apiSecret,
        webhookSecret
      });
      
      if (success) {
        const updatedMethod = await storage.getPaymentMethod(id);
        res.json({ 
          message: "Payment method configured and activated successfully",
          method: updatedMethod,
          synchronized: true
        });
      } else {
        res.status(400).json({ message: "Failed to configure payment method" });
      }
    } catch (error) {
      console.error("Error configuring payment method:", error);
      res.status(500).json({ message: "Failed to configure payment method" });
    }
  });

  // LOCATION PAYMENT METHOD ROUTES
  app.get("/api/locations/:locationId/payment-methods", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const availableMethods = await storage.getAvailablePaymentMethodsForLocation(locationId);
      const enabledMethods = await storage.getLocationPaymentMethods(locationId);
      
      res.json({
        available: availableMethods,
        enabled: enabledMethods
      });
    } catch (error) {
      console.error("Error fetching location payment methods:", error);
      res.status(500).json({ message: "Failed to fetch location payment methods" });
    }
  });

  app.post("/api/locations/:locationId/payment-methods/:methodId", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const methodId = parseInt(req.params.methodId, 10);
      const { customFee } = req.body;
      
      const locationMethod = await storage.enablePaymentMethodForLocation(locationId, methodId, customFee);
      res.status(201).json(locationMethod);
    } catch (error) {
      console.error("Error enabling payment method for location:", error);
      res.status(500).json({ message: "Failed to enable payment method" });
    }
  });

  app.delete("/api/locations/:locationId/payment-methods/:methodId", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const methodId = parseInt(req.params.methodId, 10);
      
      await storage.disablePaymentMethodForLocation(locationId, methodId);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error disabling payment method for location:", error);
      res.status(500).json({ message: "Failed to disable payment method" });
    }
  });

  // ============================================
  // UNIFIED DEPOSIT SYSTEM ROUTES
  // ============================================

  // Get Stripe publishable key for frontend
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error fetching Stripe publishable key:", error);
      res.status(500).json({ message: "Failed to fetch Stripe configuration" });
    }
  });

  // Create deposit transaction and initiate payment
  app.post("/api/deposits/initiate", async (req, res) => {
    try {
      const { locationId, borrowerName, borrowerEmail, borrowerPhone, headbandColor, notes, paymentMethod } = req.body;

      if (!locationId || !borrowerName || !borrowerEmail || !paymentMethod) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Create the transaction first
      const transaction = await DepositService.createDepositTransaction({
        locationId,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        headbandColor,
        notes
      });

      // Initiate payment based on method
      let paymentResult;
      if (paymentMethod === 'stripe') {
        paymentResult = await DepositService.initiateStripePayment(transaction.id, locationId);
      } else if (paymentMethod === 'cash') {
        // Cash deposits create a *completed* payment row, so they must come
        // from a real operator/admin — never a public/borrower request to
        // /api/deposits/initiate. Reject anonymous or non-operator callers
        // here even though the rest of /api/deposits/initiate is public.
        const operatorLocationId = getOperatorLocationId(req);
        if (operatorLocationId === null) {
          return res.status(401).json({ message: "Operator or admin authentication required to record cash" });
        }
        let role: UserRole = 'operator';
        let userId: number | undefined;
        if (req.isAuthenticated()) {
          const user = req.user as Express.User;
          userId = user.id;
          if (user.isAdmin) {
            role = 'admin';
          } else if (user.role === 'operator') {
            role = 'operator';
          } else {
            return res.status(403).json({ message: "Only operators and admins can record cash" });
          }
        } else {
          // PIN session = operator at that location.
          role = 'operator';
        }
        paymentResult = await withCashLock(transaction.id, () =>
          DepositService.initiateCashPayment(transaction.id, locationId, {
            userId,
            role,
            operatorLocationId,
            ipAddress: req.ip,
          })
        );
      } else {
        return res.status(400).json({ message: "Unsupported payment method" });
      }

      if (!paymentResult.success) {
        return res.status(400).json({ message: paymentResult.error });
      }

      res.json({
        transactionId: transaction.id,
        paymentId: paymentResult.paymentId,
        clientSecret: paymentResult.clientSecret,
        publishableKey: paymentResult.publishableKey,
        paymentMethod
      });
    } catch (error: any) {
      console.error("Deposit initiation error:", error);
      res.status(500).json({ message: error.message || "Failed to initiate deposit" });
    }
  });

  // Confirm a payment (operators and admins only)
  app.post("/api/deposits/:paymentId/confirm", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const paymentId = parseInt(req.params.paymentId);
      const { confirmed, notes } = req.body;
      const user = req.user as Express.User;

      const userRole: UserRole = user.isAdmin ? 'admin' : (user.role as UserRole);

      const result = await DepositService.confirmPayment(
        paymentId,
        user.id,
        userRole,
        confirmed !== false,
        notes
      );

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ success: true, payment: result.payment });
    } catch (error: any) {
      console.error("Deposit confirmation error:", error);
      res.status(500).json({ message: error.message || "Failed to confirm deposit" });
    }
  });

  // Bulk confirm payments
  app.post("/api/deposits/bulk-confirm-v2", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { paymentIds } = req.body;
      if (!Array.isArray(paymentIds)) {
        return res.status(400).json({ message: "paymentIds must be an array" });
      }

      const user = req.user as Express.User;
      const userRole: UserRole = user.isAdmin ? 'admin' : (user.role as UserRole);

      const result = await DepositService.bulkConfirmPayments(paymentIds, user.id, userRole);

      res.json({
        success: result.success,
        failed: result.failed,
        total: paymentIds.length
      });
    } catch (error: any) {
      console.error("Bulk confirmation error:", error);
      res.status(500).json({ message: error.message || "Failed to bulk confirm deposits" });
    }
  });

  // Get pending confirmations for current user
  app.get("/api/deposits/pending", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = req.user as Express.User;
      const userRole: UserRole = user.isAdmin ? 'admin' : (user.role as UserRole);

      const pendingPayments = await DepositService.getPendingConfirmations(
        userRole,
        user.id
      );

      // Enrich with transaction data
      const enrichedPayments = await Promise.all(
        pendingPayments.map(async (payment) => {
          const transaction = await storage.getTransaction(payment.transactionId);
          const location = transaction ? await storage.getLocation(transaction.locationId) : null;
          return {
            ...payment,
            transaction,
            location
          };
        })
      );

      res.json(enrichedPayments);
    } catch (error: any) {
      console.error("Pending deposits error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch pending deposits" });
    }
  });

  // Refund a deposit
  app.post("/api/deposits/:transactionId/refund", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const transactionId = parseInt(req.params.transactionId);
      const { refundAmount } = req.body;
      const user = req.user as Express.User;
      const userRole: UserRole = user.isAdmin ? 'admin' : (user.role as UserRole);

      const result = await DepositService.refundDeposit(
        transactionId,
        user.id,
        userRole,
        refundAmount
      );

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Refund error:", error);
      res.status(500).json({ message: error.message || "Failed to process refund" });
    }
  });

  // ADMIN EMAIL ROUTES
  // Check Gmail configuration status
  app.get("/api/admin/emails/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const status = await getGmailConfigStatus();
      res.json(status);
    } catch (error: unknown) {
      console.error("Error checking Gmail status:", error);
      const msg = error instanceof Error ? error.message : "Failed to check Gmail status";
      res.status(500).json({ message: msg });
    }
  });

  // Aggregate Gmail label counts (used by inbox folder chips for backlog hints).
  //
  // Contract: ALWAYS responds 200 with a counts object. When Gmail is
  // unavailable (not connected, transient API failure), returns
  //   { inbox: 0, sent: 0, spam: 0, trash: 0, error: <reason> }
  // so the inbox UI never breaks. Clients should treat the presence of an
  // `error` field as "counts are unavailable" rather than treating 200 as a
  // health signal.
  app.get("/api/admin/emails/labels", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const counts = await getLabelCounts();
      res.json(counts);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch label counts";
      console.error("Error fetching Gmail label counts:", msg);
      res.status(200).json({ inbox: 0, sent: 0, spam: 0, trash: 0, error: msg });
    }
  });

  // Get list of emails from connected Gmail
  app.get("/api/admin/emails", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const maxResults = parseInt(req.query.maxResults as string) || 25;
      const pageToken = (req.query.pageToken as string) || undefined;
      const rawMode = String(req.query.mode || 'inbox').toLowerCase();
      const allowedModes = ['inbox', 'spam', 'trash', 'archive', 'all', 'sent'] as const;
      const mode: GmailListMode = (allowedModes as readonly string[]).includes(rawMode)
        ? (rawMode as GmailListMode)
        : 'inbox';
      const result = await listEmails(maxResults, pageToken, mode);
      res.json(result);
    } catch (error: unknown) {
      console.error("Error fetching emails:", error);
      const errObj = error as { message?: string; response?: { data?: { error?: string } } } | undefined;
      const raw = String(errObj?.message || errObj?.response?.data?.error || "");
      if (/invalid_grant/i.test(raw)) {
        return res.status(401).json({
          code: "gmail_invalid_grant",
          message: "Gmail refresh token is invalid or expired. Generate a new GMAIL_REFRESH_TOKEN and update the environment variable.",
        });
      }
      res.status(500).json({ message: errObj?.message || "Failed to fetch emails" });
    }
  });

  // Contact-form list grouped by (lower(email), normalized subject).
  app.get("/api/admin/contacts/threads", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const all = await storage.getAllContacts();
      const out = groupContactsByThread(all);
      res.json({ threads: out });
    } catch (error: unknown) {
      console.error('Error grouping contacts:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed' });
    }
  });

  // Gmail list grouped by thread; paginated via threads.list page tokens.
  app.get("/api/admin/emails/threads", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const maxResults = parseInt(req.query.maxResults as string) || 25;
      const pageToken = (req.query.pageToken as string) || undefined;
      const rawMode = String(req.query.mode || 'inbox').toLowerCase();
      const allowedModes = ['inbox', 'spam', 'trash', 'archive', 'all', 'sent'] as const;
      const mode: GmailListMode = (allowedModes as readonly string[]).includes(rawMode)
        ? (rawMode as GmailListMode)
        : 'inbox';
      const result = await listEmailThreads(maxResults, pageToken, mode);
      res.json(result);
    } catch (error: unknown) {
      console.error("Error fetching email threads:", error);
      const errObj = error as { message?: string; response?: { data?: { error?: string } } } | undefined;
      const raw = String(errObj?.message || errObj?.response?.data?.error || "");
      if (/invalid_grant/i.test(raw)) {
        return res.status(401).json({
          code: "gmail_invalid_grant",
          message: "Gmail refresh token is invalid or expired.",
        });
      }
      res.status(500).json({ message: errObj?.message || "Failed to fetch threads" });
    }
  });


  // Get a single email by ID
  app.get("/api/admin/emails/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const email = await getEmail(req.params.id);
      if (!email) {
        return res.status(404).json({ message: "Email not found" });
      }
      res.json(email);
    } catch (error: any) {
      console.error("Error fetching email:", error);
      res.status(500).json({ message: error.message || "Failed to fetch email" });
    }
  });

  // Mark email as read
  app.post("/api/admin/emails/:id/read", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await markAsRead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking email as read:", error);
      res.status(500).json({ message: error.message || "Failed to mark as read" });
    }
  });

  // Mark email as unread
  app.post("/api/admin/emails/:id/unread", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await markAsUnread(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to mark as unread";
      console.error("Error marking email as unread:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // Archive email (remove INBOX label)
  app.post("/api/admin/emails/:id/archive", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await archiveEmail(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to archive";
      console.error("Error archiving email:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // Undo archive: re-add INBOX label so the message reappears in the inbox.
  app.post("/api/admin/emails/:id/unarchive", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await unarchiveEmail(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to unarchive";
      console.error("Error unarchiving email:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // Move to trash
  app.post("/api/admin/emails/:id/trash", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await trashEmail(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to trash";
      console.error("Error trashing email:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // Restore from trash
  app.post("/api/admin/emails/:id/untrash", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await untrashEmail(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to restore";
      console.error("Error untrashing email:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // Mark as spam
  app.post("/api/admin/emails/:id/spam", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await markAsSpam(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to mark as spam";
      console.error("Error marking email as spam:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // Unmark spam (restore to inbox). Both `/not-spam` and `/unspam` are accepted
  // so callers using either spelling work without surprise.
  const unmarkSpamHandler = async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
      const user = req.user as Express.User;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
      await unmarkSpam(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to unmark spam";
      console.error("Error unmarking spam:", msg);
      res.status(500).json({ message: msg });
    }
  };
  app.post("/api/admin/emails/:id/not-spam", unmarkSpamHandler);
  app.post("/api/admin/emails/:id/unspam", unmarkSpamHandler);

  // Thread-level Gmail mutations (atomic across all messages in the thread).
  const requireAdmin = (req: Request, res: Response): boolean => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ message: "Authentication required" });
      return false;
    }
    const user = req.user as Express.User;
    if (!user.isAdmin) {
      res.status(403).json({ message: "Admin access required" });
      return false;
    }
    return true;
  };
  type ThreadOp = (threadId: string) => Promise<void>;
  const makeThreadRoute = (path: string, op: ThreadOp, errLabel: string) => {
    app.post(path, async (req, res) => {
      if (!requireAdmin(req, res)) return;
      try {
        await op(req.params.threadId);
        res.json({ success: true });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : `Failed to ${errLabel}`;
        console.error(`Error ${errLabel} thread:`, msg);
        res.status(500).json({ message: msg });
      }
    });
  };
  makeThreadRoute("/api/admin/emails/thread/:threadId/read", markThreadAsRead, "mark thread as read");
  makeThreadRoute("/api/admin/emails/thread/:threadId/unread", markThreadAsUnread, "mark thread as unread");
  makeThreadRoute("/api/admin/emails/thread/:threadId/archive", archiveThread, "archive thread");
  makeThreadRoute("/api/admin/emails/thread/:threadId/unarchive", unarchiveThread, "unarchive thread");
  makeThreadRoute("/api/admin/emails/thread/:threadId/trash", trashThread, "trash thread");
  makeThreadRoute("/api/admin/emails/thread/:threadId/untrash", untrashThread, "untrash thread");
  makeThreadRoute("/api/admin/emails/thread/:threadId/spam", markThreadAsSpam, "mark thread as spam");
  const unspamHandler: ThreadOp = (id) => unmarkThreadSpam(id);
  makeThreadRoute("/api/admin/emails/thread/:threadId/not-spam", unspamHandler, "unmark thread spam");
  makeThreadRoute("/api/admin/emails/thread/:threadId/unspam", unspamHandler, "unmark thread spam");

  // Generate AI response for an email
  app.post("/api/admin/emails/:id/generate-response", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const email = await getEmail(req.params.id);
      if (!email) {
        return res.status(404).json({ message: "Email not found" });
      }

      const fromMatch = String(email.from || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
      const senderName = fromMatch ? fromMatch[1] || fromMatch[2] : email.from;
      const senderEmail = fromMatch ? fromMatch[2] : undefined;
      const result = await generateEmailResponse(
        email.subject,
        email.body,
        senderName,
        senderEmail,
        email.threadId,
        email.id,
      );
      res.json({
        response: result.draft,
        classification: result.classification,
        needsHumanReview: result.needsHumanReview,
        reviewReason: result.reviewReason,
        matchedLocationId: result.matchedLocationId,
        matchedLocationName: result.matchedLocationName,
        language: result.language,
        confidence: result.confidence,
        sources: result.sources,
        citedSourceIds: result.citedSourceIds,
        todayIso: result.todayIso,
        senderHistoryCount: result.senderHistoryCount,
        threadHistoryCount: result.threadHistoryCount,
      });
    } catch (error: any) {
      console.error("Error generating AI response:", error);
      res.status(500).json({ message: error.message || "Failed to generate response" });
    }
  });

  // Forward an inbound email to a specific gemach operator
  app.post("/api/admin/emails/:id/forward-to-operator", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { locationId, note } = req.body as { locationId?: number; note?: string };
      if (!locationId) {
        return res.status(400).json({ message: "locationId is required" });
      }
      const location = await storage.getLocation(Number(locationId));
      if (!location) return res.status(404).json({ message: "Location not found" });
      if (!location.email) return res.status(400).json({ message: "This location has no operator email on file" });

      const email = await getEmail(req.params.id);
      if (!email) return res.status(404).json({ message: "Email not found" });

      const sanitize = (s: string) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
      const noteBlock = (note && note.trim())
        ? `Note from admin:\n${note.trim()}\n\n----- Original message -----\n`
        : `Forwarded from the Baby Banz Gemach inbox — please follow up with the borrower directly.\n\n----- Original message -----\n`;
      const fwdBody =
        `${noteBlock}` +
        `From: ${email.from}\n` +
        `Subject: ${email.subject}\n\n` +
        `${email.body}\n`;
      const fwdSubject = `[Fwd] ${email.subject}`.slice(0, 200);
      await sendNewEmail(sanitize(location.email), sanitize(fwdSubject), fwdBody);
      res.json({ success: true, forwardedTo: location.email, locationName: location.name });
    } catch (error: any) {
      console.error("Error forwarding email to operator:", error);
      res.status(500).json({ message: error.message || "Failed to forward email" });
    }
  });

  // ============================================
  // RETURN REMINDER (operator → borrower)
  // ============================================
  const PLACEHOLDER_EMAIL_SUFFIX = "@placeholder.local";
  const REMINDER_RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Body schema for the reminder send. `channel` defaults to "email" so
  // existing clients (and older versions of the dashboard) keep working
  // with no change. New clients explicitly send "sms" to opt into the
  // Twilio path.
  const sendReminderBodySchema = z.object({
    channel: z.enum(['email', 'sms']).optional().default('email'),
  });

  app.post("/api/locations/:locationId/transactions/:id/return-reminder", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const transactionId = parseInt(req.params.id, 10);
      if (Number.isNaN(locationId) || Number.isNaN(transactionId)) {
        return res.status(400).json({ message: "Invalid location or transaction id" });
      }

      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Operator authentication required" });
      }
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }

      const parsedBody = sendReminderBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsedBody.error.flatten() });
      }
      const channel = parsedBody.data.channel;

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction || transaction.locationId !== locationId) {
        return res.status(404).json({ message: "Transaction not found for this location" });
      }
      if (transaction.isReturned) {
        return res.status(400).json({ message: "This transaction is already marked returned" });
      }

      const email = (transaction.borrowerEmail || '').trim();
      const hasRealEmail = !!email && !email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
      const phone = normalizePhoneForSms(transaction.borrowerPhone);

      // Per-channel preconditions before rate-limit so failures surface a
      // clear reason instead of a 429.
      if (channel === 'email' && !hasRealEmail) {
        return res.status(400).json({ message: "No real borrower email on file for this transaction" });
      }
      if (channel === 'sms') {
        const twilio = getTwilioConfigStatus();
        if (!twilio.configured) {
          return res.status(400).json({ message: twilio.reason || 'SMS is not configured.' });
        }
        if (!phone) {
          return res.status(400).json({ message: "No borrower phone number on file for this transaction" });
        }
      }

      // Shared 24h rate limit across email + SMS.
      if (transaction.lastReturnReminderAt) {
        const elapsed = Date.now() - new Date(transaction.lastReturnReminderAt).getTime();
        if (elapsed < REMINDER_RATE_LIMIT_MS) {
          const hoursLeft = Math.ceil((REMINDER_RATE_LIMIT_MS - elapsed) / (60 * 60 * 1000));
          return res.status(429).json({ message: `A reminder was already sent recently. Please wait ${hoursLeft}h before sending another.` });
        }
      }

      const location = await storage.getLocation(locationId);
      if (!location) return res.status(404).json({ message: "Location not found" });

      const language: 'en' | 'he' = location.nameHe ? 'he' : 'en';
      const locationName = (language === 'he' && location.nameHe) ? location.nameHe : location.name;

      if (channel === 'email') {
        try {
          await sendReturnReminderEmail({
            borrowerName: transaction.borrowerName,
            borrowerEmail: email,
            locationName,
            language,
          });
        } catch (sendErr: any) {
          console.error("Failed to send return reminder email:", sendErr);
          return res.status(502).json({ message: sendErr?.message || "Failed to send reminder email" });
        }
      } else {
        const envBase = (process.env.APP_URL || process.env.SITE_URL || '').trim();
        if (!envBase && process.env.NODE_ENV === 'production') {
          return res.status(500).json({ message: 'APP_URL or SITE_URL must be set to send SMS reminders.' });
        }
        const baseUrl = (envBase || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
        // Two-step token rotation: prepare in memory, send first, then
        // commit. A failed Twilio send leaves any prior link untouched.
        const prepared = prepareBorrowerStatusToken();
        const statusUrl = `${baseUrl}/status/${transactionId}?token=${prepared.raw}`;
        // Twilio will POST delivery events here so we can track sent → delivered / failed.
        const statusCallbackUrl = `${baseUrl}/api/webhooks/twilio/status`;

        let smsSid: string | null = null;
        try {
          const result = await sendReturnReminderSMS({
            borrowerName: transaction.borrowerName,
            borrowerPhone: phone!,
            locationName,
            language,
            dueDate: transaction.expectedReturnDate ?? null,
            statusUrl,
            statusCallbackUrl,
          });
          smsSid = result.sid;
        } catch (sendErr: any) {
          // Twilio error 21610 = recipient replied STOP (opted out).
          // Log an event for timeline visibility WITHOUT bumping lastReturnReminderAt
          // or returnReminderCount, so the operator can immediately retry via email
          // without hitting the 24h rate limit.
          if ((sendErr as any).twilioCode === 21610) {
            const sentByUserId2 = req.isAuthenticated() ? ((req.user as any)?.id ?? null) : null;
            await storage.logReminderDeliveryEvent(transactionId, {
              channel: 'sms',
              language,
              sentByUserId: sentByUserId2,
              twilioSid: null,
              deliveryStatus: 'opted_out',
              deliveryErrorCode: '21610',
            });
            return res.status(422).json({
              message: 'This number has opted out of SMS messages (STOP). Please use email instead.',
              optedOut: true,
              transaction,
            });
          }
          console.error("Failed to send return reminder SMS:", sendErr);
          return res.status(502).json({ message: sendErr?.message || "Failed to send reminder SMS" });
        }
        await commitBorrowerStatusToken(transactionId, prepared);
        const sentByUserId = req.isAuthenticated() ? ((req.user as any)?.id ?? null) : null;
        const updated = await storage.recordReturnReminderSent(transactionId, {
          channel,
          language,
          sentByUserId,
          twilioSid: smsSid,
        });
        return res.json({ success: true, transaction: updated, channel });
      }

      const sentByUserId = req.isAuthenticated() ? ((req.user as any)?.id ?? null) : null;
      const updated = await storage.recordReturnReminderSent(transactionId, {
        channel,
        language,
        sentByUserId,
      });
      res.json({ success: true, transaction: updated, channel });
    } catch (error: any) {
      console.error("Error sending return reminder:", error);
      res.status(500).json({ message: error?.message || "Failed to send return reminder" });
    }
  });

  // Lightweight, operator-scoped read of whether SMS reminders are
  // available in this environment. Returns a boolean and (when not
  // configured) a human-readable hint that the dashboard surfaces in
  // a tooltip — never the secret values themselves. Auth is required
  // so we don't leak even the configured/unconfigured signal publicly.
  app.get("/api/operator/sms-config-status", async (req, res) => {
    const operatorLocationId = getOperatorLocationId(req);
    if (!operatorLocationId) {
      return res.status(401).json({ message: "Operator authentication required" });
    }
    const status = getTwilioConfigStatus();
    // In production, the SMS body needs a public status link built from
    // a configured base URL. Reflect that prerequisite here so the UI
    // doesn't offer SMS only for the send to fail with 500.
    if (status.configured && process.env.NODE_ENV === 'production') {
      const envBase = (process.env.APP_URL || process.env.SITE_URL || '').trim();
      if (!envBase) {
        return res.json({ configured: false, reason: 'APP_URL or SITE_URL must be set so reminder SMS can include a borrower status link.' });
      }
    }
    res.json(status);
  });

  // List the full return-reminder send history for a single transaction (operator-scoped).
  app.get("/api/locations/:locationId/transactions/:id/return-reminders", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const transactionId = parseInt(req.params.id, 10);
      if (Number.isNaN(locationId) || Number.isNaN(transactionId)) {
        return res.status(400).json({ message: "Invalid location or transaction id" });
      }

      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Operator authentication required" });
      }
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction || transaction.locationId !== locationId) {
        return res.status(404).json({ message: "Transaction not found for this location" });
      }

      const events = await storage.getReturnReminderEvents(transactionId);
      res.json({ events });
    } catch (error: any) {
      console.error("Error fetching return reminder history:", error);
      res.status(500).json({ message: error?.message || "Failed to fetch reminder history" });
    }
  });

  // Transaction-scoped SMS opt-out check (operator-scoped).
  // Fetches the borrower's phone from the transaction and returns { optedOut: boolean }
  // indicating whether any prior SMS to that phone (within this location) was opted_out.
  // Using the transaction ID prevents operators from probing arbitrary phone numbers.
  app.get("/api/locations/:locationId/transactions/:id/sms-opt-out-check", async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId, 10);
      const transactionId = parseInt(req.params.id, 10);
      if (Number.isNaN(locationId) || Number.isNaN(transactionId)) {
        return res.status(400).json({ message: "Invalid location or transaction id" });
      }
      const operatorLocationId = getOperatorLocationId(req);
      if (!operatorLocationId) {
        return res.status(401).json({ message: "Operator authentication required" });
      }
      if (operatorLocationId !== -1 && operatorLocationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction || transaction.locationId !== locationId) {
        return res.status(404).json({ message: "Transaction not found for this location" });
      }
      const phone = (transaction.borrowerPhone || '').trim();
      if (!phone) {
        return res.json({ optedOut: false });
      }
      const optedOut = await storage.isPhoneOptedOutForSms(phone, locationId);
      res.json({ optedOut });
    } catch (error: any) {
      console.error("Error checking SMS opt-out status:", error);
      res.status(500).json({ message: error?.message || "Failed to check opt-out status" });
    }
  });

  // ============================================
  // TWILIO STATUS CALLBACK WEBHOOK
  // ============================================
  // Twilio POSTs delivery status updates (queued → sent → delivered / undelivered / failed)
  // here as URL-encoded bodies. We verify the Twilio signature then update the matching
  // return-reminder event so operators can see real delivery status in the timeline.
  // The route is intentionally unauthenticated (Twilio can't hold a session cookie) but
  // is protected by HMAC-SHA1 signature verification in production.
  // Twilio sends application/x-www-form-urlencoded; the global urlencoded
  // middleware in server/index.ts already parses it into req.body.
  app.post(
    "/api/webhooks/twilio/status",
    async (req, res) => {
      try {
        // Build the canonical public URL for signature verification so it
        // matches exactly what we registered with Twilio as the statusCallback.
        const envBase = (process.env.APP_URL || process.env.SITE_URL || '').trim();
        const publicUrl = envBase
          ? `${envBase.replace(/\/$/, '')}/api/webhooks/twilio/status`
          : undefined;

        const sigStatus = validateTwilioSignature(req, publicUrl);
        if (sigStatus === 'invalid') {
          console.warn('[twilio-status-webhook] rejected: invalid signature');
          return res.status(403).send('Forbidden');
        }
        // In development (unconfigured / missing), we log a warning but continue.
        if (sigStatus === 'missing' || sigStatus === 'unconfigured') {
          if (process.env.NODE_ENV === 'production') {
            console.warn(`[twilio-status-webhook] rejected in production: signature ${sigStatus}`);
            return res.status(403).send('Forbidden');
          }
          console.warn(`[twilio-status-webhook] signature ${sigStatus} — allowing in dev mode`);
        }

        const { MessageSid, MessageStatus, ErrorCode } = req.body as Record<string, string | undefined>;
        if (!MessageSid || !MessageStatus) {
          return res.status(400).send('Missing MessageSid or MessageStatus');
        }

        console.log(`[twilio-status-webhook] SID=${MessageSid} status=${MessageStatus}${ErrorCode ? ` errorCode=${ErrorCode}` : ''}`);
        await storage.updateReturnReminderDeliveryStatus(MessageSid, MessageStatus, ErrorCode ?? null);
        res.sendStatus(204);
      } catch (err: any) {
        console.error('[twilio-status-webhook] error:', err);
        res.status(500).send('Internal error');
      }
    },
  );

  // ============================================
  // TWILIO INBOUND SMS WEBHOOK (STOP / opt-out)
  // ============================================
  // When a borrower replies STOP (or STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT),
  // Twilio forwards the inbound message here. We parse the From number, mark all
  // SMS reminder events for that phone as opted_out so operators see the warning
  // in the timeline immediately — even for past sends where the status callback
  // already fired.
  //
  // Configure this URL in the Twilio console: Messaging → Phone Numbers → your number →
  // "A message comes in" → Webhook → <base_url>/api/webhooks/twilio/inbound
  app.post(
    "/api/webhooks/twilio/inbound",
    async (req, res) => {
      try {
        const envBase = (process.env.APP_URL || process.env.SITE_URL || '').trim();
        const publicUrl = envBase
          ? `${envBase.replace(/\/$/, '')}/api/webhooks/twilio/inbound`
          : undefined;

        const sigStatus = validateTwilioSignature(req, publicUrl);
        if (sigStatus === 'invalid') {
          console.warn('[twilio-inbound-webhook] rejected: invalid signature');
          return res.status(403).send('Forbidden');
        }
        if (sigStatus === 'missing' || sigStatus === 'unconfigured') {
          if (process.env.NODE_ENV === 'production') {
            console.warn(`[twilio-inbound-webhook] rejected in production: signature ${sigStatus}`);
            return res.status(403).send('Forbidden');
          }
          console.warn(`[twilio-inbound-webhook] signature ${sigStatus} — allowing in dev mode`);
        }

        const { From, Body, OptOutType } = req.body as Record<string, string | undefined>;
        if (!From) {
          return res.status(400).send('Missing From');
        }

        const bodyUpper = (Body || '').trim().toUpperCase();
        const isStopKeyword = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(bodyUpper);
        // Twilio also sets OptOutType='STOP' in the payload when an opt-out keyword is detected.
        const isOptOut = isStopKeyword || OptOutType === 'STOP';

        if (isOptOut) {
          const normalizedFrom = normalizePhoneForSms(From) || From;
          console.log(`[twilio-inbound-webhook] STOP from ${normalizedFrom}`);
          await storage.markPhoneOptedOut(normalizedFrom);
        } else {
          console.log(`[twilio-inbound-webhook] inbound from ${From} (not a STOP keyword, ignored)`);
        }

        // Twilio expects a 200 TwiML response (or 204) to confirm receipt.
        res.setHeader('Content-Type', 'text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      } catch (err: any) {
        console.error('[twilio-inbound-webhook] error:', err);
        res.status(500).send('Internal error');
      }
    },
  );

  // ============================================
  // ADMIN PLAYBOOK FACTS (AI knowledge base)
  // ============================================
  const requireAdminMW = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  app.get("/api/admin/playbook-facts", requireAdminMW, async (_req, res) => {
    try { res.json(await storage.getAllPlaybookFacts()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/admin/playbook-facts", requireAdminMW, async (req, res) => {
    try {
      const { factKey, factValue, category } = req.body as { factKey?: string; factValue?: string; category?: string };
      if (!factKey || !factValue) return res.status(400).json({ message: "factKey and factValue are required" });
      const f = await storage.createPlaybookFact({ factKey: factKey.trim(), factValue: factValue.trim(), category: (category || 'general').trim() });
      reindexFact(f).catch(() => {});
      res.status(201).json(f);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/admin/playbook-facts/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const f = await storage.updatePlaybookFact(id, req.body);
      reindexFact(f).catch(() => {});
      res.json(f);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/admin/playbook-facts/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deletePlaybookFact(id);
      storage.deleteKbEmbedding('fact', id).catch(() => {});
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/faq-entries", requireAdminMW, async (_req, res) => {
    try { res.json(await storage.getAllFaqEntries()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/admin/faq-entries", requireAdminMW, async (req, res) => {
    try {
      const parsed = insertFaqEntrySchema.parse(req.body);
      const f = await storage.createFaqEntry({
        ...parsed,
        question: parsed.question.trim(),
        answer: parsed.answer.trim(),
        language: parsed.language === 'he' ? 'he' : 'en',
        category: (parsed.category || 'general').trim(),
        isActive: parsed.isActive !== false,
      });
      reindexFaq(f).catch(() => {});
      res.status(201).json(f);
    } catch (e: any) {
      if (e?.issues) return res.status(400).json({ message: 'Invalid FAQ payload', issues: e.issues });
      res.status(500).json({ message: e.message });
    }
  });
  app.patch("/api/admin/faq-entries/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const f = await storage.updateFaqEntry(id, req.body);
      reindexFaq(f).catch(() => {});
      res.json(f);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/admin/faq-entries/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deleteFaqEntry(id);
      storage.deleteKbEmbedding('faq', id).catch(() => {});
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Knowledge documents (long-form)
  app.get("/api/admin/knowledge-docs", requireAdminMW, async (_req, res) => {
    try { res.json(await storage.getAllKnowledgeDocs()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/admin/knowledge-docs", requireAdminMW, async (req, res) => {
    try {
      const parsed = insertKnowledgeDocSchema.parse(req.body);
      const d = await storage.createKnowledgeDoc({
        ...parsed,
        title: parsed.title.trim(),
        body: parsed.body.trim(),
        category: (parsed.category || 'general').trim(),
        language: parsed.language === 'he' ? 'he' : 'en',
        isActive: parsed.isActive !== false,
      });
      reindexDoc(d).catch(() => {});
      res.status(201).json(d);
    } catch (e: any) {
      if (e?.issues) return res.status(400).json({ message: 'Invalid knowledge doc payload', issues: e.issues });
      res.status(500).json({ message: e.message });
    }
  });
  app.patch("/api/admin/knowledge-docs/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const d = await storage.updateKnowledgeDoc(id, req.body);
      reindexDoc(d).catch(() => {});
      res.json(d);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/admin/knowledge-docs/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deleteKnowledgeDoc(id);
      storage.deleteKbEmbedding('doc', id).catch(() => {});
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/knowledge-docs/:id/reset-to-default", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const doc = await storage.getKnowledgeDoc(id);
      if (!doc) return res.status(404).json({ message: 'Document not found' });
      if (!(SCENARIOS_RESETTABLE_TITLES as readonly string[]).includes(doc.title)) {
        return res.status(400).json({ message: 'This document does not have a resettable default' });
      }
      const lang = doc.language === 'he' ? 'he' : 'en';
      const baseUrl = (process.env.APP_URL || process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const defaultBody = buildScenariosSeedBody(lang, baseUrl);
      const updated = await storage.updateKnowledgeDoc(id, { body: defaultBody });
      reindexDoc(updated).catch(() => {});
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // List recent reply examples (for admin visibility / debugging)
  app.get("/api/admin/reply-examples", requireAdminMW, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(String(req.query.limit || '50'), 10) || 50);
      res.json(await storage.getRecentReplyExamples(limit));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Delete a captured reply example so it stops biasing future AI drafts.
  // Also removes the matching kb_embeddings row (sourceKind='reply_example')
  // so semantic retrieval can't surface it again. The embedding cleanup is
  // awaited (not fire-and-forget) so the response accurately reflects whether
  // the example is fully gone from both the training table AND the semantic
  // index. If only the embedding cleanup fails, we report partial success so
  // the admin knows to retry or re-index.
  app.delete("/api/admin/reply-examples/:id", requireAdminMW, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
      }
      await storage.deleteReplyExample(id);
      try {
        await storage.deleteKbEmbedding('reply_example', id);
        res.json({ success: true });
      } catch (embErr) {
        const msg = embErr instanceof Error ? embErr.message : String(embErr);
        console.warn(`Reply example ${id} deleted, but kb_embeddings cleanup failed:`, msg);
        res.status(207).json({
          success: true,
          embeddingDeleted: false,
          warning: `Reply example removed, but its semantic-index row could not be deleted: ${msg}. Use Re-index all to repair.`,
        });
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Which inbox items have already been replied to? Returns one row per
  // (sourceType, sourceRef). For email, sourceRef is the Gmail threadId.
  // Combines two sources so the list badge stays accurate even when the
  // admin replies directly in Gmail:
  //   1. Saved reply_examples (this app's own sends, plus any captured)
  //   2. Gmail threads with at least one SENT message (label SENT) — best
  //      effort, capped to recent threads to keep the call cheap. Each
  //      gmail-only entry has lastRepliedAt = "" so the UI knows to render
  //      the badge without an exact date (the precise per-message dates
  //      appear in the detail view's Sent replies panel).
  app.get("/api/admin/reply-examples/refs", requireAdminMW, async (_req, res) => {
    try {
      const saved = await storage.getReplyExampleRefs();
      const seen = new Set(saved.map((r) => `${r.sourceType}:${r.sourceRef}`));
      const merged = [...saved];
      try {
        const gmailConfigured = await getGmailConfigStatus();
        if (gmailConfigured.configured) {
          const sentThreadIds = await listSentThreadIds(500);
          for (const tid of sentThreadIds) {
            const key = `email:${tid}`;
            if (!seen.has(key)) {
              merged.push({ sourceType: "email", sourceRef: tid, lastRepliedAt: "" });
              seen.add(key);
            }
          }
        }
      } catch (gmailErr) {
        console.warn("Failed to merge Gmail SENT thread refs (non-fatal):",
          gmailErr instanceof Error ? gmailErr.message : String(gmailErr));
      }
      res.json(merged);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Full reply history for one message, oldest first. Used by the detail
  // view's "Sent replies" panel. For email items the response merges saved
  // reply_examples (sourceRef = Gmail threadId) with any Gmail-thread
  // messages that we sent (label SENT) so admins also see replies sent
  // directly from Gmail. Duplicates between the two sources are collapsed
  // by normalized body match.
  app.get("/api/admin/reply-examples/by-ref", requireAdminMW, async (req, res) => {
    try {
      const sourceType = String(req.query.sourceType || '').trim();
      const sourceRef = String(req.query.sourceRef || '').trim();
      if (!sourceType || !sourceRef) {
        return res.status(400).json({ message: "sourceType and sourceRef are required" });
      }
      if (sourceType !== 'email' && sourceType !== 'form') {
        return res.status(400).json({ message: "sourceType must be 'email' or 'form'" });
      }

      type SentReplyEntry = {
        id: string;
        source: 'saved' | 'gmail';
        sentReply: string;
        createdAt: string; // ISO
        senderEmail: string | null;
        senderName: string | null;
        wasEdited?: boolean;
      };

      const saved = await storage.getReplyExamplesByRef(sourceType, sourceRef);
      // Backward compatibility: older email reply records were keyed by the
      // Gmail message id (not threadId). When sourceType is email and a
      // legacyMessageId hint is supplied, also pull those rows so admins
      // don't lose visibility into pre-migration replies.
      const legacyMessageId = String(req.query.legacyMessageId || "").trim();
      let legacy: typeof saved = [];
      if (sourceType === "email" && legacyMessageId && legacyMessageId !== sourceRef) {
        try {
          legacy = await storage.getReplyExamplesByRef("email", legacyMessageId);
        } catch (legacyErr) {
          console.warn("Legacy reply-example lookup failed (non-fatal):",
            legacyErr instanceof Error ? legacyErr.message : String(legacyErr));
        }
      }
      const savedEntries: SentReplyEntry[] = [...saved, ...legacy].map((r) => ({
        id: `saved:${r.id}`,
        source: 'saved',
        sentReply: r.sentReply,
        createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
        senderEmail: r.senderEmail ?? null,
        senderName: r.senderName ?? null,
        wasEdited: r.wasEdited,
      }));

      if (sourceType === 'form') {
        return res.json(savedEntries);
      }

      // email: also merge in Gmail-side sent messages on this thread.
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const savedNormBodies = new Set(savedEntries.map((e) => norm(e.sentReply)));
      let gmailEntries: SentReplyEntry[] = [];
      try {
        const threadMessages = await getThreadMessages(sourceRef, 50);
        gmailEntries = threadMessages
          .filter((m) => Array.isArray(m.labels) && m.labels.includes('SENT'))
          .map((m) => {
            const fromMatch = String(m.from || '').match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/);
            const senderName = fromMatch ? (fromMatch[1] || fromMatch[2]) : (m.from || null);
            const senderEmail = fromMatch ? fromMatch[2] : ((m.from || '').includes('@') ? m.from : null);
            const dateRaw = m.date ? new Date(m.date) : new Date();
            const createdAt = isNaN(dateRaw.getTime()) ? new Date().toISOString() : dateRaw.toISOString();
            return {
              id: `gmail:${m.id}`,
              source: 'gmail' as const,
              sentReply: m.body || m.snippet || '',
              createdAt,
              senderEmail: senderEmail || null,
              senderName: senderName || null,
            };
          })
          // Drop messages whose body matches an already-saved reply to avoid
          // showing the same reply twice (saved row wins because it carries
          // wasEdited / classification metadata).
          .filter((g) => !savedNormBodies.has(norm(g.sentReply)));
      } catch (gmailErr) {
        console.warn('Failed to merge Gmail thread sent messages (non-fatal):',
          gmailErr instanceof Error ? gmailErr.message : String(gmailErr));
      }

      const merged = [...savedEntries, ...gmailEntries].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt));
      res.json(merged);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Full conversation transcript for a single inbox item.
  // For Gmail items the conversation is the underlying Gmail thread (every
  // message — inbound + outbound — oldest first). For contact-form items we
  // group prior submissions from the same sender that share the same
  // normalized subject and interleave any saved replies. The inbox detail
  // view uses this to render a Gmail-style transcript instead of one isolated
  // message at a time.
  app.get("/api/admin/inbox/thread", requireAdminMW, async (req, res) => {
    try {
      const source = String(req.query.source || '').trim();
      const ref = String(req.query.ref || '').trim();
      if (!source || !ref) {
        return res.status(400).json({ message: "source and ref are required" });
      }
      if (source !== 'email' && source !== 'form') {
        return res.status(400).json({ message: "source must be 'email' or 'form'" });
      }

      const norm = (s: string) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const { groupFormContacts, normalizeFormSubject } = await import('../shared/form-thread-grouping.js');

      type ThreadEntry = {
        id: string;
        direction: 'inbound' | 'outbound';
        from: string;
        to?: string;
        subject: string;
        body: string;
        date: string;          // ISO
        isRead?: boolean;
        source: 'gmail' | 'form' | 'saved';
        messageRef?: string;   // backend id (Gmail message id or contact id)
      };

      if (source === 'email') {
        // ref = Gmail threadId. Pull every message in the thread (no cap).
        const [threadMessages, savedReplies] = await Promise.all([
          getThreadMessages(ref).catch(() => []),
          storage.getReplyExamplesByRef('email', ref).catch(() => []),
        ]);
        const entries: ThreadEntry[] = [];
        const seenSentBodies = new Set<string>();
        for (const m of threadMessages) {
          const isSent = Array.isArray(m.labels) && m.labels.includes('SENT');
          if (isSent) seenSentBodies.add(norm(m.body || m.snippet || ''));
          const dateRaw = m.date ? new Date(m.date) : new Date();
          entries.push({
            id: `gmail:${m.id}`,
            direction: isSent ? 'outbound' : 'inbound',
            from: m.from,
            to: m.to,
            subject: m.subject,
            body: m.body || m.snippet || '',
            date: isNaN(dateRaw.getTime()) ? new Date().toISOString() : dateRaw.toISOString(),
            isRead: m.isRead,
            source: 'gmail',
            messageRef: m.id,
          });
        }
        // Defensive: include saved-only replies that didn't appear in the
        // Gmail thread (e.g. send failed at Gmail but we still recorded it).
        for (const r of savedReplies) {
          if (seenSentBodies.has(norm(r.sentReply))) continue;
          entries.push({
            id: `saved:${r.id}`,
            direction: 'outbound',
            from: r.senderName ? `${r.senderName} <${r.senderEmail || ''}>` : (r.senderEmail || 'us'),
            subject: r.incomingSubject,
            body: r.sentReply,
            date: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
            source: 'saved',
          });
        }
        entries.sort((a, b) => a.date.localeCompare(b.date));
        return res.json({ source: 'email', threadKey: ref, messages: entries });
      }

      // source === 'form': ref = contact id
      const contactId = parseInt(ref, 10);
      if (Number.isNaN(contactId)) {
        return res.status(400).json({ message: "ref must be a contact id for form source" });
      }
      const seedContact = await storage.getContact(contactId);
      if (!seedContact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const allContacts = await storage.getContactsByEmail(seedContact.email).catch(() => []);
      // Loose grouping: same sender + (identical | fuzzy-similar | empty
      // subject within 14d | any subject within 3d). See
      // shared/form-thread-grouping.ts for the full link rules — that
      // helper is also used by the inbox list and the AI context builder
      // so all three views agree on what counts as one conversation.
      const grouping = groupFormContacts(
        allContacts.map((c) => ({
          id: c.id,
          email: c.email,
          subject: c.subject,
          date: c.submittedAt,
        }))
      );
      const seedKey = grouping.keyByContactId.get(String(seedContact.id));
      const memberIdSet = new Set(
        seedKey ? grouping.membersByKey.get(seedKey) ?? [String(seedContact.id)] : [String(seedContact.id)]
      );
      const siblings = allContacts.filter((c) => memberIdSet.has(String(c.id)));
      const seedNormSubj = normalizeFormSubject(seedContact.subject);
      const repliesArrays = await Promise.all(
        siblings.map((c) => storage.getReplyExamplesByRef('form', String(c.id)).catch(() => []))
      );
      const entries: ThreadEntry[] = [];
      siblings.forEach((c, i) => {
        const ts = (c.submittedAt instanceof Date ? c.submittedAt : new Date(c.submittedAt));
        entries.push({
          id: `form:${c.id}`,
          direction: 'inbound',
          from: `${c.name} <${c.email}>`,
          subject: c.subject,
          body: c.message,
          date: (isNaN(ts.getTime()) ? new Date() : ts).toISOString(),
          isRead: !!c.isRead,
          source: 'form',
          messageRef: String(c.id),
        });
        for (const r of repliesArrays[i] || []) {
          entries.push({
            id: `saved:${r.id}`,
            direction: 'outbound',
            from: r.senderName ? `${r.senderName} <${r.senderEmail || ''}>` : 'us',
            subject: r.incomingSubject,
            body: r.sentReply,
            date: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
            source: 'saved',
          });
        }
      });
      entries.sort((a, b) => a.date.localeCompare(b.date));
      return res.json({
        source: 'form',
        threadKey: `${(seedContact.email || '').toLowerCase()}::${seedNormSubj}`,
        messages: entries,
      });
    } catch (e: any) {
      console.error("Failed to load inbox thread:", e);
      res.status(500).json({ message: e.message || "Failed to load conversation" });
    }
  });

  // Backfill embeddings (best-effort, idempotent)
  app.post("/api/admin/embeddings/backfill", requireAdminMW, async (_req, res) => {
    try {
      const result = await backfillEmbeddings();
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Re-seed the bundled /rules + common-scenarios knowledge docs (EN + HE) and
  // rebuild embeddings so retrieval works immediately. Idempotent — creates
  // missing docs and updates any whose body has drifted from the canonical source.
  app.post("/api/admin/knowledge-docs/seed", requireAdminMW, async (_req, res) => {
    try {
      const seedResult = await seedKnowledgeDocs();
      const indexResult = await backfillEmbeddings();
      res.json({
        created: seedResult.created,
        updated: seedResult.updated,
        skipped: seedResult.skipped,
        indexScanned: indexResult.scanned,
        indexCreated: indexResult.created,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Check URLs in a draft reply for potential broken links.
  // Used by the inbox composer to warn the admin before sending.
  app.post("/api/admin/check-urls", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
    const user = req.user as Express.User;
    if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });

    const { urls, rawText } = req.body as { urls?: unknown; rawText?: unknown };
    if (!Array.isArray(urls)) return res.status(400).json({ message: "urls must be an array" });
    const safeUrls = urls.filter((u): u is string => typeof u === "string" && u.length < 2048).slice(0, 20);

    const BLOCKED_DOMAINS = getBlockedDomains();

    // Returns true if hostname exactly matches a blocked domain or is a subdomain of one.
    const isBlocked = (hostname: string): boolean => {
      const h = hostname.toLowerCase().replace(/^www\./, "");
      return BLOCKED_DOMAINS.some((d) => h === d || h.endsWith("." + d));
    };

    // Also scan raw draft text for bare-domain mentions of blocklisted domains
    // so we catch "babybanzgemach.com/apply" even without an http:// prefix.
    const blockedInText: { url: string; ok: boolean; reason: string }[] = [];
    if (typeof rawText === "string") {
      for (const domain of BLOCKED_DOMAINS) {
        const escaped = domain.replace(/\./g, "\\.");
        // Match the domain optionally preceded by a subdomain label (e.g. "foo.babybanzgemach.com").
        // The (?![a-z0-9.-]) lookahead enforces a domain boundary so e.g. "babybanzgemach.co"
        // does NOT match inside "babybanzgemach.com".
        const pattern = new RegExp(`(?:^|\\s|[(<])((?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*${escaped}(?![a-z0-9.-])[^\\s)>]*)`, "gi");
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(rawText)) !== null) {
          const match = m[1].trim();
          if (match) blockedInText.push({ url: match, ok: false, reason: "domain on blocklist" });
        }
      }
    }

    // Returns true if a dotted-decimal IPv4 address falls in a private/reserved range.
    function isPrivateIPv4(ip: string): boolean {
      const parts = ip.split(".").map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true; // malformed → treat as unsafe
      const [a, b, c] = parts;
      return (
        a === 0 ||                             // 0.0.0.0/8
        a === 10 ||                            // 10.0.0.0/8
        a === 127 ||                           // 127.0.0.0/8 loopback
        (a === 100 && b >= 64 && b <= 127) ||  // 100.64.0.0/10 shared address space
        (a === 169 && b === 254) ||            // 169.254.0.0/16 link-local & metadata (AWS/GCP)
        (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12
        (a === 192 && b === 0 && c === 0) ||   // 192.0.0.0/24
        (a === 192 && b === 0 && c === 2) ||   // 192.0.2.0/24 TEST-NET-1
        (a === 192 && b === 168) ||            // 192.168.0.0/16
        (a === 198 && (b === 18 || b === 19)) ||// 198.18.0.0/15
        (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 TEST-NET-2
        (a === 203 && b === 0 && c === 113) ||  // 203.0.113.0/24 TEST-NET-3
        a >= 224                               // multicast + reserved
      );
    }

    const checkOne = (rawUrl: string): Promise<{ url: string; ok: boolean; reason?: string }> => {
      return new Promise((resolve) => {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          return resolve({ url: rawUrl, ok: false, reason: "invalid URL" });
        }
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return resolve({ url: rawUrl, ok: true }); // skip non-http links (mailto:, tel:, etc.)
        }

        if (isBlocked(parsedUrl.hostname)) {
          return resolve({ url: rawUrl, ok: false, reason: "domain on blocklist" });
        }

        // SSRF guard: resolve hostname and reject if it maps to a private/reserved IP.
        _dns.lookup(parsedUrl.hostname, { family: 4 }, (dnsErr, address) => {
          if (dnsErr) {
            // Could not resolve — treat as unreachable/broken.
            return resolve({ url: rawUrl, ok: false, reason: "DNS resolution failed" });
          }
          if (isPrivateIPv4(address)) {
            return resolve({ url: rawUrl, ok: false, reason: "resolves to a private/reserved IP" });
          }

          const lib = parsedUrl.protocol === "https:" ? _https : _http;
          const UA = "BabyBanz-Link-Checker/1.0";

          // Helper: make a single HTTP request and resolve with ok/reason.
          const makeRequest = (method: string, onResult: (status: number | null, err?: string) => void) => {
            const timer = setTimeout(() => {
              try { rr.destroy(); } catch {}
              onResult(null, "timeout");
            }, 6000);
            const opts: Record<string, unknown> = { method, timeout: 6000, headers: { "User-Agent": UA } };
            if (method === "GET") opts["headers"] = { "User-Agent": UA, "Range": "bytes=0-0" };
            const rr = lib.request(rawUrl, opts, (resp: { statusCode?: number; resume?: () => void }) => {
              clearTimeout(timer);
              try { if (typeof resp.resume === "function") resp.resume(); } catch {} // drain response
              onResult(resp.statusCode ?? 0);
            });
            rr.on("error", (e: Error) => { clearTimeout(timer); onResult(null, e.message); });
            rr.end();
          };

          makeRequest("HEAD", (status, err) => {
            if (err) return resolve({ url: rawUrl, ok: false, reason: err });
            if (status !== null && status >= 200 && status < 400) {
              return resolve({ url: rawUrl, ok: true });
            }
            // HEAD returned 405 (Method Not Allowed) or 403 — retry with GET.
            if (status === 405 || status === 403) {
              makeRequest("GET", (status2, err2) => {
                if (err2) return resolve({ url: rawUrl, ok: false, reason: err2 });
                if (status2 !== null && (status2 >= 200 && status2 < 400 || status2 === 206)) {
                  return resolve({ url: rawUrl, ok: true });
                }
                resolve({ url: rawUrl, ok: false, reason: `HTTP ${status2}` });
              });
            } else {
              resolve({ url: rawUrl, ok: false, reason: `HTTP ${status}` });
            }
          });
        });
      });
    };

    try {
      const urlResults = await Promise.all(safeUrls.map(checkOne));
      // Merge blocklist hits from raw text, deduplicating by url string.
      const seen = new Set(urlResults.map((r) => r.url));
      const extra = blockedInText.filter((r) => !seen.has(r.url));
      res.json({ results: [...urlResults, ...extra] });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Send reply to an email
  app.post("/api/admin/emails/:id/reply", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const user = req.user as Express.User;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { replyText, replySubject: customSubject, aiDraft, classification, matchedLocationId } = req.body as {
        replyText?: string; replySubject?: string;
        aiDraft?: string; classification?: string; matchedLocationId?: number;
      };
      if (!replyText || typeof replyText !== 'string') {
        return res.status(400).json({ message: "Reply text is required" });
      }

      const email = await getEmail(req.params.id);
      if (!email) {
        return res.status(404).json({ message: "Email not found" });
      }

      const subjectToUse = (typeof customSubject === 'string' && customSubject.trim())
        ? customSubject.trim()
        : email.subject;
      await sendReply(
        email.id,
        email.threadId,
        replyText,
        email.from,
        subjectToUse
      );

      // Capture as a reply example for future few-shot retrieval (best-effort)
      try {
        const fromMatch = String(email.from || '').match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/);
        const senderName = fromMatch ? fromMatch[1] || fromMatch[2] : email.from;
        const senderEmail = fromMatch ? fromMatch[2] : (email.from || '').includes('@') ? email.from : '';
        const language: 'en' | 'he' = /[\u0590-\u05FF]/.test(`${email.subject} ${email.body}`) ? 'he' : 'en';
        const wasEdited = computeReplyWasEdited(aiDraft, replyText);
        const parsed = insertReplyExampleSchema.parse({
          sourceType: 'email',
          // Use the Gmail threadId (not the message id) so reply state and
          // history can be tracked at the conversation level — multiple
          // incoming messages on the same thread share replied state.
          sourceRef: email.threadId || email.id,
          senderEmail: senderEmail || null,
          senderName: senderName || null,
          incomingSubject: email.subject || '(no subject)',
          incomingBody: email.body || '',
          sentReply: replyText,
          classification: classification || null,
          language,
          matchedLocationId: matchedLocationId ?? null,
          wasEdited,
        } satisfies InsertReplyExample);
        const example = await storage.createReplyExample(parsed);
        reindexReplyExample(example).catch((e: Error) =>
          console.warn('reindexReplyExample failed:', e?.message));
      } catch (capErr) {
        console.warn('Failed to capture reply example (non-fatal):',
          capErr instanceof Error ? capErr.message : String(capErr));
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending reply:", error);
      res.status(500).json({ message: error.message || "Failed to send reply" });
    }
  });

  // Generate AI response for a contact-form message
  app.post("/api/contact/:id/generate-response", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id, 10);
      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const result = await generateEmailResponse(
        contact.subject,
        contact.message,
        contact.name,
        contact.email,
        undefined,
        String(contact.id),
      );
      res.json({
        response: result.draft,
        classification: result.classification,
        needsHumanReview: result.needsHumanReview,
        reviewReason: result.reviewReason,
        matchedLocationId: result.matchedLocationId,
        matchedLocationName: result.matchedLocationName,
        language: result.language,
        confidence: result.confidence,
        sources: result.sources,
        citedSourceIds: result.citedSourceIds,
        todayIso: result.todayIso,
        senderHistoryCount: result.senderHistoryCount,
        threadHistoryCount: result.threadHistoryCount,
      });
    } catch (error: any) {
      console.error("Error generating contact AI response:", error);
      res.status(500).json({ message: error.message || "Failed to generate response" });
    }
  });

  // Translate arbitrary text (used by unified inbox)
  app.post("/api/admin/inbox/translate", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { text, target } = req.body as { text?: string; target?: string };
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ message: "Text is required" });
      }
      const targetLang: 'en' | 'he' = target === 'he' ? 'he' : 'en';
      const translated = await translateText(text, targetLang);
      res.json({ translated });
    } catch (error: any) {
      console.error("Error translating text:", error);
      res.status(500).json({ message: error.message || "Failed to translate" });
    }
  });

  // ============================================
  // PAY LATER (SETUP INTENT) ROUTES
  // ============================================

  // Server-authoritative fee quote — used by all UIs to display and consent to the
  // exact same amount the server will charge (payment-method > location > default).
  app.get("/api/deposits/fee-quote", async (req, res) => {
    try {
      const locationId = parseInt(req.query.locationId as string);
      const depositCents = parseInt(req.query.depositCents as string);
      if (!locationId || !depositCents || depositCents <= 0) {
        return res.status(400).json({ message: "locationId and depositCents required" });
      }
      const location = await storage.getLocation(locationId);
      if (!location) return res.status(404).json({ message: "Location not found" });
      const allPMs = await storage.getAllPaymentMethods();
      const stripePM = allPMs.find(pm => pm.provider === 'stripe' && pm.isActive);
      const { feeCents, totalCents } = computeFeeForPaymentMethod(depositCents, stripePM, location);
      const feeQuoteLocale = resolveConsentLocale(req.query.locale as string | undefined);
      return res.json({
        depositCents,
        feeCents,
        totalCents,
        percentBp: stripePM?.processingFeePercent ?? location?.processingFeePercent ?? 300,
        fixedCents: stripePM?.fixedFee ?? location?.processingFeeFixed ?? 30,
        locationName: location.name,
        consentText: buildCanonicalConsentText(location.name, totalCents, feeQuoteLocale),
      });
    } catch (err) {
      console.error("fee-quote error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create SetupIntent for card verification without charging
  app.post("/api/deposits/setup-intent", async (req, res) => {
    try {
      const {
        locationId,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        amountCents,
        consentText,
        consentMaxChargeCents,
      } = req.body;

      if (!locationId || !borrowerName) {
        return res.status(400).json({ message: "Location ID and borrower name are required" });
      }

      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      const amount = amountCents || (location.depositAmount || 20) * 100;

      // Consent is captured at two points:
      //   (a) self-service flow: client sends consentText + cap up-front.
      //   (b) operator-initiated flow: operator triggers card setup, then the
      //       borrower sees /status/<id> and ticks the consent box THERE
      //       (StripeSetupIntentForm in status.tsx) before the card is sent
      //       to Stripe. In that case consentText arrives at /confirm-setup.
      // Either way: by the time PayLaterService.chargeTransaction runs, the
      // consent_text column MUST be populated. Path (b) is enforced by the
      // borrower UI (button disabled) + server persists on confirm-setup.
      const trimmedConsent =
        typeof consentText === 'string' && consentText.trim().length >= 10
          ? String(consentText).trim()
          : undefined;

      const result = await PayLaterService.createSetupIntent({
        locationId,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        amountCents: amount,
        consentText: trimmedConsent,
        consentMaxChargeCents:
          typeof consentMaxChargeCents === 'number' ? consentMaxChargeCents : undefined,
      });

      res.json({
        transactionId: result.transactionId,
        clientSecret: result.clientSecret,
        publicStatusUrl: result.publicStatusUrl,
        publishableKey: getStripePublishableKey(),
      });
    } catch (error: any) {
      console.error("SetupIntent creation error:", error);
      res.status(500).json({ message: error.message || "Failed to create setup intent" });
    }
  });

  // Confirm SetupIntent completion (called by client after successful Stripe confirmation)
  // This provides immediate status update without waiting for webhooks
  app.post("/api/deposits/confirm-setup", async (req, res) => {
    try {
      // consentText and consentMaxChargeCents are intentionally not read from the
      // request body — the server computes both from stored transaction data so
      // neither the consent wording nor the charge cap are client-influenceable.
      const { setupIntentId, transactionId } = req.body;

      if (!setupIntentId) {
        return res.status(400).json({ message: "SetupIntent ID is required" });
      }

      const stripe = getStripeClient();
      
      // Retrieve the SetupIntent from Stripe to verify it succeeded
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      
      if (setupIntent.status !== 'succeeded') {
        return res.status(400).json({ 
          message: `SetupIntent is not in succeeded status. Current status: ${setupIntent.status}` 
        });
      }

      const paymentMethodId = setupIntent.payment_method as string;
      if (!paymentMethodId) {
        return res.status(400).json({ message: "No payment method attached to SetupIntent" });
      }

      // Persist consent from the magic-link flow (borrower accepted on /status/:id).
      // Security: look up the transaction by SetupIntent ID (1:1 mapping in DB) so
      // we never update consent for a transaction the caller doesn't own. The
      // transactionId body field, when provided, must match to prevent any
      // cross-transaction mutation.
      // The client-provided consentText is intentionally ignored — the server
      // computes the canonical sentence from stored data so the audit trail is
      // always byte-identical to what was shown via /api/status.
      const tx = await storage.getTransactionBySetupIntentId(setupIntentId);
      if (tx) {
        // Reject if caller supplied a transactionId that doesn't match.
        if (transactionId !== undefined && Number(transactionId) !== tx.id) {
          return res.status(403).json({ message: "transactionId does not match SetupIntent owner" });
        }
        const storedMax = tx.consentMaxChargeCents ?? tx.amountPlannedCents ?? 0;
        const txLocation = await storage.getLocation(tx.locationId);
        const serverConsentText = buildCanonicalConsentText(txLocation?.name ?? 'this gemach', storedMax);
        await storage.updateTransaction(tx.id, {
          consentText: serverConsentText,
          consentAcceptedAt: new Date(),
          // consentMaxChargeCents is kept as stored — the server does not allow
          // the client to widen or narrow the cap after setup-intent creation.
          consentMaxChargeCents: tx.consentMaxChargeCents ?? undefined,
        });
      }

      // Update the transaction status to CARD_SETUP_COMPLETE
      await PayLaterService.handleSetupIntentSucceeded(setupIntentId, paymentMethodId);

      console.log(`SetupIntent ${setupIntentId} confirmed via client callback`);
      
      res.json({ 
        success: true, 
        message: "Card setup confirmed successfully",
        status: 'CARD_SETUP_COMPLETE'
      });
    } catch (error: any) {
      console.error("SetupIntent confirmation error:", error);
      res.status(500).json({ message: error.message || "Failed to confirm setup intent" });
    }
  });

  // Public status page endpoint (no auth required, uses magic token)
  app.get("/api/status/:transactionId", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const token = req.query.token as string;

      if (!token) {
        return res.status(401).json({ message: "Token required" });
      }

      const transaction = await PayLaterService.getTransactionByToken(transactionId, token);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found or token invalid/expired" });
      }

      const location = await storage.getLocation(transaction.locationId);

      let paymentIntentClientSecret = null;
      if (transaction.payLaterStatus === 'CHARGE_REQUIRES_ACTION') {
        paymentIntentClientSecret = await PayLaterService.getPaymentIntentClientSecret(transactionId);
      }

      // Surface SetupIntent client_secret when the borrower hasn't saved their card yet.
      let setupIntentClientSecret: string | null = null;
      if (transaction.payLaterStatus === 'CARD_SETUP_PENDING' && transaction.stripeSetupIntentId) {
        try {
          const stripe = getStripeClient();
          const si = await stripe.setupIntents.retrieve(transaction.stripeSetupIntentId);
          setupIntentClientSecret = si.client_secret ?? null;
        } catch (e) {
          console.warn(`Failed to retrieve SetupIntent for tx ${transaction.id}:`, e);
        }
      }

      const needsStripe =
        transaction.payLaterStatus === 'CHARGE_REQUIRES_ACTION' ||
        transaction.payLaterStatus === 'CARD_SETUP_PENDING';

      res.json({
        id: transaction.id,
        status: transaction.payLaterStatus,
        borrowerName: transaction.borrowerName,
        amountCents: transaction.amountPlannedCents,
        currency: transaction.currency,
        locationName: location?.name,
        locationAddress: location?.address,
        locationPhone: location?.phone,
        locationEmail: location?.email,
        isReturned: transaction.isReturned,
        lastReturnReminderAt: transaction.lastReturnReminderAt,
        returnReminderCount: transaction.returnReminderCount ?? 0,
        requiresAction: transaction.payLaterStatus === 'CHARGE_REQUIRES_ACTION',
        paymentIntentClientSecret,
        // Task #39: setup-intent path (borrower saving card via magic link)
        setupIntentClientSecret,
        setupIntentId: transaction.stripeSetupIntentId,
        depositAmount: transaction.depositAmount,
        depositFeeCents: transaction.depositFeeCents ?? null,
        consentMaxChargeCents:
          transaction.consentMaxChargeCents ?? transaction.amountPlannedCents ?? null,
        consentText: buildCanonicalConsentText(
          location?.name ?? 'this gemach',
          transaction.consentMaxChargeCents ?? transaction.amountPlannedCents ?? 0,
          resolveConsentLocale(
            (req.query.locale as string | undefined) ?? req.get('accept-language')
          ),
        ),
        publishableKey: needsStripe ? getStripePublishableKey() : undefined,
      });
    } catch (error: any) {
      console.error("Status page error:", error);
      res.status(500).json({ message: "Failed to retrieve status" });
    }
  });

  // Get pending Pay Later transactions for operator
  app.get("/api/operator/transactions/pending", async (req, res) => {
    try {
      const operatorLocationId = (req.session as any).operatorLocationId;
      
      if (!req.isAuthenticated() && !operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const locationId = operatorLocationId || (req.user as any)?.locationId;
      
      if (!locationId) {
        return res.status(403).json({ message: "Operator location not set" });
      }

      const transactions = await storage.getPendingPayLaterTransactions(locationId);
      res.json(transactions);
    } catch (error: any) {
      console.error("Error fetching pending transactions:", error);
      res.status(500).json({ message: "Failed to fetch pending transactions" });
    }
  });

  // Operator accepts a self-deposit (confirms lending, card on file but NOT charged)
  app.post("/api/operator/transactions/:id/accept", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const operatorLocationId = (req.session as any).operatorLocationId;
      
      if (!req.isAuthenticated() && !operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.isAuthenticated() ? (req.user as any).id : undefined;
      const locationId = operatorLocationId || (req.user as any)?.locationId;

      const result = await PayLaterService.acceptTransaction(transactionId, userId, locationId);

      if (result.success) {
        res.json({ success: true, status: 'APPROVED' });
      } else {
        res.status(400).json({ success: false, message: result.errorMessage });
      }
    } catch (error: any) {
      console.error("Accept transaction error:", error);
      res.status(500).json({ message: error.message || "Failed to accept transaction" });
    }
  });

  // Operator approves and charges a transaction
  app.post("/api/operator/transactions/:id/charge", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);

      // Accept Passport (admin/operator) and PIN (operator) auth uniformly.
      // -1 means admin via getOperatorLocationId; we normalize that to
      // `undefined` before handing off so PayLaterService's location check
      // is bypassed for admins (any location) and enforced for operators.
      const resolvedLocationId = getOperatorLocationId(req);
      if (resolvedLocationId === null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Block any Passport user that isn't admin or operator (e.g. borrower).
      if (req.isAuthenticated()) {
        const u = req.user as Express.User;
        if (!u.isAdmin && u.role !== 'operator') {
          return res.status(403).json({ message: "Only operators and admins can charge cards" });
        }
      }

      const userId = req.isAuthenticated() ? (req.user as any).id : undefined;
      const locationId = resolvedLocationId === -1 ? undefined : resolvedLocationId;
      const operatorNote: string | undefined = typeof req.body?.operatorNote === 'string'
        ? req.body.operatorNote.trim() || undefined
        : undefined;

      const result = await PayLaterService.chargeTransaction(transactionId, userId, locationId, operatorNote);

      if (result.success) {
        res.json({ 
          success: true, 
          status: result.status,
          paymentIntentId: result.paymentIntentId 
        });
      } else if (result.requiresAction) {
        res.json({
          success: false,
          status: result.status,
          requiresAction: true,
          message: "Customer needs to complete additional authentication",
        });
      } else {
        res.status(400).json({
          success: false,
          status: result.status,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      }
    } catch (error: any) {
      console.error("Charge transaction error:", error);
      res.status(500).json({ message: error.message || "Failed to charge transaction" });
    }
  });

  // Operator refunds a pay-later charge that already went through.
  //
  // Transactional safety: we call Stripe FIRST (with a deterministic idempotency
  // key) and only persist refund metadata + status flip after Stripe confirms.
  // If the server crashes mid-call, a retry uses the same key and Stripe returns
  // the prior refund — we then persist normally on the second attempt. This
  // avoids the "marked refunded but Stripe never refunded" data-corruption
  // risk that a CAS-then-Stripe ordering has.
  //
  // Cumulative partial refunds: we track a running refundAmount on the row.
  // Each call is capped to (max - alreadyRefunded). Status flips to
  // PARTIALLY_REFUNDED on the first partial and to REFUNDED only when the full
  // charged amount has been returned across one or more refunds.
  //
  // Inventory: opt-in. The operator must pass itemPhysicallyReturned=true to
  // restock; otherwise the refund is treated as a money-only correction and
  // stock is left alone. The original charge does not adjust inventory.
  //
  // Audit: every refund (success path) writes an audit_log row capturing the
  // operator, amount, cumulative total, optional reason note, and Stripe refund id.
  app.post("/api/operator/transactions/:id/refund-pay-later", async (req, res) => {
    const transactionId = parseInt(req.params.id);
    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return res.status(400).json({ message: "Invalid transaction id" });
    }
    // Serialize per-transaction: prevents two concurrent refund requests both
    // passing remaining-amount validation and both calling Stripe, which would
    // refund more than was originally charged.
    return withRefundLock(transactionId, async () => {
    try {

      const locationId = getOperatorLocationId(req);
      if (locationId === null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const operatorUserId = req.isAuthenticated() ? (req.user as any).id : undefined;

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) return res.status(404).json({ message: "Transaction not found" });

      // locationId === -1 means admin — admins may refund any transaction
      if (locationId !== -1 && transaction.locationId !== locationId) {
        return res.status(403).json({ message: "Not authorized for this location" });
      }

      // Accept refunds against fully-CHARGED rows and against rows that have
      // already had one or more partial refunds (PARTIALLY_REFUNDED).
      const refundableStatuses = ["CHARGED", "PARTIALLY_REFUNDED"];
      if (!refundableStatuses.includes(transaction.payLaterStatus || "")) {
        return res.status(400).json({
          message: "Transaction has not been charged yet, or has already been fully refunded.",
        });
      }

      if (!transaction.stripePaymentIntentId) {
        return res.status(400).json({ message: "No Stripe payment intent found on this transaction" });
      }

      const depositCents = Math.round((transaction.depositAmount || 0) * 100);
      const feeCents = transaction.depositFeeCents ?? 0;
      // Legacy fallback: rows charged before depositFeeCents was tracked may
      // have amountPlannedCents capturing the true charged total. Use whichever
      // is larger so legacy rows can be fully refunded.
      const maxRefundCents = Math.max(depositCents + feeCents, transaction.amountPlannedCents ?? 0);
      const alreadyRefundedCents = Math.round(((transaction.refundAmount ?? 0) as number) * 100);
      const remainingCents = maxRefundCents - alreadyRefundedCents;
      if (remainingCents <= 0) {
        return res.status(400).json({ message: "This transaction has already been fully refunded." });
      }

      // Validate request body. refundAmount omitted => refund the remainder.
      // reason: optional free-text operator note, persisted to audit log.
      // itemPhysicallyReturned: opt-in flag controlling inventory restock.
      const refundBodySchema = z.object({
        refundAmount: z.number().positive().finite().optional(),
        reason: z.string().trim().max(500).optional(),
        itemPhysicallyReturned: z.boolean().optional(),
      });
      const parsed = refundBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid refund body: " + parsed.error.message });
      }
      const { refundAmount, reason, itemPhysicallyReturned } = parsed.data;
      const requestedCents = refundAmount !== undefined ? Math.round(refundAmount * 100) : remainingCents;
      if (requestedCents <= 0) {
        return res.status(400).json({ message: "Refund amount must be greater than zero." });
      }
      if (requestedCents > remainingCents) {
        return res.status(400).json({
          message: `Refund amount exceeds the remaining refundable balance of $${(remainingCents / 100).toFixed(2)}.`,
        });
      }

      // Task #55: Mark the row as REFUND_PENDING before calling Stripe so that
      // if the server crashes between here and the DB persist below, the
      // reconciliation job can detect and resolve the orphaned state.
      const priorStatus = transaction.payLaterStatus as PayLaterStatus;
      const pendingTx = await storage.transitionTransactionPayLaterStatus(
        transactionId,
        priorStatus,
        "REFUND_PENDING",
        { refundAttemptedAt: new Date() },
      );
      if (!pendingTx) {
        // CAS failed — another request raced us to REFUND_PENDING (or the status
        // changed since we validated it). The in-process mutex should prevent this
        // in normal operation; this is a cross-process safety net.
        return res.status(409).json({
          message: "Transaction is already being processed. Try again in a moment.",
        });
      }

      // Stripe-first call. Deterministic idempotency key keyed on
      // (transaction, prior cumulative, this amount) — replays after a crash
      // dedupe at Stripe and return the same refund object. Two simultaneous
      // identical clicks therefore produce ONE Stripe refund.
      let stripeRefund: { id: string };
      try {
        const stripe = getStripeClient();
        stripeRefund = await stripe.refunds.create(
          {
            payment_intent: transaction.stripePaymentIntentId,
            amount: requestedCents,
          },
          {
            idempotencyKey: `refund_${transactionId}_${alreadyRefundedCents}_${requestedCents}`,
          },
        );
      } catch (stripeErr: any) {
        console.error("Stripe refund error:", stripeErr);
        // Roll back REFUND_PENDING → prior status so the row isn't stuck.
        await storage.transitionTransactionPayLaterStatus(
          transactionId,
          "REFUND_PENDING",
          priorStatus,
          { refundAttemptedAt: null },
        ).catch(rollbackErr => {
          console.error(`[refund] Failed to roll back REFUND_PENDING for tx ${transactionId}:`, rollbackErr);
        });
        return res.status(502).json({ message: stripeErr.message || "Stripe refund failed" });
      }

      // Stripe has now actually refunded `requestedCents` (under a deterministic
      // idempotency key, so retries dedupe). We MUST persist this on top of
      // whatever the current DB cumulative is, even if a concurrent refund
      // also landed in between our initial read and this write. Strategy:
      // re-read current refundAmount, compute newCumulative = current + ours,
      // and CAS. On CAS conflict (another concurrent refund just committed
      // at the same instant), retry with the freshly re-read state. Limit to
      // a small number of attempts; the loop converges quickly because each
      // committed concurrent refund advances the read state.
      let updated: Transaction | undefined | null = null;
      let attempts = 0;
      let lastReadRefundedCents = alreadyRefundedCents;
      let lastReadStatus = transaction.payLaterStatus;
      let finalStatus: PayLaterStatus = "PARTIALLY_REFUNDED";
      let finalCumulativeCents = alreadyRefundedCents + requestedCents;
      while (attempts < 5 && !updated) {
        attempts++;
        const cur = await storage.getTransaction(transactionId);
        if (!cur) {
          // Transaction vanished between Stripe call and persist. Audit and bail.
          await storage.createAuditLog({
            actorUserId: operatorUserId,
            actorType: operatorUserId ? "operator" : "system",
            action: "refund_pay_later_persist_orphaned",
            entityType: "transaction",
            entityId: transactionId,
            metadata: JSON.stringify({
              stripeRefundId: stripeRefund.id,
              refundedCents: requestedCents,
              note: "transaction missing after Stripe refund succeeded",
            }),
          });
          return res.status(500).json({
            message: "Refund succeeded at Stripe but transaction record is missing. Audit logged.",
            stripeRefundId: stripeRefund.id,
          });
        }
        lastReadRefundedCents = Math.round(((cur.refundAmount ?? 0) as number) * 100);
        lastReadStatus = cur.payLaterStatus;
        finalCumulativeCents = Math.min(maxRefundCents, lastReadRefundedCents + requestedCents);
        finalStatus =
          finalCumulativeCents >= maxRefundCents ? "REFUNDED" : "PARTIALLY_REFUNDED";
        updated = await storage.recordTransactionRefund({
          id: transactionId,
          expectedPriorStatus: lastReadStatus as PayLaterStatus,
          expectedPriorRefundAmount: (cur.refundAmount ?? null) as number | null,
          newStatus: finalStatus,
          newRefundAmount: finalCumulativeCents / 100,
          stripeRefundId: stripeRefund.id,
        });
      }
      if (!updated) {
        // Highly unlikely after 5 retries (would require 5 concurrent successful
        // refunds in milliseconds). Stripe has the refund recorded under our
        // deterministic key. Log a critical audit row so an admin can reconcile.
        await storage.createAuditLog({
          actorUserId: operatorUserId,
          actorType: operatorUserId ? "operator" : "system",
          action: "refund_pay_later_persist_failed_after_retries",
          entityType: "transaction",
          entityId: transactionId,
          metadata: JSON.stringify({
            stripeRefundId: stripeRefund.id,
            requestedCents,
            attempts,
            lastReadRefundedCents,
            lastReadStatus,
          }),
        });
        return res.status(500).json({
          message: "Refund succeeded at Stripe but the database could not be updated after multiple attempts. Audit logged for manual reconciliation.",
          stripeRefundId: stripeRefund.id,
        });
      }
      const newRefundedCents = finalCumulativeCents;
      const newStatus = finalStatus;

      // Optional physical-return recording. First-time → flip + restock; already-returned → audit only.
      if (itemPhysicallyReturned) {
        if (!transaction.isReturned) {
          // First-time physical return: flip isReturned + restock atomically.
          await storage.markPhysicallyReturnedForRefund(transactionId, true);
        } else {
          // Already-returned: audit-only confirmation, no state/inventory change.
          await storage.createAuditLog({
            actorUserId: operatorUserId,
            actorType: operatorUserId ? "operator" : "system",
            action: "physical_return_reconfirmed_at_refund",
            entityType: "transaction",
            entityId: transactionId,
            beforeJson: null,
            afterJson: null,
            metadata: JSON.stringify({
              originalActualReturnDate: transaction.actualReturnDate,
              stripeRefundId: stripeRefund.id,
            }),
          });
        }
      }

      // Audit log: actor, amount, cumulative, status, reason, Stripe id, restock.
      await storage.createAuditLog({
        actorUserId: operatorUserId,
        actorType: operatorUserId ? "operator" : "system",
        action: "refund_pay_later",
        entityType: "transaction",
        entityId: transactionId,
        beforeJson: JSON.stringify({
          payLaterStatus: transaction.payLaterStatus,
          refundAmountCents: alreadyRefundedCents,
        }),
        afterJson: JSON.stringify({
          payLaterStatus: newStatus,
          refundAmountCents: newRefundedCents,
          stripeRefundId: stripeRefund.id,
        }),
        metadata: JSON.stringify({
          requestedCents,
          maxRefundCents,
          remainingBeforeCents: remainingCents,
          reason: reason ?? null,
          itemPhysicallyReturned: !!itemPhysicallyReturned,
        }),
      });

      res.json({
        success: true,
        refundedCents: requestedCents,
        cumulativeRefundedCents: newRefundedCents,
        status: newStatus,
        stripeRefundId: stripeRefund.id,
      });
    } catch (error: any) {
      console.error("Refund pay-later error:", error);
      res.status(500).json({ message: error.message || "Refund failed" });
    }
    });
  });

  // Operator declines a transaction (no charge)
  app.post("/api/operator/transactions/:id/decline", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { reason } = req.body;

      // Same auth pattern as /charge — admins (any location) and operators
      // (their own location) can release/decline a saved card.
      const resolvedLocationId = getOperatorLocationId(req);
      if (resolvedLocationId === null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (req.isAuthenticated()) {
        const u = req.user as Express.User;
        if (!u.isAdmin && u.role !== 'operator') {
          return res.status(403).json({ message: "Only operators and admins can release cards" });
        }
      }

      const userId = req.isAuthenticated() ? (req.user as any).id : undefined;
      const locationId = resolvedLocationId === -1 ? undefined : resolvedLocationId;

      const result = await PayLaterService.declineTransaction(transactionId, userId, locationId, reason);

      if (result.success) {
        res.json({ success: true, status: 'DECLINED' });
      } else {
        res.status(400).json({ success: false, message: result.errorMessage });
      }
    } catch (error: any) {
      console.error("Decline transaction error:", error);
      res.status(500).json({ message: error.message || "Failed to decline transaction" });
    }
  });


  // ===========================================================================
  // Admin notification settings — configurable admin alert email address.
  // ===========================================================================

  const ADMIN_NOTIFICATION_EMAIL_KEY = "admin_notification_email";

  /** Returns the admin notification email: DB setting → ADMIN_EMAIL env → GMAIL_USER env → "". */
  async function getAdminNotificationEmail(): Promise<string> {
    const row = await storage.getGlobalSetting(ADMIN_NOTIFICATION_EMAIL_KEY);
    if (row?.value) return row.value;
    return process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "";
  }

  app.get("/api/admin/settings/notifications", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const row = await storage.getGlobalSetting(ADMIN_NOTIFICATION_EMAIL_KEY);
    const dbValue = row?.value?.trim() || "";
    const envValue = (process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "").trim();
    const source: "db" | "env" | "none" = dbValue ? "db" : envValue ? "env" : "none";
    const effectiveEmail = dbValue || envValue || "";
    res.json({ adminEmail: dbValue, effectiveEmail, source });
  });

  app.patch("/api/admin/settings/notifications", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { adminEmail } = req.body || {};
    if (typeof adminEmail !== "string") {
      return res.status(400).json({ message: "adminEmail must be a string" });
    }
    const trimmed = adminEmail.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    await storage.setGlobalSetting(ADMIN_NOTIFICATION_EMAIL_KEY, trimmed);
    res.json({ adminEmail: trimmed });
  });

  // ===========================================================================
  // Stripe risk hardening — admin/operator settings, dispute summary,
  // request-new-card, and the Stripe operations runbook.
  // ===========================================================================

  // Operator-readable Stripe settings (no secrets, just policy values).
  app.get("/api/operator/stripe-settings", async (req, res) => {
    try {
      const operatorLocationId = (req.session as any).operatorLocationId;
      if (!req.isAuthenticated() && !operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const maxCardAgeDays = await getMaxCardAgeDays();
      res.json({ maxCardAgeDays });
    } catch (error: any) {
      console.error("operator/stripe-settings error:", error);
      res.status(500).json({ message: error.message || "Failed to load Stripe settings" });
    }
  });

  // Admin: read Stripe-policy settings (global + per-location fee config).
  app.get("/api/admin/settings/stripe", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const maxCardAgeDays = await getMaxCardAgeDays();
    const requirePreChargeNotification = await getRequirePreChargeNotification();
    // Return per-location fee config so admin UI can display it.
    const locations = await storage.getAllLocations();
    const locationFees = locations.map((loc: LocationRow) => ({
      locationId: loc.id,
      name: loc.name,
      processingFeePercent: loc.processingFeePercent ?? 300,   // basis points (300 = 3.00%)
      processingFeeFixed: loc.processingFeeFixed ?? 30,        // cents (30 = $0.30)
    }));
    res.json({ maxCardAgeDays, requirePreChargeNotification, locationFees });
  });

  // Admin: update Stripe-policy settings.
  // Accepts: maxCardAgeDays, requirePreChargeNotification, locationFees (array).
  app.patch("/api/admin/settings/stripe", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const { maxCardAgeDays, requirePreChargeNotification, locationFees } = req.body || {};

      if (maxCardAgeDays !== undefined) {
        const n = Number(maxCardAgeDays);
        if (!Number.isFinite(n) || n <= 0 || n > 365) {
          return res.status(400).json({ message: "maxCardAgeDays must be 1-365" });
        }
        await setMaxCardAgeDays(Math.floor(n));
      }

      if (requirePreChargeNotification !== undefined) {
        await setRequirePreChargeNotification(Boolean(requirePreChargeNotification));
      }

      // Update per-location fee config if provided.
      if (Array.isArray(locationFees)) {
        for (const item of locationFees) {
          const locId = Number(item?.locationId);
          if (!Number.isFinite(locId) || locId <= 0) continue;
          const patch: Record<string, number> = {};
          if (Number.isFinite(Number(item?.processingFeePercent))) {
            patch.processingFeePercent = Math.max(0, Math.floor(Number(item.processingFeePercent)));
          }
          if (Number.isFinite(Number(item?.processingFeeFixed))) {
            patch.processingFeeFixed = Math.max(0, Math.floor(Number(item.processingFeeFixed)));
          }
          if (Object.keys(patch).length > 0) {
            await storage.updateLocation(locId, patch);
          }
        }
      }

      const updatedMaxCardAgeDays = await getMaxCardAgeDays();
      const updatedRequireNotification = await getRequirePreChargeNotification();
      res.json({ maxCardAgeDays: updatedMaxCardAgeDays, requirePreChargeNotification: updatedRequireNotification });
    } catch (error: any) {
      console.error("admin/settings/stripe PATCH error:", error);
      res.status(500).json({ message: error.message || "Failed to update settings" });
    }
  });

  // Admin: 30-day per-location dispute summary. Highlights any location whose
  // dispute rate is approaching Stripe's 0.7% network threshold (we warn at 0.5%).
  app.get("/api/admin/disputes/summary", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const WARN_THRESHOLD = 0.005;
      const stats = await storage.getRecentDisputeStats(30);
      const locations = await storage.getAllLocations();
      const locById = new Map(locations.map((l: any) => [l.id, l]));
      const rows = stats.map(s => ({
        ...s,
        locationName: (locById.get(s.locationId) as any)?.name || `Location #${s.locationId}`,
        flagged: s.rate >= WARN_THRESHOLD,
      })).sort((a, b) => b.rate - a.rate);
      res.json({ warnThreshold: WARN_THRESHOLD, windowDays: 30, rows });
    } catch (error: any) {
      console.error("admin/disputes/summary error:", error);
      res.status(500).json({ message: error.message || "Failed to load dispute summary" });
    }
  });

  // Admin: list all disputes (most-recent first) for the /admin/disputes detail page.
  app.get("/api/admin/disputes", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const allDisputes = await storage.getAllDisputes();
      const locations = await storage.getAllLocations();
      const locById = new Map(locations.map((l: any) => [l.id, l]));
      res.json(allDisputes.map(d => ({
        ...d,
        locationName: (locById.get(d.locationId) as any)?.name || `Location #${d.locationId}`,
      })));
    } catch (error: any) {
      console.error("admin/disputes error:", error);
      res.status(500).json({ message: error.message || "Failed to load disputes" });
    }
  });

  // Admin: serve the Stripe operations runbook (markdown) for the dashboard link.
  app.get("/api/admin/docs/stripe-operations", async (req, res) => {
    if (!req.isAuthenticated() || !((req.user as any)?.isAdmin)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'docs', 'stripe-operations.md');
      const md = await fs.readFile(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(md);
    } catch (error: any) {
      console.error("admin/docs/stripe-operations error:", error);
      res.status(404).json({ message: "Runbook not found" });
    }
  });

  // Operator: re-request a new card from the borrower when the saved card is
  // stale. Spawns a fresh SetupIntent (new transaction) reusing the original
  // borrower contact + amount. Returns the public status URL the operator can
  // SMS/email to the borrower.
  app.post("/api/operator/transactions/:id/request-new-card", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      // getOperatorLocationId: null=not operator(401), -1=admin(any), n=location-scoped
      const allowedLocId = getOperatorLocationId(req);
      if (allowedLocId === null) {
        return res.status(401).json({ message: "Operator authentication required" });
      }
      const tx = await storage.getTransaction(transactionId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (allowedLocId !== -1 && allowedLocId !== tx.locationId) {
        return res.status(403).json({ message: "Not your location" });
      }

      // Pass base deposit only — createSetupIntent recomputes the fee, so
      // passing amountPlannedCents (which already includes the fee) would double it.
      const baseDepositCents = Math.round((tx.depositAmount || 0) * 100);
      const result = await PayLaterService.createSetupIntent({
        locationId: tx.locationId,
        borrowerName: tx.borrowerName,
        borrowerEmail: tx.borrowerEmail || undefined,
        borrowerPhone: tx.borrowerPhone || undefined,
        amountCents: baseDepositCents,
        currency: tx.currency || 'usd',
      });

      await storage.createAuditLog({
        actorUserId: req.isAuthenticated() ? (req.user as any).id : undefined,
        actorType: req.isAuthenticated() ? 'operator' : 'system',
        action: 'request_new_card',
        entityType: 'transaction',
        entityId: tx.id,
        afterJson: JSON.stringify({ newTransactionId: result.transactionId }),
      });

      res.json({
        newTransactionId: result.transactionId,
        statusUrl: result.publicStatusUrl,
        clientSecret: result.clientSecret,
      });
    } catch (error: any) {
      console.error("operator/request-new-card error:", error);
      res.status(500).json({ message: error.message || "Failed to request new card" });
    }
  });

  // ============================================================
  // TEST-ONLY SEEDING ENDPOINTS (disabled in production)
  // ============================================================
  // These endpoints exist solely to support e2e tests. They are
  // never registered when NODE_ENV === 'production'.
  if (process.env.NODE_ENV !== 'production') {
    // Seed a return-reminder event for a freshly-created test transaction.
    // Body: { locationId, borrowerName, twilioSid, deliveryStatus, channel?, deliveryErrorCode? }
    // Returns: { transactionId, twilioSid }
    app.post('/api/test/seed-reminder-event', async (req, res) => {
      try {
        const {
          locationId,
          borrowerName,
          twilioSid,
          deliveryStatus,
          channel = 'sms',
          deliveryErrorCode,
        } = req.body as Record<string, string | number | undefined>;

        if (!locationId || !borrowerName || !twilioSid || !deliveryStatus) {
          return res.status(400).json({ message: 'locationId, borrowerName, twilioSid and deliveryStatus are required' });
        }

        const tx = await storage.createTransaction({
          locationId: Number(locationId),
          borrowerName: String(borrowerName),
          borrowerEmail: `e2e-test-${Date.now()}@example.com`,
          depositAmount: 20,
          depositPaymentMethod: 'cash',
        });

        await storage.recordReturnReminderSent(tx.id, {
          channel: String(channel),
          language: 'en',
          twilioSid: String(twilioSid),
          deliveryStatus: String(deliveryStatus),
          deliveryErrorCode: deliveryErrorCode ? String(deliveryErrorCode) : null,
        });

        res.status(201).json({ transactionId: tx.id, twilioSid });
      } catch (err: any) {
        console.error('[test-seed] error:', err);
        res.status(500).json({ message: err.message });
      }
    });

    // Fetch a reminder event by twilioSid for webhook-update verification.
    app.get('/api/test/reminder-event-by-sid/:sid', async (req, res) => {
      try {
        const event = await storage.getReturnReminderEventBySid(req.params.sid);
        if (!event) return res.status(404).json({ message: 'Not found' });
        res.json(event);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    // Clean up a test transaction (mark as returned so it disappears from dashboards).
    app.delete('/api/test/transaction/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
        await storage.markTransactionReturned(id);
        res.sendStatus(204);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });
  }

  const httpServer = createServer(app);

  return httpServer;
}
