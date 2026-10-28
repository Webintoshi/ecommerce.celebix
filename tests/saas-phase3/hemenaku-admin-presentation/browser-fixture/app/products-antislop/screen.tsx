"use client";

import { useEffect, useState, type ComponentType, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { MODEL } from "../mira-catalog/catalog-fixture";
import { createProductsFixtureFetchBridge, createProductsFixtureTransport, type ProductsFixtureTransport, type ProductsScenario } from "./transport";

type ConsoleProps = { canManage: boolean; canArchive: boolean; canDelete: boolean; canImport: boolean };
type Modules = { Layout: ComponentType<{ model: typeof MODEL; children: ReactNode }>; Console: ComponentType<ConsoleProps> };
type Snapshot = ReturnType<ProductsFixtureTransport["snapshot"]>;
let browserBridge: ReturnType<typeof createProductsFixtureFetchBridge> | undefined;

/** Product and ranking API singletons are imported only after the local bridge is active. */
export function ProductsAntislopFixture({ state }: { state: ProductsScenario }) {
  const [modules, setModules] = useState<Modules>();
  const [transport, setTransport] = useState<ProductsFixtureTransport>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    let mounted = true;
    const priorFetch = window.fetch;
    const local = createProductsFixtureTransport({ state, origin: window.location.origin });
    browserBridge ??= createProductsFixtureFetchBridge({ origin: window.location.origin, frameworkFetch: priorFetch.bind(window) });
    const bridge = browserBridge;
    const release = bridge.activate(local);
    const unsubscribe = local.subscribe(() => { if (mounted) setSnapshot(local.snapshot()); });
    window.fetch = bridge.fetch;
    setTransport(local);
    setSnapshot(local.snapshot());
    void Promise.all([import("@/components/panel/PanelLayoutClient"), import("@/components/catalog/ProductListConsole")])
      .then(([layout, console]) => { if (mounted) setModules({ Layout: layout.PanelLayoutClient, Console: console.ProductListConsole }); })
      .catch(() => { if (mounted) setFailure(true); });
    return () => {
      mounted = false;
      unsubscribe();
      const released = release();
      if (released && window.fetch === bridge.fetch) window.fetch = priorFetch;
    };
  }, [state]);

  function recoverOnRetry(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (anchor && new URL(anchor.href, window.location.href).origin !== window.location.origin) {
      event.preventDefault();
      event.stopPropagation();
      void transport?.fetch(anchor.href);
      return;
    }
    const button = (event.target as HTMLElement).closest("button");
    const label = button?.textContent?.trim() ?? "";
    if (/^(?:Tekrar dene|Yeniden dene|Yeniden yükle|Kategorileri yenile|Silme etkilerini yeniden yükle)$/.test(label)) transport?.recover();
  }
  function preventSessionWrites(event: FormEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLFormElement && /\/api\/session\/(?:logout|switch)/.test(event.target.action)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  const counters = <aside aria-label="Yerel QA senaryosu" data-qa-scenario={state} data-api-reads={snapshot?.apiReads ?? 0} data-local-writes={snapshot?.localWrites ?? 0} data-live-writes="0" data-blocked-requests={snapshot?.blockedRequests ?? 0} data-failed-requests={snapshot?.failedRequests ?? 0} data-pending-requests={snapshot?.pendingRequests ?? 0} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "12px", color: "var(--cp-text-secondary)", fontSize: "12px", lineHeight: 1.5 }}>
    <span>Senaryo: {state}. Örnek veriler, canlı yazma: 0.</span>
    <span>API okuma: {snapshot?.apiReads ?? 0}. Yerel yazma: {snapshot?.localWrites ?? 0}. Engellenen: {snapshot?.blockedRequests ?? 0}.</span>
    {state === "loading" && (snapshot?.pendingRequests ?? 0) > 0 ? <button className="button button-secondary" type="button" onClick={() => transport?.recover()}>Yükleme senaryosunu tamamla</button> : null}
  </aside>;
  const content = modules ? (() => {
    const { Layout, Console } = modules;
    const writable = state !== "readonly";
    return <Layout model={MODEL}>{counters}<Console canManage={writable} canArchive={writable} canDelete={writable} canImport={writable} /></Layout>;
  })() : <div style={{ padding: "16px" }}>{counters}<p role={failure ? "alert" : "status"}>{failure ? "Yerel ürün senaryosu açılamadı." : "Yerel ürün senaryosu hazırlanıyor…"}</p></div>;
  return <div data-fixture="products-antislop" data-evidence="products-antislop-local-fixture" data-qa-state={state} data-qa-ready={Boolean(modules)} onClickCapture={recoverOnRetry} onSubmitCapture={preventSessionWrites}>{content}</div>;
}
