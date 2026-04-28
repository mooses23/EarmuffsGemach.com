// Shared phone normalization for SMS reminders. Used by both the
// server (Twilio send path) and the operator dashboard (channel
// enablement) so the UI never offers SMS for a number the backend
// will reject.
//
// Returns an E.164 string (e.g. "+15551234567") or null if the input
// cannot be safely normalized. Bare 10/11-digit NANP numbers are
// auto-prefixed with "+1"; everything else must already include a
// "+<country>" prefix.
export function normalizePhoneForSms(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return '+' + digits;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && /^[2-9]/.test(digits)) return '+1' + digits;
  if (digits.length === 11 && /^1[2-9]/.test(digits)) return '+' + digits;
  return null;
}

export function isPhoneSendableViaSms(raw: string | null | undefined): boolean {
  return normalizePhoneForSms(raw) !== null;
}
