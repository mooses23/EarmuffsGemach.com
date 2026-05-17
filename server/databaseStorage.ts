import { eq, and, sql, ilike, isNull, or, inArray, desc, lt, type SQL } from 'drizzle-orm';
import { db } from './db.js';
import {
  users, type User, type InsertUser,
  regions, type Region, type InsertRegion,
  cityCategories, type CityCategory, type InsertCityCategory,
  locations, type Location, type InsertLocation,
  gemachApplications, type GemachApplication, type InsertGemachApplication,
  applicationStatusChanges, type ApplicationStatusChange, type InsertApplicationStatusChange,
  inviteCodes, type InviteCode, type InsertInviteCode,
  transactions, type Transaction, type InsertTransaction,
  contacts, type Contact, type InsertContact,
  payments, type Payment, type InsertPayment,
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
  messageSendLogs, type MessageSendLog, type InsertMessageSendLog,
  smsConversations, smsMessages,
  type SmsConversation, type SmsMessage, type SmsChannel,
  restockCodeRequests, type RestockCodeRequest,
  restockShipments, type RestockShipment,
  translationCache, type TranslationCacheEntry,
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

  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
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
      stateCode: cityCategory.stateCode ?? null,
      districtCode: cityCategory.districtCode ?? null,
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
      processingFeeFixed: insertLocation.processingFeeFixed ?? null,
      contactPreference: insertLocation.contactPreference ?? null,
      cityCategoryId: insertLocation.cityCategoryId ?? null,
      operatorPin: insertLocation.operatorPin ?? null
    }).returning();
    const created = result[0];
    // Task #263: silently geocode the postal address in the background.
    if (created?.address) {
      void (async () => {
        try {
          const { geocodeAndStore } = await import("./geocoder.js");
          geocodeAndStore(created.id, created.address);
        } catch (err) {
          console.warn(`[createLocation] geocode dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    }
    return created;
  }

  async updateLocation(id: number, data: Partial<InsertLocation> & { latitude?: number | null; longitude?: number | null; geocodedAt?: Date | null }): Promise<Location> {
    // Detect address change BEFORE the write so we can re-geocode after.
    // Task #263: when address is cleared (empty/null), also null out any
    // stale coordinates so the location stops appearing in nearest-sort.
    let addressChanged = false;
    let newAddress: string | null = null;
    const writeData: typeof data = { ...data };
    if (typeof data.address === "string") {
      const trimmed = data.address.trim();
      const existing = await db.select({ address: locations.address }).from(locations).where(eq(locations.id, id)).limit(1);
      const prevAddress = (existing[0]?.address ?? "").trim();
      if (trimmed.length === 0) {
        if (prevAddress.length > 0) {
          writeData.latitude = null;
          writeData.longitude = null;
          writeData.geocodedAt = null;
        }
      } else if (trimmed !== prevAddress) {
        addressChanged = true;
        newAddress = trimmed;
      }
    }
    const result = await db.update(locations)
      .set(writeData)
      .where(eq(locations.id, id))
      .returning();
    if (result.length === 0) {
      throw new Error(`Location with id ${id} not found`);
    }
    if (addressChanged && newAddress) {
      void (async () => {
        try {
          const { geocodeAndStore } = await import("./geocoder.js");
          geocodeAndStore(id, newAddress!);
        } catch (err) {
          console.warn(`[updateLocation] geocode dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
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

  async createApplication(insertApplication: InsertGemachApplication & { submittedLang?: string | null; suggestedRegionId?: number | null; suggestedCityCategoryId?: number | null }): Promise<GemachApplication> {
    const result = await db.insert(gemachApplications).values({
      ...insertApplication,
      status: "pending",
      submittedAt: new Date(),
      message: insertApplication.message ?? null,
      community: insertApplication.community ?? null,
      submittedLang: insertApplication.submittedLang ?? null,
      suggestedRegionId: insertApplication.suggestedRegionId ?? null,
      suggestedCityCategoryId: insertApplication.suggestedCityCategoryId ?? null,
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

  async recordApplicationStatusChange(change: InsertApplicationStatusChange): Promise<ApplicationStatusChange> {
    const result = await db.insert(applicationStatusChanges).values({
      applicationId: change.applicationId,
      previousStatus: change.previousStatus,
      newStatus: change.newStatus,
      source: change.source,
      changedByUserId: change.changedByUserId ?? null,
      changedByUsername: change.changedByUsername ?? null,
    }).returning();
    return result[0];
  }

  async getApplicationStatusChanges(applicationId: number): Promise<ApplicationStatusChange[]> {
    return db.select()
      .from(applicationStatusChanges)
      .where(eq(applicationStatusChanges.applicationId, applicationId))
      .orderBy(desc(applicationStatusChanges.changedAt));
  }

  async updateApplicationStatusAtomic(input: {
    applicationId: number;
    newStatus: string;
    source: string;
    changedByUserId?: number | null;
    changedByUsername?: string | null;
  }): Promise<{ application: GemachApplication; change: ApplicationStatusChange }> {
    return await db.transaction(async (tx) => {
      const existing = await tx.select().from(gemachApplications).where(eq(gemachApplications.id, input.applicationId));
      const previous = existing[0];
      if (!previous) {
        throw new Error(`Application with id ${input.applicationId} not found`);
      }
      const updated = await tx.update(gemachApplications)
        .set({ status: input.newStatus })
        .where(eq(gemachApplications.id, input.applicationId))
        .returning();
      const change = await tx.insert(applicationStatusChanges).values({
        applicationId: input.applicationId,
        previousStatus: previous.status,
        newStatus: input.newStatus,
        source: input.source,
        changedByUserId: input.changedByUserId ?? null,
        changedByUsername: input.changedByUsername ?? null,
      }).returning();
      return { application: updated[0], change: change[0] };
    });
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

  async createTransactionWithInventory(
    insertTransaction: InsertTransaction,
    inventoryColor: string,
  ): Promise<Transaction> {
    return await db.transaction(async (tx) => {
      // Lock the inventory row for this (location, color) so concurrent lends
      // serialize and cannot both decrement the last item.
      const lockedRows = await tx
        .select({ id: inventory.id, quantity: inventory.quantity })
        .from(inventory)
        .where(
          and(
            eq(inventory.locationId, insertTransaction.locationId),
            eq(inventory.color, inventoryColor),
          ),
        )
        .for("update");
      const row = lockedRows[0];
      if (!row || row.quantity <= 0) {
        throw new Error(
          `Insufficient stock for color ${inventoryColor}. Available: ${row?.quantity ?? 0}, Requested: 1`,
        );
      }
      await tx.update(inventory)
        .set({ quantity: row.quantity - 1 })
        .where(eq(inventory.id, row.id));

      const created = await tx.insert(transactions).values({
        ...insertTransaction,
        isReturned: false,
        borrowDate: new Date(),
        actualReturnDate: null,
        expectedReturnDate: insertTransaction.expectedReturnDate
          ? new Date(insertTransaction.expectedReturnDate)
          : null,
        depositAmount: insertTransaction.depositAmount ?? 20,
        borrowerEmail: insertTransaction.borrowerEmail ?? null,
        borrowerPhone: insertTransaction.borrowerPhone ?? null,
        headbandColor: insertTransaction.headbandColor ?? null,
        depositPaymentMethod: insertTransaction.depositPaymentMethod ?? "cash",
        refundAmount: null,
        notes: insertTransaction.notes ?? null,
      }).returning();
      return created[0];
    });
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

    // Only write refundAmount when the caller explicitly supplies one.
    // For pay-later (CHARGED/PARTIALLY_REFUNDED) transactions the refund amount
    // is owned by recordTransactionRefund (the Stripe-first path); auto-filling
    // depositAmount here would make the frontend believe the refund already
    // happened and disable the refund button.
    const updateData: Record<string, unknown> = {
      isReturned: true,
      actualReturnDate: new Date(),
    };
    if (refundAmount !== undefined) {
      updateData.refundAmount = refundAmount;
    }

    const result = await db.update(transactions)
      .set(updateData)
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

  async recordReturnReminderSent(id: number, opts?: { channel?: string; language?: string; sentByUserId?: number | null; twilioSid?: string | null; deliveryStatus?: string | null; deliveryErrorCode?: string | null }): Promise<Transaction> {
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
      const initialStatus = opts?.deliveryStatus ?? null;
      await tx.insert(returnReminderEvents).values({
        transactionId: id,
        sentByUserId: opts?.sentByUserId ?? null,
        channel: opts?.channel ?? 'email',
        language: opts?.language ?? 'en',
        twilioSid: opts?.twilioSid ?? null,
        deliveryStatus: initialStatus,
        deliveryStatusUpdatedAt: initialStatus ? now : null,
        deliveryErrorCode: opts?.deliveryErrorCode ?? null,
      });
      return result[0];
    });
  }

  async logReminderDeliveryEvent(transactionId: number, opts: { channel: string; language: string; sentByUserId?: number | null; twilioSid?: string | null; deliveryStatus: string; deliveryErrorCode?: string | null }): Promise<void> {
    const now = new Date();
    await db.insert(returnReminderEvents).values({
      transactionId,
      sentByUserId: opts.sentByUserId ?? null,
      channel: opts.channel,
      language: opts.language,
      twilioSid: opts.twilioSid ?? null,
      deliveryStatus: opts.deliveryStatus,
      deliveryStatusUpdatedAt: now,
      deliveryErrorCode: opts.deliveryErrorCode ?? null,
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
      twilioSid: returnReminderEvents.twilioSid,
      deliveryStatus: returnReminderEvents.deliveryStatus,
      deliveryStatusUpdatedAt: returnReminderEvents.deliveryStatusUpdatedAt,
      deliveryErrorCode: returnReminderEvents.deliveryErrorCode,
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
        twilioSid: r.twilioSid,
        deliveryStatus: r.deliveryStatus,
        deliveryStatusUpdatedAt: r.deliveryStatusUpdatedAt,
        deliveryErrorCode: r.deliveryErrorCode,
        senderName,
      };
    });
  }

  async getReturnReminderEventBySid(sid: string): Promise<ReturnReminderEvent | undefined> {
    const rows = await db.select().from(returnReminderEvents)
      .where(eq(returnReminderEvents.twilioSid, sid))
      .limit(1);
    return rows[0];
  }

  async updateReturnReminderDeliveryStatus(sid: string, status: string, errorCode?: string | null): Promise<void> {
    // Treat Twilio error code 21610 (opted-out / STOP) as a synthetic status.
    const resolvedStatus = errorCode === '21610' ? 'opted_out' : status;
    await db.update(returnReminderEvents)
      .set({
        deliveryStatus: resolvedStatus,
        deliveryStatusUpdatedAt: new Date(),
        deliveryErrorCode: errorCode ?? null,
      })
      .where(eq(returnReminderEvents.twilioSid, sid));
  }

  async markPhoneOptedOut(borrowerPhone: string): Promise<void> {
    // Phone values in the DB may be formatted differently from the inbound Twilio
    // From (which is E.164). Use the same digit-strip + subset-match approach as
    // getTransactionByPhone so "(555) 123-4567" matches "+15551234567".
    const normalizedInput = borrowerPhone.replace(/\D/g, '');
    if (!normalizedInput) return;

    // Fetch candidate transactions with a phone number set.
    const allTx = await db.select({ id: transactions.id, borrowerPhone: transactions.borrowerPhone })
      .from(transactions)
      .where(sql`borrower_phone IS NOT NULL`);

    const txIds = allTx
      .filter(r => {
        if (!r.borrowerPhone) return false;
        const storedDigits = r.borrowerPhone.replace(/\D/g, '');
        return storedDigits && (
          storedDigits.includes(normalizedInput) || normalizedInput.includes(storedDigits)
        );
      })
      .map(r => r.id);

    if (txIds.length === 0) return;
    await db.update(returnReminderEvents)
      .set({
        deliveryStatus: 'opted_out',
        deliveryStatusUpdatedAt: new Date(),
        deliveryErrorCode: '21610',
      })
      .where(
        and(
          inArray(returnReminderEvents.transactionId, txIds),
          eq(returnReminderEvents.channel, 'sms'),
        ),
      );
  }

  async isPhoneOptedOutForSms(borrowerPhone: string, locationId: number): Promise<boolean> {
    const normalizedInput = borrowerPhone.replace(/\D/g, '');
    if (!normalizedInput) return false;

    // Scope to the operator's location so no cross-location data leaks.
    const locationTx = await db.select({ id: transactions.id, borrowerPhone: transactions.borrowerPhone })
      .from(transactions)
      .where(and(eq(transactions.locationId, locationId), sql`borrower_phone IS NOT NULL`));

    const txIds = locationTx
      .filter(r => {
        if (!r.borrowerPhone) return false;
        const storedDigits = r.borrowerPhone.replace(/\D/g, '');
        return storedDigits && (
          storedDigits.includes(normalizedInput) || normalizedInput.includes(storedDigits)
        );
      })
      .map(r => r.id);

    if (txIds.length === 0) return false;

    const rows = await db.select({ id: returnReminderEvents.id })
      .from(returnReminderEvents)
      .where(
        and(
          inArray(returnReminderEvents.transactionId, txIds),
          eq(returnReminderEvents.channel, 'sms'),
          eq(returnReminderEvents.deliveryStatus, 'opted_out'),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  // Contact operations
  async getAllContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(desc(contacts.submittedAt));
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
        refundAttemptedAt: null,
      })
      .where(and(
        eq(transactions.id, args.id),
        eq(transactions.payLaterStatus, args.expectedPriorStatus),
        priorAmtCondition,
      ))
      .returning();
    return result.length === 0 ? null : result[0];
  }

  async getStaleRefundPendingTransactions(olderThanMinutes: number): Promise<Transaction[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return db.select().from(transactions).where(
      and(
        eq(transactions.payLaterStatus, "REFUND_PENDING"),
        sql`${transactions.refundAttemptedAt} IS NOT NULL AND ${transactions.refundAttemptedAt} < ${cutoff}`,
      )
    );
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

  async getAuditLogsByAction(action: string, limit = 25): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .where(eq(auditLogs.action, action))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
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

  async deleteGlobalSetting(key: string): Promise<void> {
    await db.delete(globalSettings).where(eq(globalSettings.key, key));
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
            AND borrow_date >= ${since}
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

  // Message Send Logs — persistent history of every operator message send attempt
  async createMessageSendLog(log: InsertMessageSendLog): Promise<MessageSendLog> {
    const result = await db.insert(messageSendLogs).values(log).returning();
    return result[0];
  }

  async getMessageSendLogs(opts?: { locationId?: number; limit?: number }): Promise<MessageSendLog[]> {
    const limit = opts?.limit ?? 500;
    if (opts?.locationId != null) {
      return db.select().from(messageSendLogs)
        .where(eq(messageSendLogs.locationId, opts.locationId))
        .orderBy(desc(messageSendLogs.sentAt))
        .limit(limit);
    }
    return db.select().from(messageSendLogs)
      .orderBy(desc(messageSendLogs.sentAt))
      .limit(limit);
  }

  async updateMessageSendLogByTwilioSid(sid: string, deliveryStatus: string, deliveryError?: string): Promise<boolean> {
    const result = await db.update(messageSendLogs)
      .set({ deliveryStatus, deliveryError: deliveryError ?? null })
      .where(eq(messageSendLogs.twilioSid, sid))
      .returning({ id: messageSendLogs.id });
    return result.length > 0;
  }

  // Task #307: SMS / WhatsApp conversation storage
  async recordSmsMessage(input: {
    phone: string;
    channel: SmsChannel;
    direction: 'inbound' | 'outbound';
    body: string;
    twilioSid?: string | null;
    locationId?: number | null;
    sentByUserId?: number | null;
    deliveryStatus?: string | null;
    errorMessage?: string | null;
    isOptedOut?: boolean;
  }): Promise<{ conversation: SmsConversation; message: SmsMessage }> {
    return db.transaction(async (tx) => {
      const preview = input.body.slice(0, 200);
      const isInbound = input.direction === 'inbound';
      // Upsert conversation on (phone, channel).
      // unread_count bumps only on inbound; isArchived auto-resets on inbound.
      const upserted = await tx.execute(sql`
        INSERT INTO sms_conversations (
          phone, channel, location_id, last_message_at,
          last_message_preview, last_direction,
          unread_count, is_archived, is_opted_out
        ) VALUES (
          ${input.phone}, ${input.channel}, ${input.locationId ?? null}, NOW(),
          ${preview}, ${input.direction},
          ${isInbound ? 1 : 0}, FALSE, ${!!input.isOptedOut}
        )
        ON CONFLICT (phone, channel) DO UPDATE SET
          last_message_at = NOW(),
          last_message_preview = EXCLUDED.last_message_preview,
          last_direction = EXCLUDED.last_direction,
          unread_count = sms_conversations.unread_count + ${isInbound ? 1 : 0},
          is_archived = CASE WHEN ${isInbound} THEN FALSE ELSE sms_conversations.is_archived END,
          is_opted_out = sms_conversations.is_opted_out OR ${!!input.isOptedOut},
          location_id = COALESCE(sms_conversations.location_id, EXCLUDED.location_id)
        RETURNING *
      `);
      const row = (upserted as any).rows?.[0] as Record<string, any>;
      const conversation: SmsConversation = {
        id: row.id,
        phone: row.phone,
        channel: row.channel,
        locationId: row.location_id,
        displayName: row.display_name,
        lastMessageAt: row.last_message_at,
        lastMessagePreview: row.last_message_preview,
        lastDirection: row.last_direction,
        unreadCount: row.unread_count,
        isArchived: row.is_archived,
        isOptedOut: row.is_opted_out,
        createdAt: row.created_at,
      };
      const [message] = await tx.insert(smsMessages).values({
        conversationId: conversation.id,
        direction: input.direction,
        body: input.body,
        twilioSid: input.twilioSid ?? null,
        deliveryStatus: input.deliveryStatus ?? null,
        errorMessage: input.errorMessage ?? null,
        sentByUserId: input.sentByUserId ?? null,
      }).returning();
      return { conversation, message };
    });
  }

  async listSmsConversations(opts?: {
    channel?: SmsChannel;
    folder?: 'inbox' | 'archived';
    unreadOnly?: boolean;
    unlinkedOnly?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: SmsConversation[]; total: number }> {
    const limit = Math.max(1, Math.min(opts?.limit ?? 50, 200));
    const offset = Math.max(0, opts?.offset ?? 0);
    const conditions = [] as any[];
    if (opts?.channel) conditions.push(eq(smsConversations.channel, opts.channel));
    if (opts?.folder === 'archived') conditions.push(eq(smsConversations.isArchived, true));
    else if (opts?.folder === 'inbox') conditions.push(eq(smsConversations.isArchived, false));
    if (opts?.unreadOnly) conditions.push(sql`${smsConversations.unreadCount} > 0`);
    // Task #309: "Unknown" filter — no resolved name AND no assigned location.
    if (opts?.unlinkedOnly) {
      conditions.push(sql`${smsConversations.displayName} IS NULL AND ${smsConversations.locationId} IS NULL`);
    }
    // Task #309: search across phone, displayName, and the joined location
    // name. We resolve location-name matches up front (single SELECT) and
    // OR-in `locationId IN (...)` so the main query stays a flat scan and
    // doesn't need a JOIN that would complicate the count query.
    if (opts?.q && opts.q.trim()) {
      const term = opts.q.trim();
      const pattern = `%${term}%`;
      const locMatches = await db.select({ id: locations.id })
        .from(locations)
        .where(ilike(locations.name, pattern));
      const locIds = locMatches.map((r) => r.id);
      const orClauses: SQL[] = [
        ilike(smsConversations.phone, pattern),
        ilike(smsConversations.displayName, pattern),
      ];
      // Phone numbers are stored normalized as E.164 ("+15551234567"), but
      // admins routinely paste numbers with dashes, parens, spaces, or a
      // country-code prefix. Strip the search term to digits and do a
      // substring match against the digits-only form of the stored phone so
      // "(555) 123-4567", "555-1234", or "+1 555 123 4567" all find the
      // same conversation. We only add this clause when the term has at
      // least 3 digits to avoid noisy single-digit matches.
      const termDigits = term.replace(/\D/g, "");
      if (termDigits.length >= 3) {
        orClauses.push(sql`regexp_replace(${smsConversations.phone}, '\\D', '', 'g') ILIKE ${'%' + termDigits + '%'}`);
      }
      if (locIds.length) {
        orClauses.push(inArray(smsConversations.locationId, locIds));
      }
      conditions.push(or(...orClauses)!);
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const q = db.select().from(smsConversations);
    const rows = whereClause
      ? await q.where(whereClause).orderBy(desc(smsConversations.lastMessageAt)).limit(limit).offset(offset)
      : await q.orderBy(desc(smsConversations.lastMessageAt)).limit(limit).offset(offset);
    const totalQ = db.select({ count: sql<number>`count(*)::int` }).from(smsConversations);
    const totalResult = whereClause ? await totalQ.where(whereClause) : await totalQ;
    return { rows, total: totalResult[0]?.count ?? 0 };
  }

  async getSmsConversation(id: number): Promise<SmsConversation | undefined> {
    const rows = await db.select().from(smsConversations).where(eq(smsConversations.id, id)).limit(1);
    return rows[0];
  }

  async getSmsConversationByPhoneChannel(phone: string, channel: SmsChannel): Promise<SmsConversation | undefined> {
    const rows = await db.select().from(smsConversations)
      .where(and(eq(smsConversations.phone, phone), eq(smsConversations.channel, channel)))
      .limit(1);
    return rows[0];
  }

  async getSmsMessages(conversationId: number, opts?: { limit?: number; beforeId?: number }): Promise<SmsMessage[]> {
    const limit = Math.max(1, Math.min(opts?.limit ?? 500, 1000));
    // Fetch the latest N (DESC + limit) then reverse so callers receive
    // messages in chronological ascending order. Callers can paginate
    // backwards by passing `beforeId` (the smallest id from the previous
    // page) to fetch the next-older window — this lifts the hard cap and
    // gives the admin UI true full-history access on long threads.
    const whereExpr = opts?.beforeId !== undefined
      ? and(eq(smsMessages.conversationId, conversationId), lt(smsMessages.id, opts.beforeId))
      : eq(smsMessages.conversationId, conversationId);
    const rows = await db.select().from(smsMessages)
      .where(whereExpr)
      .orderBy(desc(smsMessages.sentAt))
      .limit(limit);
    return rows.reverse();
  }

  async updateSmsConversation(
    id: number,
    data: Partial<Pick<SmsConversation, 'isArchived' | 'isOptedOut' | 'displayName' | 'locationId'>> & { markRead?: boolean },
  ): Promise<SmsConversation> {
    const patch: Record<string, unknown> = {};
    if (data.isArchived !== undefined) patch.isArchived = data.isArchived;
    if (data.isOptedOut !== undefined) patch.isOptedOut = data.isOptedOut;
    if (data.displayName !== undefined) patch.displayName = data.displayName;
    if (data.locationId !== undefined) patch.locationId = data.locationId;
    if (data.markRead) patch.unreadCount = 0;
    if (Object.keys(patch).length === 0) {
      const existing = await this.getSmsConversation(id);
      if (!existing) throw new Error(`SMS conversation ${id} not found`);
      return existing;
    }
    const result = await db.update(smsConversations).set(patch).where(eq(smsConversations.id, id)).returning();
    if (!result[0]) throw new Error(`SMS conversation ${id} not found`);
    return result[0];
  }

  async updateSmsMessageDeliveryByTwilioSid(sid: string, deliveryStatus: string, errorMessage?: string | null): Promise<boolean> {
    const patch: Record<string, unknown> = { deliveryStatus };
    if (errorMessage !== undefined) patch.errorMessage = errorMessage;
    const result = await db.update(smsMessages)
      .set(patch)
      .where(eq(smsMessages.twilioSid, sid))
      .returning({ id: smsMessages.id });
    return result.length > 0;
  }

  async getSmsUnreadCounts(): Promise<{ sms: number; whatsapp: number }> {
    const rows = await db.select({
      channel: smsConversations.channel,
      total: sql<number>`COALESCE(SUM(${smsConversations.unreadCount}), 0)::int`,
    })
      .from(smsConversations)
      .where(eq(smsConversations.isArchived, false))
      .groupBy(smsConversations.channel);
    let sms = 0, whatsapp = 0;
    for (const r of rows) {
      if (r.channel === 'sms') sms = r.total;
      else if (r.channel === 'whatsapp') whatsapp = r.total;
    }
    return { sms, whatsapp };
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

  // Task #249: Restock verification code requests
  async createRestockCodeRequest(locationId: number, requestedAt: Date, expiresAt: Date): Promise<RestockCodeRequest> {
    const result = await db.insert(restockCodeRequests).values({
      locationId,
      requestedAt,
      expiresAt,
    }).returning();
    return result[0];
  }

  async getRestockCodeRequest(id: number): Promise<RestockCodeRequest | undefined> {
    const result = await db.select().from(restockCodeRequests).where(eq(restockCodeRequests.id, id));
    return result[0];
  }

  async getEarliestUnclaimedRestockRequest(): Promise<RestockCodeRequest | undefined> {
    // Global query — no locationId filter — so coordinators from different locations
    // don't race to claim emails from the same shared inbox.
    const result = await db.select().from(restockCodeRequests)
      .where(
        and(
          isNull(restockCodeRequests.claimedEmailId),
          sql`${restockCodeRequests.expiresAt} > NOW()`
        )
      )
      .orderBy(restockCodeRequests.requestedAt)
      .limit(1);
    return result[0];
  }

  async claimRestockCodeRequest(id: number, emailId: string): Promise<RestockCodeRequest | null> {
    const now = new Date();
    // Atomic: only succeeds if this request is unclaimed AND no other request has claimed this email.
    // The unique index on claimed_email_id (WHERE NOT NULL) enforces the cross-request constraint at DB level.
    // NOTE: The OTP code is deliberately NOT stored here — it lives only in the server-side in-memory cache.
    const result = await db.update(restockCodeRequests)
      .set({ claimedEmailId: emailId, resolvedAt: now })
      .where(
        and(
          eq(restockCodeRequests.id, id),
          isNull(restockCodeRequests.claimedEmailId),
          sql`${restockCodeRequests.expiresAt} > NOW()`
        )
      )
      .returning();
    return result[0] ?? null;
  }

  // Task #250: Restock shipment tracking
  async upsertRestockShipment(
    locationId: number,
    data: {
      orderedAt: Date;
      detectedAt?: Date | null;
      trackingNumber?: string | null;
      carrier?: string | null;
      estimatedDelivery?: string | null;
      rawEmailSnippet?: string | null;
      dismissed?: boolean;
    }
  ): Promise<RestockShipment> {
    const result = await db
      .insert(restockShipments)
      .values({
        locationId,
        orderedAt: data.orderedAt,
        detectedAt: data.detectedAt ?? null,
        trackingNumber: data.trackingNumber ?? null,
        carrier: data.carrier ?? null,
        estimatedDelivery: data.estimatedDelivery ?? null,
        rawEmailSnippet: data.rawEmailSnippet ?? null,
        dismissed: data.dismissed ?? false,
      })
      .onConflictDoUpdate({
        target: restockShipments.locationId,
        set: {
          orderedAt: data.orderedAt,
          detectedAt: data.detectedAt ?? null,
          trackingNumber: data.trackingNumber ?? null,
          carrier: data.carrier ?? null,
          estimatedDelivery: data.estimatedDelivery ?? null,
          rawEmailSnippet: data.rawEmailSnippet ?? null,
          dismissed: data.dismissed ?? false,
        },
      })
      .returning();
    return result[0];
  }

  async getRestockShipment(locationId: number): Promise<RestockShipment | undefined> {
    const result = await db
      .select()
      .from(restockShipments)
      .where(eq(restockShipments.locationId, locationId))
      .limit(1);
    return result[0];
  }

  async dismissRestockShipment(locationId: number): Promise<void> {
    await db
      .update(restockShipments)
      .set({ dismissed: true })
      .where(eq(restockShipments.locationId, locationId));
  }

  async listActiveRestockShipments(): Promise<Array<RestockShipment & { locationName: string }>> {
    const rows = await db
      .select({
        id: restockShipments.id,
        locationId: restockShipments.locationId,
        orderedAt: restockShipments.orderedAt,
        detectedAt: restockShipments.detectedAt,
        trackingNumber: restockShipments.trackingNumber,
        carrier: restockShipments.carrier,
        estimatedDelivery: restockShipments.estimatedDelivery,
        rawEmailSnippet: restockShipments.rawEmailSnippet,
        dismissed: restockShipments.dismissed,
        locationName: locations.name,
      })
      .from(restockShipments)
      .innerJoin(locations, eq(restockShipments.locationId, locations.id))
      .where(eq(restockShipments.dismissed, false))
      .orderBy(desc(restockShipments.orderedAt));
    return rows;
  }

  // Task #289: Translation cache lookups
  async getTranslationCacheEntry(sourceText: string, sourceLang: string, targetLang: string): Promise<TranslationCacheEntry | undefined> {
    const rows = await db.select().from(translationCache)
      .where(and(
        eq(translationCache.sourceText, sourceText),
        eq(translationCache.sourceLang, sourceLang),
        eq(translationCache.targetLang, targetLang),
      ))
      .limit(1);
    return rows[0];
  }

  async upsertTranslationCacheEntry(entry: { sourceText: string; sourceLang: string; targetLang: string; translatedText: string; isAdminCorrected?: boolean }): Promise<TranslationCacheEntry> {
    const existing = await this.getTranslationCacheEntry(entry.sourceText, entry.sourceLang, entry.targetLang);
    if (existing) {
      // Admin-corrected entries are sticky: a non-corrected upsert (e.g. a
      // fresh provider response) never overwrites an admin's manual fix.
      if (existing.isAdminCorrected && !entry.isAdminCorrected) return existing;
      const updated = await db.update(translationCache)
        .set({
          translatedText: entry.translatedText,
          isAdminCorrected: entry.isAdminCorrected ?? existing.isAdminCorrected,
          updatedAt: new Date(),
        })
        .where(eq(translationCache.id, existing.id))
        .returning();
      return updated[0];
    }
    const inserted = await db.insert(translationCache).values({
      sourceText: entry.sourceText,
      sourceLang: entry.sourceLang,
      targetLang: entry.targetLang,
      translatedText: entry.translatedText,
      isAdminCorrected: entry.isAdminCorrected ?? false,
    }).returning();
    return inserted[0];
  }
}

let schemaUpgradesRun = false;
export async function ensureSchemaUpgrades(): Promise<void> {
  if (schemaUpgradesRun) return;

  // Per-statement try/catch so one bad ALTER does not short-circuit the rest
  // of the chain (Task #175). Without this, a single failure could leave
  // production permanently behind shared/schema.ts and silently 500.
  const failures: Array<{ label: string; error: unknown }> = [];
  const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);
  const safe = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    try {
      await action();
    } catch (err) {
      failures.push({ label, error: err });
      console.error(`[ensureSchemaUpgrades] ${label} failed: ${errorMessage(err)}`);
    }
  };

  // Task #217: drop retired payment_methods + location_payment_methods tables.
  // Retained as IF EXISTS so re-running on already-migrated DBs is a no-op.
  await safe("drop table location_payment_methods", () => db.execute(sql`DROP TABLE IF EXISTS location_payment_methods`));
  await safe("drop table payment_methods", () => db.execute(sql`DROP TABLE IF EXISTS payment_methods`));

  await safe("add transactions.last_return_reminder_at", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS last_return_reminder_at TIMESTAMP`));
  await safe("add transactions.return_reminder_count", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_reminder_count INTEGER NOT NULL DEFAULT 0`));
  // Task #38: store the latest Stripe refund id for traceability + audit lookups.
  await safe("add transactions.stripe_refund_id", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT`));
  // Inbox: archived/spam flags for web-form contacts (Task #22)
  await safe("add contacts.is_archived", () => db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`));
  await safe("add contacts.is_spam", () => db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_spam BOOLEAN NOT NULL DEFAULT FALSE`));
  await safe("create table return_reminder_events", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS return_reminder_events (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER NOT NULL,
      sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
      sent_by_user_id INTEGER,
      channel TEXT NOT NULL DEFAULT 'email',
      language TEXT NOT NULL DEFAULT 'en'
    )
  `));
  await safe("create index return_reminder_events_tx_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS return_reminder_events_tx_idx ON return_reminder_events (transaction_id, sent_at DESC)`));
  // Idempotent CREATE for tables declared in shared/schema.ts but not
  // managed by drizzle-kit on this project.
  await safe("create table playbook_facts", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS playbook_facts (
      id SERIAL PRIMARY KEY,
      fact_key TEXT NOT NULL UNIQUE,
      fact_value TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await safe("create table faq_entries", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS faq_entries (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      category TEXT NOT NULL DEFAULT 'general',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await safe("create table knowledge_docs", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      language TEXT NOT NULL DEFAULT 'en',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await safe("create table reply_examples", () => db.execute(sql`
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
  `));
  await safe("create table kb_embeddings", () => db.execute(sql`
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
  `));
  await safe("create index kb_embeddings_source_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS kb_embeddings_source_idx ON kb_embeddings (source_kind, source_id, chunk_idx)`));
  // Task #35: operator onboarding (SMS+WhatsApp claim flow) on locations
  // Task #263: silent geocoding columns for "Find nearest to me".
  await safe("add locations.latitude", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`));
  await safe("add locations.longitude", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`));
  await safe("add locations.geocoded_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMP`));

  await safe("add locations.claim_token", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS claim_token TEXT`));
  await safe("add locations.claim_token_created_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS claim_token_created_at TIMESTAMP`));
  await safe("add locations.welcome_sent_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMP`));
  await safe("add locations.welcome_sms_status", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_status TEXT`));
  await safe("add locations.welcome_sms_error", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_error TEXT`));
  await safe("add locations.welcome_sms_sent_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_sent_at TIMESTAMP`));
  await safe("add locations.welcome_sms_sid", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_sid TEXT`));
  await safe("add locations.welcome_sms_delivered_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_sms_delivered_at TIMESTAMP`));
  await safe("add locations.welcome_whatsapp_status", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_status TEXT`));
  await safe("add locations.welcome_whatsapp_error", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_error TEXT`));
  await safe("add locations.welcome_whatsapp_sent_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_sent_at TIMESTAMP`));
  await safe("add locations.welcome_whatsapp_sid", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_sid TEXT`));
  await safe("add locations.welcome_whatsapp_delivered_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_whatsapp_delivered_at TIMESTAMP`));
  await safe("create index locations_welcome_sms_sid_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS locations_welcome_sms_sid_idx ON locations (welcome_sms_sid)`));
  await safe("create index locations_welcome_whatsapp_sid_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS locations_welcome_whatsapp_sid_idx ON locations (welcome_whatsapp_sid)`));
  await safe("add locations.default_welcome_channel", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_welcome_channel TEXT`));
  await safe("add locations.contact_preference", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS contact_preference TEXT`));
  await safe("add locations.contact_preference_set_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS contact_preference_set_at TIMESTAMP`));
  await safe("add locations.onboarded_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP`));
  await safe("create index locations_claim_token_uq", () => db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS locations_claim_token_uq ON locations (claim_token) WHERE claim_token IS NOT NULL`));
  // Task #39: card-on-file hardening (consent, notification audit, fee math, disputes)
  await safe("add locations.processing_fee_fixed", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS processing_fee_fixed INTEGER DEFAULT 30`));
  await safe("add transactions.consent_text", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consent_text TEXT`));
  await safe("add transactions.consent_accepted_at", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMP`));
  await safe("add transactions.consent_max_charge_cents", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consent_max_charge_cents INTEGER`));
  await safe("add transactions.card_saved_at", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_saved_at TIMESTAMP`));
  await safe("add transactions.charge_notification_sent_at", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS charge_notification_sent_at TIMESTAMP`));
  await safe("add transactions.charge_notification_channel", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS charge_notification_channel TEXT`));
  await safe("add transactions.deposit_fee_cents", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deposit_fee_cents INTEGER`));
  await safe("add transactions.charged_at", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS charged_at TIMESTAMP`));
  await safe("create index transactions_charged_at_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_charged_at_idx ON transactions (charged_at) WHERE charged_at IS NOT NULL`));
  await safe("create table disputes", () => db.execute(sql`
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
  `));
  // Drop NOT NULL on location_id for existing DBs created before it became nullable.
  await safe("drop NOT NULL on disputes.location_id", () => db.execute(sql`ALTER TABLE disputes ALTER COLUMN location_id DROP NOT NULL`));
  await safe("create index disputes_location_created_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS disputes_location_created_idx ON disputes (location_id, created_at DESC)`));
  await safe("create index disputes_charge_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS disputes_charge_idx ON disputes (stripe_charge_id)`));
  // Task #39: global_settings holds runtime-configurable knobs like
  // max_card_age_days for the stale-card guardrail. Created idempotently
  // here so existing DBs (no drizzle push) pick it up automatically.
  await safe("create table global_settings", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS global_settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  // Older deployments may have created the table without is_enabled.
  // Add it idempotently so getGlobalSetting/setGlobalSetting (which
  // reference the column via Drizzle) don't throw on existing DBs.
  await safe("add global_settings.is_enabled", () => db.execute(sql`ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true`));
  // Task #55: refund_attempted_at — set when a refund enters REFUND_PENDING; cleared on finalization.
  await safe("add transactions.refund_attempted_at", () => db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_attempted_at TIMESTAMP`));
  // Task #60: email onboarding status tracking on locations
  await safe("add locations.welcome_email_status", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_email_status TEXT`));
  await safe("add locations.welcome_email_error", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_email_error TEXT`));
  await safe("add locations.welcome_email_sent_at", () => db.execute(sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMP`));
  // Task #42: SMS delivery status tracking on return_reminder_events
  await safe("add return_reminder_events.twilio_sid", () => db.execute(sql`ALTER TABLE return_reminder_events ADD COLUMN IF NOT EXISTS twilio_sid TEXT`));
  await safe("add return_reminder_events.delivery_status", () => db.execute(sql`ALTER TABLE return_reminder_events ADD COLUMN IF NOT EXISTS delivery_status TEXT`));
  await safe("add return_reminder_events.delivery_status_updated_at", () => db.execute(sql`ALTER TABLE return_reminder_events ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMP`));
  await safe("add return_reminder_events.delivery_error_code", () => db.execute(sql`ALTER TABLE return_reminder_events ADD COLUMN IF NOT EXISTS delivery_error_code TEXT`));
  // Message send log table
  await safe("create table message_send_logs", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS message_send_logs (
      id SERIAL PRIMARY KEY,
      location_id INTEGER,
      location_name TEXT NOT NULL,
      location_code TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
      sent_by_user_id INTEGER,
      batch_id TEXT
    )
  `));
  // Task #239 follow-up: store Twilio SID + async delivery status on send log rows
  await safe("add message_send_logs.twilio_sid", () => db.execute(sql`ALTER TABLE message_send_logs ADD COLUMN IF NOT EXISTS twilio_sid TEXT`));
  await safe("add message_send_logs.delivery_status", () => db.execute(sql`ALTER TABLE message_send_logs ADD COLUMN IF NOT EXISTS delivery_status TEXT`));
  await safe("add message_send_logs.delivery_error", () => db.execute(sql`ALTER TABLE message_send_logs ADD COLUMN IF NOT EXISTS delivery_error TEXT`));
  await safe("create index message_send_logs_twilio_sid_idx", () => db.execute(sql`CREATE INDEX IF NOT EXISTS message_send_logs_twilio_sid_idx ON message_send_logs (twilio_sid) WHERE twilio_sid IS NOT NULL`));

  // Task #307: SMS / WhatsApp conversation storage
  await safe("create table sms_conversations", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS sms_conversations (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      channel TEXT NOT NULL,
      location_id INTEGER,
      display_name TEXT,
      last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_message_preview TEXT,
      last_direction TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      is_opted_out BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await safe("create unique index sms_conversations_phone_channel_uq", () => db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sms_conversations_phone_channel_uq
      ON sms_conversations (phone, channel)
  `));
  await safe("create index sms_conversations_last_message_idx", () => db.execute(sql`
    CREATE INDEX IF NOT EXISTS sms_conversations_last_message_idx
      ON sms_conversations (last_message_at DESC)
  `));
  await safe("create table sms_messages", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS sms_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      twilio_sid TEXT,
      sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivery_status TEXT,
      error_message TEXT,
      sent_by_user_id INTEGER
    )
  `));
  await safe("create index sms_messages_conversation_idx", () => db.execute(sql`
    CREATE INDEX IF NOT EXISTS sms_messages_conversation_idx
      ON sms_messages (conversation_id, sent_at)
  `));
  await safe("create index sms_messages_twilio_sid_idx", () => db.execute(sql`
    CREATE INDEX IF NOT EXISTS sms_messages_twilio_sid_idx
      ON sms_messages (twilio_sid) WHERE twilio_sid IS NOT NULL
  `));

  // Make sure the confirmation-email-sent timestamp column exists. The
  // gemach_applications schema declares it but older databases (including
  // some dev environments) were created without it, which breaks every
  // SELECT * over the table. Idempotent.
  await safe("add gemach_applications.confirmation_email_sent_at", () => db.execute(sql`ALTER TABLE gemach_applications ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMP`));

  // Task #174: audit trail for application status changes so admins can
  // trace and recover from accidental approve/reject toggles.
  await safe("create table application_status_changes", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_status_changes (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      source TEXT NOT NULL,
      changed_by_user_id INTEGER,
      changed_by_username TEXT,
      changed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await safe("create index application_status_changes_application_id_idx", () => db.execute(sql`
    CREATE INDEX IF NOT EXISTS application_status_changes_application_id_idx
      ON application_status_changes (application_id)
  `));

  // Task #249: restock_code_requests table — tracks in-flight 2FA code fetches
  await safe("create table restock_code_requests", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS restock_code_requests (
      id SERIAL PRIMARY KEY,
      location_id INTEGER NOT NULL,
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      claimed_email_id TEXT,
      resolved_at TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    )
  `));
  // Drop the resolved_code column if it was created by an earlier migration that included it.
  // OTPs must not be persisted to the database.
  await safe("drop column restock_code_requests.resolved_code", () => db.execute(sql`
    ALTER TABLE restock_code_requests DROP COLUMN IF EXISTS resolved_code
  `));
  await safe("create index restock_code_requests_location_idx", () => db.execute(sql`
    CREATE INDEX IF NOT EXISTS restock_code_requests_location_idx
      ON restock_code_requests (location_id, requested_at DESC)
  `));
  await safe("create unique index restock_code_requests_claimed_email_uq", () => db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS restock_code_requests_claimed_email_uq
      ON restock_code_requests (claimed_email_id) WHERE claimed_email_id IS NOT NULL
  `));

  // Task #250: restock_shipments table — one active shipment record per location
  await safe("create table restock_shipments", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS restock_shipments (
      id SERIAL PRIMARY KEY,
      location_id INTEGER NOT NULL UNIQUE,
      ordered_at TIMESTAMP NOT NULL,
      detected_at TIMESTAMP,
      tracking_number TEXT,
      carrier TEXT,
      estimated_delivery TEXT,
      raw_email_snippet TEXT,
      dismissed BOOLEAN NOT NULL DEFAULT false
    )
  `));

  // Task #281: Israel district_code column + data backfill
  await safe("add city_categories.district_code", () => db.execute(sql`ALTER TABLE city_categories ADD COLUMN IF NOT EXISTS district_code TEXT`));
  await safe("Task #281 israel district_code backfill", () => db.execute(sql`
    UPDATE city_categories SET district_code = CASE
      WHEN slug IN ('haifa','kiryat-tivon','afula') THEN 'north'
      WHEN slug IN ('tel-aviv','petach-tikvah','bnei-brak','kfar-chabad','lod','elad','rechovot','bnei-reem','moshav-yesodot') THEN 'central'
      WHEN slug IN ('jerusalem','givat-zeev','telzstone-kiryat-yearim','neriya','beit-shemesh') THEN 'jerusalem'
      WHEN slug IN ('maaleh-adumim','kochav-hashachar','beitar-illit','modiin-illit','shomron') THEN 'judea-samaria'
      WHEN slug IN ('ashdod') THEN 'south'
      ELSE district_code
    END
    WHERE district_code IS NULL
      AND slug IN (
        'haifa','kiryat-tivon','afula',
        'tel-aviv','petach-tikvah','bnei-brak','kfar-chabad','lod','elad','rechovot','bnei-reem','moshav-yesodot',
        'jerusalem','givat-zeev','telzstone-kiryat-yearim','neriya','beit-shemesh',
        'maaleh-adumim','kochav-hashachar','beitar-illit','modiin-illit','shomron',
        'ashdod'
      )
  `));

  // Task #290: operator profile + region description columns
  await safe("add users.first_name_he", () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name_he TEXT`));
  await safe("add users.last_name_he", () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name_he TEXT`));
  await safe("add users.phone", () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`));
  await safe("add regions.description", () => db.execute(sql`ALTER TABLE regions ADD COLUMN IF NOT EXISTS description TEXT`));
  await safe("add regions.description_he", () => db.execute(sql`ALTER TABLE regions ADD COLUMN IF NOT EXISTS description_he TEXT`));

  // Task #70: pay-later refund_amount data-fix. Wrapped via safe() so a failure
  // here can't take down the rest of the boot path.
  await safe('Task #70 pay-later refund_amount data-fix', async () => {
    const fixResult = await db.execute(sql`
      UPDATE transactions
      SET refund_amount = NULL
      WHERE pay_later_status IN ('CHARGED', 'PARTIALLY_REFUNDED')
        AND stripe_refund_id IS NULL
        AND refund_amount IS NOT NULL
    `);
    const r = fixResult as { rowCount?: number; count?: number };
    const fixedCount = r.rowCount ?? r.count ?? 0;
    if (fixedCount > 0) {
      console.log(`[ensureSchemaUpgrades] Task #70 data-fix: cleared stale refund_amount on ${fixedCount} pay-later transaction(s).`);
    }
  });

  // Task #289: per-application source language + suggested region/community matches.
  await safe("add gemach_applications.submitted_lang", () => db.execute(sql`ALTER TABLE gemach_applications ADD COLUMN IF NOT EXISTS submitted_lang TEXT`));
  await safe("add gemach_applications.suggested_region_id", () => db.execute(sql`ALTER TABLE gemach_applications ADD COLUMN IF NOT EXISTS suggested_region_id INTEGER`));
  await safe("add gemach_applications.suggested_city_category_id", () => db.execute(sql`ALTER TABLE gemach_applications ADD COLUMN IF NOT EXISTS suggested_city_category_id INTEGER`));
  // Task #289: translation cache table (source-text + lang pair → translated).
  await safe("create table translation_cache", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS translation_cache (
      id SERIAL PRIMARY KEY,
      source_text TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      is_admin_corrected BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await safe("create unique index translation_cache_lookup_idx", () => db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS translation_cache_lookup_idx
      ON translation_cache (source_text, source_lang, target_lang)
  `));

  // Only flip the run-once guard on full success; otherwise retry next boot.
  if (failures.length === 0) {
    schemaUpgradesRun = true;
  } else {
    console.error(`[ensureSchemaUpgrades] ${failures.length} statement(s) failed; will retry on next boot. Labels: ${failures.map((f) => f.label).join(', ')}`);
  }
}
  