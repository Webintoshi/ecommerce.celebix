import assert from "node:assert/strict";
import test from "node:test";
import type { AccountingAccount, AccountingCustomerAccount, AccountingEvent, AccountingReceivable } from "@celebix/saas-contracts";
import type { AccountingEffectInput } from "./effects.ts";

const module = await import("./effects.ts").catch(() => ({})) as typeof import("./effects.ts");
const preview = (input: Partial<AccountingEffectInput> = {}) => {
  assert.equal(typeof module.previewAccountingEffects, "function", "accounting effect preview must exist");
  return module.previewAccountingEffects({ kind: "collect", amountCents: 400, currency: "TRY", accounts: [], ...input });
};
const account = (id = "cash", balanceCents = 2_000, type: AccountingAccount["type"] = "cash", currency = "TRY"): AccountingAccount => ({ id, name: id, type, currency, balanceCents, version: 1, createdAt: "2026-10-15T10:00:00Z" });
const debt = (patch: Partial<AccountingReceivable> = {}): AccountingReceivable => ({ id: "debt", customerId: "customer", customerName: "Ayşe", customerPhone: null, customerArchived: false, orderId: "order", orderNumber: "1", channel: "POS", currency: "TRY", saleCents: 1_000, collectedCents: 0, returnCents: 0, refundedCents: 0, dueCents: 1_000, refundDueCents: 0, occurredAt: "2026-10-01T10:00:00Z", dueDate: null, version: 1, ...patch });
const customer = (receivables: readonly AccountingReceivable[] = [debt()], patch: Partial<AccountingCustomerAccount> = {}): AccountingCustomerAccount => ({ customerId: "customer", customerName: "Ayşe", customerPhone: null, customerArchived: false, currency: "TRY", version: 1, dueCents: 1_000, refundDueCents: 0, receivables, events: [], ...patch });
const event = (patch: Partial<AccountingEvent> = {}): AccountingEvent => ({ id: "event", kind: "collection", currency: "TRY", amountCents: 400, accountId: "cash", customerId: "customer", orderId: "order", channel: "POS", paymentMethod: "cash", note: null, category: null, documentNumber: null, metadata: {}, actorMembershipId: "actor", occurredAt: "2026-10-15T10:00:00Z", createdAt: "2026-10-15T10:00:00Z", reversesEventId: null, reversed: false, allocations: [{ receivableId: "debt", orderId: "order", amountCents: 400 }], ...patch });
const amounts = (result: ReturnType<typeof preview>) => result.rows.map(({ beforeCents, changeCents, afterCents }) => [beforeCents, changeCents, afterCents]);

test("collection reduces customer debt and increases the chosen account", () => {
  const result = preview({ accounts: [account()], accountId: "cash", customerAccount: customer() });
  assert.equal(result.error, null);
  assert.deepEqual(amounts(result), [[1_000, -400, 600], [2_000, 400, 2_400]]);
});

test("collection cannot exceed the selected order while other customer debts remain", () => {
  const rows = [debt({ dueCents: 100, saleCents: 100 }), debt({ id: "other", orderId: "other-order", dueCents: 900, saleCents: 900 })];
  assert.ok(preview({ customerAccount: customer(rows), orderId: "order", amountCents: 101 }).error);
  assert.equal(preview({ customerAccount: customer(rows), amountCents: 1_000 }).error, null);
  assert.ok(preview({ customerAccount: customer(rows), amountCents: 1_001 }).error);
});

test("unknown default account preserves the collection delta without inventing a zero balance", () => {
  const result = preview({ customerAccount: customer() });
  assert.deepEqual(amounts(result), [[1_000, -400, 600], [null, 400, null]]);
  assert.ok(result.notes.length);
  assert.equal(result.error, null);
});

test("opening debt increases what the customer owes without adding account income", () => {
  const result = preview({ kind: "openingDebt", customerAccount: customer() });
  assert.deepEqual(amounts(result), [[1_000, 400, 1_400]]);
  assert.match(result.notes.join(" "), /satış|stok/i);
  assert.deepEqual(amounts(preview({ kind: "openingDebt" })), [[null, 400, null]]);
});

test("opening balance adds to the existing balance on every entry and permits zero", () => {
  assert.deepEqual(amounts(preview({ kind: "openBalance", accounts: [account()], accountId: "cash" })), [[2_000, 400, 2_400]]);
  assert.deepEqual(amounts(preview({ kind: "openBalance", amountCents: 0, accounts: [account()], accountId: "cash" })), [[2_000, 0, 2_000]]);
});

test("paid expense decreases available money and rejects insufficient funds", () => {
  assert.deepEqual(amounts(preview({ kind: "expense", accounts: [account()], accountId: "cash" })), [[2_000, -400, 1_600]]);
  const rejected = preview({ kind: "expense", amountCents: 2_001, accounts: [account()], accountId: "cash" });
  assert.ok(rejected.error);
  assert.deepEqual(rejected.rows, []);
});

test("transfer moves the same amount between distinct accounts", () => {
  assert.deepEqual(amounts(preview({ kind: "transfer", accounts: [account(), account("bank", 500, "bank")], fromAccountId: "cash", toAccountId: "bank" })), [[2_000, -400, 1_600], [500, 400, 900]]);
  assert.ok(preview({ kind: "transfer", fromAccountId: "cash", toAccountId: "cash" }).error);
});

test("card settlement deducts gross once and credits only net after commission", () => {
  const result = preview({ kind: "settleCard", amountCents: 1_000, commissionCents: 30, accounts: [account("card", 2_000, "card"), account("bank", 500, "bank")], fromAccountId: "card", toAccountId: "bank" });
  assert.equal(result.error, null);
  assert.deepEqual(amounts(result), [[2_000, -1_000, 1_000], [500, 970, 1_470]]);
  assert.equal(result.rows.length, 2);
  assert.match(result.notes.join(" "), /komisyon/i);
  assert.ok(preview({ kind: "settleCard", commissionCents: 401 }).error);
  assert.ok(preview({ kind: "settleCard", accounts: [account()], fromAccountId: "cash" }).error);
});

test("cleared settlement commission never invents a zero commission or net bank credit", () => {
  const result = preview({ kind: "settleCard", amountCents: 1_000, commissionCents: null, accounts: [account("card", 2_000, "card"), account("bank", 500, "bank")], fromAccountId: "card", toAccountId: "bank" });
  assert.deepEqual(result.rows, []);
  assert.ok(result.notes.length || result.error);
});

test("return credit first reduces debt then creates only the excess refund due", () => {
  const selectedDebt = debt({ collectedCents: 700, dueCents: 300 });
  const result = preview({ kind: "returnCredit", amountCents: 500, selectedDebt, orderId: "order", customerAccount: customer([selectedDebt], { dueCents: 300 }) });
  assert.equal(result.error, null);
  assert.deepEqual(amounts(result), [[300, -300, 0], [0, 200, 200]]);
});

test("return credit keeps prior refund payments out of the new refund due", () => {
  const selectedDebt = debt({ collectedCents: 1_000, returnCents: 300, refundedCents: 200, dueCents: 0, refundDueCents: 100 });
  const result = preview({ kind: "returnCredit", amountCents: 200, selectedDebt, customerAccount: customer([selectedDebt], { dueCents: 0, refundDueCents: 100 }) });
  assert.deepEqual(amounts(result), [[0, 0, 0], [100, 200, 300]]);
  assert.ok(preview({ kind: "returnCredit", amountCents: 701, selectedDebt }).error);
});

test("refund reduces both the account and the unpaid refund obligation", () => {
  const selectedDebt = debt({ collectedCents: 1_000, returnCents: 300, refundedCents: 100, dueCents: 0, refundDueCents: 200 });
  const result = preview({ kind: "refund", amountCents: 150, selectedDebt, accounts: [account()], accountId: "cash", customerAccount: customer([selectedDebt], { dueCents: 0, refundDueCents: 200 }) });
  assert.deepEqual(amounts(result), [[200, -150, 50], [2_000, -150, 1_850]]);
  assert.match(result.notes.join(" "), /gönder|geri verdi|ödeme/i);
  assert.ok(preview({ kind: "refund", amountCents: 201, selectedDebt }).error);
});

test("missing sale details never fabricate the debt or refund split", () => {
  const result = preview({ kind: "returnCredit" });
  assert.deepEqual(result.rows, []);
  assert.ok(result.notes.length);
  assert.equal(result.error, null);
});

test("reversing a split collection recalculates the complete customer account", () => {
  const rows = [debt({ collectedCents: 300, dueCents: 700 }), debt({ id: "second", orderId: "second-order", saleCents: 500, collectedCents: 200, dueCents: 300 })];
  const selectedEvent = event({ orderId: null, amountCents: 500, allocations: [{ receivableId: "debt", orderId: "order", amountCents: 300 }, { receivableId: "second", orderId: "second-order", amountCents: 200 }] });
  const before = JSON.stringify(rows);
  const result = preview({ kind: "reverse", selectedEvent, customerAccount: customer(rows), accounts: [account()], amountCents: null });
  assert.equal(result.error, null);
  assert.deepEqual(amounts(result), [[1_000, 500, 1_500], [0, 0, 0], [2_000, -500, 1_500]]);
  assert.equal(JSON.stringify(rows), before);
});

test("collection reversal cannot invalidate a refund already paid", () => {
  const selectedDebt = debt({ collectedCents: 1_000, returnCents: 500, refundedCents: 300, dueCents: 0, refundDueCents: 200 });
  const rejected = preview({ kind: "reverse", selectedEvent: event({ amountCents: 400 }), selectedDebt, accounts: [account()] });
  assert.ok(rejected.error);
  assert.deepEqual(rejected.rows, []);
});

test("return reversal reduces refundable balance and rejects removal after it was refunded", () => {
  const selectedDebt = debt({ collectedCents: 1_000, returnCents: 500, refundedCents: 200, dueCents: 0, refundDueCents: 300 });
  const selectedEvent = event({ kind: "return_credit", amountCents: 300, accountId: null, allocations: [{ receivableId: "debt", orderId: "order", amountCents: 300 }] });
  assert.deepEqual(amounts(preview({ kind: "reverse", selectedEvent, selectedDebt })), [[0, 0, 0], [300, -300, 0]]);
  assert.ok(preview({ kind: "reverse", selectedEvent: { ...selectedEvent, amountCents: 400, allocations: [{ receivableId: "debt", orderId: "order", amountCents: 400 }] }, selectedDebt }).error);
});

test("refund reversal restores the unpaid refund obligation and account balance", () => {
  const selectedDebt = debt({ collectedCents: 1_000, returnCents: 500, refundedCents: 200, dueCents: 0, refundDueCents: 300 });
  const selectedEvent = event({ kind: "refund", amountCents: 200, allocations: [{ receivableId: "debt", orderId: "order", amountCents: 200 }] });
  assert.deepEqual(amounts(preview({ kind: "reverse", selectedEvent, selectedDebt, accounts: [account()] })), [[0, 0, 0], [300, 200, 500], [2_000, 200, 2_200]]);
});

test("opening debt reversal removes only an uncollected charge", () => {
  const selectedEvent = event({ kind: "opening_debt", amountCents: 1_000, accountId: null, orderId: null, allocations: [{ receivableId: "debt", orderId: null, amountCents: 1_000 }] });
  assert.deepEqual(amounts(preview({ kind: "reverse", selectedEvent, selectedDebt: debt({ orderId: null }) })), [[1_000, -1_000, 0], [0, 0, 0]]);
  assert.ok(preview({ kind: "reverse", selectedEvent, selectedDebt: debt({ orderId: null, collectedCents: 100, dueCents: 900 }) }).error);
});

test("expense and account opening reversals undo their original account movement", () => {
  assert.deepEqual(amounts(preview({ kind: "reverse", selectedEvent: event({ kind: "expense", customerId: null, orderId: null, allocations: [] }), accounts: [account()] })), [[2_000, 400, 2_400]]);
  assert.deepEqual(amounts(preview({ kind: "reverse", selectedEvent: event({ kind: "account_opening", customerId: null, orderId: null, allocations: [] }), accounts: [account()] })), [[2_000, -400, 1_600]]);
});

test("settlement reversal uses stored net and never deducts gross from the bank", () => {
  const selectedEvent = event({ kind: "card_settlement", amountCents: 1_000, customerId: null, orderId: null, accountId: "card", allocations: [], metadata: { toAccountId: "bank", grossCents: 1_000, netCents: 970, commissionCents: 30 } });
  const result = preview({ kind: "reverse", selectedEvent, accounts: [account("card", 1_000, "card"), account("bank", 1_470, "bank")] });
  assert.deepEqual(amounts(result), [[1_000, 1_000, 2_000], [1_470, -970, 500]]);
  assert.equal(result.rows.length, 2);
});

test("anonymous order reversal shows only known sale balances and qualifies customer scope", () => {
  const selectedDebt = debt({ customerId: null, collectedCents: 400, dueCents: 600 });
  const result = preview({ kind: "reverse", selectedEvent: event({ customerId: null }), selectedDebt, accounts: [account()] });
  assert.deepEqual(amounts(result), [[600, 400, 1_000], [0, 0, 0], [2_000, -400, 1_600]]);
  assert.match(result.notes.join(" "), /satış|müşteri/i);
});

test("missing allocated debts suppress customer numbers while retaining known account movement", () => {
  const selectedEvent = event({ amountCents: 500, allocations: [{ receivableId: "debt", orderId: "order", amountCents: 300 }, { receivableId: "unknown", orderId: "other", amountCents: 200 }] });
  const result = preview({ kind: "reverse", selectedEvent, selectedDebt: debt({ collectedCents: 300, dueCents: 700 }), accounts: [account()] });
  assert.deepEqual(amounts(result), [[2_000, -500, 1_500]]);
  assert.ok(result.notes.length);
});

test("sale, reversal, already reversed and unfinished manual receipts cannot be reversed", () => {
  for (const selectedEvent of [event({ kind: "sale" }), event({ kind: "reversal" }), event({ reversed: true }), event({ allocations: [], metadata: { saleId: "sale", partId: "part", pendingSale: true } })]) {
    assert.ok(preview({ kind: "reverse", selectedEvent }).error);
  }
});

test("foreign currencies and unsafe amounts never produce a numeric preview", () => {
  for (const input of [
    { accounts: [account("cash", 2_000, "cash", "USD")], accountId: "cash" },
    { customerAccount: customer([], { currency: "USD" }) },
    { kind: "returnCredit" as const, selectedDebt: debt({ currency: "USD" }) },
    { kind: "reverse" as const, selectedEvent: event({ currency: "USD" }) },
    { kind: "reverse" as const, selectedEvent: event({ kind: "expense", customerId: null, orderId: null, allocations: [] }), accounts: [account("cash", 2_000, "cash", "USD")] },
    { kind: "reverse" as const, selectedEvent: event({ kind: "card_settlement", accountId: "card", customerId: null, orderId: null, allocations: [], metadata: { toAccountId: "bank", grossCents: 400, netCents: 390, commissionCents: 10 } }), accounts: [account("card", 2_000, "card"), account("bank", 2_000, "bank", "USD")] },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { amountCents: 1.5 },
    { amountCents: -1 },
    { kind: "openBalance" as const, accounts: [account("cash", Number.MAX_SAFE_INTEGER)], accountId: "cash", amountCents: 1 },
  ]) {
    const result = preview(input);
    assert.ok(result.error);
    assert.deepEqual(result.rows, []);
  }
});

test("new account and incomplete amount show honest nonnumeric guidance", () => {
  const result = preview({ kind: "saveAccount", amountCents: null });
  assert.deepEqual(result.rows, []);
  assert.equal(result.error, null);
  assert.match(result.notes.join(" "), /0|sıfır/i);
  const empty = preview({ amountCents: null });
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.error, null);
});
