"use client";

import Link from "next/link";
import { ArrowRight, Ruler, Tags } from "lucide-react";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CATALOG_EXTRA_TYPES } from "./registry";
import styles from "./extras.module.css";

export function CatalogExtraTypeChooser({ canManage }: { canManage: boolean }) {
  return <PanelPageShell><PanelPageHeader title="Yeni ekstra" /><h1 className={styles.srOnly}>Yeni ekstra</h1>
    {!canManage ? <p className={styles.error} role="alert">Bu katalog işlemi için yetkiniz yok.</p> : <section className={styles.typeChoices} aria-label="Ekstra türü">
      {CATALOG_EXTRA_TYPES.map((entry) => <Link className={styles.typeChoice} href={entry.createHref} key={entry.type}>
        {entry.type === "size_guide" ? <Ruler aria-hidden="true" /> : <Tags aria-hidden="true" />}
        <span><strong>{entry.label}</strong><small>{entry.description}</small></span><ArrowRight aria-hidden="true" />
      </Link>)}
    </section>}
    <Link className={styles.backLink} href="/products/extras">Vazgeç</Link>
  </PanelPageShell>;
}
