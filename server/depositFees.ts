// Task #39: single source of truth for processing-fee math.
//
// Stripe charges (us-style cards): 2.9% + $0.30 per successful charge.
// Historically only the percent was added on top of the deposit, which
// quietly cost the gemach money on every transaction (especially small
// deposits where the fixed $0.30 dwarfs the percent). This helper adds
// both, then ceils to whole cents so the gemach is always made whole.

import { storage } from './storage.js';

export interface ComputeFeeInput {
  /** Deposit amount in CENTS. */
  depositCents: number;
  /** Processing fee percent in BASIS POINTS. e.g. 290 = 2.9%, 300 = 3.0%. */
  percentBp: number;
  /** Fixed per-transaction fee in CENTS. e.g. 30 = $0.30. */
  fixedCents: number;
}

export interface ComputeFeeResult {
  feeCents: number;
  totalCents: number;
}

export function computeProcessingFeeCents(input: ComputeFeeInput): ComputeFeeResult {
  const deposit = Math.max(0, Math.round(input.depositCents));
  const pct = Math.max(0, Math.round(input.percentBp));
  const fixed = Math.max(0, Math.round(input.fixedCents));
  const feeCents = Math.ceil((deposit * pct) / 10000) + fixed;
  return { feeCents, totalCents: deposit + feeCents };
}

/**
 * Convenience helper that pulls the per-location fee config and computes
 * the fee for a given deposit amount in CENTS.
 */
export function computeFeeForLocation(
  depositCents: number,
  location: { processingFeePercent?: number | null; processingFeeFixed?: number | null } | null | undefined
): ComputeFeeResult {
  const percentBp = location?.processingFeePercent ?? 300;
  const fixedCents = location?.processingFeeFixed ?? 30;
  return computeProcessingFeeCents({ depositCents, percentBp, fixedCents });
}

// Task #217: global Stripe fee override lives in `global_settings`, replacing
// the retired admin Payment Methods page (which previously held the only
// real knob — the stripe row's processingFeePercent/fixedFee).
// Priority: global override > location config > hard defaults.
export const STRIPE_FEE_PERCENT_BP_KEY = 'stripe.depositFeePercentBp';
export const STRIPE_FEE_FIXED_CENTS_KEY = 'stripe.depositFeeFixedCents';

export interface StripeFeeOverride {
  percentBp: number | null;
  fixedCents: number | null;
}

export async function getStripeFeeOverride(): Promise<StripeFeeOverride> {
  const [pctRow, fixedRow] = await Promise.all([
    storage.getGlobalSetting(STRIPE_FEE_PERCENT_BP_KEY),
    storage.getGlobalSetting(STRIPE_FEE_FIXED_CENTS_KEY),
  ]);
  const pct = pctRow?.value != null ? Number(pctRow.value) : NaN;
  const fixed = fixedRow?.value != null ? Number(fixedRow.value) : NaN;
  return {
    percentBp: Number.isFinite(pct) && pct >= 0 ? pct : null,
    fixedCents: Number.isFinite(fixed) && fixed >= 0 ? fixed : null,
  };
}

export async function setStripeFeeOverride(override: { percentBp?: number | null; fixedCents?: number | null }): Promise<void> {
  if (override.percentBp != null && Number.isFinite(override.percentBp)) {
    await storage.setGlobalSetting(STRIPE_FEE_PERCENT_BP_KEY, String(Math.max(0, Math.floor(Number(override.percentBp)))));
  }
  if (override.fixedCents != null && Number.isFinite(override.fixedCents)) {
    await storage.setGlobalSetting(STRIPE_FEE_FIXED_CENTS_KEY, String(Math.max(0, Math.floor(Number(override.fixedCents)))));
  }
}

/**
 * Compute Stripe deposit fee. Priority: global override > location config > hard defaults.
 */
export function computeFeeForStripe(
  depositCents: number,
  override: { percentBp?: number | null; fixedCents?: number | null } | null | undefined,
  location: { processingFeePercent?: number | null; processingFeeFixed?: number | null } | null | undefined
): ComputeFeeResult {
  const percentBp = override?.percentBp ?? location?.processingFeePercent ?? 300;
  const fixedCents = override?.fixedCents ?? location?.processingFeeFixed ?? 30;
  return computeProcessingFeeCents({ depositCents, percentBp, fixedCents });
}
