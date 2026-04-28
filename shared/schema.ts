import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Pay Later Status Enum for SetupIntent → PaymentIntent flow
export const PAY_LATER_STATUSES = [
  "REQUEST_CREATED",
  "CARD_SETUP_PENDING",
  "CARD_SETUP_COMPLETE",
  "APPROVED",
  "CHARGE_ATTEMPTED",
  "CHARGED",
  "CHARGE_REQUIRES_ACTION",
  "CHARGE_FAILED",
  "DECLINED",
  "EXPIRED"
] as const;
export type PayLaterStatus = typeof PAY_LATER_STATUSES[number];

// User schema (for authentication)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull().default("operator"), // "operator", "admin" - no generic user role
  isAdmin: boolean("is_admin").default(false),
  locationId: integer("location_id"), // Associated gemach location (for operators)
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isAdmin: true,
  locationId: true,
}).extend({
  inviteCode: z.string().min(1, "Invite code is required"),
});

// Login schema for validation
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Session table for connect-pg-simple (preserve during migrations)
export const userSessions = pgTable("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

// Operator login schema (PIN-based access)
export const operatorLoginSchema = z.object({
  locationCode: z.string().min(1, "Location code is required"),
  pin: z.string().min(4, "PIN must be at least 4 digits").max(6, "PIN must be at most 6 digits"),
});

// Region schema (for grouping locations by continent)
export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  slug: text("slug").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertRegionSchema = createInsertSchema(regions).pick({
  name: true,
  nameHe: true,
  slug: true,
  displayOrder: true,
});

// City Category schema (for grouping locations within regions)
export const cityCategories = pgTable("city_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g., "New York", "Los Angeles", "London"
  nameHe: text("name_he"),
  slug: text("slug").notNull(), // e.g., "new-york", "los-angeles", "london"
  regionId: integer("region_id").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isPopular: boolean("is_popular").default(false), // Admin can mark as popular city
  description: text("description"), // Optional description for the city category
  descriptionHe: text("description_he"),
  stateCode: text("state_code"), // US state code for state-level grouping (e.g., "NY", "CA")
});

export const insertCityCategorySchema = createInsertSchema(cityCategories).pick({
  name: true,
  nameHe: true,
  slug: true,
  regionId: true,
  displayOrder: true,
  isPopular: true,
  description: true,
  descriptionHe: true,
  stateCode: true,
});

// Headband colors available in the system
export const HEADBAND_COLORS = ["red", "blue", "black", "white", "pink", "purple", "green", "orange", "yellow", "gray"] as const;
export type HeadbandColor = typeof HEADBAND_COLORS[number];

// Inventory by color type (e.g., { "red": 5, "blue": 3 }) - for API responses
export type InventoryByColor = Partial<Record<HeadbandColor, number>>;

// Inventory table - proper normalized storage for headband inventory
export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  color: text("color").notNull(), // One of HEADBAND_COLORS
  quantity: integer("quantity").notNull().default(0),
});

export const insertInventorySchema = createInsertSchema(inventory).pick({
  locationId: true,
  color: true,
  quantity: true,
});

export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = z.infer<typeof insertInventorySchema>;

// Location schema
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  locationCode: text("location_code").notNull().unique(),
  contactPerson: text("contact_person").notNull(),
  contactPersonHe: text("contact_person_he"),
  address: text("address").notNull(),
  addressHe: text("address_he"),
  zipCode: text("zip_code"),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  regionId: integer("region_id").notNull(),
  cityCategoryId: integer("city_category_id"), // Optional city category assignment
  isActive: boolean("is_active").default(true),
  cashOnly: boolean("cash_only").default(false),
  depositAmount: integer("deposit_amount").default(20),
  paymentMethods: text("payment_methods").array().default(["cash"]),
  processingFeePercent: integer("processing_fee_percent").default(300), // 3.00% stored as 300 basis points
  operatorPin: text("operator_pin"),
  // Operator onboarding (Task #35): SMS+WhatsApp claim flow
  claimToken: text("claim_token").unique(),
  claimTokenCreatedAt: timestamp("claim_token_created_at"),
  welcomeSentAt: timestamp("welcome_sent_at"),
  welcomeSmsStatus: text("welcome_sms_status"), // 'sent' | 'failed' | null
  welcomeSmsError: text("welcome_sms_error"),
  welcomeSmsSentAt: timestamp("welcome_sms_sent_at"),
  welcomeWhatsappStatus: text("welcome_whatsapp_status"),
  welcomeWhatsappError: text("welcome_whatsapp_error"),
  welcomeWhatsappSentAt: timestamp("welcome_whatsapp_sent_at"),
  defaultWelcomeChannel: text("default_welcome_channel"), // 'sms' | 'whatsapp' | 'both' | null
  contactPreference: text("contact_preference"), // 'phone' | 'whatsapp' | 'email' | null
  contactPreferenceSetAt: timestamp("contact_preference_set_at"),
  onboardedAt: timestamp("onboarded_at"),
});

export const OPERATOR_WELCOME_CHANNELS = ["sms", "whatsapp", "both"] as const;
export type OperatorWelcomeChannel = (typeof OPERATOR_WELCOME_CHANNELS)[number];

export const OPERATOR_CONTACT_PREFERENCES = ["phone", "whatsapp", "email"] as const;
export type OperatorContactPreference = (typeof OPERATOR_CONTACT_PREFERENCES)[number];

export const insertLocationSchema = createInsertSchema(locations).pick({
  name: true,
  nameHe: true,
  locationCode: true,
  contactPerson: true,
  contactPersonHe: true,
  address: true,
  addressHe: true,
  zipCode: true,
  phone: true,
  email: true,
  regionId: true,
  cityCategoryId: true,
  isActive: true,
  cashOnly: true,
  depositAmount: true,
  paymentMethods: true,
  processingFeePercent: true,
  operatorPin: true,
});

// GemachApplication schema
export const gemachApplications = pgTable("gemach_applications", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  streetAddress: text("street_address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  country: text("country").notNull(),
  community: text("community"),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertGemachApplicationSchema = createInsertSchema(gemachApplications).pick({
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  streetAddress: true,
  city: true,
  state: true,
  zipCode: true,
  country: true,
  community: true,
  message: true,
});

// Invite Codes schema (for operator registration)
export const inviteCodes = pgTable("invite_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  locationId: integer("location_id").notNull(),
  applicationId: integer("application_id"),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedAt: timestamp("used_at"),
  usedByUserId: integer("used_by_user_id"),
});

export const insertInviteCodeSchema = createInsertSchema(inviteCodes).pick({
  code: true,
  locationId: true,
  applicationId: true,
});

// Transaction schema (for deposit tracking)
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  borrowerName: text("borrower_name").notNull(),
  borrowerEmail: text("borrower_email"),
  borrowerPhone: text("borrower_phone"),
  headbandColor: text("headband_color"), // Color of headband borrowed
  depositAmount: doublePrecision("deposit_amount").notNull().default(20), // Default $20
  depositPaymentMethod: text("deposit_payment_method").default("cash"), // "cash" or "card"
  refundAmount: doublePrecision("refund_amount"), // Amount actually refunded (for partial refunds)
  isReturned: boolean("is_returned").default(false),
  borrowDate: timestamp("borrow_date").notNull().defaultNow(),
  expectedReturnDate: timestamp("expected_return_date"),
  actualReturnDate: timestamp("actual_return_date"),
  notes: text("notes"),
  // Pay Later (SetupIntent → PaymentIntent) fields
  payLaterStatus: text("pay_later_status"), // One of PAY_LATER_STATUSES
  stripeCustomerId: text("stripe_customer_id"), // cus_*
  stripeSetupIntentId: text("stripe_setup_intent_id"), // seti_*
  stripePaymentMethodId: text("stripe_payment_method_id"), // pm_*
  stripePaymentIntentId: text("stripe_payment_intent_id"), // pi_* (nullable, set when charge is created)
  amountPlannedCents: integer("amount_planned_cents"), // Amount to charge in cents
  currency: text("currency").default("usd"),
  magicToken: text("magic_token"), // Hashed token for public status page
  magicTokenExpiresAt: timestamp("magic_token_expires_at"),
  chargeErrorCode: text("charge_error_code"), // Stripe error code if charge fails
  chargeErrorMessage: text("charge_error_message"), // Stripe error message
  // Return reminder tracking (fast summary; detailed history lives in returnReminderEvents)
  lastReturnReminderAt: timestamp("last_return_reminder_at"),
  returnReminderCount: integer("return_reminder_count").notNull().default(0),
});

// Per-send history of return reminders for each transaction.
export const returnReminderEvents = pgTable("return_reminder_events", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  sentByUserId: integer("sent_by_user_id"),
  channel: text("channel").notNull().default("email"),
  language: text("language").notNull().default("en"),
});

export const insertReturnReminderEventSchema = createInsertSchema(returnReminderEvents).omit({
  id: true,
  sentAt: true,
});

export type ReturnReminderEvent = typeof returnReminderEvents.$inferSelect;
export type InsertReturnReminderEvent = z.infer<typeof insertReturnReminderEventSchema>;
export type ReturnReminderEventWithSender = ReturnReminderEvent & { senderName: string | null };

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  locationId: true,
  borrowerName: true,
  borrowerEmail: true,
  borrowerPhone: true,
  headbandColor: true,
  depositAmount: true,
  depositPaymentMethod: true,
  expectedReturnDate: true,
  notes: true,
  payLaterStatus: true,
  stripeCustomerId: true,
  stripeSetupIntentId: true,
  stripePaymentMethodId: true,
  stripePaymentIntentId: true,
  amountPlannedCents: true,
  currency: true,
  magicToken: true,
  magicTokenExpiresAt: true,
  chargeErrorCode: true,
  chargeErrorMessage: true,
}).extend({
  expectedReturnDate: z.union([
    z.date(),
    z.string().transform((str) => new Date(str)),
  ]).optional(),
  magicTokenExpiresAt: z.union([
    z.date(),
    z.string().transform((str) => new Date(str)),
  ]).optional(),
});

// Contact schema
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  isRead: boolean("is_read").default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  isSpam: boolean("is_spam").notNull().default(false),
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  name: true,
  email: true,
  subject: true,
  message: true,
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type GemachApplication = typeof gemachApplications.$inferSelect;
export type InsertGemachApplication = z.infer<typeof insertGemachApplicationSchema>;

export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertInviteCode = z.infer<typeof insertInviteCodeSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

// Global Settings schema
export const globalSettings = pgTable("global_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  isEnabled: boolean("is_enabled").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGlobalSettingSchema = createInsertSchema(globalSettings).pick({
  key: true,
  value: true,
  isEnabled: true,
});

export type GlobalSetting = typeof globalSettings.$inferSelect;
export type InsertGlobalSetting = z.infer<typeof insertGlobalSettingSchema>;

// Payment Methods Configuration
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "stripe", "paypal", "square", "cash", "venmo", "zelle"
  displayName: text("display_name").notNull(), // "Credit/Debit Card", "PayPal", etc.
  provider: text("provider"), // "stripe", "paypal", "square" - null for cash/manual methods
  isActive: boolean("is_active").default(true),
  isAvailableToLocations: boolean("is_available_to_locations").default(false),
  processingFeePercent: integer("processing_fee_percent").default(0), // stored as basis points (290 = 2.9%)
  fixedFee: integer("fixed_fee").default(0), // in cents
  requiresApi: boolean("requires_api").default(false),
  apiKey: text("api_key"), // encrypted API key
  apiSecret: text("api_secret"), // encrypted API secret  
  webhookSecret: text("webhook_secret"), // encrypted webhook secret
  isConfigured: boolean("is_configured").default(false), // true when API credentials are provided
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).pick({
  name: true,
  displayName: true,
  provider: true,
  isActive: true,
  isAvailableToLocations: true,
  processingFeePercent: true,
  fixedFee: true,
  requiresApi: true,
  apiKey: true,
  apiSecret: true,
  webhookSecret: true,
  isConfigured: true,
});

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;

// City category type definitions
export type CityCategory = typeof cityCategories.$inferSelect;
export type InsertCityCategory = z.infer<typeof insertCityCategorySchema>;

// Location Payment Methods (which methods each location accepts)
export const locationPaymentMethods = pgTable("location_payment_methods", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  paymentMethodId: integer("payment_method_id").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  customProcessingFee: integer("custom_processing_fee"), // override global fee if set
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLocationPaymentMethodSchema = createInsertSchema(locationPaymentMethods).pick({
  locationId: true,
  paymentMethodId: true,
  isEnabled: true,
  customProcessingFee: true,
});

export type LocationPaymentMethod = typeof locationPaymentMethods.$inferSelect;
export type InsertLocationPaymentMethod = z.infer<typeof insertLocationPaymentMethodSchema>;

// Payment schema for tracking payments
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull(),
  paymentMethod: text("payment_method").notNull(), // "cash", "stripe", "paypal", "square"
  paymentProvider: text("payment_provider"), // "stripe", "paypal", "square" 
  externalPaymentId: text("external_payment_id"), // Provider's payment ID
  depositAmount: integer("deposit_amount").notNull(),
  processingFee: integer("processing_fee").default(0),
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull().default("pending"), // "pending", "confirming", "completed", "failed", "refunded"
  paymentData: text("payment_data"), // JSON string of provider response
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  retryAttempts: integer("retry_attempts").default(0),
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  transactionId: true,
  paymentMethod: true,
  paymentProvider: true,
  externalPaymentId: true,
  depositAmount: true,
  processingFee: true,
  totalAmount: true,
  status: true,
  paymentData: true,
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// Audit Log schema for tracking operator/admin actions (Pay Later flow)
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id"), // User who performed the action (null for system actions)
  actorType: text("actor_type").notNull().default("user"), // "user", "operator", "system", "webhook"
  action: text("action").notNull(), // "charge_initiated", "charge_succeeded", "charge_failed", "declined", etc.
  entityType: text("entity_type").notNull(), // "transaction", "payment", etc.
  entityId: integer("entity_id").notNull(),
  beforeJson: text("before_json"), // JSON snapshot before change
  afterJson: text("after_json"), // JSON snapshot after change
  metadata: text("metadata"), // Additional context (error codes, stripe event ids, etc.)
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  actorUserId: true,
  actorType: true,
  action: true,
  entityType: true,
  entityId: true,
  beforeJson: true,
  afterJson: true,
  metadata: true,
  ipAddress: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Webhook Events deduplication table (for idempotent webhook handling)
export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(), // Stripe event ID
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).pick({
  eventId: true,
  eventType: true,
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;

// AI Playbook Facts — admin-editable global facts the AI uses when drafting replies
export const playbookFacts = pgTable("playbook_facts", {
  id: serial("id").primaryKey(),
  factKey: text("fact_key").notNull().unique(),
  factValue: text("fact_value").notNull(),
  category: text("category").notNull().default("general"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertPlaybookFactSchema = createInsertSchema(playbookFacts).omit({ id: true, updatedAt: true });
export type PlaybookFact = typeof playbookFacts.$inferSelect;
export type InsertPlaybookFact = z.infer<typeof insertPlaybookFactSchema>;

// AI FAQ Knowledge Base — admin-curated Q&A pairs the AI references when drafting
export const faqEntries = pgTable("faq_entries", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  language: text("language").notNull().default("en"),
  category: text("category").notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertFaqEntrySchema = createInsertSchema(faqEntries).omit({ id: true, updatedAt: true });
export type FaqEntry = typeof faqEntries.$inferSelect;
export type InsertFaqEntry = z.infer<typeof insertFaqEntrySchema>;

// Long-form knowledge documents (rules, policies, common scenarios) — chunked + embedded
export const knowledgeDocs = pgTable("knowledge_docs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("general"),
  language: text("language").notNull().default("en"),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertKnowledgeDocSchema = createInsertSchema(knowledgeDocs).omit({ id: true, updatedAt: true });
export type KnowledgeDoc = typeof knowledgeDocs.$inferSelect;
export type InsertKnowledgeDoc = z.infer<typeof insertKnowledgeDocSchema>;

// Reply examples — captured every time the admin sends a reply, used as few-shot training
export const replyExamples = pgTable("reply_examples", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'email' | 'form'
  sourceRef: text("source_ref"), // gmail message id or contact id (string)
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  incomingSubject: text("incoming_subject").notNull(),
  incomingBody: text("incoming_body").notNull(),
  sentReply: text("sent_reply").notNull(),
  classification: text("classification"),
  language: text("language").notNull().default("en"),
  matchedLocationId: integer("matched_location_id"),
  wasEdited: boolean("was_edited").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const insertReplyExampleSchema = createInsertSchema(replyExamples).omit({ id: true, createdAt: true });
export type ReplyExample = typeof replyExamples.$inferSelect;
export type InsertReplyExample = z.infer<typeof insertReplyExampleSchema>;

// Unified semantic-search index over fact / faq / doc / reply_example sources
export const KB_SOURCE_KINDS = ["fact", "faq", "doc", "reply_example"] as const;
export type KbSourceKind = typeof KB_SOURCE_KINDS[number];
export const kbEmbeddings = pgTable("kb_embeddings", {
  id: serial("id").primaryKey(),
  sourceKind: text("source_kind").notNull(),
  sourceId: integer("source_id").notNull(),
  chunkIdx: integer("chunk_idx").notNull().default(0),
  content: text("content").notNull(),
  embedding: jsonb("embedding").notNull(), // number[]
  language: text("language").notNull().default("en"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertKbEmbeddingSchema = createInsertSchema(kbEmbeddings).omit({ id: true, updatedAt: true });
export type KbEmbedding = typeof kbEmbeddings.$inferSelect;
export type InsertKbEmbedding = z.infer<typeof insertKbEmbeddingSchema>;
