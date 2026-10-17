# Cashier commissions

## Intent

Store owners and managers can enable a percentage commission for each cashier in the existing sales permissions form. Accounting gains a Primler screen listing the staff member, phone identifier and earned commission. This extends the shared panel for every eligible tenant. The user requested planning and implementation together and confirmed the basis: product sales after discounts and returns, excluding delivery.

## Rules

- One `commissionEnabled` flag and `commissionRateBps` integer, saved atomically with the other staff permissions. Default false/0. Enabled rates are 1–10000 basis points (0.01–100%); disabled settings may retain a rate or use 0. The rate is not capped at 20%.
- Staff V6 is separate from sale/payment V4. Staff V1–V5 DTOs, receipt meanings and saves retain their exact behavior; old saves preserve the new settings.
- Capture one prospective immutable snapshot on the actual transition to completed. The recipient is the cashier who created the sale, from the immutable create operation; manager takeover or collecting payment does not transfer the commission. Capture the current enabled policy, rate, merchandise subtotal less sale discounts, completion timestamp, staff display name and masked phone. Do not backfill previously completed sales.
- Pending sales and individual payment parts do not earn duplicate commission. Completed credit sales use the same sales basis; collecting the debt later does not earn commission again.
- Product base excludes delivery. Existing financial return credits reduce merchandise first, capped at its original value; subsequent debt-settlement discounts reduce the remaining merchandise. The current amount-based return system does not identify a separate delivery-only component. Refund payment settlement is not deducted again. Reversals restore the corresponding original-rate entitlement. The report shows the current adjustments on the period's completed sales.
- Compute each sale's earnings in integer cents with numeric half-up rounding, then sum. Never recalculate old rates from current settings. Current settings can be disabled without erasing earned snapshots.
- Primler is a manager/store-owner report; granting a cashier general accounting access does not automatically disclose colleagues' compensation. No general role expansion. Existing Professional/accounting package boundaries apply.
- Show actual staff display names faithfully and existing masked phone identifiers. Keep historical identity snapshots for removed staff. No phone decryption keys or plaintext identifiers are added to panel contracts.
- The report is earned entitlement, not a payment instruction. Creating entitlement does not change cash/bank balances or create duplicate financial expenses.

## Contracts and surfaces

- Staff-only V6 list/set/recover RPCs and `set_staff_v6` operation/fingerprint. Append `commissionEnabled`, `commissionRateBps` to the V6 grant contract.
- `AccountingCommissionFilters`: `{dateFrom,dateTo}`, inclusive ISO date range no longer than 366 days.
- Report: `{dateFrom,dateTo,basis:'net_product_sales',currency:'TRY',prospectiveOnly:true,rows,totals}`. Existing POS sales are TRY.
- Row: `{membershipId,displayName,phoneMasked,commissionEnabled,commissionRateBps,completedSaleCount,merchandiseSalesCents,returnAdjustmentCents,collectionDiscountCents,eligibleBaseCents,earnedCommissionCents}`.
- Totals: the count and five money columns summed exactly across rows. At most 1000 grouped staff rows; fail explicitly rather than silently truncate totals.
- `AccountingRepository.commissions({tenantContext,now,filters})` calls `accounting_commissions_read(auth7,jsonb)` with a manager-authorized session. `GET /api/accounting/commissions` and the browser client validate filters and response/date binding.
- Two existing sales permission forms get the flag and decimal rate input, retaining drafts, CAS, retry/recovery and conflict handling.
- `/accounting/commissions`, shared accounting navigation and panel navigation use a manager-only gate. A current-month default, date filters, stable loading/error/empty states and a short calculation note follow existing accounting UI.

## Verification and rollout

Focused tests cover percentage limits, V1–V6 compatibility, strict authority and cross-tenant isolation, rate changes, disabled settings, original cashier attribution, partial payment/replay, returns/discount reversals and rounding. The trigger must not break completion when a sale is ineligible; no source-pinned sale/payment function is modified. Native test fixtures are isolated and stopped after verification. No whole-database business-row scans.

Build the shared panel and check owner compatibility. Apply additive native support under the existing publisher lock, preserving current rows and protected function/payment authority. Publish NET then SITE with actual source, health, protected configuration and UI acceptance. Root is the only live publisher. No real cashier receives an enabled commission during deployment.
