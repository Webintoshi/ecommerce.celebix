"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import type { PanelClientChromeModel } from "@/lib/panel-ui/client-chrome-model";
import styles from "./fixture.module.css";

export const SIDEBAR_SCENARIOS = ["logo", "no-logo", "broken-logo", "long-name", "multi", "cashier"] as const;
export type SidebarScenario = typeof SIDEBAR_SCENARIOS[number];

function modelFor(state: SidebarScenario): PanelClientChromeModel {
  return {
    storeSlug: "alpler-spor-local-qa",
    storeDisplayName: state === "long-name" ? "Alpler Spor Outdoor, Kamp ve Doğa Sporları Mağazası" : "Alpler Spor",
    storeLogoUrl: state === "no-logo" ? null : state === "broken-logo" ? "/mira-sidebar-assets/broken-logo.svg" : "/mira-sidebar-assets/alpler-logo-navy.png",
    membershipLabel: state === "cashier" ? "Kasiyer" : "Mağaza sahibi",
    navigationMode: state === "cashier" ? "register" : undefined,
    analyticsAvailable: state !== "cashier",
    planCode: "growth", planVersion: 3, entitlementStatus: "active", locale: "tr-TR",
    ...(state === "multi" ? {
      activeStoreSelectionKey: "alpler-local",
      storeOptions: [
        { selectionKey: "alpler-local", displayName: "Alpler Spor" },
        { selectionKey: "siora-local", displayName: "Butik Siora" },
        { selectionKey: "guzide-local", displayName: "Güzide Kuyumcu" },
      ],
    } : {}),
  };
}

/** Real panel chrome, synthetic local content, and no live transport or form mutations. */
export function SidebarApprovedFixture({ state }: { state: SidebarScenario }) {
  const [ready, setReady] = useState(false);
  const [blockedForms, setBlockedForms] = useState(0);
  useEffect(() => {
    const previousFetch = window.fetch;
    const calls: { method: string; path: string; blocked: boolean }[] = [];
    const interceptedFetch: typeof window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const api = url.pathname.startsWith("/api/");
      const blocked = url.origin !== window.location.origin || !["GET", "HEAD"].includes(method) || api;
      calls.push({ method, path: url.pathname, blocked });
      if (blocked) return Promise.resolve(Response.json({ code: "local_fixture_transport_only", message: "Yerel önizlemede canlı işlem kapalı." }, { status: api && ["GET", "HEAD"].includes(method) ? 503 : 403 }));
      return previousFetch(input, init);
    };
    window.fetch = interceptedFetch;
    (window as unknown as { __CELEBIX_SIDEBAR_QA__: unknown }).__CELEBIX_SIDEBAR_QA__ = { state, model: modelFor(state), calls, liveWrites: false };
    setReady(true);
    return () => {
      if (window.fetch === interceptedFetch) window.fetch = previousFetch;
      delete (window as unknown as { __CELEBIX_SIDEBAR_QA__?: unknown }).__CELEBIX_SIDEBAR_QA__;
    };
  }, [state]);

  function blockForm(event: FormEvent<HTMLDivElement>) {
    event.preventDefault(); event.stopPropagation(); setBlockedForms((count) => count + 1);
  }

  return <div className={styles.root} onSubmitCapture={blockForm} data-evidence="mira-sidebar-approved-local-fixture" data-qa-state={state} data-qa-ready={ready} data-qa-blocked-forms={blockedForms}>
    {ready ? <PanelLayoutClient model={modelFor(state)}>
      <h1 className={styles.srOnly}>Panel menüsü önizlemesi</h1>
      <section className={styles.content} aria-label="Yerel katalog önizlemesi">
        <div className={styles.toolbar}><input aria-label="Ürün ara" placeholder="Ürün, SKU veya barkod ara" /><button type="button">Yeni ürün</button></div>
        <div className={styles.metrics}>
          <div><span>Toplam ürün</span><strong>148</strong></div><div><span>Yayında</span><strong>126</strong></div><div><span>Taslak</span><strong>22</strong></div>
        </div>
        <div className={styles.list} aria-label="Örnek ürünler">
          <div className={styles.row}><span className={styles.thumbnail} aria-hidden="true">A</span><span><strong>Outdoor kamp çantası</strong><small>ALP-001</small></span><strong>₺1.490,00</strong><span>24 adet</span></div>
          <div className={styles.row}><span className={styles.thumbnail} aria-hidden="true">A</span><span><strong>Su geçirmez trekking ayakkabısı</strong><small>ALP-002</small></span><strong>₺2.790,00</strong><span>18 adet</span></div>
          <div className={styles.row}><span className={styles.thumbnail} aria-hidden="true">A</span><span><strong>Hafif günlük mont</strong><small>ALP-003</small></span><strong>₺1.990,00</strong><span>32 adet</span></div>
        </div>
      </section>
    </PanelLayoutClient> : <p role="status">Yerel önizleme hazırlanıyor…</p>}
  </div>;
}
