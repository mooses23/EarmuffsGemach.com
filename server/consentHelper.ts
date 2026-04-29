/**
 * Canonical consent sentence for card-on-file authorisation.
 * The server builds this from stored data at both display time
 * (/api/status, /api/deposits/fee-quote) and save time
 * (/api/deposits/setup-intent, /api/deposits/confirm-setup), so the
 * audit-trail text is always byte-identical to what the borrower saw.
 *
 * @param gemachName      Display name of the gemach location.
 * @param maxChargeCents  Maximum authorised charge in cents (deposit + fee).
 * @param locale          'he' for Hebrew, defaults to English.
 */
export type ConsentLocale = 'en' | 'he';

export function resolveConsentLocale(raw?: string | null): ConsentLocale {
  if (!raw) return 'en';
  const tag = raw.split(',')[0].trim().toLowerCase();
  if (tag === 'he' || tag.startsWith('he-')) return 'he';
  return 'en';
}

export function buildCanonicalConsentText(
  gemachName: string,
  maxChargeCents: number,
  locale: ConsentLocale = 'en',
): string {
  const dollars = (maxChargeCents / 100).toFixed(2);
  if (locale === 'he') {
    // Hebrew: "By saving this card, I authorize [gemachName] to charge up to
    //          $[amount] if I do not return the borrowed item."
    // NOTE: reviewed with gemach management; "מרשה" is unambiguous in
    //       written Hebrew (without nikud) and acceptable for both genders.
    return `על ידי שמירת הכרטיס, אני מרשה ל${gemachName} לחייב עד $${dollars} אם לא אחזיר את הפריט השאול.`;
  }
  return `By saving this card, I authorize ${gemachName} to charge up to $${dollars} if I do not return the borrowed item.`;
}
