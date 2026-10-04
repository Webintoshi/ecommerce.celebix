"use client";
import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import workspaceStyles from "@/components/inventory/stock-workspace.module.css";
import overviewStyles from "@/components/inventory/stock-overview.module.css";
import consoleStyles from "@/components/inventory/inventory-console.module.css";
import { createStockFixtureTransport } from "./transport";

type Props = { canReadInventory: boolean; canManageInventory: boolean; canReadPurchasing: boolean; canManagePurchasing: boolean };
type FixtureState = "loaded" | "readonly" | "error";
type TestWindow = Window & { __stockWorkspaceFixture?: { state: FixtureState; transport: ReturnType<typeof createStockFixtureTransport> } };

export function StockWorkspaceFixture({ scenario }: { scenario: FixtureState }) {
  const [Screen, setScreen] = useState<ComponentType<Props> | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState(scenario);
  useEffect(() => {
    let mounted = true;
    const target = window as TestWindow;
    const selected = scenario === "loaded" && target.__stockWorkspaceFixture ? target.__stockWorkspaceFixture.state : scenario;
    setState(selected);
    if (!target.__stockWorkspaceFixture || target.__stockWorkspaceFixture.state !== selected) {
      target.__stockWorkspaceFixture = { state: selected, transport: createStockFixtureTransport(window.location.origin, selected) };
    }
    const previous = window.fetch;
    const intercepted: typeof fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.pathname.startsWith("/api/")) return target.__stockWorkspaceFixture!.transport.fetch(input, init);
      if (url.origin !== window.location.origin || !["GET", "HEAD"].includes(method)) return Promise.resolve(new Response("Local fixture blocked", { status: 403 }));
      return previous(input, init);
    };
    window.fetch = intercepted;
    void import("@/components/inventory/StockWorkspace").then((module) => { if (mounted) setScreen(() => module.StockWorkspace); }).catch(() => { if (mounted) setFailed(true); });
    return () => { mounted = false; if (window.fetch === intercepted) window.fetch = previous; };
  }, [scenario]);
  function blockSessionWrite(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (form instanceof HTMLFormElement && /\/api\/session\/(logout|switch)/.test(form.action)) event.preventDefault();
  }
  return <div data-style-witness={[workspaceStyles.workspace, overviewStyles.overview, consoleStyles.stack].join(" ")} data-evidence="isolated-stock-workspace" data-qa-ready={Boolean(Screen)} onSubmitCapture={blockSessionWrite}>
    <PanelLayoutClient model={{ storeSlug: "stock-local-qa", storeDisplayName: "Stok Önizleme", storeLogoUrl: null, membershipLabel: state === "readonly" ? "Görüntüleme" : "Mağaza sahibi", analyticsAvailable: false, planCode: "growth", planVersion: 3, entitlementStatus: "active", locale: "tr" }}>
      {Screen ? <Screen canReadInventory canReadPurchasing canManageInventory={state !== "readonly"} canManagePurchasing={state !== "readonly"} /> : <p role={failed ? "alert" : "status"}>{failed ? "Önizleme açılamadı." : "Önizleme hazırlanıyor…"}</p>}
    </PanelLayoutClient>
  </div>;
}
