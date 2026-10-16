import assert from "node:assert/strict";
import test from "node:test";
import { compile, mounted } from "../../lib/mira-final-test-support.ts";

const { AccountingOverviewDashboard, signedChartLayout } = compile("components/accounting/AccountingOverviewDashboard.tsx");
const summary = (currency = "TRY") => ({ currency, salesCents: 20000, collectionsCents: 10000, expensesCents: 4000, refundsCents: 1000, returnCents: 2500, commissionCents: 200, recordedWebPaymentsCents: 6000, dueCents: 9000, overdueCents: 3000, refundDueCents: 500 });
const account = (id: string, currency: string, balanceCents: number) => ({ id, name: id, currency, balanceCents, type: "bank", active: true, version: 1 });

test("signed chart geometry preserves negative reversals, zero and relative magnitudes", () => {
  const mixed = signedChartLayout([200, -100, 0]);
  assert.ok(Math.abs(mixed.zero - 100 / 3) < 1e-10);
  assert.equal(mixed.negative, true);
  assert.equal(mixed.bars[0].left, mixed.zero);
  assert.ok(Math.abs(mixed.bars[0].width - 200 / 3) < 1e-10);
  assert.deepEqual(mixed.bars[1], { left: 0, width: mixed.zero });
  assert.deepEqual(mixed.bars[2], { left: mixed.zero, width: 0 });
  const zero = signedChartLayout([0, 0]);
  assert.equal(zero.zero, 0);
  assert.ok(zero.bars.every((bar: any) => bar.left === 0 && bar.width === 0));
  assert.deepEqual(signedChartLayout([-50, -100]).bars, [{ left: 50, width: 50 }, { left: 0, width: 100 }]);
});

test("overview retains every authoritative period and current value with separate currency scales", async () => {
  const trySummary = summary(), usdSummary = { ...summary("USD"), salesCents: -500, collectionsCents: 1000 };
  await mounted(AccountingOverviewDashboard, { overview: { currencies: [trySummary, usdSummary], accounts: [account("TL hesabı", "TRY", 20000), account("Dolar hesabı", "USD", -100)], recentEvents: [] } }, async host => {
    const groups = host.querySelectorAll('[data-period-currency]');
    assert.equal(groups.length, 2);
    assert.equal(groups[0].querySelectorAll("dl > div").length, 7);
    assert.equal(groups[1].querySelectorAll("dl > div").length, 7);
    assert.equal(groups[0].querySelector('[data-chart-bar]').style.width, "100%");
    assert.ok(Number.parseFloat(groups[1].querySelector('[data-chart-bar]').style.width) < 34);
    assert.match(groups[1].textContent, /-.*5/);
    assert.equal(host.querySelectorAll('[data-debt-currency] dl > div').length, 6);
    assert.equal(host.querySelectorAll('[data-account-currency]').length, 2);
    assert.match(host.textContent, /Bankadan doğrulanmaz/);
    const info = host.querySelector("details");
    assert.equal(info.open, false);
    assert.match(info.textContent, /tarih filtresinden bağımsızdır/i);
    assert.match(info.textContent, /Kanal ve para birimi/);
    assert.equal(host.querySelectorAll("button").length, 0);
  });
});
test("overview keeps settlement discounts separate from collected cash", async () => {
 await mounted(AccountingOverviewDashboard,{overview:{currencies:[{...summary(),discountCents:4000}],accounts:[],recentEvents:[]}},async host=>{
  const period=host.querySelector('[data-period-currency]');assert.match(period.textContent,/İskonto.*40,00/);assert.match(period.textContent,/Alınan ödeme.*100,00/);
 });
});

test("no period summary never hides existing current accounts or fabricates zero debt", async () => {
  await mounted(AccountingOverviewDashboard, { overview: { currencies: [], accounts: [account("Kasa", "TRY", 2300)], recentEvents: [] } }, async host => {
    assert.match(host.textContent, /Bu dönemde hareket yok/);
    assert.match(host.textContent, /Kasa/);
    assert.equal(host.querySelector('[data-debt-currency]'), null);
    assert.match(host.querySelector('a[href="/accounting/accounts"]').textContent, /Hesaplar/);
  });
});

test("an empty overview offers account setup and an all-zero overview draws no false activity", async () => {
  await mounted(AccountingOverviewDashboard, { overview: { currencies: [], accounts: [], recentEvents: [] } }, async host => {
    assert.equal(host.querySelectorAll('a[href="/accounting/accounts"]').length, 1);
    assert.match(host.textContent, /İlk hesabı ekle/);
  });
  const zero = Object.fromEntries(Object.entries(summary()).map(([key, value]) => [key, key === "currency" ? value : 0]));
  await mounted(AccountingOverviewDashboard, { overview: { currencies: [zero], accounts: [account("Kasa", "TRY", 0)], recentEvents: [] } }, async host => {
    assert.equal(host.querySelectorAll('[data-chart-bar]').length, 5);
    assert.ok([...host.querySelectorAll('[data-chart-bar]')].every((bar: any) => bar.style.width === "0%"));
    assert.equal(host.querySelectorAll("dd").length, 11);
  });
});
