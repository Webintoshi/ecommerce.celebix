import type { AccountingAccount, AccountingCustomerAccount, AccountingEvent, AccountingMutation, AccountingReceivable } from "@celebix/saas-contracts";

export type AccountingEffectInput = {
  kind: AccountingMutation;
  amountCents: number | null;
  commissionCents?: number | null;
  currency: string;
  accounts: readonly AccountingAccount[];
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  customerAccount?: AccountingCustomerAccount | null;
  selectedDebt?: AccountingReceivable | null;
  selectedEvent?: AccountingEvent | null;
  orderId?: string | null;
};

export type AccountingEffectRow = {
  readonly label: string;
  readonly currency: string;
  readonly beforeCents: number | null;
  readonly changeCents: number;
  readonly afterCents: number | null;
};

export type AccountingEffectPreview = {
  readonly rows: readonly AccountingEffectRow[];
  readonly notes: readonly string[];
  readonly error: string | null;
};

const MAX_MONEY = BigInt(Number.MAX_SAFE_INTEGER);
const ZERO = BigInt(0);
const REVERSE_KINDS = new Set(["collection", "opening_debt", "account_opening", "expense", "transfer", "card_settlement", "return_credit", "refund"]);

function money(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Geçerli bir tutar gir.");
  return value;
}

function safe(value: bigint): number {
  if (value < ZERO || value > MAX_MONEY) throw new Error("Tutar hesap sınırını aşıyor.");
  return Number(value);
}

function changed(before: number, delta: number): number {
  const next = BigInt(money(before)) + BigInt(delta);
  if (next < ZERO) throw new Error("Hesap bakiyesi bu işlem için yeterli değil.");
  return safe(next);
}

function balances(debt: AccountingReceivable): { due: number; refund: number } {
  const sale = BigInt(money(debt.saleCents));
  const collected = BigInt(money(debt.collectedCents));
  const returned = BigInt(money(debt.returnCents));
  const refunded = BigInt(money(debt.refundedCents));
  const refundBeforePayment = collected - sale + returned;
  if (returned > sale || refunded > (refundBeforePayment > ZERO ? refundBeforePayment : ZERO)) {
    throw new Error("Borç ve iade bilgilerini yenileyip tekrar dene.");
  }
  const due = sale - returned - collected;
  const refund = refundBeforePayment - refunded;
  return { due: safe(due > ZERO ? due : ZERO), refund: safe(refund > ZERO ? refund : ZERO) };
}

// This is a local display projection. The existing mutation still checks the current
// versions, permissions and committed balances when the user saves.
export function previewAccountingEffects(input: AccountingEffectInput): AccountingEffectPreview {
  const rows: AccountingEffectRow[] = [];
  const notes: string[] = [];
  const note = (value: string) => { if (!notes.includes(value)) notes.push(value); };
  const result = (error: string | null = null): AccountingEffectPreview => ({ rows: error ? [] : rows, notes, error });

  try {
    if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Geçerli bir para birimi seç.");
    const currencyMatches = (currency: string) => {
      if (currency !== input.currency) throw new Error("Her para birimi için ayrı işlem kaydet.");
    };
    const addRow = (label: string, beforeCents: number | null, changeCents: number) => {
      if (!Number.isSafeInteger(changeCents)) throw new Error("Tutar hesap sınırını aşıyor.");
      rows.push({ label, currency: input.currency, beforeCents, changeCents, afterCents: beforeCents === null ? null : changed(beforeCents, changeCents) });
    };
    const findAccount = (id: string | undefined | null) => {
      const account = id ? input.accounts.find(item => item.id === id) : undefined;
      if (account) { currencyMatches(account.currency); money(account.balanceCents); }
      return account;
    };
    const accountEffect = (id: string | undefined | null, delta: number, fallback = "Seçilecek hesap") => {
      const account = findAccount(id);
      addRow(account?.name ?? fallback, account?.balanceCents ?? null, delta);
      if (!account) note("Hesabın güncel bakiyesi bilinmiyor; yalnızca para hareketi gösteriliyor.");
    };
    let checkedCustomer: AccountingCustomerAccount | undefined;
    const customer = () => {
      if (!input.customerAccount) return undefined;
      if (checkedCustomer) return checkedCustomer;
      const value = input.customerAccount;
      currencyMatches(value.currency);
      let due = ZERO;
      let refund = ZERO;
      const ids = new Set<string>();
      for (const debt of value.receivables) {
        currencyMatches(debt.currency);
        if (debt.customerId !== value.customerId || ids.has(debt.id)) throw new Error("Müşteri borç bilgilerini yenileyip tekrar dene.");
        ids.add(debt.id);
        const balance = balances(debt);
        due += BigInt(balance.due);
        refund += BigInt(balance.refund);
      }
      if (safe(due) !== money(value.dueCents) || safe(refund) !== money(value.refundDueCents)) {
        throw new Error("Müşteri borç bilgilerini yenileyip tekrar dene.");
      }
      checkedCustomer = value;
      return value;
    };
    const selectedDebt = () => {
      const value = customer();
      const selected = input.selectedDebt;
      if (selected) {
        currencyMatches(selected.currency);
        if (input.orderId && selected.orderId !== input.orderId) throw new Error("İşlem yapılacak satışı tekrar seç.");
        if (value && selected.customerId !== value.customerId) throw new Error("Satış ve müşteri bilgileri uyuşmuyor.");
        return value?.receivables.find(item => item.id === selected.id) ?? selected;
      }
      return input.orderId ? value?.receivables.find(item => item.orderId === input.orderId) : undefined;
    };
    const debtEffects = (beforeDebt: AccountingReceivable, afterDebt: AccountingReceivable, onlyRefund = false) => {
      const before = balances(beforeDebt);
      const after = balances(afterDebt);
      const value = customer();
      const fullCustomer = value?.receivables.some(item => item.id === beforeDebt.id);
      if (!onlyRefund) addRow(fullCustomer ? "Müşterinin kalan borcu" : "Satışın kalan borcu", fullCustomer ? value!.dueCents : before.due, after.due - before.due);
      addRow(fullCustomer ? "Müşteriye iade edilecek" : "Satış için iade edilecek", fullCustomer ? value!.refundDueCents : before.refund, after.refund - before.refund);
      if (!fullCustomer) note("Borç ve iade tutarları bu satış içindir; müşterinin diğer kayıtlarını içermez.");
    };

    if (input.kind === "saveAccount") {
      note("Yeni hesap 0 bakiye ile açılır. Başlangıç parasını ayrıca ekleyebilirsin.");
      return result();
    }

    if (input.kind === "reverse") {
      const original = input.selectedEvent;
      if (!original) { note("Etkisini görmek için düzeltilecek kaydı seç."); return result(); }
      currencyMatches(original.currency);
      const amount = money(original.amountCents);
      if (!REVERSE_KINDS.has(original.kind) || original.reversed || original.reversesEventId) throw new Error("Bu kayıt tekrar düzeltilemez.");
      const manualPart = typeof original.metadata.saleId === "string" && typeof original.metadata.partId === "string";
      if (manualPart && (original.metadata.pendingSale === true || typeof original.metadata.saleStatus === "string" && original.metadata.saleStatus !== "completed" || original.allocations.length === 0 && original.metadata.saleStatus !== "completed")) {
        throw new Error("Bu ödeme için satış ekranındaki işlemi tamamla.");
      }
      note("İlk kayıt geçmişte kalır; bu işlem onun etkisini geri alan bir düzeltme kaydı ekler.");
      const affectsDebt = ["collection", "opening_debt", "return_credit", "refund"].includes(original.kind);
      if (affectsDebt) {
        const value = customer();
        if (value && original.customerId && original.customerId !== value.customerId) throw new Error("Kayıt ve müşteri bilgileri uyuşmuyor.");
        const suppliedDebt = input.selectedDebt;
        if (suppliedDebt) currencyMatches(suppliedDebt.currency);
        const knownDebts = value?.receivables ?? (suppliedDebt ? [suppliedDebt] : []);
        const allocations = original.allocations;
        const ids = new Set<string>();
        let allocated = ZERO;
        for (const allocation of allocations) {
          if (money(allocation.amountCents) === 0 || ids.has(allocation.receivableId)) throw new Error("Kaydın borç dağılımını yenileyip tekrar dene.");
          ids.add(allocation.receivableId);
          allocated += BigInt(allocation.amountCents);
        }
        if (allocations.length && safe(allocated) !== amount) throw new Error("Kaydın borç dağılımını yenileyip tekrar dene.");
        const complete = allocations.length > 0 && allocations.every(allocation => knownDebts.some(debt => debt.id === allocation.receivableId));
        if (complete) {
          let dueDelta = ZERO;
          let refundDelta = ZERO;
          for (const allocation of allocations) {
            const debt = knownDebts.find(item => item.id === allocation.receivableId)!;
            currencyMatches(debt.currency);
            const before = balances(debt);
            if (original.kind === "opening_debt" && (debt.collectedCents > 0 || debt.returnCents > 0)) throw new Error("Ödeme alınmış eski borç bu işlemle kaldırılamaz.");
            const afterDebt = {
              ...debt,
              saleCents: original.kind === "opening_debt" ? debt.saleCents - allocation.amountCents : debt.saleCents,
              collectedCents: original.kind === "collection" ? debt.collectedCents - allocation.amountCents : debt.collectedCents,
              returnCents: original.kind === "return_credit" ? debt.returnCents - allocation.amountCents : debt.returnCents,
              refundedCents: original.kind === "refund" ? debt.refundedCents - allocation.amountCents : debt.refundedCents,
            };
            const after = balances(afterDebt);
            dueDelta += BigInt(after.due) - BigInt(before.due);
            refundDelta += BigInt(after.refund) - BigInt(before.refund);
          }
          if (dueDelta < -MAX_MONEY || dueDelta > MAX_MONEY || refundDelta < -MAX_MONEY || refundDelta > MAX_MONEY) throw new Error("Tutar hesap sınırını aşıyor.");
          const scope = value ?? suppliedDebt!;
          const before = value ? { due: value.dueCents, refund: value.refundDueCents } : balances(scope as AccountingReceivable);
          addRow(value ? "Müşterinin kalan borcu" : "Satışın kalan borcu", before.due, Number(dueDelta));
          addRow(value ? "Müşteriye iade edilecek" : "Satış için iade edilecek", before.refund, Number(refundDelta));
          if (!value) note("Borç ve iade tutarları bu satış içindir; müşterinin diğer kayıtlarını içermez.");
        } else {
          note("Dağıtılan borçların tamamı bilinmediği için müşteri borcunun sonucu gösterilemiyor.");
        }
      }
      if (["collection", "account_opening"].includes(original.kind)) accountEffect(original.accountId, -amount);
      else if (["expense", "refund"].includes(original.kind)) accountEffect(original.accountId, amount);
      else if (["transfer", "card_settlement"].includes(original.kind)) {
        const targetId = typeof original.metadata.toAccountId === "string" ? original.metadata.toAccountId : undefined;
        if (targetId && targetId === original.accountId) throw new Error("Kaynak ve hedef hesap farklı olmalı.");
        accountEffect(original.accountId, amount, "Kaynak hesap");
        if (original.kind === "transfer") accountEffect(targetId, -amount, "Hedef hesap");
        else {
          const { grossCents, netCents, commissionCents } = original.metadata;
          if (typeof grossCents === "number" && typeof netCents === "number" && typeof commissionCents === "number") {
            if (money(grossCents) !== amount || money(commissionCents) > amount || money(netCents) !== amount - commissionCents) throw new Error("Kart aktarımının net tutarını yenileyip tekrar dene.");
            accountEffect(targetId, -netCents, "Banka hesabı");
            note("Kart aktarımıyla birlikte kaydedilen komisyonun etkisi de geri alınır.");
          } else note("Bankaya geçen net tutar bilinmediği için hedef hesap etkisi gösterilemiyor.");
        }
      }
      return result();
    }

    if (input.amountCents === null) { note("Etkisini görmek için tutarı gir."); return result(); }
    const amount = money(input.amountCents);
    if (amount === 0 && input.kind !== "openBalance") throw new Error("Sıfırdan büyük bir tutar gir.");

    switch (input.kind) {
      case "collect": {
        const value = customer();
        const selected = selectedDebt();
        if (value) {
          const scoped = input.orderId ? value.receivables.filter(debt => debt.orderId === input.orderId) : value.receivables;
          const available = scoped.reduce((sum, debt) => sum + BigInt(balances(debt).due), ZERO);
          if (BigInt(amount) > available) throw new Error("Tahsilat kalan borcu aşamaz.");
          addRow("Müşterinin kalan borcu", value.dueCents, -amount);
        } else if (selected) {
          const due = balances(selected).due;
          if (amount > due) throw new Error("Tahsilat satışın kalan borcunu aşamaz.");
          addRow("Satışın kalan borcu", due, -amount);
          note("Kalan borç bu satış içindir; müşterinin diğer kayıtlarını içermez.");
        } else {
          addRow("Müşterinin kalan borcu", null, -amount);
          note("Müşterinin güncel borcu bilinmiyor; yalnızca tahsilat etkisi gösteriliyor.");
        }
        accountEffect(input.accountId, amount);
        break;
      }
      case "openingDebt": {
        addRow("Müşterinin kalan borcu", customer()?.dueCents ?? null, amount);
        if (!input.customerAccount) note("Müşterinin güncel borcu bilinmiyor; yalnızca eklenecek tutar gösteriliyor.");
        note("Önceden kalan borç satış geliri ve stok hareketi oluşturmaz.");
        break;
      }
      case "openBalance":
        accountEffect(input.accountId, amount);
        note("Girilen tutar mevcut bakiyeye eklenir.");
        break;
      case "expense":
        accountEffect(input.accountId, -amount);
        break;
      case "transfer":
      case "settleCard": {
        if (input.kind === "settleCard" && input.commissionCents === null) {
          note("Bankaya geçecek net tutarı görmek için komisyonu gir. Komisyon yoksa 0 yaz.");
          break;
        }
        if (input.fromAccountId && input.fromAccountId === input.toAccountId) throw new Error("Kaynak ve hedef hesap farklı olmalı.");
        const source = findAccount(input.fromAccountId);
        const target = findAccount(input.toAccountId);
        const commission = input.kind === "settleCard" ? money(input.commissionCents ?? 0) : 0;
        if (commission > amount) throw new Error("Komisyon aktarılan tutarı aşamaz.");
        if (input.kind === "settleCard" && (source && source.type !== "card" || target && target.type !== "bank")) throw new Error("Kart hesabından banka hesabına aktarım seç.");
        accountEffect(input.fromAccountId, -amount, "Kaynak hesap");
        accountEffect(input.toAccountId, amount - commission, "Hedef hesap");
        if (input.kind === "settleCard") note("Komisyon brüt tutarın içinden düşülür; bankaya net tutar geçer.");
        break;
      }
      case "returnCredit": {
        const debt = selectedDebt();
        if (!debt) { note("Borç ve iade etkisini görmek için satış bilgilerini aç."); break; }
        if (amount > debt.saleCents - debt.returnCents) throw new Error("İade tutarı satışın kalan tutarını aşamaz.");
        debtEffects(debt, { ...debt, returnCents: changed(debt.returnCents, amount) });
        note("Bu kayıt satışın borç ve iade tutarını değiştirir; stok hareketi ayrıca kaydedilir.");
        break;
      }
      case "refund": {
        const debt = selectedDebt();
        if (debt) {
          if (amount > balances(debt).refund) throw new Error("Para iadesi kalan iade tutarını aşamaz.");
          debtEffects(debt, { ...debt, refundedCents: changed(debt.refundedCents, amount) }, true);
        } else {
          addRow("Müşteriye iade edilecek", null, -amount);
          note("Satışın kalan iade tutarı bilinmiyor; yalnızca para hareketi gösteriliyor.");
        }
        accountEffect(input.accountId, -amount);
        note("Parayı müşteriye geri verdiğinde bu kaydı kullan. Bu önizleme ödeme göndermez.");
        break;
      }
    }
    return result();
  } catch (error) {
    return result(error instanceof Error ? error.message : "İşlem etkisi hesaplanamadı.");
  }
}
