import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { PaymentSyncService } from "./payment-sync.js";
import { DepositSyncService } from "./deposit-sync.js";
import { DepositRefundService } from "./deposit-refund.js";
import { EmailNotificationService, sendOperatorWelcomeEmail } from "./email-notifications.js";
import { AuditTrailService } from "./audit-trail.js";
import { PaymentAnalyticsEngine } from "./analytics-engine.js";
import { DepositDetectionService } from "./deposit-detection.js";
import { DepositService, type UserRole } from "./depositService.js";
import { PayLaterService } from "./payLaterService.js";
import { getStripePublishableKey, getStripeClient } from "./stripeClient.js";
import { listEmails, getEmail, markAsRead, sendReply, sendNewEmail, getGmailConfigStatus } from "./gmail-client.js";
import { generateEmailResponse, translateText } from "./openai-client.js";
import { z } from "zod";

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
  insertGemachApplicationSchema,
  insertContactSchema,
  insertTransactionSchema,
  insertPaymentSchema,
  insertPaymentMethodSchema,
  insertLocationPaymentMethodSchema,
  insertCityCategorySchema,
  operatorLoginSchema,
  HEADBAND_COLORS
} from "../shared/schema.js";
import { setupAuth, requireRole, requireOperatorForLocation, createTestUsers } from "./auth.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Create test users for demonstration
  await createTestUsers();

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
    try {
      const regionData = req.body;
      const region = await storage.createRegion(regionData);
      res.status(201).json(region);
    } catch (error) {
      console.error("Error creating region:", error);
      res.status(500).json({ message: "Failed to create region" });
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
  app.get("/api/locations", async (req, res) => {
    try {
      const locations = await storage.getAllLocations();
      res.json(locations);
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
      res.json(locations);
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
      
      res.json(location);
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
      
      const updatedLocation = await storage.updateLocation(id, req.body);
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
      
      if (location.operatorPin !== pin) {
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
          location: { ...locationWithoutPin, pinIsDefault: operatorPin === '1234' }
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

      if (location.operatorPin !== currentPin) {
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
      await sendOperatorWelcomeEmail({
        locationName: location.name,
        locationCode: location.locationCode,
        operatorName: location.contactPerson || '',
        operatorEmail: location.email,
        dashboardUrl,
        defaultPin: location.operatorPin || '1234',
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
          await sendOperatorWelcomeEmail({
            locationName: loc.name,
            locationCode: loc.locationCode,
            operatorName: loc.contactPerson || '',
            operatorEmail: loc.email,
            dashboardUrl,
            defaultPin: loc.operatorPin || '1234',
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

  // APPLICATIONS ROUTES
  app.get("/api/applications", async (req, res) => {
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid application data", errors: error.errors });
      }
      console.error("Error creating application:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });

  app.patch("/api/applications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const application = await storage.getApplication(id);
      
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      const updatedApplication = await storage.updateApplication(id, req.body);
      res.json(updatedApplication);
    } catch (error) {
      console.error("Error updating application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Approve application and create location
  app.post("/api/applications/:id/approve-with-location", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const application = await storage.getApplication(id);
      
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      if (application.status !== "pending") {
        return res.status(400).json({ message: "Application is not pending" });
      }

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
      
      res.status(201).json({ 
        application: updatedApplication, 
        location,
        inviteCode: inviteCode.code 
      });
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
      const { subject, message, isRead } = req.body;
      const updateData: any = {};
      if (subject !== undefined) updateData.subject = subject;
      if (message !== undefined) updateData.message = message;
      if (isRead !== undefined) updateData.isRead = isRead;
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
      const { replyText, replySubject: customSubject } = req.body as { replyText?: string; replySubject?: string };
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
        await EmailNotificationService.notifyFailedDeposit(updatedPayment, transaction);
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
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const { transactionId, locationId } = req.body;
      
      // Get location to determine deposit amount
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      const depositAmount = location.depositAmount || 20;
      
      // Create cash payment record - requires confirmation
      const payment = await storage.createPayment({
        transactionId,
        paymentMethod: "cash",
        depositAmount: depositAmount * 100,
        processingFee: 0, // No processing fee for cash
        totalAmount: depositAmount * 100,
        status: "confirming" // Requires manual confirmation even for cash
      });
      
      res.json({
        paymentId: payment.id,
        status: "confirming",
        amount: depositAmount * 100,
        message: "Payment created - requires confirmation"
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
        paymentResult = await DepositService.initiateCashPayment(transaction.id, locationId);
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

      const status = getGmailConfigStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Error checking Gmail status:", error);
      res.status(500).json({ message: error.message || "Failed to check Gmail status" });
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
      const result = await listEmails(maxResults, pageToken);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching emails:", error);
      const raw = String(error?.message || error?.response?.data?.error || "");
      if (/invalid_grant/i.test(raw)) {
        return res.status(401).json({
          code: "gmail_invalid_grant",
          message: "Gmail refresh token is invalid or expired. Generate a new GMAIL_REFRESH_TOKEN and update the environment variable.",
        });
      }
      res.status(500).json({ message: error.message || "Failed to fetch emails" });
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
        senderEmail
      );
      res.json({
        response: result.draft,
        classification: result.classification,
        needsHumanReview: result.needsHumanReview,
        reviewReason: result.reviewReason,
      });
    } catch (error: any) {
      console.error("Error generating AI response:", error);
      res.status(500).json({ message: error.message || "Failed to generate response" });
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

      const { replyText, replySubject: customSubject } = req.body as { replyText?: string; replySubject?: string };
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
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending reply:", error);
      res.status(500).json({ message: error.message || "Failed to send reply" });
    }
  });

  // Generate AI response for a contact-form message
  app.post("/api/contact/:id/generate-response", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
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
        contact.email
      );
      res.json({
        response: result.draft,
        classification: result.classification,
        needsHumanReview: result.needsHumanReview,
        reviewReason: result.reviewReason,
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

  // Create SetupIntent for card verification without charging
  app.post("/api/deposits/setup-intent", async (req, res) => {
    try {
      const { locationId, borrowerName, borrowerEmail, borrowerPhone, amountCents } = req.body;

      if (!locationId || !borrowerName) {
        return res.status(400).json({ message: "Location ID and borrower name are required" });
      }

      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      const amount = amountCents || (location.depositAmount || 20) * 100;

      const result = await PayLaterService.createSetupIntent({
        locationId,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        amountCents: amount,
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

      res.json({
        id: transaction.id,
        status: transaction.payLaterStatus,
        borrowerName: transaction.borrowerName,
        amountCents: transaction.amountPlannedCents,
        currency: transaction.currency,
        locationName: location?.name,
        locationAddress: location?.address,
        requiresAction: transaction.payLaterStatus === 'CHARGE_REQUIRES_ACTION',
        paymentIntentClientSecret,
        publishableKey: transaction.payLaterStatus === 'CHARGE_REQUIRES_ACTION' ? getStripePublishableKey() : undefined,
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
      const operatorLocationId = (req.session as any).operatorLocationId;
      
      if (!req.isAuthenticated() && !operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.isAuthenticated() ? (req.user as any).id : undefined;
      const locationId = operatorLocationId || (req.user as any)?.locationId;

      const result = await PayLaterService.chargeTransaction(transactionId, userId, locationId);

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

  // Operator declines a transaction (no charge)
  app.post("/api/operator/transactions/:id/decline", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { reason } = req.body;
      const operatorLocationId = (req.session as any).operatorLocationId;
      
      if (!req.isAuthenticated() && !operatorLocationId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.isAuthenticated() ? (req.user as any).id : undefined;
      const locationId = operatorLocationId || (req.user as any)?.locationId;

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

  const httpServer = createServer(app);

  return httpServer;
}
