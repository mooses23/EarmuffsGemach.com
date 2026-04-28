# Stripe Operations Runbook

This document is the source of truth for how the Replit-managed Stripe account is
operated for the gemach network. It is linked from the admin dashboard and should
be updated whenever risk policy changes.

---

## 1. Overview

- **Single shared Stripe account** is used across all 130 locations. Each
  `transaction` row carries `locationId`, and each Stripe `PaymentIntent` /
  `SetupIntent` we create is tagged with `metadata.location_id` so support can
  trace any Stripe object back to the originating gemach.
- **MCC**: 8398 (Charitable & Social Service Organizations). All settled funds
  are gemach deposits; we never co-mingle other revenue.
- **Two product flows**:
  1. **Direct Deposit** — borrower pays the deposit up front via card. The card
     is charged once for `deposit + processing fee`.
  2. **Pay Later** — borrower saves a card on file via `SetupIntent`. The card
     is charged off-session by the operator only if the item is not returned.
- Both flows pass the deposit through the Stripe network at the moment of
  charge; we do not custody funds outside Stripe.

---

## 2. How Off-Session Charges Work

Off-session charges (Pay Later) are higher-risk than on-session ones because
the borrower is not present to authenticate. Stripe scrutinizes the following:

1. **The card was saved with explicit consent** — we send `setup_future_usage`
   on the SetupIntent and persist the consent text the borrower agreed to.
2. **The amount we charge matches the amount the borrower agreed to** —
   `consentMaxChargeCents` is set at SetupIntent time and is the cap. We charge
   `amountPlannedCents` (deposit + fee), which equals the consent maximum.
3. **The borrower is given prior notice** — we send a heads-up via the
   borrower's preferred channel (SMS first, email fallback) before any
   off-session charge. This is logged on the transaction
   (`chargeNotificationSentAt`, `chargeNotificationChannel`) and visible in the
   audit log.
4. **The card is not stale** — we refuse off-session charges on cards saved
   more than `stripe.maxCardAgeDays` (default **90**) days ago. The operator
   sees a "Request new card" button in the dashboard instead.

---

## 3. Consent We Capture

At card setup the borrower must tick a required checkbox above the submit
button. The exact text is:

> By saving this card, I authorize **{gemachName}** to charge up to
> **${maxAmount}** plus a small processing fee if I do not return the borrowed
> item.

We persist:
- `consentText` — the literal string above with the gemach name and amount filled in
- `consentAcceptedAt` — UTC timestamp
- `consentMaxChargeCents` — the cap the borrower agreed to

In a Stripe dispute response, paste this verbatim into the "Customer
communication" evidence field along with the timestamp.

---

## 4. Stripe Dispute Thresholds

- **Network ceiling (Visa/MC enforced via Stripe)**: 0.7% disputes-to-charges.
  Sustained breach = monitoring program → fines → account termination.
- **Our internal warning threshold**: 0.5%. The admin dashboard "Stripe risk"
  card highlights any location whose 30-day rate is at or above this.
- The denominator is "successful pay-later charges in the same 30-day window"
  per location. Direct-Deposit charges are not (yet) counted because the
  Direct-Deposit path is on-session and almost never disputed.

When a location is flagged:
1. Pause new Pay-Later card setups at that location.
2. Pull the dispute reason codes from the `disputes` table for that location.
3. If `fraudulent` or `unrecognized` dominate → tighten consent UI / re-train
   operator on the heads-up notification.
4. If `product_not_received` dominates → operator hygiene problem; confirm
   their item-out / item-returned discipline.

---

## 5. Runbook: "Risk review" email from Stripe

If Stripe risk-ops emails about a specific charge, deposit pattern, or
location:

1. Reply within 24h with the following template (do not delegate; admins only):

    ```
    Hi Stripe Risk team,

    Reference: <stripe charge id or PI id from their email>

    Our shared Stripe account services 130 charitable lending libraries
    ("gemachs"). The flagged charge originates from location "<name>"
    (gemach #<locationCode>). The charge is a <deposit | pay-later
    fallback> for a borrowed item that was <not returned | held past due>.

    Borrower consent (verbatim, agreed at <consentAcceptedAt>):
    "<consentText>"

    Pre-charge notification: sent via <channel> at
    <chargeNotificationSentAt>.

    Card age at charge: <N> days (our internal max: 90).

    Happy to provide additional evidence (receipt, photo of item check-in,
    operator audit log) on request.

    — Admin, <yourname>
    ```

2. Pull the data from the admin dashboard and the per-transaction audit log.
3. Log the outreach in the location's notes.

If Stripe asks to review the *entire account* (not a specific charge), escalate
immediately and consider pausing all Pay-Later setups network-wide using the
admin Stripe-policy switch.

---

## 6. Future Option: Stripe Connect for Per-Gemach Isolation

The current shared-account model is operationally simple but couples all 130
locations' risk together: one bad-actor location can put the whole network into
Stripe's monitoring program.

The clean solution is **Stripe Connect with one connected account per gemach**:

- Each location gets its own Stripe-issued `acct_*` ID.
- Disputes, payouts, and risk decisions are scoped to that account.
- Onboarding flow: Stripe-hosted Express onboarding link emailed to the
  gemach's coordinator at application-approval time.
- Code-level changes: `Location.stripeAccountId` column; pass
  `stripeAccount: location.stripeAccountId` to every Stripe API call;
  update webhook handling to resolve the account from the event.

Cost: ~2 weeks of engineering + ongoing 0.25% Connect fee. Worth it once we
exceed ~50 active Pay-Later locations or the first time a single location
threatens the shared account.

---

## 7. Configuration Reference

| Setting key                  | Default | Where it lives                                          |
|------------------------------|---------|---------------------------------------------------------|
| `stripe.maxCardAgeDays`      | 90      | `global_settings` table; admin UI under Stripe settings |
| `processingFeePercent`       | 290     | `locations.processingFeePercent` (basis points)         |
| `processingFeeFixed`         | 30      | `locations.processingFeeFixed` (cents)                  |
| Internal dispute warn rate   | 0.5%    | hard-coded in `/api/admin/disputes/summary`             |
| Stripe-network dispute cap   | 0.7%    | enforced by Stripe                                      |

Fee math (both flows):

```
feeCents   = ceil(depositCents * percentBp / 10000) + fixedCents
totalCents = depositCents + feeCents
```

**Fee source hierarchy (both flows):**
1. `payment_methods` row where `provider = 'stripe'` (set in the admin payment-method
   configuration) — highest priority.
2. Location-level `processingFeePercent` / `processingFeeFixed` (set per-location in
   admin Stripe settings) — fallback.
3. Hard defaults: 300 bp (3.00%) + 30 cents — last resort.

Both the **Direct Deposit** flow (`server/depositService.ts`) and the **Pay Later** flow
(`server/payLaterService.ts`) resolve fees through the same helper
`computeFeeForPaymentMethod()` in `server/depositFees.ts`, ensuring consistent amounts
across all Stripe charges and consent disclosures.
