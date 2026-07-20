"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PanelActionButton, PanelMetricCard, PanelPageHeader, PanelPageShell, PanelPanel } from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { catalogApi, type CatalogDashboardSummary } from "@/lib/catalog-ui/client";
import { createPanelDashboardModel } from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

export function PanelDashboardHomeView() {
  const chrome = usePanelChromeModel();
  const [summary, setSummary] = useState<CatalogDashboardSummary>();
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState("loading");
    try {
      const value = await catalogApi.getDashboardSummary();
      if (sequence !== requestSequence.current) return;
      setSummary(value);
      setState("loaded");
    } catch {
      if (sequence !== requestSequence.current) return;
      setSummary(undefined);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const dashboard = createPanelDashboardModel(chrome, summary);
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={dashboard.title}
        description={dashboard.description}
        actions={<PanelActionButton href="/products/new" primary>Yeni ürün</PanelActionButton>}
      />
      <div className={styles.cardGrid}>
        {dashboard.cards.map((card) => (
          <PanelMetricCard
            key={card.key}
            label={card.label}
            value={card.value}
            detail={card.detail ?? card.status}
          />
        ))}
      </div>
      <PanelPanel>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Katalog özeti</h2>
            <p>Paylaşılan katalogdaki güncel ürün ve stok görünümü.</p>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => { void load(); }}
            disabled={state === "loading"}
            aria-label="Katalog özetini yenile"
          >
            Yenile
          </button>
        </div>
        {state === "loading" ? (
          <div className={styles.cardGrid} role="status" aria-label="Katalog özeti yükleniyor">
            {Array.from({ length: 4 }, (_, index) => (
              <article className={styles.skeletonCard} aria-hidden="true" key={index}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
          </div>
        ) : null}
        {state === "error" ? (
          <div className={styles.errorState} role="alert">
            <p>Katalog özeti şu anda yüklenemiyor.</p>
            <button type="button" onClick={() => { void load(); }}>Tekrar dene</button>
          </div>
        ) : null}
        {state === "loaded" ? (
          <>
            <div className={styles.cardGrid}>
              {dashboard.catalogCards.map((card) => (
                <PanelMetricCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                />
              ))}
            </div>
            {dashboard.catalogReadiness ? (
              <p className={styles.readinessLine}>{dashboard.catalogReadiness.detail}</p>
            ) : null}
          </>
        ) : null}
      </PanelPanel>
      <PanelPanel title="Hızlı işlemler">
        <div className={styles.actionRail}>
          {dashboard.actions.map((action) => (
            <PanelActionButton key={action.href} href={action.href}>{action.label}</PanelActionButton>
          ))}
        </div>
      </PanelPanel>
    </PanelPageShell>
  );
}
