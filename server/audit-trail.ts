/**
 * Audit Trail Service
 * Tracks all deposit-related actions for compliance and debugging
 */

import { storage } from "./storage.js";

interface AuditEntry {
  id: number;
  timestamp: Date;
  userId: number;
  username: string;
  action: string;
  entityType: 'payment' | 'transaction' | 'deposit' | 'location';
  entityId: number;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  notes?: string;
}

export class AuditTrailService {
  private static auditEntries: Map<number, AuditEntry> = new Map();
  private static auditCounter = 1;

  /**
   * Records deposit confirmation action
   */
  static async logDepositConfirmation(
    userId: number,
    username: string,
    paymentId: number,
    oldStatus: string,
    newStatus: string,
    confirmationData: any,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.auditCounter++,
      timestamp: new Date(),
      userId,
      username,
      action: 'DEPOSIT_CONFIRMATION',
      entityType: 'payment',
      entityId: paymentId,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus, ...confirmationData },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      notes: `Payment ${paymentId} status changed from ${oldStatus} to ${newStatus}`
    };

    this.auditEntries.set(entry.id, entry);
    console.log('Audit logged:', entry);
  }

  /**
   * Records refund processing action
   */
  static async logRefundProcessing(
    userId: number,
    username: string,
    transactionId: number,
    refundAmount: number,
    condition: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.auditCounter++,
      timestamp: new Date(),
      userId,
      username,
      action: 'REFUND_PROCESSED',
      entityType: 'transaction',
      entityId: transactionId,
      newValue: { refundAmount, condition },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      notes: `Refund of $${refundAmount} processed for transaction ${transactionId} (condition: ${condition})`
    };

    this.auditEntries.set(entry.id, entry);
    console.log('Audit logged:', entry);
  }

  /**
   * Records bulk operations
   */
  static async logBulkOperation(
    userId: number,
    username: string,
    operation: string,
    entityIds: number[],
    results: { successful: number; failed: number },
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.auditCounter++,
      timestamp: new Date(),
      userId,
      username,
      action: `BULK_${operation.toUpperCase()}`,
      entityType: 'deposit',
      entityId: 0, // Bulk operations don't have single entity ID
      newValue: { entityIds, results },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      notes: `Bulk ${operation}: ${results.successful} successful, ${results.failed} failed`
    };

    this.auditEntries.set(entry.id, entry);
    console.log('Audit logged:', entry);
  }

  /**
   * Records admin re-geocode / manual coordinate override on a location.
   */
  static async logLocationGeocode(
    userId: number,
    username: string,
    locationId: number,
    action: 'REGEOCODE' | 'MANUAL_COORDS',
    oldCoords: { latitude: number | null; longitude: number | null },
    newCoords: { latitude: number | null; longitude: number | null },
    metadata?: { ipAddress?: string; userAgent?: string; address?: string | null; reason?: string },
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.auditCounter++,
      timestamp: new Date(),
      userId,
      username,
      action: `LOCATION_${action}`,
      entityType: 'location',
      entityId: locationId,
      oldValue: oldCoords,
      newValue: { ...newCoords, address: metadata?.address },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      notes: action === 'REGEOCODE'
        ? `Re-geocoded location ${locationId}: (${oldCoords.latitude}, ${oldCoords.longitude}) -> (${newCoords.latitude}, ${newCoords.longitude})`
        : `Manual coords override on location ${locationId}: (${oldCoords.latitude}, ${oldCoords.longitude}) -> (${newCoords.latitude}, ${newCoords.longitude})${metadata?.reason ? ` [${metadata.reason}]` : ''}`,
    };
    this.auditEntries.set(entry.id, entry);
    console.log('Audit logged:', entry);
  }

  /**
   * Retrieves audit trail for specific entity
   */
  static async getAuditTrail(entityType: string, entityId: number): Promise<AuditEntry[]> {
    return Array.from(this.auditEntries.values())
      .filter(entry => entry.entityType === entityType && entry.entityId === entityId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Retrieves recent audit entries
   */
  static async getRecentAuditEntries(limit: number = 50): Promise<AuditEntry[]> {
    return Array.from(this.auditEntries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Generates compliance report
   */
  static async generateComplianceReport(dateRange: { start: Date; end: Date }): Promise<any> {
    const entries = Array.from(this.auditEntries.values())
      .filter(entry => 
        entry.timestamp >= dateRange.start && 
        entry.timestamp <= dateRange.end
      );

    const actionCounts = entries.reduce((acc, entry) => {
      acc[entry.action] = (acc[entry.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const userActions = entries.reduce((acc, entry) => {
      if (!acc[entry.username]) {
        acc[entry.username] = { userId: entry.userId, actions: 0 };
      }
      acc[entry.username].actions++;
      return acc;
    }, {} as Record<string, { userId: number; actions: number }>);

    return {
      totalActions: entries.length,
      dateRange,
      actionBreakdown: actionCounts,
      userActivity: userActions,
      entries: entries.slice(0, 100) // Last 100 entries for detailed review
    };
  }
}