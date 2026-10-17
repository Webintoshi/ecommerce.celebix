"use client";

import {createContext,useContext,type ReactNode} from "react";
import Link from "next/link";
import styles from "./accounting.module.css";

const sections = [
  ["overview", "/accounting", "Özet"],
  ["receivables", "/accounting/receivables", "Müşteri borçları"],
  ["profitability", "/accounting/profitability", "Gelir ve kâr"],
  ["commissions", "/accounting/commissions", "Primler"],
  ["suppliers", "/accounting/suppliers", "Tedarikçi borçları"],
  ["accounts", "/accounting/accounts", "Kasa ve banka"],
  ["cash-sessions", "/accounting/cash-sessions", "Kasa sayımı"],
  ["expenses", "/accounting/expenses", "Giderler"],
  ["settings", "/accounting/settings", "İşletme bilgileri"],
  ["invoicing-integration", "/accounting/invoicing-integration", "Fatura bağlantıları"],
] as const;

const CommissionVisibility = createContext(false);
export function AccountingNavigationProvider({commissionsAvailable,children}:{commissionsAvailable:boolean;children:ReactNode}){return <CommissionVisibility.Provider value={commissionsAvailable}>{children}</CommissionVisibility.Provider>;}

export function AccountingNavigation({ active, collectionOnly = false }: {
  active: (typeof sections)[number][0];
  collectionOnly?: boolean;
}) {
  const commissionsAvailable=useContext(CommissionVisibility);
  return <nav className={styles.tabs} aria-label="Muhasebe bölümleri">
    {sections.filter(([key]) => (!collectionOnly || key === "receivables") && (key!=="commissions" || commissionsAvailable)).map(([key, href, label]) =>
      <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
