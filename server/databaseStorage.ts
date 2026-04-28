import { eq, and, sql, ilike, isNull, or, inArray, desc } from 'drizzle-orm';
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
  knowledgeDocs, type KnowledgeDoc, type InsertKnowledgeDoc,
  replyExamples, type ReplyExample, type InsertReplyExample,
  returnReminderEvents, type ReturnReminderEvent, type InsertReturnReminderEvent, type ReturnReminderEventWithSender,
  kbEmbeddings, type KbEmbedding, type InsertKbEmbedding,
  globalSettings, type GlobalSetting, type InsertGlobalSetting,
  disputes, type Dispute, type InsertDispute,
  type KbSourceKind,
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

  // ---- Operator onboarding (Task #35) ----

  async getLocationByClaimToken(token: string): Promise<Location | undefined> {
    if (!token || typeof token !== 'string') return undefined;
    const result = await db.select().from(locations).where(eq(locations.claimToken, token)).limit(1);
    return result[0];
  }

  /**
   * Returns the existing claim token if present; otherwise atomically generates
   * and stores a fresh one. The UPDATE is gated on `claim_token IS NULL` to
   * make concurrent calls safe — only one writer wins; losers re-read the row
   * and return the winner's token.
   */
  async ensureLocationClaimToken(
    id: number,
    generate: () => string,
    options?: { regenerate?: boolean },
  ): Promise<{ location: Location; token: string }> {
    const existing = await this.getLocation(id);
    if (!existing) throw new Error(`Location with id ${id} not found`);
    const wantRegen = !!options?.regenerate;
    if (existing.claimToken && !wantRegen) {
      return { location: existing, token: existing.claimToken };
    }
    for (let i = 0; i < 5; i++) {
      const token = generate();
      try {
        // When regenerating, we always overwrite (gated only by id). Otherwise
        // we only write when no token exists, so concurrent callers race
        // safely and the loser re-reads the winner's token below.
        const whereClause = wantRegen
          ? eq(locations.id, id)
          : and(eq(locations.id, id), isNull(locations.claimToken));
        const updated = await db
          .update(locations)
          .set({ claimToken: token, claimTokenCreatedAt: new Date() })
          .where(whereClause)
          .returning();
        if (updated[0]) return { location: updated[0], token };
        // Lost the race — someone else just allocated a token. Read and return it.
        const reread = await this.getLocation(id);
        if (reread?.claimToken) return { location: reread, token: reread.claimToken };
      } catch (e: any) {
        if (!/unique|duplicate/i.test(e?.message || '')) throw e;
      }
    }
    throw new Error('Failed to allocate a unique claim token after several attempts');
  }

  /**
   * Atomic onboarding completion. The UPDATE is gated on the token still
   * matching AND the location not yet being onboarded, so concurrent /complete
   * calls with the same token cannot both succeed — the loser sees `undefined`
   * (which the route translates to 409 Already onboarded). The claim token is
   * intentionally NOT cleared: per spec the welcome link stays valid forever
   * so that the operator can reopen it later (it short-circuits to the
   * "already onboarded — go to dashboard" view).
   */
  async completeOperatorOnboardingByToken(
    token: string,
    data: {
      contactPerson: string;
      email: string;
      operatorPin: string;
      contactPreference: 'phone' | 'whatsapp' | 'email';
    },
  ): Promise<Location | undefined> {
    const now = new Date();
    const result = await db
      .update(locations)
      .set({
        contactPerson: data.contactPerson,
        email: data.email,
        operatorPin: data.operatorPin,
        contactPreference: data.contactPreference,
        contactPreferenceSetAt: now,
        onboardedAt: now,
      })
      .where(and(
        eq(locations.claimToken, token),
        isNull(locations.onboardedAt),
      ))
      .returning();
    return result[0];
  }

  async recordOperatorWelcomeAttempt(
    id: number,
    update: {
      sms?: { ok: boolean; error?: string; sid?: string };
      whatsapp?: { ok: boolean; error?: string; sid?: string };
      email?: { ok: boolean; error?: string };
      defaultWelcomeChannel?: string | null;
    },
  ): Promise<Location> {
    const now = new Date();
    const patch: Record<string, any> = { welcomeSentAt: now };
    if (update.sms) {
      patch.welcomeSmsStatus = update.sms.ok ? 'sent' : 'failed';
      patch.welcomeSmsError = update.sms.ok ? null : (update.sms.error || 'Unknown error');
      patch.welcomeSmsSentAt = now;
      patch.welcomeSmsSid = update.sms.sid || null;
      patch.welcomeSmsDeliveredAt = null;
    }
    if (update.whatsapp) {
      patch.welcomeWhatsappStatus = update.whatsapp.ok ? 'sent' : 'failed';
      patch.welcomeWhatsappError = update.whatsapp.ok ? null : (update.whatsapp.error || 'Unknown error');
      patch.welcomeWhatsappSentAt = now;
      patch.welcomeWhatsappSid = update.whatsapp.sid || null;
      patch.welcomeWhatsappDeliveredAt = null;
    }
    if (update.email) {
      patch.welcomeEmailStatus = update.email.ok ? 'sent' : 'failed';
      patch.welcomeEmailError = update.email.ok ? null : (update.email.error || 'Unknown error');
      patch.welcomeEmailSentAt = now;
    }
    if (update.defaultWelcomeChannel !== undefined) {
      patch.defaultWelcomeChannel = update.defaultWelcomeChannel;
    }
    const result = await db.update(locations).set(patch).where(eq(locations.id, id)).returning();
    if (!result[0]) throw new Error(`Location with id ${id} not found`);
    return result[0];
  }

  /**
   * Updates the cached delivery state for an SMS or WhatsApp welcome message
   * based on a Twilio status callback (e.g. delivered/undelivered/failed).
   * The row is matched by SID since Twilio doesn't know our location id.
   */
  async updateWelcomeDeliveryStatus(
    sid: string,
    channel: 'sms' | 'whatsapp',
    status: string,
    errorMessage?: string,
  ): Promise<Location | undefined> {
    const now = new Date();
    const patch: Record<string, any> = {};
    if (channel === 'sms') {
      patch.welcomeSmsStatus = status;
      if (status === 'delivered') patch.welcomeSmsDeliveredAt = now;
      if (errorMessage) patch.welcomeSmsError = errorMessage;
      else if (status === 'delivered' || status === 'sent') patch.welcomeSmsError = null;
      const result = await db.update(locations).set(patch).where(eq(locations.welcomeSmsSid, sid)).returning();
      return result[0];
    }
    patch.welcomeWhatsappStatus = status;
    if (status === 'delivered') patch.welcomeWhatsappDeliveredAt = now;
    if (errorMessage) patch.welcomeWhatsappError = errorMessage;
    else if (status === 'delivered' || status === 'sent') patch.welcomeWhatsappError = null;
    const result = await db.update(locations).set(patch).where(eq(locations.welcomeWhatsappSid, sid)).returning();
    return result[0];
  }

  // NOTE: Operator onboarding completion is handled via
  // completeOperatorOnboardingByToken() above, which preserves the claim
  // token (durable + reusable per spec). A by-id variant that burned the
  // token would conflict with that semantics, so it is intentionally not
  // provided.

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

  async markPhysicallyReturnedForRefund(id: number, restock: boolean): Promise<Transaction | null> {
    const transaction = await this.getTransaction(id);
    if (!transaction) return null;
    if (transaction.isReturned) return null;
    // CAS on isReturned=false; do NOT set refundAmount (refund total is owned by recordTransactionRefund).
    const result = await db.update(transactions)
      .set({
        isReturned: true,
        actualReturnDate: new Date(),
      })
      .where(and(eq(transactions.id, id), eq(transactions.isReturned, false)))
      .returning();
    if (result.length === 0) return null;
    if (restock && transaction.headbandColor && transaction.locationId) {
      await this.adjustInventory(transaction.locationId, transaction.headbandColor, 1);
    }
    return result[0];
  }

  async recordReturnReminderSent(id: number, opts?: { channel?: string; language?: string; sentByUserId?: number | null }): Promise<Transaction> {
    return await db.transaction(async (tx) => {
      const existing = await tx.select().from(transactions).where(eq(transactions.id, id));
      const transaction = existing[0];
      if (!transaction) {
        throw new Error(`Transaction with id ${id} not found`);
      }
      const now = new Date();
      const result = await tx.update(transactions)
        .set({
          lastReturnReminderAt: now,
          returnReminderCount: (transaction.returnReminderCount ?? 0) + 1,
        })
        .where(eq(transactions.id, id))
        .returning();
      await tx.insert(returnReminderEvents).values({
        transactionId: id,
        sentByUserId: opts?.sentByUserId ?? null,
        channel: opts?.channel ?? 'email',
        language: opts?.language ?? 'en',
      });
      return result[0];
    });
  }

  async getReturnReminderEvents(transactionId: number): Promise<ReturnReminderEventWithSender[]> {
    const rows = await db.select({
      id: returnReminderEvents.id,
      transactionId: returnReminderEvents.transactionId,
      sentAt: returnReminderEvents.sentAt,
      sentByUserId: returnReminderEvents.sentByUserId,
      channel: returnReminderEvents.channel,
      language: returnReminderEvents.language,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(returnReminderEvents)
      .leftJoin(users, eq(users.id, returnReminderEvents.sentByUserId))
      .where(eq(returnReminderEvents.transactionId, transactionId))
      .orderBy(desc(returnReminderEvents.sentAt));
    return rows.map(r => {
      const senderName = r.sentByUserId != null
        ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || null
        : null;
      return {
        id: r.id,
        transactionId: r.transactionId,
        sentAt: r.sentAt,
        sentByUserId: r.sentByUserId,
        channel: r.channel,
        language: r.language,
        senderName,
      };
    });
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
      isRead: false,
      isArchived: false,
      isSpam: false,
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

  async updateContact(id: number, data: Partial<Pick<Contact, 'subject' | 'message' | 'isRead' | 'isArchived' | 'isSpam'>>): Promise<Contact> {
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
    const updateData: Partial<Transaction> = { payLaterStatus: status, ...additionalData };

    const result = await db.update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    return result[0];
  }

  async transitionTransactionPayLaterStatus(
    id: number,
    fromStatus: PayLaterStatus,
    toStatus: PayLaterStatus,
    additionalData?: Partial<Transaction>
  ): Promise<Transaction | null> {
    const updateData: Partial<Transaction> = { payLaterStatus: toStatus, ...additionalData };
    const result = await db.update(transactions)
      .set(updateData)
      .where(and(eq(transactions.id, id), eq(transactions.payLaterStatus, fromStatus)))
      .returning();
    return result.length === 0 ? null : result[0];
  }

  async recordTransactionRefund(args: {
    id: number;
    expectedPriorStatus: PayLaterStatus;
    expectedPriorRefundAmount: number | null;
    newStatus: PayLaterStatus;
    newRefundAmount: number;
    stripeRefundId: string;
  }): Promise<Transaction | null> {
    // CAS on (status, refundAmount). Treat NULL prior refund as equivalent to 0
    // so a never-refunded row matches when the caller passes 0/null.
    const expectedAmt = args.expectedPriorRefundAmount ?? 0;
    const priorAmtCondition = expectedAmt === 0
      ? sql`(${transactions.refundAmount} IS NULL OR ${transactions.refundAmount} = 0)`
      : sql`${transactions.refundAmount} = ${expectedAmt}`;
    const result = await db.update(transactions)
      .set({
        payLaterStatus: args.newStatus,
        refundAmount: args.newRefundAmount,
        stripeRefundId: args.stripeRefundId,
      })
      .where(and(
        eq(transactions.id, args.id),
        eq(transactions.payLaterStatus, args.expectedPriorStatus),
        priorAmtCondition,
      ))
      .returning();
    return result.length === 0 ? null : result[0];
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

  // Task #39: Global Settings (key/value)
  async getGlobalSetting(key: string): Promise<GlobalSetting | undefined> {
    const result = await db.select().from(globalSettings).where(eq(globalSettings.key, key));
    return result[0];
  }

  async setGlobalSetting(key: string, value: string): Promise<GlobalSetting> {
    const existing = await this.getGlobalSetting(key);
    if (existing) {
      const updated = await db.update(globalSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(globalSettings.key, key))
        .returning();
      return updated[0];
    }
    const inserted = await db.insert(globalSettings)
      .values({ key, value, isEnabled: true, updatedAt: new Date() })
      .returning();
    return inserted[0];
  }

  // Task #39: Stripe Disputes
  async createDispute(dispute: InsertDispute): Promise<Dispute> {
    // Idempotent on stripe_dispute_id (UNIQUE in schema). On conflict, return existing row.
    const existing = await this.getDisputeByStripeId(dispute.stripeDisputeId);
    if (existing) return existing;
    const result = await db.insert(disputes).values(dispute).returning();
    return result[0];
  }

  async getDisputeByStripeId(stripeDisputeId: string): Promise<Dispute | undefined> {
    const result = await db.select().from(disputes).where(eq(disputes.stripeDisputeId, stripeDisputeId));
    return result[0];
  }

  async getDisputesByLocationSince(locationId: number, since: Date): Promise<Dispute[]> {
    return db.select().from(disputes).where(
      and(eq(disputes.locationId, locationId), sql`${disputes.createdAt} >= ${since}`)
    ).orderBy(desc(disputes.createdAt));
  }

  async getAllDisputes(): Promise<Dispute[]> {
    return db.select().from(disputes).orderBy(desc(disputes.createdAt));
  }

  async getRecentDisputeStats(sinceDays: number): Promise<{ locationId: number; disputeCount: number; chargedCount: number; rate: number; }[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    // Numerator: all disputes received in window (covers both direct-deposit
    // and pay-later Stripe charges — dispute.location_id is the source).
    const disputeRows = await db.execute(sql`
      SELECT location_id, COUNT(*)::int AS count
      FROM disputes
      WHERE created_at >= ${since}
        AND location_id IS NOT NULL
      GROUP BY location_id
    `);
    // Denominator: all Stripe card charges in window regardless of flow.
    //   - Pay Later: pay_later_status='CHARGED' with charged_at in window.
    //   - Direct Deposit: deposit_payment_method='card' with stripe_payment_intent_id
    //     set and created_at in window (no charged_at column for that flow).
    // Using UNION ALL keeps the populations consistent with the dispute numerator.
    const chargedRows = await db.execute(sql`
      SELECT location_id, COUNT(*)::int AS count
      FROM (
        SELECT location_id FROM transactions
          WHERE pay_later_status = 'CHARGED'
            AND charged_at IS NOT NULL
            AND charged_at >= ${since}
        UNION ALL
        SELECT location_id FROM transactions
          WHERE deposit_payment_method IN ('card', 'stripe')
            AND stripe_payment_intent_id IS NOT NULL
            AND pay_later_status IS NULL
            AND created_at >= ${since}
      ) combined
      GROUP BY location_id
    `);
    const disputeMap = new Map<number, number>();
    for (const r of (disputeRows as any).rows ?? []) disputeMap.set(Number(r.location_id), Number(r.count));
    const chargedMap = new Map<number, number>();
    for (const r of (chargedRows as any).rows ?? []) chargedMap.set(Number(r.location_id), Number(r.count));
    const allLocationIds = new Set<number>([...Array.from(disputeMap.keys()), ...Array.from(chargedMap.keys())]);
    return Array.from(allLocationIds).map(locationId => {
      const disputeCount = disputeMap.get(locationId) || 0;
      const chargedCount = chargedMap.get(locationId) || 0;
      const rate = chargedCount > 0 ? disputeCount / chargedCount : 0;
      return { locationId, disputeCount, chargedCount, rate };
    });
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

  // Knowledge Docs
  async getAllKnowledgeDocs(): Promise<KnowledgeDoc[]> {
    return db.select().from(knowledgeDocs).orderBy(knowledgeDocs.category, knowledgeDocs.id);
  }
  async getActiveKnowledgeDocs(): Promise<KnowledgeDoc[]> {
    return db.select().from(knowledgeDocs).where(eq(knowledgeDocs.isActive, true));
  }
  async getKnowledgeDoc(id: number): Promise<KnowledgeDoc | undefined> {
    const r = await db.select().from(knowledgeDocs).where(eq(knowledgeDocs.id, id));
    return r[0];
  }
  async createKnowledgeDoc(doc: InsertKnowledgeDoc): Promise<KnowledgeDoc> {
    const r = await db.insert(knowledgeDocs).values({ ...doc, updatedAt: new Date() }).returning();
    return r[0];
  }
  async updateKnowledgeDoc(id: number, data: Partial<InsertKnowledgeDoc>): Promise<KnowledgeDoc> {
    const r = await db.update(knowledgeDocs).set({ ...data, updatedAt: new Date() }).where(eq(knowledgeDocs.id, id)).returning();
    if (!r[0]) throw new Error(`Knowledge doc ${id} not found`);
    return r[0];
  }
  async deleteKnowledgeDoc(id: number): Promise<void> {
    await db.delete(knowledgeDocs).where(eq(knowledgeDocs.id, id));
  }

  // Reply examples
  async createReplyExample(rec: InsertReplyExample): Promise<ReplyExample> {
    const r = await db.insert(replyExamples).values({ ...rec, createdAt: new Date() }).returning();
    return r[0];
  }
  async getRecentReplyExamples(limit: number = 50): Promise<ReplyExample[]> {
    return db.select().from(replyExamples).orderBy(desc(replyExamples.createdAt)).limit(limit);
  }
  async getReplyExamplesBySender(email: string, limit: number = 10): Promise<ReplyExample[]> {
    if (!email) return [];
    return db.select().from(replyExamples)
      .where(sql`lower(${replyExamples.senderEmail}) = ${email.toLowerCase()}`)
      .orderBy(desc(replyExamples.createdAt))
      .limit(limit);
  }
  async getReplyExample(id: number): Promise<ReplyExample | undefined> {
    const r = await db.select().from(replyExamples).where(eq(replyExamples.id, id));
    return r[0];
  }
  async getReplyExamplesByRef(sourceType: string, sourceRef: string): Promise<ReplyExample[]> {
    if (!sourceType || !sourceRef) return [];
    return db.select().from(replyExamples)
      .where(and(eq(replyExamples.sourceType, sourceType), eq(replyExamples.sourceRef, sourceRef)))
      .orderBy(replyExamples.createdAt);
  }
  async getReplyExampleRefs(): Promise<{ sourceType: string; sourceRef: string; lastRepliedAt: string }[]> {
    // Aggregate the most recent reply timestamp per (sourceType, sourceRef) so
    // the inbox list can mark answered messages without an N+1 lookup. Filter
    // out rows with a null sourceRef (legacy/manual entries) via the WHERE so
    // the result row type can stay non-nullable for sourceRef.
    const rows = await db
      .select({
        sourceType: replyExamples.sourceType,
        sourceRef: replyExamples.sourceRef,
        lastRepliedAt: sql<Date>`MAX(${replyExamples.createdAt})`.as("lastRepliedAt"),
      })
      .from(replyExamples)
      .where(sql`${replyExamples.sourceRef} IS NOT NULL`)
      .groupBy(replyExamples.sourceType, replyExamples.sourceRef);
    return rows.map((r) => ({
      sourceType: r.sourceType,
      sourceRef: r.sourceRef ?? "",
      lastRepliedAt: r.lastRepliedAt instanceof Date
        ? r.lastRepliedAt.toISOString()
        : new Date(r.lastRepliedAt).toISOString(),
    }));
  }

  async deleteReplyExample(id: number): Promise<void> {
    await db.delete(replyExamples).where(eq(replyExamples.id, id));
  }

  // KB embeddings
  async upsertKbEmbedding(rec: InsertKbEmbedding): Promise<KbEmbedding> {
    const chunkIdx = rec.chunkIdx ?? 0;
    const existing = await db.select().from(kbEmbeddings).where(
      and(
        eq(kbEmbeddings.sourceKind, rec.sourceKind),
        eq(kbEmbeddings.sourceId, rec.sourceId),
        eq(kbEmbeddings.chunkIdx, chunkIdx),
      )
    );
    if (existing[0]) {
      const r = await db.update(kbEmbeddings).set({
        content: rec.content,
        embedding: rec.embedding,
        language: rec.language || existing[0].language,
        updatedAt: new Date(),
      }).where(eq(kbEmbeddings.id, existing[0].id)).returning();
      return r[0];
    }
    const r = await db.insert(kbEmbeddings).values({ ...rec, chunkIdx, updatedAt: new Date() }).returning();
    return r[0];
  }
  async deleteKbEmbedding(kind: KbSourceKind, id: number): Promise<void> {
    // Delete all chunks for this source
    await db.delete(kbEmbeddings).where(
      and(eq(kbEmbeddings.sourceKind, kind), eq(kbEmbeddings.sourceId, id))
    );
  }
  async getAllKbEmbeddings(): Promise<KbEmbedding[]> {
    return db.select().from(kbEmbeddings);
  }
  async getKbEmbeddingsByKind(kind: KbSourceKind): Promise<KbEmbedding[]> {
    return db.select().from(kbEmbeddings).where(eq(kbEmbeddings.sourceKind, kind));
  }

  // Sender history helpers
  async getContactsByEmail(email: string): Promise<Contact[]> {
    if (!email) return [];
    return db.select().from(contacts).where(sql`lower(${contacts.email}) = ${email.toLowerCase()}`);
  }
  async getTransactionsByEmail(email: string): Promise<Transaction[]> {
    if (!email) return [];
    return db.select().from(transactions).where(sql`lower(${transactions.borrowerEmail}) = ${email.toLowerCase()}`);
  }
}

let schemaUpgradesRun = false;
export async function ensureSchemaUpgrades(): Promise<void> {
  if (schemaUpgradesRun) return;
  schemaUpgradesRun = true;
  try {
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS last_return_reminder_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_reminder_count INTEGER NOT NULL DEFAULT 0`);
    // Task #38: store the latest Stripe refund id for traceability + audit lookups.
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT`);
    // Inbox: archived/spam flags for web-form contacts (Task #22)
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_spam BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS return_reminder_events (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER NOT NULL,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        sent_by_user_id INTEGER,
        channel TEXT NOT NULL DEFAULT 'email',
        language TEXT NOT NULL DEFAULT 'en'
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS return_reminder_events_tx_idx ON return_reminder_events (transaction_id, sent_at DESC)`);
    // Task #9 tables (drizzle-kit on this project does not run pg push, so we
    // create them idempotently here so existing DBs pick them up automatically).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_docs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        language TEXT NOT NULL DEFAULT 'en',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reply_examples (
        id SERIAL PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        sender_email TEXT,
        sender_name TEXT,
        incoming_subject TEXT NOT NULL,
        incoming_body TEXT NOT NULL,
        sent_reply TEXT NOT NULL,
        classification TEXT,
        language TEXT NOT NULL DEFAULT 'en',
        matched_location_id INTEGER,
        was_edited BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kb_embeddings (
        id SERIAL PRIMARY KEY,
        source_kind TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        chunk_idx INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        embedding JSONB NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS kb_embeddings_source_idx ON kb_embeddings (source_kind, source_id, chunk_idx)`);
    // Task #35: operator onboarding (SMS+WhatsApp claim flow) on locations
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS claim_token TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS claim_token_created_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_status TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_error TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_sent_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_sid TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_delivered_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_status TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_error TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_sent_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_sid TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_delivered_at TIMESTAMP`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS locations_welcome_sms_sid_idx ON locations (welcome_sms_sid)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS locations_welcome_whatsapp_sid_idx ON locations (welcome_whatsapp_sid)`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_welcome_channel TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS contact_preference TEXT`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS contact_preference_set_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS locations_claim_token_uq ON locations (claim_token) WHERE claim_token IS NOT NULL`);
    // Task #39: card-on-file hardening (consent, notification audit, fee math, disputes)
    await db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS processing_fee_fixed INTEGER DEFAULT 30`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consent_text TEXT`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consent_max_charge_cents INTEGER`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_saved_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS charge_notification_sent_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS charge_notification_channel TEXT`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deposit_fee_cents INTEGER`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS charged_at TIMESTAMP`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_charged_at_idx ON transactions (charged_at) WHERE charged_at IS NOT NULL`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS disputes (
        id SERIAL PRIMARY KEY,
        location_id INTEGER,
        transaction_id INTEGER,
        stripe_dispute_id TEXT NOT NULL UNIQUE,
        stripe_charge_id TEXT NOT NULL,
        stripe_payment_intent_id TEXT,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence_due_by TIMESTAMP,
        raw_payload_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Drop NOT NULL on location_id for existing DBs created before it became nullable.
    await db.execute(sql`ALTER TABLE disputes ALTER COLUMN location_id DROP NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS disputes_location_created_idx ON disputes (location_id, created_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS disputes_charge_idx ON disputes (stripe_charge_id)`);
    // Task #39: global_settings holds runtime-configurable knobs like
    // max_card_age_days for the stale-card guardrail. Created idempotently
    // here so existing DBs (no drizzle push) pick it up automatically.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS global_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Older deployments may have created the table without is_enabled.
    // Add it idempotently so getGlobalSetting/setGlobalSetting (which
    // reference the column via Drizzle) don't throw on existing DBs.
    await db.execute(sql`ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true`);
  } catch (err: any) {
    schemaUpgradesRun = false;
    console.error('[ensureSchemaUpgrades] Failed to apply transactions reminder columns:', err?.message || err);
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  }
}
