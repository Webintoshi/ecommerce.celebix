import Link from "next/link";
import styles from "./accounting.module.css";

const sections = [
  ["overview", "/accounting", "Özet"],
  ["receivables", "/accounting/receivables", "Müşteri borçları"],
  ["profitability", "/accounting/profitability", "Gelir ve kâr"],
  ["suppliers", "/accounting/suppliers", "Tedarikçi borçları"],
  ["accounts", "/accounting/accounts", "Kasa ve banka"],
  ["cash-sessions", "/accounting/cash-sessions", "Kasa sayımı"],
  ["expenses", "/accounting/expenses", "Giderler"],
  ["settings", "/accounting/settings", "İşletme bilgileri"],
  ["invoicing-integration", "/accounting/invoicing-integration", "Fatura bağlantıları"],
] as const;

export function AccountingNavigation({ active, collectionOnly = false }: {
  active: (typeof sections)[number][0];
  collectionOnly?: boolean;
}) {
  return <nav className={styles.tabs} aria-label="Muhasebe bölümleri">
    {sections.filter(([key]) => !collectionOnly || key === "receivables").map(([key, href, label]) =>
      <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
