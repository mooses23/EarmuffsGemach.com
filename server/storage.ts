import {
  users, type User, type InsertUser,
  regions, type Region, type InsertRegion,
  cityCategories, type CityCategory, type InsertCityCategory,
  locations, type Location, type InsertLocation,
  gemachApplications, type GemachApplication, type InsertGemachApplication,
  inviteCodes, type InviteCode, type InsertInviteCode,
  transactions, type Transaction, type InsertTransaction,
  contacts, type Contact, type InsertContact,
  payments, type Payment, type InsertPayment,
  paymentMethods, type PaymentMethod, type InsertPaymentMethod,
  locationPaymentMethods, type LocationPaymentMethod, type InsertLocationPaymentMethod,
  inventory, type Inventory, type InsertInventory,
  auditLogs, type AuditLog, type InsertAuditLog,
  webhookEvents, type WebhookEvent, type InsertWebhookEvent,
  playbookFacts, type PlaybookFact, type InsertPlaybookFact,
  faqEntries, type FaqEntry, type InsertFaqEntry,
  knowledgeDocs, type KnowledgeDoc, type InsertKnowledgeDoc,
  replyExamples, type ReplyExample, type InsertReplyExample,
  returnReminderEvents, type ReturnReminderEvent, type InsertReturnReminderEvent, type ReturnReminderEventWithSender,
  kbEmbeddings, type KbEmbedding, type InsertKbEmbedding,
  globalSettings, type GlobalSetting, type InsertGlobalSetting,
  disputes, type Dispute, type InsertDispute,
  type KbSourceKind,
  type PayLaterStatus
} from "../shared/schema.js";

// Interface for storage operations
export interface IStorage {
  // Playbook & FAQ
  getAllPlaybookFacts(): Promise<PlaybookFact[]>;
  createPlaybookFact(fact: InsertPlaybookFact): Promise<PlaybookFact>;
  updatePlaybookFact(id: number, data: Partial<InsertPlaybookFact>): Promise<PlaybookFact>;
  deletePlaybookFact(id: number): Promise<void>;
  getAllFaqEntries(): Promise<FaqEntry[]>;
  getActiveFaqEntries(): Promise<FaqEntry[]>;
  createFaqEntry(faq: InsertFaqEntry): Promise<FaqEntry>;
  updateFaqEntry(id: number, data: Partial<InsertFaqEntry>): Promise<FaqEntry>;
  deleteFaqEntry(id: number): Promise<void>;

  // Long-form Knowledge Docs
  getAllKnowledgeDocs(): Promise<KnowledgeDoc[]>;
  getActiveKnowledgeDocs(): Promise<KnowledgeDoc[]>;
  getKnowledgeDoc(id: number): Promise<KnowledgeDoc | undefined>;
  createKnowledgeDoc(doc: InsertKnowledgeDoc): Promise<KnowledgeDoc>;
  updateKnowledgeDoc(id: number, data: Partial<InsertKnowledgeDoc>): Promise<KnowledgeDoc>;
  deleteKnowledgeDoc(id: number): Promise<void>;

  // Reply Examples (training memory)
  createReplyExample(rec: InsertReplyExample): Promise<ReplyExample>;
  getRecentReplyExamples(limit?: number): Promise<ReplyExample[]>;
  getReplyExamplesBySender(email: string, limit?: number): Promise<ReplyExample[]>;
  getReplyExample(id: number): Promise<ReplyExample | undefined>;
  getReplyExamplesByRef(sourceType: string, sourceRef: string): Promise<ReplyExample[]>;
  getReplyExampleRefs(): Promise<{ sourceType: string; sourceRef: string; lastRepliedAt: string }[]>;
  deleteReplyExample(id: number): Promise<void>;

  // KB Embeddings
  upsertKbEmbedding(rec: InsertKbEmbedding): Promise<KbEmbedding>;
  deleteKbEmbedding(sourceKind: KbSourceKind, sourceId: number): Promise<void>;
  getAllKbEmbeddings(): Promise<KbEmbedding[]>;
  getKbEmbeddingsByKind(kind: KbSourceKind): Promise<KbEmbedding[]>;

  // Sender history helpers
  getContactsByEmail(email: string): Promise<Contact[]>;
  getTransactionsByEmail(email: string): Promise<Transaction[]>;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createSystemUser(userData: Omit<InsertUser, 'inviteCode'>): Promise<User>;
  
  // Invite Code operations
  createInviteCode(inviteCode: InsertInviteCode): Promise<InviteCode>;
  getInviteCodeByCode(code: string): Promise<InviteCode | undefined>;
  validateInviteCode(code: string): Promise<boolean>;
  useInviteCode(code: string, userId: number): Promise<InviteCode>;

  // Region operations
  getAllRegions(): Promise<Region[]>;
  getRegion(id: number): Promise<Region | undefined>;
  getRegionBySlug(slug: string): Promise<Region | undefined>;
  createRegion(region: InsertRegion): Promise<Region>;
  updateRegion(id: number, data: Partial<InsertRegion>): Promise<Region>;

  // City Category operations
  getAllCityCategories(): Promise<CityCategory[]>;
  getCityCategory(id: number): Promise<CityCategory | undefined>;
  getCityCategoriesByRegionId(regionId: number): Promise<CityCategory[]>;
  getPopularCitiesByRegionId(regionId: number): Promise<CityCategory[]>;
  createCityCategory(cityCategory: InsertCityCategory): Promise<CityCategory>;
  updateCityCategory(id: number, data: Partial<InsertCityCategory>): Promise<CityCategory>;
  deleteCityCategory(id: number): Promise<void>;

  // Location operations
  getAllLocations(): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  getLocationByCode(code: string): Promise<Location | undefined>;
  getLocationsByRegionId(regionId: number): Promise<Location[]>;
  getNextLocationCode(): Promise<string>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: number, data: Partial<InsertLocation>): Promise<Location>;
  deleteLocation(id: number): Promise<void>;

  // GemachApplication operations
  getAllApplications(): Promise<GemachApplication[]>;
  getApplication(id: number): Promise<GemachApplication | undefined>;
  createApplication(application: InsertGemachApplication): Promise<GemachApplication>;
  updateApplication(id: number, data: Partial<GemachApplication>): Promise<GemachApplication>;

  // Inventory operations (using new inventory table)
  getInventoryByLocation(locationId: number): Promise<Inventory[]>;
  setInventoryItem(locationId: number, color: string, quantity: number): Promise<Inventory>;
  adjustInventory(locationId: number, color: string, delta: number): Promise<Inventory>;
  getInventoryTotal(locationId: number): Promise<number>;

  // Transaction operations
  getAllTransactions(): Promise<Transaction[]>;
  getTransaction(id: number): Promise<Transaction | undefined>;
  getTransactionsByLocation(locationId: number): Promise<Transaction[]>;
  getTransactionByPhone(locationId: number, phone: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction>;
  markTransactionReturned(id: number, refundAmount?: number): Promise<Transaction>;
  recordReturnReminderSent(id: number, opts?: { channel?: string; language?: string; sentByUserId?: number | null }): Promise<Transaction>;
  getReturnReminderEvents(transactionId: number): Promise<ReturnReminderEventWithSender[]>;

  // Contact operations
  getAllContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  markContactRead(id: number): Promise<Contact>;
  updateContact(id: number, data: Partial<Pick<Contact, 'subject' | 'message' | 'isRead' | 'isArchived' | 'isSpam'>>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;

  // Payment operations
  getAllPayments(): Promise<Payment[]>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentsByTransaction(transactionId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePaymentStatus(id: number, status: string, paymentData?: any): Promise<Payment>;

  // Payment Method operations
  getAllPaymentMethods(): Promise<PaymentMethod[]>;
  getPaymentMethod(id: number): Promise<PaymentMethod | undefined>;
  createPaymentMethod(method: InsertPaymentMethod): Promise<PaymentMethod>;
  updatePaymentMethod(id: number, data: Partial<InsertPaymentMethod>): Promise<PaymentMethod>;
  deletePaymentMethod(id: number): Promise<void>;

  // Location Payment Method operations
  getLocationPaymentMethods(locationId: number): Promise<LocationPaymentMethod[]>;
  getAvailablePaymentMethodsForLocation(locationId: number): Promise<PaymentMethod[]>;
  enablePaymentMethodForLocation(locationId: number, paymentMethodId: number, customFee?: number): Promise<LocationPaymentMethod>;
  disablePaymentMethodForLocation(locationId: number, paymentMethodId: number): Promise<void>;

  // Pay Later operations
  getTransactionByMagicToken(magicToken: string): Promise<Transaction | undefined>;
  getTransactionBySetupIntentId(setupIntentId: string): Promise<Transaction | undefined>;
  getTransactionByPaymentIntentId(paymentIntentId: string): Promise<Transaction | undefined>;
  getPendingPayLaterTransactions(locationId?: number): Promise<Transaction[]>;
  updateTransactionPayLaterStatus(id: number, status: PayLaterStatus, additionalData?: Partial<Transaction>): Promise<Transaction>;

  // Audit Log operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsForEntity(entityType: string, entityId: number): Promise<AuditLog[]>;

  // Webhook Event operations (for idempotency)
  getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined>;
  createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent>;

  // Task #39: Global Settings (key/value, primarily Stripe risk knobs)
  getGlobalSetting(key: string): Promise<GlobalSetting | undefined>;
  setGlobalSetting(key: string, value: string): Promise<GlobalSetting>;

  // Task #39: Stripe Disputes (per-gemach 30-day risk monitoring)
  createDispute(dispute: InsertDispute): Promise<Dispute>;
  getDisputeByStripeId(stripeDisputeId: string): Promise<Dispute | undefined>;
  getDisputesByLocationSince(locationId: number, since: Date): Promise<Dispute[]>;
  getAllDisputes(): Promise<Dispute[]>;
  getRecentDisputeStats(sinceDays: number): Promise<{
    locationId: number;
    disputeCount: number;
    chargedCount: number;
    rate: number;
  }[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private regions: Map<number, Region>;
  private locations: Map<number, Location>;
  private applications: Map<number, GemachApplication>;
  private inviteCodesMap: Map<number, InviteCode>;
  private transactions: Map<number, Transaction>;
  private contacts: Map<number, Contact>;
  private payments: Map<number, Payment>;
  private paymentMethods: Map<number, PaymentMethod>;
  private locationPaymentMethods: Map<number, LocationPaymentMethod>;
  private cityCategories: Map<number, CityCategory>;
  private inventoryItems: Map<number, Inventory>;
  private auditLogsMap: Map<number, AuditLog>;
  private webhookEventsMap: Map<number, WebhookEvent>;
  private returnReminderEventsMap: Map<number, ReturnReminderEvent>;
  private returnReminderEventCounter: number = 1;
  private validInviteCodes: Set<string>;

  private userCounter: number;
  private regionCounter: number;
  private locationCounter: number;
  private applicationCounter: number;
  private inviteCodeCounter: number;
  private transactionCounter: number;
  private contactCounter: number;
  private paymentCounter: number;
  private paymentMethodCounter: number;
  private locationPaymentMethodCounter: number;
  private cityCategoryCounter: number;
  private inventoryCounter: number;
  private auditLogCounter: number;
  private webhookEventCounter: number;

  constructor() {
    this.users = new Map();
    this.regions = new Map();
    this.locations = new Map();
    this.applications = new Map();
    this.inviteCodesMap = new Map();
    this.transactions = new Map();
    this.contacts = new Map();
    this.payments = new Map();
    this.paymentMethods = new Map();
    this.locationPaymentMethods = new Map();
    this.cityCategories = new Map();
    this.inventoryItems = new Map();
    this.auditLogsMap = new Map();
    this.webhookEventsMap = new Map();
    this.returnReminderEventsMap = new Map();
    this.validInviteCodes = new Set();

    this.userCounter = 1;
    this.regionCounter = 1;
    this.locationCounter = 1;
    this.applicationCounter = 1;
    this.inviteCodeCounter = 1;
    this.transactionCounter = 1;
    this.contactCounter = 1;
    this.paymentCounter = 1;
    this.paymentMethodCounter = 1;
    this.locationPaymentMethodCounter = 1;
    this.cityCategoryCounter = 1;
    this.inventoryCounter = 1;
    this.auditLogCounter = 1;
    this.webhookEventCounter = 1;

    // Initialize with default regions
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Add all regions from website
    const defaultRegions: InsertRegion[] = [
      { name: "United States", slug: "united-states", displayOrder: 1 },
      { name: "Canada", slug: "canada", displayOrder: 2 },
      { name: "United Kingdom", slug: "united-kingdom", displayOrder: 3 },
      { name: "Europe", slug: "europe", displayOrder: 4 },
      { name: "Australia", slug: "australia", displayOrder: 5 },
      { name: "Israel", slug: "israel", displayOrder: 6 }
    ];

    defaultRegions.forEach(region => this.createRegion(region));

    // Initialize default city categories aligned with existing hardcoded locations
    const defaultCityCategories: InsertCityCategory[] = [
      // United States (regionId: 1) - aligned with existing locations (IDs 1-13)
      { name: "Los Angeles", slug: "los-angeles", regionId: 1, displayOrder: 1, isPopular: true, stateCode: "CA" },
      { name: "Brooklyn", slug: "brooklyn", regionId: 1, displayOrder: 2, isPopular: true, stateCode: "NY" },
      { name: "Monsey", slug: "monsey", regionId: 1, displayOrder: 3, isPopular: true, stateCode: "NY" },
      { name: "New Square", slug: "new-square", regionId: 1, displayOrder: 4, stateCode: "NY" },
      { name: "Queens", slug: "queens", regionId: 1, displayOrder: 5, stateCode: "NY" },
      { name: "Five Towns & Far Rockaway", slug: "five-towns-far-rockaway", regionId: 1, displayOrder: 6, isPopular: true, stateCode: "NY" },
      { name: "Staten Island", slug: "staten-island", regionId: 1, displayOrder: 7, stateCode: "NY" },
      { name: "West Hempstead", slug: "west-hempstead", regionId: 1, displayOrder: 8, stateCode: "NY" },
      { name: "Highland Park / Edison", slug: "highland-park-edison", regionId: 1, displayOrder: 9, stateCode: "NJ" },
      { name: "Jackson", slug: "jackson", regionId: 1, displayOrder: 10, stateCode: "NJ" },
      { name: "Lakewood", slug: "lakewood", regionId: 1, displayOrder: 11, isPopular: true, stateCode: "NJ" },
      { name: "Passaic", slug: "passaic", regionId: 1, displayOrder: 12, stateCode: "NJ" },
      { name: "Toms River", slug: "toms-river", regionId: 1, displayOrder: 13, stateCode: "NJ" },
      // Canada (regionId: 2) - IDs 14-15
      { name: "Toronto", slug: "toronto", regionId: 2, displayOrder: 1, isPopular: true },
      { name: "Montreal", slug: "montreal", regionId: 2, displayOrder: 2 },
      // United Kingdom (regionId: 3) - IDs 16-17
      { name: "London", slug: "london", regionId: 3, displayOrder: 1, isPopular: true },
      { name: "Manchester", slug: "manchester", regionId: 3, displayOrder: 2 },
      // Europe (regionId: 4) - IDs 18-20
      { name: "Antwerp", slug: "antwerp", regionId: 4, displayOrder: 1 },
      { name: "Paris", slug: "paris", regionId: 4, displayOrder: 2 },
      { name: "Amsterdam", slug: "amsterdam", regionId: 4, displayOrder: 3 },
      // Australia (regionId: 5) - IDs 21-22
      { name: "Melbourne", slug: "melbourne", regionId: 5, displayOrder: 1 },
      { name: "Sydney", slug: "sydney", regionId: 5, displayOrder: 2 },
      // Israel (regionId: 6) - aligned with existing locations (IDs 23-40)
      { name: "Jerusalem", slug: "jerusalem", regionId: 6, displayOrder: 1, isPopular: true },
      { name: "Bnei Brak", slug: "bnei-brak", regionId: 6, displayOrder: 2, isPopular: true },
      { name: "Beit Shemesh", slug: "beit-shemesh", regionId: 6, displayOrder: 3, isPopular: true },
      { name: "Modi'in Illit", slug: "modiin-illit", regionId: 6, displayOrder: 4 },
      { name: "Beitar Illit", slug: "beitar-illit", regionId: 6, displayOrder: 5 },
      { name: "Lod", slug: "lod", regionId: 6, displayOrder: 6 },
      { name: "Afula", slug: "afula", regionId: 6, displayOrder: 7 },
      { name: "Elad", slug: "elad", regionId: 6, displayOrder: 8 },
      { name: "Givat Zeev", slug: "givat-zeev", regionId: 6, displayOrder: 9 },
      { name: "Haifa", slug: "haifa", regionId: 6, displayOrder: 10 },
      { name: "Kiryat Tivon", slug: "kiryat-tivon", regionId: 6, displayOrder: 11 },
      { name: "Kochav HaShachar", slug: "kochav-hashachar", regionId: 6, displayOrder: 12 },
      { name: "Maaleh Adumim", slug: "maaleh-adumim", regionId: 6, displayOrder: 13 },
      { name: "Neriya", slug: "neriya", regionId: 6, displayOrder: 14 },
      { name: "Telzstone/Kiryat Yearim", slug: "telzstone-kiryat-yearim", regionId: 6, displayOrder: 15 },
      { name: "Rechovot", slug: "rechovot", regionId: 6, displayOrder: 16 },
      { name: "Ashdod", slug: "ashdod", regionId: 6, displayOrder: 17 },
      { name: "Bnei Re'em", slug: "bnei-reem", regionId: 6, displayOrder: 18 },
      // NEW CATEGORIES (IDs 41-52) - Added at end to maintain backward compatibility
      // New US city categories for uncategorized locations (IDs 41-47)
      { name: "Miami", slug: "miami", regionId: 1, displayOrder: 14, stateCode: "FL" },
      { name: "Chicago", slug: "chicago", regionId: 1, displayOrder: 15, stateCode: "IL" },
      { name: "Baltimore", slug: "baltimore", regionId: 1, displayOrder: 16, stateCode: "MD" },
      { name: "Detroit", slug: "detroit", regionId: 1, displayOrder: 17, stateCode: "MI" },
      { name: "Cleveland", slug: "cleveland", regionId: 1, displayOrder: 18, stateCode: "OH" },
      { name: "Philadelphia", slug: "philadelphia", regionId: 1, displayOrder: 19, stateCode: "PA" },
      { name: "Teaneck", slug: "teaneck", regionId: 1, displayOrder: 20, stateCode: "NJ" },
      // New Israel city categories for uncategorized locations (IDs 48-52)
      { name: "Kfar Chabad", slug: "kfar-chabad", regionId: 6, displayOrder: 19 },
      { name: "Tel Aviv", slug: "tel-aviv", regionId: 6, displayOrder: 20 },
      { name: "Petach Tikvah", slug: "petach-tikvah", regionId: 6, displayOrder: 21 },
      { name: "Moshav Yesodot", slug: "moshav-yesodot", regionId: 6, displayOrder: 22 },
      { name: "Shomron", slug: "shomron", regionId: 6, displayOrder: 23 },
    ];

    defaultCityCategories.forEach(category => this.createCityCategory(category));

    // Initialize default invite codes
    // Generic invite codes removed - only location-specific invite codes are valid for operator registration

    // Add all locations from earmuffsgemach.com with simple numbering
    // Using any[] for legacy inventory data compatibility during migration
    const allLocations: any[] = [
      // United States - California
      {
        name: "Los Angeles - Pico",
        locationCode: "#1",
        contactPerson: "Location Coordinator",
        address: "Pico Area, Los Angeles, CA",
        zipCode: "90035",
        phone: "310-465-9885",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 10,
        inventoryByColor: JSON.stringify({ red: 3, blue: 2, black: 3, white: 2 }),
        cityCategoryId: 1,
        operatorPin: "1234"
      },
      {
        name: "Los Angeles - La Brea", 
        locationCode: "#2",
        contactPerson: "Location Coordinator",
        address: "La Brea Area, Los Angeles, CA",
        zipCode: "90036",
        phone: "323-428-5925",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        inventoryByColor: JSON.stringify({ red: 2, blue: 3, black: 2, pink: 1 }),
        cityCategoryId: 1,
        operatorPin: "1234"
      },
      {
        name: "Los Angeles - Valley Village", 
        locationCode: "#3",
        contactPerson: "Location Coordinator",
        address: "Valley Village, Los Angeles, CA",
        zipCode: "91607",
        phone: "818-442-4369",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 6,
        inventoryByColor: JSON.stringify({ black: 2, white: 2, purple: 2 }),
        cityCategoryId: 1,
        operatorPin: "1234"
      },
      // United States - Florida
      {
        name: "Miami Beach", 
        locationCode: "#4",
        contactPerson: "Location Coordinator",
        address: "Miami Beach, FL",
        zipCode: "33139",
        phone: "786-436-0060",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 12,
        inventoryByColor: JSON.stringify({ red: 3, blue: 3, black: 3, white: 2, pink: 1 }),
        cityCategoryId: 41,
        operatorPin: "1234"
      },
      // United States - Illinois
      {
        name: "Chicago", 
        locationCode: "#5",
        contactPerson: "Location Coordinator",
        address: "Chicago, IL",
        zipCode: "60647",
        phone: "773-961-5627",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        inventoryByColor: JSON.stringify({ red: 2, blue: 2, black: 3, gray: 2 }),
        cityCategoryId: 42,
        operatorPin: "1234"
      },
      // United States - Maryland
      {
        name: "Baltimore - Shellydale Drive", 
        locationCode: "#6",
        contactPerson: "Location Coordinator",
        address: "Shellydale Drive, Baltimore, MD",
        zipCode: "21215",
        phone: "847-804-6654",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 43,
        operatorPin: "1234"
      },
      {
        name: "Baltimore - Western Run Drive", 
        locationCode: "#7",
        contactPerson: "Location Coordinator",
        address: "Western Run Drive, Baltimore, MD",
        zipCode: "21208",
        phone: "516-439-8099",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 43,
        operatorPin: "1234"
      },
      // United States - Michigan
      {
        name: "Detroit", 
        locationCode: "#8",
        contactPerson: "Location Coordinator",
        address: "Detroit, MI",
        zipCode: "48202",
        phone: "248-910-4322",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 44,
        operatorPin: "1234"
      },
      // United States - Ohio
      {
        name: "University Heights", 
        locationCode: "#9",
        contactPerson: "Location Coordinator",
        address: "University Heights, OH",
        zipCode: "44118",
        phone: "216-206-7653",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 45,
        operatorPin: "1234"
      },
      // United States - Pennsylvania
      {
        name: "Philadelphia", 
        locationCode: "#10",
        contactPerson: "Location Coordinator",
        address: "Philadelphia, PA",
        zipCode: "19131",
        phone: "215-913-3467",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 46,
        operatorPin: "1234"
      },
      {
        name: "Bala Cynwyd Philadelphia", 
        locationCode: "#11",
        contactPerson: "Location Coordinator",
        address: "Bala Cynwyd Area, Philadelphia, PA",
        zipCode: "19004",
        phone: "973-518-1416",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 46,
        operatorPin: "1234"
      },
      // New York - Brooklyn
      {
        name: "Brooklyn - Boro Park (12th Ave & 45th St)",
        locationCode: "#12",
        contactPerson: "Location Coordinator",
        address: "12th Ave & 45th Street, Brooklyn, NY",
        zipCode: "11219",
        phone: "631-318-0739",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Boro Park (14th Ave & 40th St)",
        locationCode: "#13",
        contactPerson: "Location Coordinator",
        address: "14th Ave & 40th Street, Brooklyn, NY",
        zipCode: "11218",
        phone: "718-854-7574",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Boro Park (16th Ave & 42nd St)",
        locationCode: "#14",
        contactPerson: "Location Coordinator",
        address: "16th Ave & 42nd Street, Brooklyn, NY",
        zipCode: "11204",
        phone: "718-300-0848",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Crown Heights",
        locationCode: "#15",
        contactPerson: "Location Coordinator",
        address: "Crown Heights, Brooklyn, NY",
        zipCode: "11213",
        phone: "646-295-3077",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 12,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Flatbush (East 35th & Ave L)",
        locationCode: "#16",
        contactPerson: "Location Coordinator",
        address: "East 35th & Avenue L, Brooklyn, NY",
        zipCode: "11210",
        phone: "917-545-3065",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Flatbush (East 9th & Ave M)",
        locationCode: "#17",
        contactPerson: "Location Coordinator",
        address: "East 9th & Avenue M, Brooklyn, NY",
        zipCode: "11230",
        phone: "917-301-1150",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Flatbush (East 24th & Ave P)",
        locationCode: "#18",
        contactPerson: "Location Coordinator",
        address: "East 24th & Avenue P, Brooklyn, NY",
        zipCode: "11229",
        phone: "347-300-6172",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Kensington (Avenue F)",
        locationCode: "#19",
        contactPerson: "Location Coordinator",
        address: "Avenue F, Kensington, Brooklyn, NY",
        zipCode: "11218",
        phone: "347-409-9479",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      {
        name: "Brooklyn - Kensington (East 8th & Ave C)",
        locationCode: "#20",
        contactPerson: "Location Coordinator",
        address: "East 8th & Avenue C, Kensington, Brooklyn, NY",
        zipCode: "11218",
        phone: "347-546-9849",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 2,
        operatorPin: "1234"
      },
      // New York - Monsey
      {
        name: "Monsey - Airmont Regina Road",
        locationCode: "#21",
        contactPerson: "Location Coordinator",
        address: "Airmont, Regina Road, Monsey, NY",
        zipCode: "10952",
        phone: "845-558-9370",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 3,
        operatorPin: "1234"
      },
      {
        name: "Monsey - Butterfield Drive",
        locationCode: "#22",
        contactPerson: "Location Coordinator",
        address: "Butterfield Drive, Monsey, NY",
        zipCode: "10952",
        phone: "845-270-5060",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 3,
        operatorPin: "1234"
      },
      {
        name: "Monsey - Haverstraw",
        locationCode: "#23",
        contactPerson: "Location Coordinator",
        address: "Haverstraw, NY",
        zipCode: "10927",
        phone: "845-729-2035",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 3,
        operatorPin: "1234"
      },
      {
        name: "Monsey - Homestead Lane",
        locationCode: "#24",
        contactPerson: "Location Coordinator",
        address: "Homestead Lane off Rt. 306, Monsey, NY",
        zipCode: "10952",
        phone: "973-934-3775",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 3,
        operatorPin: "1234"
      },
      {
        name: "Monsey - Scotland Hill",
        locationCode: "#25",
        contactPerson: "Location Coordinator",
        address: "Scotland Hill, Monsey, NY",
        zipCode: "10952",
        phone: "347-988-4924",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 3,
        operatorPin: "1234"
      },
      {
        name: "Monsey - Wesley Hills",
        locationCode: "#26",
        contactPerson: "Location Coordinator",
        address: "Wesley Hills, NY",
        zipCode: "10977",
        phone: "914-393-2537",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 3,
        operatorPin: "1234"
      },
      // New York - Other Areas
      {
        name: "New Square",
        locationCode: "#27",
        contactPerson: "Location Coordinator",
        address: "New Square, NY",
        zipCode: "10977",
        phone: "845-354-6548",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 4,
        operatorPin: "1234"
      },
      {
        name: "Queens - Kew Gardens",
        locationCode: "#28",
        contactPerson: "Location Coordinator",
        address: "Kew Gardens, Queens, NY",
        zipCode: "11415",
        phone: "917-696-8217",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 5,
        operatorPin: "1234"
      },
      {
        name: "Five Towns & Far Rockaway",
        locationCode: "#29",
        contactPerson: "Location Coordinator",
        address: "Five Towns & Far Rockaway, NY",
        zipCode: "11691",
        phone: "718-309-3218",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 6,
        operatorPin: "1234"
      },
      {
        name: "Five Towns - Lawrence",
        locationCode: "#30",
        contactPerson: "Location Coordinator",
        address: "Lawrence, Five Towns, NY",
        zipCode: "11559",
        phone: "347-515-0173",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 6,
        operatorPin: "1234"
      },
      {
        name: "Five Towns - Cedarhurst",
        locationCode: "#31",
        contactPerson: "Location Coordinator",
        address: "Cedarhurst, Five Towns, NY",
        zipCode: "11516",
        phone: "516-582-1985",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 6,
        operatorPin: "1234"
      },
      {
        name: "Five Towns - Cedarhurst (Second Location)",
        locationCode: "#32",
        contactPerson: "Location Coordinator",
        address: "Cedarhurst, Five Towns, NY",
        zipCode: "11516",
        phone: "917-817-7468",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 6,
        operatorPin: "1234"
      },
      {
        name: "Five Towns - North Woodmere",
        locationCode: "#33",
        contactPerson: "Location Coordinator",
        address: "North Woodmere, Five Towns, NY",
        zipCode: "11581",
        phone: "718-869-4468",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 6,
        operatorPin: "1234"
      },
      {
        name: "Five Towns - Woodmere",
        locationCode: "#34",
        contactPerson: "Location Coordinator",
        address: "Woodmere, Five Towns, NY",
        zipCode: "11598",
        phone: "516-592-8980",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 6,
        operatorPin: "1234"
      },
      {
        name: "Staten Island",
        locationCode: "#35",
        contactPerson: "Location Coordinator",
        address: "Staten Island, NY",
        zipCode: "10314",
        phone: "347-243-2476",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 4,
        cityCategoryId: 7,
        operatorPin: "1234"
      },
      {
        name: "West Hempstead",
        locationCode: "#36",
        contactPerson: "Location Coordinator",
        address: "West Hempstead, NY",
        zipCode: "11552",
        phone: "917-496-4619",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 8,
        operatorPin: "1234"
      },
      // New Jersey
      {
        name: "Highland Park / Edison",
        locationCode: "#37",
        contactPerson: "Location Coordinator",
        address: "Highland Park / Edison, NJ",
        zipCode: "08837",
        phone: "347-203-7906",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 9,
        operatorPin: "1234"
      },
      {
        name: "Jackson",
        locationCode: "#38",
        contactPerson: "Location Coordinator",
        address: "Jackson, NJ",
        zipCode: "08527",
        phone: "516-712-7735",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 10,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - Near Beis Feiga",
        locationCode: "#39",
        contactPerson: "Location Coordinator",
        address: "Near Beis Feiga, Lakewood, NJ",
        zipCode: "08701",
        phone: "732-370-2609",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 12,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - East County Line",
        locationCode: "#40",
        contactPerson: "Location Coordinator",
        address: "East County Line, Lakewood, NJ",
        zipCode: "08701",
        phone: "917-861-2101",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - West County Line",
        locationCode: "#41",
        contactPerson: "Location Coordinator",
        address: "West County Line, Lakewood, NJ",
        zipCode: "08701",
        phone: "732-833-3132",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - Pine Street",
        locationCode: "#42",
        contactPerson: "Location Coordinator",
        address: "Pine Street, Lakewood, NJ",
        zipCode: "08701",
        phone: "732-730-5606",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - Prospect Area",
        locationCode: "#43",
        contactPerson: "Location Coordinator",
        address: "Prospect Area, Lakewood, NJ",
        zipCode: "08701",
        phone: "646-647-5148",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - Sunset & James",
        locationCode: "#44",
        contactPerson: "Location Coordinator",
        address: "Sunset & James, Lakewood, NJ",
        zipCode: "08701",
        phone: "718-757-8615",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - Vine Ave",
        locationCode: "#45",
        contactPerson: "Location Coordinator",
        address: "Vine Ave, Lakewood, NJ",
        zipCode: "08701",
        phone: "347-563-7220",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Lakewood - Westgate",
        locationCode: "#46",
        contactPerson: "Location Coordinator",
        address: "Westgate, Lakewood, NJ",
        zipCode: "08701",
        phone: "718-594-7868",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 13,
        cityCategoryId: 11,
        operatorPin: "1234"
      },
      {
        name: "Passaic - Amsterdam Avenue",
        locationCode: "#47",
        contactPerson: "Location Coordinator",
        address: "Amsterdam Avenue, Passaic, NJ",
        zipCode: "07055",
        phone: "917-756-8724",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 12,
        operatorPin: "1234"
      },
      {
        name: "Passaic - Boulevard",
        locationCode: "#48",
        contactPerson: "Location Coordinator",
        address: "Boulevard, Passaic, NJ",
        zipCode: "07055",
        phone: "973-617-7947",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 12,
        operatorPin: "1234"
      },
      {
        name: "Passaic - Passaic Avenue",
        locationCode: "#49",
        contactPerson: "Location Coordinator",
        address: "Passaic Avenue, Passaic, NJ",
        zipCode: "07055",
        phone: "201-468-1928",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 12,
        operatorPin: "1234"
      },
      {
        name: "Toms River",
        locationCode: "#50",
        contactPerson: "Location Coordinator",
        address: "Toms River, NJ",
        zipCode: "08753",
        phone: "347-909-1447",
        email: "earmuffsgemach@gmail.com",
        regionId: 1,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 13,
        operatorPin: "1234"
      },
      // Israel - Jerusalem
      {
        name: "Jerusalem - Arzei HaBira",
        locationCode: "#51",
        contactPerson: "Location Coordinator",
        address: "Arzei HaBira, Jerusalem, Israel",
        zipCode: "91000",
        phone: "02-581-6171",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Baka",
        locationCode: "#52",
        contactPerson: "Location Coordinator",
        address: "Baka, Jerusalem, Israel",
        zipCode: "93000",
        phone: "054-588-5468",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Bayit Vegan",
        locationCode: "#53",
        contactPerson: "Location Coordinator",
        address: "Bayit Vegan, Jerusalem, Israel",
        zipCode: "96000",
        phone: "02-538-0377",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Eli HaKohen",
        locationCode: "#54",
        contactPerson: "Location Coordinator",
        address: "Eli HaKohen, Jerusalem, Israel",
        zipCode: "94000",
        phone: "058-321-9027",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - French Hill",
        locationCode: "#55",
        contactPerson: "Location Coordinator",
        address: "French Hill, Jerusalem, Israel",
        zipCode: "97000",
        phone: "054-485-1569",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ganei Geula",
        locationCode: "#56",
        contactPerson: "Location Coordinator",
        address: "Ganei Geula, Jerusalem, Israel",
        zipCode: "95000",
        phone: "058-322-4449",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Givat Mordechai",
        locationCode: "#57",
        contactPerson: "Location Coordinator",
        address: "Givat Mordechai, Jerusalem, Israel",
        zipCode: "96000",
        phone: "054-653-5095",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Givat Shaul (Pinchas Kehati)",
        locationCode: "#58",
        contactPerson: "Location Coordinator",
        address: "Pinchas Kehati 1, Givat Shaul, Jerusalem, Israel",
        zipCode: "95000",
        phone: "052-769-2966",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 12,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Har Nof",
        locationCode: "#59",
        contactPerson: "Location Coordinator",
        address: "Har Nof, Jerusalem, Israel",
        zipCode: "96000",
        phone: "02-582-6093",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Katamon",
        locationCode: "#60",
        contactPerson: "Location Coordinator",
        address: "Katamon, Jerusalem, Israel",
        zipCode: "93000",
        phone: "054-491-3825",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Maalot Dafna",
        locationCode: "#61",
        contactPerson: "Location Coordinator",
        address: "Maalot Dafna, Jerusalem, Israel",
        zipCode: "97000",
        phone: "053-974-0653",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Mem Gimmel",
        locationCode: "#62",
        contactPerson: "Location Coordinator",
        address: "Mem Gimmel, Jerusalem, Israel",
        zipCode: "94000",
        phone: "058-321-3943",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Neve Yaakov",
        locationCode: "#63",
        contactPerson: "Location Coordinator",
        address: "Neve Yaakov, Jerusalem, Israel",
        zipCode: "97000",
        phone: "052-711-7466",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Pisgat Zeev (Neve HaPisga)",
        locationCode: "#64",
        contactPerson: "Location Coordinator",
        address: "Neve HaPisga, Pisgat Zeev, Jerusalem, Israel",
        zipCode: "97000",
        phone: "052-768-1960",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Pisgat Zeev",
        locationCode: "#65",
        contactPerson: "Location Coordinator",
        address: "Pisgat Zeev, Jerusalem, Israel",
        zipCode: "97000",
        phone: "058-448-7134",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramat Eshkol",
        locationCode: "#66",
        contactPerson: "Location Coordinator",
        address: "Ramat Eshkol, Jerusalem, Israel",
        zipCode: "97000",
        phone: "058-326-1763",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramat Eshkol (Second Location)",
        locationCode: "#67",
        contactPerson: "Location Coordinator",
        address: "Ramat Eshkol, Jerusalem, Israel",
        zipCode: "97000",
        phone: "058-325-1273",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramat Shlomo (Rafael Baruch Toledano)",
        locationCode: "#68",
        contactPerson: "Location Coordinator",
        address: "15 Rafael Baruch Toledano, Ramat Shlomo, Jerusalem, Israel",
        zipCode: "97000",
        phone: "054-859-2755",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramat Shlomo (Chazon Ish)",
        locationCode: "#69",
        contactPerson: "Location Coordinator",
        address: "Chazon Ish 1/1, Ramat Shlomo, Jerusalem, Israel",
        zipCode: "97000",
        phone: "053-316-8870",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramat Shlomo",
        locationCode: "#70",
        contactPerson: "Location Coordinator",
        address: "Ramat Shlomo, Jerusalem, Israel",
        zipCode: "97000",
        phone: "058-320-1963",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramot",
        locationCode: "#71",
        contactPerson: "Location Coordinator",
        address: "Ramot, Jerusalem, Israel",
        zipCode: "97000",
        phone: "02-586-8904",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Ramot Daled (Rechov Valenstein)",
        locationCode: "#72",
        contactPerson: "Location Coordinator",
        address: "Rechov Valenstein, Ramot Daled, Jerusalem, Israel",
        zipCode: "97000",
        phone: "02-651-8875",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Rechavia-Nachlaot (Mordechai Narkis)",
        locationCode: "#73",
        contactPerson: "Location Coordinator",
        address: "Rechov Mordechai Narkis, Rechavia-Nachlaot, Jerusalem, Israel",
        zipCode: "94000",
        phone: "054-305-1823",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Romema",
        locationCode: "#74",
        contactPerson: "Location Coordinator",
        address: "Romema, Jerusalem, Israel",
        zipCode: "95000",
        phone: "054-845-4685",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Rova Hayehudi",
        locationCode: "#75",
        contactPerson: "Location Coordinator",
        address: "Rova Hayehudi, Jerusalem, Israel",
        zipCode: "97000",
        phone: "050-592-4415",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Sanhedria Murchevet",
        locationCode: "#76",
        contactPerson: "Location Coordinator",
        address: "Sanhedria Murchevet, Jerusalem, Israel",
        zipCode: "97000",
        phone: "058-320-3823",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Sanz/Belz",
        locationCode: "#77",
        contactPerson: "Location Coordinator",
        address: "Sanz/Belz, Jerusalem, Israel",
        zipCode: "95000",
        phone: "058-321-0490",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Sarei Yisroel",
        locationCode: "#78",
        contactPerson: "Location Coordinator",
        address: "Sarei Yisroel, Jerusalem, Israel",
        zipCode: "95000",
        phone: "054-847-0478",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      {
        name: "Jerusalem - Kiryat HaYovel",
        locationCode: "#79",
        contactPerson: "Location Coordinator",
        address: "Kiryat HaYovel, Jerusalem, Israel",
        zipCode: "96000",
        phone: "054-843-3572",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 23,
        operatorPin: "1234"
      },
      // Israel - Other Cities
      {
        name: "Lod - Ganei Ayalon (Achisomoch)",
        locationCode: "#80",
        contactPerson: "Location Coordinator",
        address: "Ganei Ayalon - Achisomoch, Lod, Israel",
        zipCode: "71100",
        phone: "050-416-9168",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 28,
        operatorPin: "1234"
      },
      {
        name: "Lod - Shechunat Chabad",
        locationCode: "#81",
        contactPerson: "Location Coordinator",
        address: "Shechunat Chabad, Lod, Israel",
        zipCode: "71100",
        phone: "052-523-4091",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 28,
        operatorPin: "1234"
      },
      {
        name: "Afula",
        locationCode: "#82",
        contactPerson: "Location Coordinator",
        address: "Afula, Israel",
        zipCode: "18000",
        phone: "054-844-6642",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 29,
        operatorPin: "1234"
      },
      {
        name: "Beitar Illit",
        locationCode: "#83",
        contactPerson: "Location Coordinator",
        address: "Beitar Illit, Israel",
        zipCode: "90500",
        phone: "02-650-3688",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 12,
        cityCategoryId: 27,
        operatorPin: "1234"
      },
      {
        name: "Beit Shemesh - Ramat Beit Shemesh",
        locationCode: "#84",
        contactPerson: "Location Coordinator",
        address: "Ramat Beit Shemesh, Beit Shemesh, Israel",
        zipCode: "99000",
        phone: "058-762-4983",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 25,
        operatorPin: "1234"
      },
      {
        name: "Beit Shemesh - Ramat Beit Shemesh Aleph",
        locationCode: "#85",
        contactPerson: "Location Coordinator",
        address: "Ramat Beit Shemesh Aleph, Beit Shemesh, Israel",
        zipCode: "99000",
        phone: "058-500-9889",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 25,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Shechunat Or HaChaim",
        locationCode: "#86",
        contactPerson: "Location Coordinator",
        address: "Shechunat Or HaChaim, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "052-768-6415",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Shichun Hey",
        locationCode: "#87",
        contactPerson: "Location Coordinator",
        address: "Shichun Hey, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "054-844-9073",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Zichron Meir",
        locationCode: "#88",
        contactPerson: "Location Coordinator",
        address: "Zichron Meir, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "03-570-2112",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 13,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Rechov Sokolov",
        locationCode: "#89",
        contactPerson: "Location Coordinator",
        address: "Rechov Sokolov, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "050-410-9336",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Rechov HaBanim",
        locationCode: "#90",
        contactPerson: "Location Coordinator",
        address: "Rechov HaBanim, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "05-423-0031",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Pardes Katz",
        locationCode: "#91",
        contactPerson: "Location Coordinator",
        address: "Pardes Katz, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "055-679-6880",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Rechov Amram Gaon 7 (Shikun Vav)",
        locationCode: "#92",
        contactPerson: "Location Coordinator",
        address: "Rechov Amram Gaon 7 (Shikun Vav), Bnei Brak, Israel",
        zipCode: "51100",
        phone: "055-677-1013",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Rechov Menachem 6",
        locationCode: "#93",
        contactPerson: "Location Coordinator",
        address: "Rechov Menachem 6, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "053-317-6969",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Brak - Ramat Elchanan",
        locationCode: "#94",
        contactPerson: "Location Coordinator",
        address: "Ramat Elchanan, Bnei Brak, Israel",
        zipCode: "51100",
        phone: "054-848-2073",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 11,
        cityCategoryId: 24,
        operatorPin: "1234"
      },
      {
        name: "Bnei Re'em",
        locationCode: "#95",
        contactPerson: "Location Coordinator",
        address: "Bnei Re'em, Israel",
        zipCode: "79800",
        phone: "058-490-8084",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 40,
        operatorPin: "1234"
      },
      {
        name: "Elad",
        locationCode: "#96",
        contactPerson: "Location Coordinator",
        address: "Elad, Israel",
        zipCode: "40800",
        phone: "058-329-9178",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 30,
        operatorPin: "1234"
      },
      {
        name: "Givat Zeev - 33 Ha'yalot",
        locationCode: "#97",
        contactPerson: "Location Coordinator",
        address: "33 Ha'yalot, Givat Zeev, Israel",
        zipCode: "90900",
        phone: "054-845-2415",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 31,
        operatorPin: "1234"
      },
      {
        name: "Givat Zeev - 59 Ha'yalot",
        locationCode: "#98",
        contactPerson: "Location Coordinator",
        address: "59 Ha'yalot, Givat Zeev, Israel",
        zipCode: "90900",
        phone: "02-582-1811",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 31,
        operatorPin: "1234"
      },
      {
        name: "Haifa - Shechunat Hadar",
        locationCode: "#99",
        contactPerson: "Location Coordinator",
        address: "Shechunat Hadar, Haifa, Israel",
        zipCode: "33000",
        phone: "052-767-4800",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 32,
        operatorPin: "1234"
      },
      {
        name: "Kiryat Tivon",
        locationCode: "#100",
        contactPerson: "Location Coordinator",
        address: "Kiryat Tivon, Israel",
        zipCode: "36000",
        phone: "054-655-4710",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 33,
        operatorPin: "1234"
      },
      {
        name: "Kochav HaShachar",
        locationCode: "#101",
        contactPerson: "Location Coordinator",
        address: "Kochav HaShachar, Israel",
        zipCode: "90612",
        phone: "054-755-0642",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 34,
        operatorPin: "1234"
      },
      {
        name: "Maaleh Adumim",
        locationCode: "#102",
        contactPerson: "Location Coordinator",
        address: "Maaleh Adumim, Israel",
        zipCode: "98100",
        phone: "058-400-1438",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 35,
        operatorPin: "1234"
      },
      {
        name: "Modiin Illit - Netivot Hamishpat",
        locationCode: "#103",
        contactPerson: "Location Coordinator",
        address: "Netivot Hamishpat, Modiin Illit, Israel",
        zipCode: "71900",
        phone: "08-649-3721",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 12,
        cityCategoryId: 26,
        operatorPin: "1234"
      },
      {
        name: "Modiin Illit - Brachfeld",
        locationCode: "#104",
        contactPerson: "Location Coordinator",
        address: "Brachfeld, Modiin Illit, Israel",
        zipCode: "71900",
        phone: "054-841-6213",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 26,
        operatorPin: "1234"
      },
      {
        name: "Modiin Illit - Gan HaDasim",
        locationCode: "#105",
        contactPerson: "Location Coordinator",
        address: "Gan HaDasim, Modiin Illit, Israel",
        zipCode: "71900",
        phone: "053-312-5453",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 26,
        operatorPin: "1234"
      },
      {
        name: "Neriya",
        locationCode: "#106",
        contactPerson: "Location Coordinator",
        address: "Neriya, Israel",
        zipCode: "90612",
        phone: "052-860-0786",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 36,
        operatorPin: "1234"
      },
      {
        name: "Telzstone/Kiryat Yearim - Ma'alot Kedushei Telz",
        locationCode: "#107",
        contactPerson: "Location Coordinator",
        address: "Ma'alot Kedushei Telz 7/1, Telzstone/Kiryat Yearim, Israel",
        zipCode: "90840",
        phone: "02-534-1425",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 37,
        operatorPin: "1234"
      },
      {
        name: "Telzstone/Kiryat Yearim - HaRif 16",
        locationCode: "#108",
        contactPerson: "Location Coordinator",
        address: "HaRif 16, Telzstone/Kiryat Yearim, Israel",
        zipCode: "90840",
        phone: "058-462-6211",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 37,
        operatorPin: "1234"
      },
      {
        name: "Rechovot",
        locationCode: "#109",
        contactPerson: "Location Coordinator",
        address: "Rechovot, Israel",
        zipCode: "76100",
        phone: "052-764-1974",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 38,
        operatorPin: "1234"
      },
      {
        name: "Ashdod - Rova Gimmel",
        locationCode: "#110",
        contactPerson: "Location Coordinator",
        address: "Rova Gimmel, Ashdod, Israel",
        zipCode: "77100",
        phone: "050-413-2956",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 39,
        operatorPin: "1234"
      },
      {
        name: "Kfar Chabad",
        locationCode: "#111",
        contactPerson: "Location Coordinator",
        address: "Kfar Chabad, Israel",
        zipCode: "72915",
        phone: "054-596-8966",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 48,
        operatorPin: "1234"
      },
      {
        name: "Tel Aviv - Ramat Gan",
        locationCode: "#112",
        contactPerson: "Location Coordinator",
        address: "Ramat Gan, Tel Aviv, Israel",
        zipCode: "52000",
        phone: "052-329-9914",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 49,
        operatorPin: "1234"
      },
      {
        name: "Moshav Yesodot",
        locationCode: "#113",
        contactPerson: "Location Coordinator",
        address: "Moshav Yesodot, Israel",
        zipCode: "76867",
        phone: "054-841-4333",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 51,
        operatorPin: "1234"
      },
      {
        name: "Petach Tikvah - Kfar Ganim Gimmel",
        locationCode: "#114",
        contactPerson: "Location Coordinator",
        address: "Kfar Ganim Gimmel, Petach Tikvah, Israel",
        zipCode: "49100",
        phone: "050-921-7651",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 50,
        operatorPin: "1234"
      },
      {
        name: "Shomron - Revava",
        locationCode: "#115",
        contactPerson: "Location Coordinator",
        address: "Revava, Shomron, Israel",
        zipCode: "44820",
        phone: "050-901-9052",
        email: "earmuffsgemach@gmail.com",
        regionId: 6,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 52,
        operatorPin: "1234"
      },
      // Canada
      {
        name: "Toronto - Bathurst & Lawrence",
        locationCode: "#116",
        contactPerson: "Location Coordinator",
        address: "Bathurst & Lawrence, Toronto, ON",
        zipCode: "M6A 2X7",
        phone: "416-785-1234",
        email: "earmuffsgemach@gmail.com",
        regionId: 2,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 14,
        operatorPin: "1234"
      },
      {
        name: "Toronto - Forest Hill",
        locationCode: "#117",
        contactPerson: "Location Coordinator",
        address: "Forest Hill, Toronto, ON",
        zipCode: "M5N 2K7",
        phone: "416-482-5678",
        email: "earmuffsgemach@gmail.com",
        regionId: 2,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 14,
        operatorPin: "1234"
      },
      {
        name: "Toronto - York Mills",
        locationCode: "#118",
        contactPerson: "Location Coordinator",
        address: "York Mills, Toronto, ON",
        zipCode: "M2P 1W5",
        phone: "416-225-9012",
        email: "earmuffsgemach@gmail.com",
        regionId: 2,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 14,
        operatorPin: "1234"
      },
      {
        name: "Montreal - Cote St-Luc",
        locationCode: "#119",
        contactPerson: "Location Coordinator",
        address: "Cote St-Luc, Montreal, QC",
        zipCode: "H4W 2M8",
        phone: "514-485-3456",
        email: "earmuffsgemach@gmail.com",
        regionId: 2,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 15,
        operatorPin: "1234"
      },
      {
        name: "Montreal - Hampstead",
        locationCode: "#120",
        contactPerson: "Location Coordinator",
        address: "Hampstead, Montreal, QC",
        zipCode: "H3X 3J4",
        phone: "514-342-7890",
        email: "earmuffsgemach@gmail.com",
        regionId: 2,
        isActive: true,
        inventoryCount: 5,
        cityCategoryId: 15,
        operatorPin: "1234"
      },
      // England
      {
        name: "London - Golders Green",
        locationCode: "#121",
        contactPerson: "Location Coordinator",
        address: "Golders Green, London, UK",
        zipCode: "NW11 9DJ",
        phone: "+44 20 8455 1234",
        email: "earmuffsgemach@gmail.com",
        regionId: 3,
        isActive: true,
        inventoryCount: 10,
        cityCategoryId: 16,
        operatorPin: "1234"
      },
      {
        name: "London - Hendon",
        locationCode: "#122",
        contactPerson: "Location Coordinator",
        address: "Hendon, London, UK",
        zipCode: "NW4 4BT",
        phone: "+44 20 8203 5678",
        email: "earmuffsgemach@gmail.com",
        regionId: 3,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 16,
        operatorPin: "1234"
      },
      {
        name: "London - Stamford Hill",
        locationCode: "#123",
        contactPerson: "Location Coordinator",
        address: "Stamford Hill, London, UK",
        zipCode: "N16 6XS",
        phone: "+44 20 8800 9012",
        email: "earmuffsgemach@gmail.com",
        regionId: 3,
        isActive: true,
        inventoryCount: 12,
        cityCategoryId: 16,
        operatorPin: "1234"
      },
      {
        name: "Manchester - Prestwich",
        locationCode: "#124",
        contactPerson: "Location Coordinator",
        address: "Prestwich, Manchester, UK",
        zipCode: "M25 1AJ",
        phone: "+44 161 773 3456",
        email: "earmuffsgemach@gmail.com",
        regionId: 3,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 17,
        operatorPin: "1234"
      },
      {
        name: "Manchester - Whitefield",
        locationCode: "#125",
        contactPerson: "Location Coordinator",
        address: "Whitefield, Manchester, UK",
        zipCode: "M45 7TA",
        phone: "+44 161 796 7890",
        email: "earmuffsgemach@gmail.com",
        regionId: 3,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 17,
        operatorPin: "1234"
      },
      // Belgium
      {
        name: "Antwerp - Borgerhout",
        locationCode: "#126",
        contactPerson: "Location Coordinator",
        address: "Borgerhout, Antwerp, Belgium",
        zipCode: "2140",
        phone: "+32 3 271 1234",
        email: "earmuffsgemach@gmail.com",
        regionId: 4,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 18,
        operatorPin: "1234"
      },
      {
        name: "Antwerp - Berchem",
        locationCode: "#127",
        contactPerson: "Location Coordinator",
        address: "Berchem, Antwerp, Belgium",
        zipCode: "2600",
        phone: "+32 3 230 5678",
        email: "earmuffsgemach@gmail.com",
        regionId: 4,
        isActive: true,
        inventoryCount: 6,
        cityCategoryId: 18,
        operatorPin: "1234"
      },
      // Australia
      {
        name: "Melbourne - Caulfield",
        locationCode: "#128",
        contactPerson: "Location Coordinator",
        address: "Caulfield, Melbourne, VIC",
        zipCode: "3161",
        phone: "+61 3 9523 1234",
        email: "earmuffsgemach@gmail.com",
        regionId: 5,
        isActive: true,
        inventoryCount: 9,
        cityCategoryId: 21,
        operatorPin: "1234"
      },
      {
        name: "Melbourne - St Kilda",
        locationCode: "#129",
        contactPerson: "Location Coordinator",
        address: "St Kilda, Melbourne, VIC",
        zipCode: "3182",
        phone: "+61 3 9534 5678",
        email: "earmuffsgemach@gmail.com",
        regionId: 5,
        isActive: true,
        inventoryCount: 7,
        cityCategoryId: 21,
        operatorPin: "1234"
      },
      {
        name: "Sydney - Bondi",
        locationCode: "#130",
        contactPerson: "Location Coordinator",
        address: "Bondi, Sydney, NSW",
        zipCode: "2026",
        phone: "+61 2 9130 9012",
        email: "earmuffsgemach@gmail.com",
        regionId: 5,
        isActive: true,
        inventoryCount: 8,
        cityCategoryId: 22,
        operatorPin: "1234"
      }
    ];

    allLocations.forEach((location: any) => {
      const { inventoryCount, inventoryByColor, ...locationData } = location;
      const locationWithDefaults = {
        ...locationData,
        depositAmount: location.depositAmount || 20,
        paymentMethods: location.paymentMethods || ["cash"],
        processingFeePercent: location.processingFeePercent || 300 // 3.00%
      };
      const createdLocation = this.createLocationSync(locationWithDefaults);
      
      if (inventoryByColor) {
        try {
          const colorInventory = typeof inventoryByColor === 'string' 
            ? JSON.parse(inventoryByColor) 
            : inventoryByColor;
          for (const [color, quantity] of Object.entries(colorInventory)) {
            this.addInventoryItem(createdLocation.id, color, quantity as number);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      } else if (inventoryCount) {
        this.addInventoryItem(createdLocation.id, "black", inventoryCount);
      }
    });

    // Initialize default payment methods
    const defaultPaymentMethods: InsertPaymentMethod[] = [
      {
        name: "cash",
        displayName: "Cash",
        provider: null,
        isActive: true,
        isAvailableToLocations: true,
        processingFeePercent: 0,
        fixedFee: 0,
        requiresApi: false,
        apiKey: null,
        apiSecret: null,
        webhookSecret: null,
        isConfigured: true
      },
      {
        name: "stripe",
        displayName: "Credit/Debit Card",
        provider: "stripe",
        isActive: false,
        isAvailableToLocations: false,
        processingFeePercent: 290, // 2.9%
        fixedFee: 30, // $0.30
        requiresApi: true,
        apiKey: null,
        apiSecret: null,
        webhookSecret: null,
        isConfigured: false
      },
      {
        name: "paypal",
        displayName: "PayPal",
        provider: "paypal",
        isActive: false,
        isAvailableToLocations: false,
        processingFeePercent: 290, // 2.9%
        fixedFee: 30, // $0.30
        requiresApi: true,
        apiKey: null,
        apiSecret: null,
        webhookSecret: null,
        isConfigured: false
      },
      {
        name: "venmo",
        displayName: "Venmo",
        provider: null,
        isActive: true,
        isAvailableToLocations: true,
        processingFeePercent: 0,
        fixedFee: 0,
        requiresApi: false,
        apiKey: null,
        apiSecret: null,
        webhookSecret: null,
        isConfigured: true
      },
      {
        name: "zelle",
        displayName: "Zelle",
        provider: null,
        isActive: true,
        isAvailableToLocations: true,
        processingFeePercent: 0,
        fixedFee: 0,
        requiresApi: false,
        apiKey: null,
        apiSecret: null,
        webhookSecret: null,
        isConfigured: true
      }
    ];

    defaultPaymentMethods.forEach(method => this.createPaymentMethod(method));
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCounter++;
    const user: User = { 
      ...insertUser, 
      id,
      role: insertUser.role || "customer",
      isAdmin: insertUser.isAdmin ?? null,
      locationId: insertUser.locationId ?? null
    };
    this.users.set(id, user);
    return user;
  }

  // Internal method for creating system users without invite code validation
  async createSystemUser(userData: Omit<InsertUser, 'inviteCode'>): Promise<User> {
    const id = this.userCounter++;
    const user: User = { 
      ...userData, 
      id,
      role: userData.role || "operator",
      isAdmin: userData.isAdmin ?? null,
      locationId: userData.locationId ?? null
    };
    this.users.set(id, user);
    return user;
  }

  // Invite Code methods
  async createInviteCode(insertInviteCode: InsertInviteCode): Promise<InviteCode> {
    const id = this.inviteCodeCounter++;
    const inviteCode: InviteCode = {
      ...insertInviteCode,
      id,
      applicationId: insertInviteCode.applicationId ?? null,
      isUsed: false,
      createdAt: new Date(),
      usedAt: null,
      usedByUserId: null
    };
    this.inviteCodesMap.set(id, inviteCode);
    return inviteCode;
  }

  async getInviteCodeByCode(code: string): Promise<InviteCode | undefined> {
    return Array.from(this.inviteCodesMap.values()).find(
      (inviteCode) => inviteCode.code === code
    );
  }

  async validateInviteCode(code: string): Promise<boolean> {
    // Check legacy static invite codes first
    if (this.validInviteCodes.has(code)) {
      return true;
    }
    // Check dynamic invite codes
    const inviteCode = await this.getInviteCodeByCode(code);
    return inviteCode !== undefined && !inviteCode.isUsed;
  }

  async useInviteCode(code: string, userId: number): Promise<InviteCode> {
    const inviteCode = await this.getInviteCodeByCode(code);
    if (!inviteCode) {
      throw new Error("Invite code not found");
    }
    if (inviteCode.isUsed) {
      throw new Error("Invite code has already been used");
    }
    const updatedCode: InviteCode = {
      ...inviteCode,
      isUsed: true,
      usedAt: new Date(),
      usedByUserId: userId
    };
    this.inviteCodesMap.set(inviteCode.id, updatedCode);
    return updatedCode;
  }

  // Region methods
  async getAllRegions(): Promise<Region[]> {
    return Array.from(this.regions.values());
  }

  async getRegion(id: number): Promise<Region | undefined> {
    return this.regions.get(id);
  }

  async getRegionBySlug(slug: string): Promise<Region | undefined> {
    return Array.from(this.regions.values()).find(
      (region) => region.slug === slug
    );
  }

  async createRegion(insertRegion: InsertRegion): Promise<Region> {
    const id = this.regionCounter++;
    const region: Region = { 
      ...insertRegion, 
      id,
      displayOrder: insertRegion.displayOrder ?? 0,
      nameHe: insertRegion.nameHe ?? null,
    };
    this.regions.set(id, region);
    return region;
  }

  async updateRegion(id: number, data: Partial<InsertRegion>): Promise<Region> {
    const region = this.regions.get(id);
    if (!region) {
      throw new Error(`Region with id ${id} not found`);
    }
    
    const updatedRegion = { ...region, ...data };
    this.regions.set(id, updatedRegion);
    return updatedRegion;
  }

  // Location methods
  async getAllLocations(): Promise<Location[]> {
    return Array.from(this.locations.values());
  }

  async getLocation(id: number): Promise<Location | undefined> {
    return this.locations.get(id);
  }

  async getLocationsByRegionId(regionId: number): Promise<Location[]> {
    return Array.from(this.locations.values()).filter(
      (location) => location.regionId === regionId
    );
  }

  async getLocationByCode(code: string): Promise<Location | undefined> {
    return Array.from(this.locations.values()).find(
      (location) => location.locationCode.toLowerCase() === code.toLowerCase()
    );
  }

  async getNextLocationCode(): Promise<string> {
    const locations = Array.from(this.locations.values());
    let maxNumber = 0;
    
    for (const location of locations) {
      const match = location.locationCode.match(/^#(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    
    return `#${maxNumber + 1}`;
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    return this.createLocationSync(insertLocation);
  }

  private createLocationSync(insertLocation: InsertLocation): Location {
    const id = this.locationCounter++;
    const location: Location = { 
      ...insertLocation, 
      id,
      zipCode: insertLocation.zipCode ?? null,
      isActive: insertLocation.isActive ?? true,
      cashOnly: insertLocation.cashOnly ?? null,
      depositAmount: insertLocation.depositAmount ?? null,
      paymentMethods: insertLocation.paymentMethods ?? null,
      processingFeePercent: insertLocation.processingFeePercent ?? null,
      processingFeeFixed: (insertLocation as any).processingFeeFixed ?? 30,
      cityCategoryId: insertLocation.cityCategoryId ?? null,
      operatorPin: insertLocation.operatorPin ?? null,
      nameHe: insertLocation.nameHe ?? null,
      contactPersonHe: insertLocation.contactPersonHe ?? null,
      addressHe: insertLocation.addressHe ?? null,
      claimToken: null,
      claimTokenCreatedAt: null,
      welcomeSentAt: null,
      welcomeSmsStatus: null,
      welcomeSmsError: null,
      welcomeSmsSentAt: null,
      welcomeSmsSid: null,
      welcomeSmsDeliveredAt: null,
      welcomeWhatsappStatus: null,
      welcomeWhatsappError: null,
      welcomeWhatsappSentAt: null,
      welcomeWhatsappSid: null,
      welcomeWhatsappDeliveredAt: null,
      defaultWelcomeChannel: null,
      contactPreference: null,
      contactPreferenceSetAt: null,
      onboardedAt: null,
    };
    this.locations.set(id, location);
    return location;
  }

  private addInventoryItem(locationId: number, color: string, quantity: number): Inventory {
    const id = this.inventoryCounter++;
    const item: Inventory = { id, locationId, color, quantity };
    this.inventoryItems.set(id, item);
    return item;
  }

  async updateLocation(id: number, data: Partial<InsertLocation>): Promise<Location> {
    const location = this.locations.get(id);
    if (!location) {
      throw new Error(`Location with id ${id} not found`);
    }
    
    const updatedLocation = { ...location, ...data };
    this.locations.set(id, updatedLocation);
    return updatedLocation;
  }

  async deleteLocation(id: number): Promise<void> {
    const location = this.locations.get(id);
    if (!location) {
      throw new Error(`Location with id ${id} not found`);
    }
    this.locations.delete(id);
  }

  // Inventory methods (using inventory table)
  async getInventoryByLocation(locationId: number): Promise<Inventory[]> {
    return Array.from(this.inventoryItems.values()).filter(
      item => item.locationId === locationId
    );
  }

  async setInventoryItem(locationId: number, color: string, quantity: number): Promise<Inventory> {
    const location = this.locations.get(locationId);
    if (!location) {
      throw new Error(`Location with id ${locationId} not found`);
    }

    const existing = Array.from(this.inventoryItems.values()).find(
      item => item.locationId === locationId && item.color === color
    );

    if (existing) {
      const updated: Inventory = { ...existing, quantity };
      this.inventoryItems.set(existing.id, updated);
      return updated;
    }

    const id = this.inventoryCounter++;
    const newItem: Inventory = { id, locationId, color, quantity };
    this.inventoryItems.set(id, newItem);
    return newItem;
  }

  async adjustInventory(locationId: number, color: string, delta: number): Promise<Inventory> {
    const location = this.locations.get(locationId);
    if (!location) {
      throw new Error(`Location with id ${locationId} not found`);
    }

    const existing = Array.from(this.inventoryItems.values()).find(
      item => item.locationId === locationId && item.color === color
    );

    if (existing) {
      const newQuantity = existing.quantity + delta;
      if (newQuantity < 0) {
        throw new Error(`Insufficient stock for color ${color}. Available: ${existing.quantity}, Requested: ${-delta}`);
      }
      const updated: Inventory = { ...existing, quantity: newQuantity };
      this.inventoryItems.set(existing.id, updated);
      return updated;
    }

    if (delta < 0) {
      throw new Error(`Insufficient stock for color ${color}. Available: 0, Requested: ${-delta}`);
    }

    const id = this.inventoryCounter++;
    const newItem: Inventory = { id, locationId, color, quantity: delta };
    this.inventoryItems.set(id, newItem);
    return newItem;
  }

  async getInventoryTotal(locationId: number): Promise<number> {
    const items = await this.getInventoryByLocation(locationId);
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  // GemachApplication methods
  async getAllApplications(): Promise<GemachApplication[]> {
    return Array.from(this.applications.values());
  }

  async getApplication(id: number): Promise<GemachApplication | undefined> {
    return this.applications.get(id);
  }

  async createApplication(insertApplication: InsertGemachApplication): Promise<GemachApplication> {
    const id = this.applicationCounter++;
    const application: GemachApplication = { 
      ...insertApplication, 
      id, 
      status: "pending",
      submittedAt: new Date(),
      message: insertApplication.message ?? null,
      community: insertApplication.community ?? null
    };
    this.applications.set(id, application);
    return application;
  }

  async updateApplication(id: number, data: Partial<GemachApplication>): Promise<GemachApplication> {
    const application = this.applications.get(id);
    if (!application) {
      throw new Error(`Application with id ${id} not found`);
    }
    
    const updatedApplication = { ...application, ...data };
    this.applications.set(id, updatedApplication);
    return updatedApplication;
  }

  // Transaction methods
  async getAllTransactions(): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    return this.transactions.get(id);
  }

  async getTransactionsByLocation(locationId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      (transaction) => transaction.locationId === locationId
    );
  }

  async getTransactionByPhone(locationId: number, phone: string): Promise<Transaction[]> {
    const normalizedPhone = phone.replace(/\D/g, '');
    return Array.from(this.transactions.values()).filter(
      (transaction) => {
        if (transaction.locationId !== locationId) return false;
        if (!transaction.borrowerPhone) return false;
        const txPhone = transaction.borrowerPhone.replace(/\D/g, '');
        return txPhone.includes(normalizedPhone) || normalizedPhone.includes(txPhone);
      }
    );
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = this.transactionCounter++;
    
    const transaction: Transaction = { 
      ...insertTransaction, 
      id, 
      isReturned: false,
      borrowDate: new Date(),
      actualReturnDate: null,
      expectedReturnDate: insertTransaction.expectedReturnDate ? new Date(insertTransaction.expectedReturnDate) : null,
      depositAmount: insertTransaction.depositAmount ?? 20,
      borrowerEmail: insertTransaction.borrowerEmail ?? null,
      borrowerPhone: insertTransaction.borrowerPhone ?? null,
      headbandColor: insertTransaction.headbandColor ?? null,
      depositPaymentMethod: insertTransaction.depositPaymentMethod ?? "cash",
      refundAmount: null,
      notes: insertTransaction.notes ?? null,
      // Pay Later fields
      payLaterStatus: insertTransaction.payLaterStatus ?? null,
      stripeCustomerId: insertTransaction.stripeCustomerId ?? null,
      stripeSetupIntentId: insertTransaction.stripeSetupIntentId ?? null,
      stripePaymentMethodId: insertTransaction.stripePaymentMethodId ?? null,
      stripePaymentIntentId: insertTransaction.stripePaymentIntentId ?? null,
      amountPlannedCents: insertTransaction.amountPlannedCents ?? null,
      currency: insertTransaction.currency ?? "usd",
      magicToken: insertTransaction.magicToken ?? null,
      magicTokenExpiresAt: insertTransaction.magicTokenExpiresAt ? new Date(insertTransaction.magicTokenExpiresAt) : null,
      lastReturnReminderAt: null,
      returnReminderCount: 0,
      chargeErrorCode: insertTransaction.chargeErrorCode ?? null,
      chargeErrorMessage: insertTransaction.chargeErrorMessage ?? null,
      // Task #39: consent + fee + notification + card-age fields
      consentText: insertTransaction.consentText ?? null,
      consentAcceptedAt: insertTransaction.consentAcceptedAt ?? null,
      consentMaxChargeCents: insertTransaction.consentMaxChargeCents ?? null,
      cardSavedAt: insertTransaction.cardSavedAt ?? null,
      chargeNotificationSentAt: insertTransaction.chargeNotificationSentAt ?? null,
      chargeNotificationChannel: insertTransaction.chargeNotificationChannel ?? null,
      depositFeeCents: insertTransaction.depositFeeCents ?? null,
      chargedAt: insertTransaction.chargedAt ?? null,
    };
    
    this.transactions.set(id, transaction);
    return transaction;
  }

  async updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction> {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    
    const updatedTransaction = { ...transaction, ...data };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  async markTransactionReturned(id: number, refundAmount?: number): Promise<Transaction> {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    
    const updatedTransaction: Transaction = { 
      ...transaction, 
      isReturned: true,
      actualReturnDate: new Date(),
      refundAmount: refundAmount ?? transaction.depositAmount
    };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  async recordReturnReminderSent(id: number, opts?: { channel?: string; language?: string; sentByUserId?: number | null }): Promise<Transaction> {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    const now = new Date();
    const updated: Transaction = {
      ...transaction,
      lastReturnReminderAt: now,
      returnReminderCount: (transaction.returnReminderCount ?? 0) + 1,
    };
    this.transactions.set(id, updated);
    const eventId = this.returnReminderEventCounter++;
    const event: ReturnReminderEvent = {
      id: eventId,
      transactionId: id,
      sentAt: now,
      sentByUserId: opts?.sentByUserId ?? null,
      channel: opts?.channel ?? 'email',
      language: opts?.language ?? 'en',
    };
    this.returnReminderEventsMap.set(eventId, event);
    return updated;
  }

  async getReturnReminderEvents(transactionId: number): Promise<ReturnReminderEventWithSender[]> {
    return Array.from(this.returnReminderEventsMap.values())
      .filter(e => e.transactionId === transactionId)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .map(e => {
        const user = e.sentByUserId != null ? this.users.get(e.sentByUserId) : undefined;
        const senderName = user
          ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || null
          : null;
        return { ...e, senderName };
      });
  }

  // Contact methods
  async getAllContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values());
  }

  async getContact(id: number): Promise<Contact | undefined> {
    return this.contacts.get(id);
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const id = this.contactCounter++;
    const contact: Contact = { 
      ...insertContact, 
      id, 
      submittedAt: new Date(),
      isRead: false,
      isArchived: false,
      isSpam: false
    };
    this.contacts.set(id, contact);
    return contact;
  }

  async markContactRead(id: number): Promise<Contact> {
    const contact = this.contacts.get(id);
    if (!contact) {
      throw new Error(`Contact with id ${id} not found`);
    }
    
    const updatedContact: Contact = { ...contact, isRead: true };
    this.contacts.set(id, updatedContact);
    return updatedContact;
  }

  async updateContact(id: number, data: Partial<Pick<Contact, 'subject' | 'message' | 'isRead' | 'isArchived' | 'isSpam'>>): Promise<Contact> {
    const contact = this.contacts.get(id);
    if (!contact) {
      throw new Error(`Contact with id ${id} not found`);
    }
    const updatedContact: Contact = { ...contact, ...data };
    this.contacts.set(id, updatedContact);
    return updatedContact;
  }

  async deleteContact(id: number): Promise<void> {
    if (!this.contacts.has(id)) {
      throw new Error(`Contact with id ${id} not found`);
    }
    this.contacts.delete(id);
  }

  // Payment methods
  async getAllPayments(): Promise<Payment[]> {
    return Array.from(this.payments.values());
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentsByTransaction(transactionId: number): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(
      payment => payment.transactionId === transactionId
    );
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = this.paymentCounter++;
    const payment: Payment = { 
      ...insertPayment, 
      id,
      status: insertPayment.status || "pending",
      paymentProvider: insertPayment.paymentProvider ?? null,
      externalPaymentId: insertPayment.externalPaymentId ?? null,
      processingFee: insertPayment.processingFee ?? null,
      paymentData: insertPayment.paymentData ?? null,
      createdAt: new Date(),
      completedAt: insertPayment.status === "completed" ? new Date() : null,
      retryAttempts: 0
    };
    this.payments.set(id, payment);
    return payment;
  }

  async updatePaymentStatus(id: number, status: string, paymentData?: any): Promise<Payment> {
    const payment = this.payments.get(id);
    if (!payment) {
      throw new Error(`Payment with id ${id} not found`);
    }
    
    const updatedPayment: Payment = { 
      ...payment, 
      status,
      paymentData: paymentData ? JSON.stringify(paymentData) : payment.paymentData,
      completedAt: status === "completed" ? new Date() : payment.completedAt
    };
    this.payments.set(id, updatedPayment);
    return updatedPayment;
  }

  // Payment Method operations
  async getAllPaymentMethods(): Promise<PaymentMethod[]> {
    return Array.from(this.paymentMethods.values());
  }

  async getPaymentMethod(id: number): Promise<PaymentMethod | undefined> {
    return this.paymentMethods.get(id);
  }

  async createPaymentMethod(insertMethod: InsertPaymentMethod): Promise<PaymentMethod> {
    const id = this.paymentMethodCounter++;
    const method: PaymentMethod = { 
      ...insertMethod,
      id,
      isActive: insertMethod.isActive ?? true,
      isAvailableToLocations: insertMethod.isAvailableToLocations ?? false,
      processingFeePercent: insertMethod.processingFeePercent ?? 0,
      fixedFee: insertMethod.fixedFee ?? 0,
      requiresApi: insertMethod.requiresApi ?? false,
      provider: insertMethod.provider ?? null,
      apiKey: insertMethod.apiKey ?? null,
      apiSecret: insertMethod.apiSecret ?? null,
      webhookSecret: insertMethod.webhookSecret ?? null,
      isConfigured: insertMethod.isConfigured ?? false,
      createdAt: new Date()
    };
    this.paymentMethods.set(id, method);
    return method;
  }

  async updatePaymentMethod(id: number, data: Partial<InsertPaymentMethod>): Promise<PaymentMethod> {
    const method = this.paymentMethods.get(id);
    if (!method) {
      throw new Error(`Payment method with id ${id} not found`);
    }
    
    const updatedMethod: PaymentMethod = { ...method, ...data };
    this.paymentMethods.set(id, updatedMethod);
    return updatedMethod;
  }

  async deletePaymentMethod(id: number): Promise<void> {
    this.paymentMethods.delete(id);
  }

  // Location Payment Method operations
  async getLocationPaymentMethods(locationId: number): Promise<LocationPaymentMethod[]> {
    return Array.from(this.locationPaymentMethods.values()).filter(
      lpm => lpm.locationId === locationId
    );
  }

  async getAvailablePaymentMethodsForLocation(locationId: number): Promise<PaymentMethod[]> {
    return Array.from(this.paymentMethods.values()).filter(
      method => method.isActive && method.isAvailableToLocations
    );
  }

  async enablePaymentMethodForLocation(locationId: number, paymentMethodId: number, customFee?: number): Promise<LocationPaymentMethod> {
    const id = this.locationPaymentMethodCounter++;
    const locationPaymentMethod: LocationPaymentMethod = {
      id,
      locationId,
      paymentMethodId,
      isEnabled: true,
      customProcessingFee: customFee || null,
      createdAt: new Date()
    };
    this.locationPaymentMethods.set(id, locationPaymentMethod);
    return locationPaymentMethod;
  }

  async disablePaymentMethodForLocation(locationId: number, paymentMethodId: number): Promise<void> {
    const lpm = Array.from(this.locationPaymentMethods.values()).find(
      item => item.locationId === locationId && item.paymentMethodId === paymentMethodId
    );
    if (lpm) {
      this.locationPaymentMethods.delete(lpm.id);
    }
  }

  // City Category operations
  async getAllCityCategories(): Promise<CityCategory[]> {
    return Array.from(this.cityCategories.values());
  }

  async getCityCategory(id: number): Promise<CityCategory | undefined> {
    return this.cityCategories.get(id);
  }

  async getCityCategoriesByRegionId(regionId: number): Promise<CityCategory[]> {
    return Array.from(this.cityCategories.values()).filter(
      cat => cat.regionId === regionId
    );
  }

  async getPopularCitiesByRegionId(regionId: number): Promise<CityCategory[]> {
    return Array.from(this.cityCategories.values()).filter(
      cat => cat.regionId === regionId && cat.isPopular
    );
  }

  async createCityCategory(cityCategory: InsertCityCategory): Promise<CityCategory> {
    const id = this.cityCategoryCounter++;
    const newCategory: CityCategory = {
      id,
      name: cityCategory.name,
      nameHe: cityCategory.nameHe ?? null,
      slug: cityCategory.slug,
      regionId: cityCategory.regionId,
      displayOrder: cityCategory.displayOrder ?? 0,
      isPopular: cityCategory.isPopular ?? false,
      description: cityCategory.description ?? null,
      descriptionHe: cityCategory.descriptionHe ?? null,
      stateCode: cityCategory.stateCode ?? null
    };
    this.cityCategories.set(id, newCategory);
    return newCategory;
  }

  async updateCityCategory(id: number, data: Partial<InsertCityCategory>): Promise<CityCategory> {
    const category = this.cityCategories.get(id);
    if (!category) {
      throw new Error(`City category with id ${id} not found`);
    }
    const updatedCategory: CityCategory = { ...category, ...data };
    this.cityCategories.set(id, updatedCategory);
    return updatedCategory;
  }

  // Pay Later operations
  async getTransactionByMagicToken(magicToken: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(t => t.magicToken === magicToken);
  }

  async getTransactionBySetupIntentId(setupIntentId: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(t => t.stripeSetupIntentId === setupIntentId);
  }

  async getTransactionByPaymentIntentId(paymentIntentId: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(t => t.stripePaymentIntentId === paymentIntentId);
  }

  async getPendingPayLaterTransactions(locationId?: number): Promise<Transaction[]> {
    const allTransactions = Array.from(this.transactions.values());
    return allTransactions.filter(t => {
      const isPending = t.payLaterStatus === 'CARD_SETUP_COMPLETE' || t.payLaterStatus === 'APPROVED';
      return isPending && (locationId === undefined || t.locationId === locationId);
    });
  }

  async updateTransactionPayLaterStatus(id: number, status: PayLaterStatus, additionalData?: Partial<Transaction>): Promise<Transaction> {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error(`Transaction ${id} not found`);
    }
    const updated = { ...transaction, payLaterStatus: status, ...additionalData };
    this.transactions.set(id, updated);
    return updated;
  }

  // Audit Log operations
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const auditLog: AuditLog = {
      id: this.auditLogCounter++,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      actorUserId: log.actorUserId || null,
      actorType: log.actorType || "system",
      beforeJson: log.beforeJson || null,
      afterJson: log.afterJson || null,
      metadata: log.metadata || null,
      ipAddress: log.ipAddress || null,
      createdAt: new Date()
    };
    this.auditLogsMap.set(auditLog.id, auditLog);
    return auditLog;
  }

  async getAuditLogsForEntity(entityType: string, entityId: number): Promise<AuditLog[]> {
    return Array.from(this.auditLogsMap.values()).filter(
      log => log.entityType === entityType && log.entityId === entityId
    );
  }

  // Webhook Event operations
  async getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined> {
    return Array.from(this.webhookEventsMap.values()).find(event => event.eventId === eventId);
  }

  // Playbook Fact / FAQ stubs (MemStorage is unused in production; these satisfy the interface)
  async getAllPlaybookFacts(): Promise<PlaybookFact[]> { return []; }
  async createPlaybookFact(fact: InsertPlaybookFact): Promise<PlaybookFact> {
    return { id: 0, factKey: fact.factKey, factValue: fact.factValue, category: fact.category || 'general', updatedAt: new Date() };
  }
  async updatePlaybookFact(id: number, _data: Partial<InsertPlaybookFact>): Promise<PlaybookFact> {
    throw new Error(`Playbook fact ${id} not found`);
  }
  async deletePlaybookFact(_id: number): Promise<void> {}
  async getAllFaqEntries(): Promise<FaqEntry[]> { return []; }
  async getActiveFaqEntries(): Promise<FaqEntry[]> { return []; }
  async createFaqEntry(faq: InsertFaqEntry): Promise<FaqEntry> {
    return { id: 0, question: faq.question, answer: faq.answer, language: faq.language || 'en', category: faq.category || 'general', isActive: faq.isActive ?? true, updatedAt: new Date() };
  }
  async updateFaqEntry(id: number, _data: Partial<InsertFaqEntry>): Promise<FaqEntry> {
    throw new Error(`FAQ entry ${id} not found`);
  }
  async deleteFaqEntry(_id: number): Promise<void> {}

  async getAllKnowledgeDocs(): Promise<KnowledgeDoc[]> { return []; }
  async getActiveKnowledgeDocs(): Promise<KnowledgeDoc[]> { return []; }
  async getKnowledgeDoc(_id: number): Promise<KnowledgeDoc | undefined> { return undefined; }
  async createKnowledgeDoc(doc: InsertKnowledgeDoc): Promise<KnowledgeDoc> {
    return { id: 0, title: doc.title, body: doc.body, category: doc.category || 'general', language: doc.language || 'en', isActive: doc.isActive ?? true, updatedAt: new Date() };
  }
  async updateKnowledgeDoc(id: number, _data: Partial<InsertKnowledgeDoc>): Promise<KnowledgeDoc> {
    throw new Error(`Knowledge doc ${id} not found`);
  }
  async deleteKnowledgeDoc(_id: number): Promise<void> {}

  async createReplyExample(rec: InsertReplyExample): Promise<ReplyExample> {
    return {
      id: 0,
      sourceType: rec.sourceType, sourceRef: rec.sourceRef ?? null,
      senderEmail: rec.senderEmail ?? null, senderName: rec.senderName ?? null,
      incomingSubject: rec.incomingSubject, incomingBody: rec.incomingBody,
      sentReply: rec.sentReply, classification: rec.classification ?? null,
      language: rec.language || 'en', matchedLocationId: rec.matchedLocationId ?? null,
      wasEdited: rec.wasEdited ?? false, createdAt: new Date(),
    };
  }
  async getRecentReplyExamples(_limit?: number): Promise<ReplyExample[]> { return []; }
  async getReplyExamplesBySender(_email: string, _limit?: number): Promise<ReplyExample[]> { return []; }
  async getReplyExample(_id: number): Promise<ReplyExample | undefined> { return undefined; }
  async getReplyExamplesByRef(_sourceType: string, _sourceRef: string): Promise<ReplyExample[]> { return []; }
  async getReplyExampleRefs(): Promise<{ sourceType: string; sourceRef: string; lastRepliedAt: string }[]> { return []; }
  async deleteReplyExample(_id: number): Promise<void> {}

  async upsertKbEmbedding(rec: InsertKbEmbedding): Promise<KbEmbedding> {
    return {
      id: 0,
      sourceKind: rec.sourceKind, sourceId: rec.sourceId,
      chunkIdx: rec.chunkIdx ?? 0,
      content: rec.content, embedding: rec.embedding,
      language: rec.language || 'en', updatedAt: new Date(),
    };
  }
  async deleteKbEmbedding(_kind: KbSourceKind, _id: number): Promise<void> {}
  async getAllKbEmbeddings(): Promise<KbEmbedding[]> { return []; }
  async getKbEmbeddingsByKind(_kind: KbSourceKind): Promise<KbEmbedding[]> { return []; }

  async getContactsByEmail(email: string): Promise<Contact[]> {
    const e = (email || '').toLowerCase();
    return Array.from(this.contacts.values()).filter(c => (c.email || '').toLowerCase() === e);
  }
  async getTransactionsByEmail(email: string): Promise<Transaction[]> {
    const e = (email || '').toLowerCase();
    return Array.from(this.transactions.values()).filter(t => (t.borrowerEmail || '').toLowerCase() === e);
  }

  async createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent> {
    const webhookEvent: WebhookEvent = {
      id: this.webhookEventCounter++,
      eventId: event.eventId,
      eventType: event.eventType,
      processedAt: new Date()
    };
    this.webhookEventsMap.set(webhookEvent.id, webhookEvent);
    return webhookEvent;
  }

  async deleteCityCategory(id: number): Promise<void> {
    this.cityCategories.delete(id);
  }

  // Task #39: Global Settings (in-memory shim)
  private globalSettingsMap = new Map<string, GlobalSetting>();
  async getGlobalSetting(key: string): Promise<GlobalSetting | undefined> {
    return this.globalSettingsMap.get(key);
  }
  async setGlobalSetting(key: string, value: string): Promise<GlobalSetting> {
    const existing = this.globalSettingsMap.get(key);
    const setting: GlobalSetting = {
      id: existing?.id ?? this.globalSettingsMap.size + 1,
      key,
      value,
      isEnabled: true,
      updatedAt: new Date(),
    };
    this.globalSettingsMap.set(key, setting);
    return setting;
  }

  // Task #39: Disputes (in-memory shim)
  private disputesMap = new Map<number, Dispute>();
  private disputesCounter = 1;
  async createDispute(dispute: InsertDispute): Promise<Dispute> {
    const existing = Array.from(this.disputesMap.values()).find(d => d.stripeDisputeId === dispute.stripeDisputeId);
    if (existing) return existing;
    const row: Dispute = {
      id: this.disputesCounter++,
      locationId: dispute.locationId ?? null,
      transactionId: dispute.transactionId ?? null,
      stripeDisputeId: dispute.stripeDisputeId,
      stripeChargeId: dispute.stripeChargeId,
      stripePaymentIntentId: dispute.stripePaymentIntentId ?? null,
      amountCents: dispute.amountCents,
      currency: dispute.currency ?? 'usd',
      status: dispute.status,
      reason: dispute.reason,
      evidenceDueBy: dispute.evidenceDueBy ?? null,
      rawPayloadJson: dispute.rawPayloadJson ?? null,
      createdAt: new Date(),
    };
    this.disputesMap.set(row.id, row);
    return row;
  }
  async getDisputeByStripeId(stripeDisputeId: string): Promise<Dispute | undefined> {
    return Array.from(this.disputesMap.values()).find(d => d.stripeDisputeId === stripeDisputeId);
  }
  async getDisputesByLocationSince(locationId: number, since: Date): Promise<Dispute[]> {
    return Array.from(this.disputesMap.values())
      .filter(d => d.locationId === locationId && d.createdAt >= since)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async getAllDisputes(): Promise<Dispute[]> {
    return Array.from(this.disputesMap.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async getRecentDisputeStats(sinceDays: number): Promise<{ locationId: number; disputeCount: number; chargedCount: number; rate: number; }[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    // Denominator mirrors DatabaseStorage: pay-later charges windowed by chargedAt,
    // plus direct-deposit Stripe card charges windowed by borrowDate (= created_at).
    // No (as any) casts — Transaction fields are fully typed in shared/schema.ts.
    const chargedByLoc = new Map<number, number>();
    for (const t of Array.from(this.transactions.values())) {
      const isPayLaterCharged =
        t.payLaterStatus === 'CHARGED' &&
        t.chargedAt instanceof Date &&
        t.chargedAt >= since;
      const isDirectDepositCharged =
        (t.depositPaymentMethod === 'card' || t.depositPaymentMethod === 'stripe') &&
        t.stripePaymentIntentId !== null &&
        t.payLaterStatus === null &&
        t.borrowDate instanceof Date &&
        t.borrowDate >= since;
      if (isPayLaterCharged || isDirectDepositCharged) {
        chargedByLoc.set(t.locationId, (chargedByLoc.get(t.locationId) || 0) + 1);
      }
    }
    const dispByLoc = new Map<number, number>();
    for (const d of Array.from(this.disputesMap.values())) {
      if (d.createdAt >= since && d.locationId !== null) {
        dispByLoc.set(d.locationId, (dispByLoc.get(d.locationId) || 0) + 1);
      }
    }
    const allLocIds = new Set<number>([...Array.from(chargedByLoc.keys()), ...Array.from(dispByLoc.keys())]);
    return Array.from(allLocIds).map(locationId => {
      const disputeCount = dispByLoc.get(locationId) || 0;
      const chargedCount = chargedByLoc.get(locationId) || 0;
      const rate = chargedCount > 0 ? disputeCount / chargedCount : 0;
      return { locationId, disputeCount, chargedCount, rate };
    });
  }
}

import { DatabaseStorage } from './databaseStorage.js';

export const storage = new DatabaseStorage();
