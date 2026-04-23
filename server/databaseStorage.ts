import { eq, and, sql, ilike, isNull, or, inArray } from 'drizzle-orm';
import { db } from './db.js';
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
  type PayLaterStatus
} from '../shared/schema.js';
import type { IStorage } from './storage.js';

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { inviteCode, ...userData } = insertUser;
    const result = await db.insert(users).values({
      ...userData,
      role: userData.role || "customer",
      isAdmin: userData.isAdmin ?? null,
      locationId: userData.locationId ?? null
    }).returning();
    return result[0];
  }

  async createSystemUser(userData: Omit<InsertUser, 'inviteCode'>): Promise<User> {
    const result = await db.insert(users).values({
      ...userData,
      role: userData.role || "operator",
      isAdmin: userData.isAdmin ?? null,
      locationId: userData.locationId ?? null
    }).returning();
    return result[0];
  }

  // Invite Code operations
  async createInviteCode(insertInviteCode: InsertInviteCode): Promise<InviteCode> {
    const result = await db.insert(inviteCodes).values({
      ...insertInviteCode,
      applicationId: insertInviteCode.applicationId ?? null,
      isUsed: false,
      createdAt: new Date(),
      usedAt: null,
      usedByUserId: null
    }).returning();
    return result[0];
  }

  async getInviteCodeByCode(code: string): Promise<InviteCode | undefined> {
    const result = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    return result[0];
  }

  async validateInviteCode(code: string): Promise<boolean> {
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
    const result = await db.update(inviteCodes)
      .set({
        isUsed: true,
        usedAt: new Date(),
        usedByUserId: userId
      })
      .where(eq(inviteCodes.id, inviteCode.id))
      .returning();
    return result[0];
  }

  // Region operations
  async getAllRegions(): Promise<Region[]> {
    return db.select().from(regions);
  }

  async getRegion(id: number): Promise<Region | undefined> {
    const result = await db.select().from(regions).where(eq(regions.id, id));
    return result[0];
  }

  async getRegionBySlug(slug: string): Promise<Region | undefined> {
    const result = await db.select().from(regions).where(eq(regions.slug, slug));
    return result[0];
  }

  async createRegion(insertRegion: InsertRegion): Promise<Region> {
    const result = await db.insert(regions).values({
      ...insertRegion,
      displayOrder: insertRegion.displayOrder ?? 0
    }).returning();
    return result[0];
  }

  async updateRegion(id: number, data: Partial<InsertRegion>): Promise<Region> {
    const result = await db.update(regions)
      .set(data)
      .where(eq(regions.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Region with id ${id} not found`);
    }
    return result[0];
  }

  // City Category operations
  async getAllCityCategories(): Promise<CityCategory[]> {
    return db.select().from(cityCategories);
  }

  async getCityCategory(id: number): Promise<CityCategory | undefined> {
    const result = await db.select().from(cityCategories).where(eq(cityCategories.id, id));
    return result[0];
  }

  async getCityCategoriesByRegionId(regionId: number): Promise<CityCategory[]> {
    return db.select().from(cityCategories).where(eq(cityCategories.regionId, regionId));
  }

  async getPopularCitiesByRegionId(regionId: number): Promise<CityCategory[]> {
    return db.select().from(cityCategories).where(
      and(
        eq(cityCategories.regionId, regionId),
        eq(cityCategories.isPopular, true)
      )
    );
  }

  async createCityCategory(cityCategory: InsertCityCategory): Promise<CityCategory> {
    const result = await db.insert(cityCategories).values({
      name: cityCategory.name,
      nameHe: cityCategory.nameHe ?? null,
      slug: cityCategory.slug,
      regionId: cityCategory.regionId,
      displayOrder: cityCategory.displayOrder ?? 0,
      isPopular: cityCategory.isPopular ?? false,
      description: cityCategory.description ?? null,
      descriptionHe: cityCategory.descriptionHe ?? null,
      stateCode: cityCategory.stateCode ?? null
    }).returning();
    return result[0];
  }

  async updateCityCategory(id: number, data: Partial<InsertCityCategory>): Promise<CityCategory> {
    const result = await db.update(cityCategories)
      .set(data)
      .where(eq(cityCategories.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`City category with id ${id} not found`);
    }
    return result[0];
  }

  async deleteCityCategory(id: number): Promise<void> {
    await db.delete(cityCategories).where(eq(cityCategories.id, id));
  }

  // Location operations
  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations);
  }

  async getLocation(id: number): Promise<Location | undefined> {
    const result = await db.select().from(locations).where(eq(locations.id, id));
    return result[0];
  }

  async getLocationByCode(code: string): Promise<Location | undefined> {
    const result = await db.select().from(locations).where(
      ilike(locations.locationCode, code)
    );
    return result[0];
  }

  async getLocationsByRegionId(regionId: number): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.regionId, regionId));
  }

  async getNextLocationCode(): Promise<string> {
    const allLocations = await db.select().from(locations);
    let maxNumber = 0;
    
    for (const location of allLocations) {
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
    const result = await db.insert(locations).values({
      ...insertLocation,
      zipCode: insertLocation.zipCode ?? null,
      isActive: insertLocation.isActive ?? true,
      cashOnly: insertLocation.cashOnly ?? null,
      depositAmount: insertLocation.depositAmount ?? null,
      paymentMethods: insertLocation.paymentMethods ?? null,
      processingFeePercent: insertLocation.processingFeePercent ?? null,
      cityCategoryId: insertLocation.cityCategoryId ?? null,
      operatorPin: insertLocation.operatorPin ?? null
    }).returning();
    return result[0];
  }

  async updateLocation(id: number, data: Partial<InsertLocation>): Promise<Location> {
    const result = await db.update(locations)
      .set(data)
      .where(eq(locations.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Location with id ${id} not found`);
    }
    return result[0];
  }

  async deleteLocation(id: number): Promise<void> {
    const result = await db.delete(locations).where(eq(locations.id, id)).returning();
    if (result.length === 0) {
      throw new Error(`Location with id ${id} not found`);
    }
  }

  // Inventory operations
  async getInventoryByLocation(locationId: number): Promise<Inventory[]> {
    return db.select().from(inventory).where(eq(inventory.locationId, locationId));
  }

  async setInventoryItem(locationId: number, color: string, quantity: number): Promise<Inventory> {
    const location = await this.getLocation(locationId);
    if (!location) {
      throw new Error(`Location with id ${locationId} not found`);
    }

    const existing = await db.select().from(inventory).where(
      and(
        eq(inventory.locationId, locationId),
        eq(inventory.color, color)
      )
    );

    if (existing.length > 0) {
      const result = await db.update(inventory)
        .set({ quantity })
        .where(eq(inventory.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(inventory).values({
      locationId,
      color,
      quantity
    }).returning();
    return result[0];
  }

  async adjustInventory(locationId: number, color: string, delta: number): Promise<Inventory> {
    const location = await this.getLocation(locationId);
    if (!location) {
      throw new Error(`Location with id ${locationId} not found`);
    }

    const existing = await db.select().from(inventory).where(
      and(
        eq(inventory.locationId, locationId),
        eq(inventory.color, color)
      )
    );

    if (existing.length > 0) {
      const newQuantity = existing[0].quantity + delta;
      if (newQuantity < 0) {
        throw new Error(`Insufficient stock for color ${color}. Available: ${existing[0].quantity}, Requested: ${-delta}`);
      }
      const result = await db.update(inventory)
        .set({ quantity: newQuantity })
        .where(eq(inventory.id, existing[0].id))
        .returning();
      return result[0];
    }

    if (delta < 0) {
      throw new Error(`Insufficient stock for color ${color}. Available: 0, Requested: ${-delta}`);
    }

    const result = await db.insert(inventory).values({
      locationId,
      color,
      quantity: delta
    }).returning();
    return result[0];
  }

  async getInventoryTotal(locationId: number): Promise<number> {
    const items = await this.getInventoryByLocation(locationId);
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  // GemachApplication operations
  async getAllApplications(): Promise<GemachApplication[]> {
    return db.select().from(gemachApplications);
  }

  async getApplication(id: number): Promise<GemachApplication | undefined> {
    const result = await db.select().from(gemachApplications).where(eq(gemachApplications.id, id));
    return result[0];
  }

  async createApplication(insertApplication: InsertGemachApplication): Promise<GemachApplication> {
    const result = await db.insert(gemachApplications).values({
      ...insertApplication,
      status: "pending",
      submittedAt: new Date(),
      message: insertApplication.message ?? null,
      community: insertApplication.community ?? null
    }).returning();
    return result[0];
  }

  async updateApplication(id: number, data: Partial<GemachApplication>): Promise<GemachApplication> {
    const result = await db.update(gemachApplications)
      .set(data)
      .where(eq(gemachApplications.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Application with id ${id} not found`);
    }
    return result[0];
  }

  // Transaction operations
  async getAllTransactions(): Promise<Transaction[]> {
    return db.select().from(transactions);
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.id, id));
    return result[0];
  }

  async getTransactionsByLocation(locationId: number): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.locationId, locationId));
  }

  async getTransactionByPhone(locationId: number, phone: string): Promise<Transaction[]> {
    const allTransactions = await db.select().from(transactions).where(eq(transactions.locationId, locationId));
    const normalizedPhone = phone.replace(/\D/g, '');
    return allTransactions.filter(transaction => {
      if (!transaction.borrowerPhone) return false;
      const txPhone = transaction.borrowerPhone.replace(/\D/g, '');
      return txPhone.includes(normalizedPhone) || normalizedPhone.includes(txPhone);
    });
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const result = await db.insert(transactions).values({
      ...insertTransaction,
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
      notes: insertTransaction.notes ?? null
    }).returning();
    return result[0];
  }

  async updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction> {
    const result = await db.update(transactions)
      .set(data)
      .where(eq(transactions.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    return result[0];
  }

  async markTransactionReturned(id: number, refundAmount?: number): Promise<Transaction> {
    const transaction = await this.getTransaction(id);
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    
    const result = await db.update(transactions)
      .set({
        isReturned: true,
        actualReturnDate: new Date(),
        refundAmount: refundAmount ?? transaction.depositAmount
      })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async recordReturnReminderSent(id: number): Promise<Transaction> {
    const transaction = await this.getTransaction(id);
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    const result = await db.update(transactions)
      .set({
        lastReturnReminderAt: new Date(),
        returnReminderCount: (transaction.returnReminderCount ?? 0) + 1,
      })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  // Contact operations
  async getAllContacts(): Promise<Contact[]> {
    return db.select().from(contacts);
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const result = await db.select().from(contacts).where(eq(contacts.id, id));
    return result[0];
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const result = await db.insert(contacts).values({
      ...insertContact,
      submittedAt: new Date(),
      isRead: false
    }).returning();
    return result[0];
  }

  async markContactRead(id: number): Promise<Contact> {
    const result = await db.update(contacts)
      .set({ isRead: true })
      .where(eq(contacts.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Contact with id ${id} not found`);
    }
    return result[0];
  }

  async updateContact(id: number, data: Partial<Pick<Contact, 'subject' | 'message' | 'isRead'>>): Promise<Contact> {
    const result = await db.update(contacts)
      .set(data)
      .where(eq(contacts.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Contact with id ${id} not found`);
    }
    return result[0];
  }

  async deleteContact(id: number): Promise<void> {
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (result.length === 0) {
      throw new Error(`Contact with id ${id} not found`);
    }
  }

  // Payment operations
  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments);
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.id, id));
    return result[0];
  }

  async getPaymentsByTransaction(transactionId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.transactionId, transactionId));
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const result = await db.insert(payments).values({
      ...insertPayment,
      status: insertPayment.status || "pending",
      paymentProvider: insertPayment.paymentProvider ?? null,
      externalPaymentId: insertPayment.externalPaymentId ?? null,
      processingFee: insertPayment.processingFee ?? null,
      paymentData: insertPayment.paymentData ?? null,
      createdAt: new Date(),
      completedAt: insertPayment.status === "completed" ? new Date() : null
    }).returning();
    return result[0];
  }

  async updatePaymentStatus(id: number, status: string, paymentData?: any): Promise<Payment> {
    const payment = await this.getPayment(id);
    if (!payment) {
      throw new Error(`Payment with id ${id} not found`);
    }
    
    const result = await db.update(payments)
      .set({
        status,
        paymentData: paymentData ? JSON.stringify(paymentData) : payment.paymentData,
        completedAt: status === "completed" ? new Date() : payment.completedAt
      })
      .where(eq(payments.id, id))
      .returning();
    return result[0];
  }

  // Payment Method operations
  async getAllPaymentMethods(): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods);
  }

  async getPaymentMethod(id: number): Promise<PaymentMethod | undefined> {
    const result = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    return result[0];
  }

  async createPaymentMethod(insertMethod: InsertPaymentMethod): Promise<PaymentMethod> {
    const result = await db.insert(paymentMethods).values({
      ...insertMethod,
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
    }).returning();
    return result[0];
  }

  async updatePaymentMethod(id: number, data: Partial<InsertPaymentMethod>): Promise<PaymentMethod> {
    const result = await db.update(paymentMethods)
      .set(data)
      .where(eq(paymentMethods.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Payment method with id ${id} not found`);
    }
    return result[0];
  }

  async deletePaymentMethod(id: number): Promise<void> {
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
  }

  // Location Payment Method operations
  async getLocationPaymentMethods(locationId: number): Promise<LocationPaymentMethod[]> {
    return db.select().from(locationPaymentMethods).where(eq(locationPaymentMethods.locationId, locationId));
  }

  async getAvailablePaymentMethodsForLocation(locationId: number): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods).where(
      and(
        eq(paymentMethods.isActive, true),
        eq(paymentMethods.isAvailableToLocations, true)
      )
    );
  }

  async enablePaymentMethodForLocation(locationId: number, paymentMethodId: number, customFee?: number): Promise<LocationPaymentMethod> {
    const result = await db.insert(locationPaymentMethods).values({
      locationId,
      paymentMethodId,
      isEnabled: true,
      customProcessingFee: customFee || null,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async disablePaymentMethodForLocation(locationId: number, paymentMethodId: number): Promise<void> {
    await db.delete(locationPaymentMethods).where(
      and(
        eq(locationPaymentMethods.locationId, locationId),
        eq(locationPaymentMethods.paymentMethodId, paymentMethodId)
      )
    );
  }

  // Pay Later operations
  async getTransactionByMagicToken(magicToken: string): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.magicToken, magicToken));
    return result[0];
  }

  async getTransactionBySetupIntentId(setupIntentId: string): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.stripeSetupIntentId, setupIntentId));
    return result[0];
  }

  async getTransactionByPaymentIntentId(paymentIntentId: string): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.stripePaymentIntentId, paymentIntentId));
    return result[0];
  }

  async getPendingPayLaterTransactions(locationId?: number): Promise<Transaction[]> {
    const pendingStatuses = ['CARD_SETUP_PENDING', 'CARD_SETUP_COMPLETE', 'CHARGE_REQUIRES_ACTION'];
    
    if (locationId) {
      return db.select().from(transactions).where(
        and(
          eq(transactions.locationId, locationId),
          inArray(transactions.payLaterStatus, pendingStatuses)
        )
      );
    }
    
    return db.select().from(transactions).where(
      inArray(transactions.payLaterStatus, pendingStatuses)
    );
  }

  async updateTransactionPayLaterStatus(id: number, status: PayLaterStatus, additionalData?: Partial<Transaction>): Promise<Transaction> {
    const updateData: any = { payLaterStatus: status, ...additionalData };
    
    const result = await db.update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    return result[0];
  }

  // Audit Log operations
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values({
      ...log,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async getAuditLogsForEntity(entityType: string, entityId: number): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(
      and(
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId)
      )
    );
  }

  // Webhook Event operations (for idempotency)
  async getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined> {
    const result = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, eventId));
    return result[0];
  }

  async createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent> {
    const result = await db.insert(webhookEvents).values({
      ...event,
      processedAt: new Date()
    }).returning();
    return result[0];
  }

  // Playbook Fact operations (admin-editable AI facts)
  async getAllPlaybookFacts(): Promise<PlaybookFact[]> {
    return db.select().from(playbookFacts).orderBy(playbookFacts.category, playbookFacts.factKey);
  }
  async createPlaybookFact(fact: InsertPlaybookFact): Promise<PlaybookFact> {
    const result = await db.insert(playbookFacts).values({ ...fact, updatedAt: new Date() }).returning();
    return result[0];
  }
  async updatePlaybookFact(id: number, data: Partial<InsertPlaybookFact>): Promise<PlaybookFact> {
    const result = await db.update(playbookFacts).set({ ...data, updatedAt: new Date() }).where(eq(playbookFacts.id, id)).returning();
    if (!result[0]) throw new Error(`Playbook fact ${id} not found`);
    return result[0];
  }
  async deletePlaybookFact(id: number): Promise<void> {
    await db.delete(playbookFacts).where(eq(playbookFacts.id, id));
  }

  // FAQ Entry operations (admin-curated AI knowledge base)
  async getAllFaqEntries(): Promise<FaqEntry[]> {
    return db.select().from(faqEntries).orderBy(faqEntries.category, faqEntries.id);
  }
  async getActiveFaqEntries(): Promise<FaqEntry[]> {
    return db.select().from(faqEntries).where(eq(faqEntries.isActive, true));
  }
  async createFaqEntry(faq: InsertFaqEntry): Promise<FaqEntry> {
    const result = await db.insert(faqEntries).values({ ...faq, updatedAt: new Date() }).returning();
    return result[0];
  }
  async updateFaqEntry(id: number, data: Partial<InsertFaqEntry>): Promise<FaqEntry> {
    const result = await db.update(faqEntries).set({ ...data, updatedAt: new Date() }).where(eq(faqEntries.id, id)).returning();
    if (!result[0]) throw new Error(`FAQ entry ${id} not found`);
    return result[0];
  }
  async deleteFaqEntry(id: number): Promise<void> {
    await db.delete(faqEntries).where(eq(faqEntries.id, id));
  }
}

let schemaUpgradesRun = false;
export async function ensureSchemaUpgrades(): Promise<void> {
  if (schemaUpgradesRun) return;
  schemaUpgradesRun = true;
  try {
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS last_return_reminder_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_reminder_count INTEGER NOT NULL DEFAULT 0`);
  } catch (err: any) {
    schemaUpgradesRun = false;
    console.error('[ensureSchemaUpgrades] Failed to apply transactions reminder columns:', err?.message || err);
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  }
}
