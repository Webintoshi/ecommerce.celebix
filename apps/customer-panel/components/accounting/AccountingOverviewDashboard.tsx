import Link from "next/link";
import type { AccountingOverview } from "@celebix/saas-contracts";
import { ACCOUNT_TYPE_LABELS, accountingMoney as money } from "@/lib/accounting-ui/model";
import { AccountingEmptyState } from "./AccountingEmptyState";
import styles from "./AccountingOverviewDashboard.module.css";

// Presentation only: each currency has its own signed scale. No totals are derived.
export function signedChartLayout(values: readonly number[]) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const range = high - low;
  const zero = range ? -low / range * 100 : 0;
  return {
    zero, negative: low < 0,
    bars: values.map(value => {
      const position = range ? (value - low) / range * 100 : 0;
      return { left: Math.min(zero, position), width: Math.abs(position - zero) };
    }),
  };
}

function ChartRows({ rows, currency }: { rows: readonly { key: string; label: string; value: number; note?: string; accent?: boolean }[]; currency: string }) {
  const layout = signedChartLayout(rows.map(row => row.value));
  return <><dl className={styles.chart}>
    {rows.map((row, index) => <div className={styles.chartRow} key={row.key}>
      <dt>{row.label}{row.note ? <small>{row.note}</small> : null}</dt>
      <dd>{money(row.value, currency)}<span className={styles.track} aria-hidden="true">
        {layout.negative ? <i className={styles.zero} style={{ left: `${layout.zero}%` }} /> : null}
        <span data-chart-bar className={row.accent ? styles.accent : styles.bar} style={{ left: `${layout.bars[index].left}%`, width: `${layout.bars[index].width}%` }} />
      </span></dd>
    </div>)}
  </dl>{layout.negative ? <div className={styles.axis} aria-hidden="true"><span style={{ left: `${layout.zero}%` }}>0</span></div> : null}</>;
}

export function AccountingOverviewDashboard({ overview }: { overview: AccountingOverview }) {
  const groups = new Map<string, typeof overview.accounts[number][]>();
  for (const account of overview.accounts) {
    const group = groups.get(account.currency) ?? [];
    group.push(account);
    groups.set(account.currency, group);
  }
  const empty = !overview.currencies.length && !overview.accounts.length;
  return <div className={styles.dashboard}>
    {empty ? <AccountingEmptyState variant="overview" title="Bu dönemde muhasebe hareketi yok." action={<Link className={styles.link} href="/accounting/accounts">İlk hesabı ekle <span aria-hidden="true">↗</span></Link>} /> : <>
      <div className={styles.charts}>
        <section className={styles.period} aria-label="Seçili dönemin hareketleri">
          <header className={styles.header}><h2>Dönem hareketleri</h2><span>Seçili dönem</span></header>
          {overview.currencies.map(summary => <section className={styles.currency} key={summary.currency} data-period-currency={summary.currency} aria-label={`${summary.currency} dönem hareketleri`}>
            <h3>{summary.currency}</h3>
            <ChartRows currency={summary.currency} rows={[
              { key: "sales", label: "Satış", value: summary.salesCents },
              { key: "collections", label: "Alınan ödeme", value: summary.collectionsCents, accent: true },
              { key: "expenses", label: "Ödenmiş gider", value: summary.expensesCents },
              { key: "refunds", label: "Yapılan para iadesi", value: summary.refundsCents },
            ]} />
            <dl className={styles.secondary}>
              <div><dt>İade kaydı</dt><dd>{money(summary.returnCents, summary.currency)}</dd></div>
              <div><dt>Kart komisyonu</dt><dd>{money(summary.commissionCents, summary.currency)}</dd></div>
              <div><dt>Kayıtlı web ödemeleri</dt><dd>{money(summary.recordedWebPaymentsCents, summary.currency)}</dd></div>
            </dl>
          </section>)}
          {!overview.currencies.length ? <p className={styles.empty}>Bu dönemde hareket yok.</p> : null}
        </section>
        <section className={styles.accounts} aria-label="Güncel kayıtlı hesap bakiyeleri">
          <header className={styles.header}><h2>Kayıtlı hesaplar</h2><span>Güncel</span></header>
          {[...groups].map(([currency, accounts]) => <section key={currency} className={styles.currency} data-account-currency={currency} aria-label={`${currency} kayıtlı hesap bakiyeleri`}>
            <h3>{currency}</h3>
            <ChartRows currency={currency} rows={accounts.map(account => ({ key: account.id, label: account.name, note: ACCOUNT_TYPE_LABELS[account.type], value: account.balanceCents }))} />
          </section>)}
          {!overview.accounts.length ? <p className={styles.empty}>Henüz hesap yok.</p> : null}
          <footer className={styles.accountFooter}><span>Kayıtlara göre · Bankadan doğrulanmaz</span><Link className={styles.link} href="/accounting/accounts">Hesaplar <span aria-hidden="true">↗</span></Link></footer>
        </section>
      </div>
      {overview.currencies.map(summary => <section key={summary.currency} className={styles.debts} data-debt-currency={summary.currency} aria-label={`${summary.currency} güncel müşteri borçları`}>
        <header className={styles.debtHeader}><h2>Güncel borçlar</h2><span>{summary.currency}</span></header>
        <dl>
          <div><dt>Güncel müşteri borcu</dt><dd>{money(summary.dueCents, summary.currency)}</dd></div>
          <div><dt>Vadesi geçen borç</dt><dd>{money(summary.overdueCents, summary.currency)}</dd></div>
          <div><dt>İade ödenecek</dt><dd>{money(summary.refundDueCents, summary.currency)}</dd></div>
        </dl>
      </section>)}
    </>}
    <details className={styles.info}>
      <summary>Bilgi</summary>
      <ul>
        <li>Satışlar tamamlandığı, ödemeler alındığı tarihe göre gösterilir. Grafikler bağımsız tutarları karşılaştırır.</li>
        <li>Güncel borçlar ve hesap bakiyeleri tarih filtresinden bağımsızdır. Kanal ve para birimi filtreleri müşteri borçlarına uygulanır.</li>
        <li>Hesap bakiyeleri buraya girilen kayıtlara göredir; bankadaki güncel bakiye doğrulanmaz.</li>
      </ul>
    </details>
  </div>;
}

export function AccountingOverviewSkeleton() {
  return <div className={`${styles.charts} ${styles.skeleton}`} aria-hidden="true">
    {[4, 3].map((count, group) => <div key={group}><i className={styles.skeletonHeading} />{Array.from({ length: count }, (_, index) => <div className={styles.skeletonRow} key={index}><i /><b /><i /></div>)}</div>)}
  </div>;
}
