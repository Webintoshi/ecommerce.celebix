"use client";

import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { createStoreToolsFixtureTransport, type StoreToolsScenario } from "./fixture-transport";
export type { StoreToolsScenario } from "./fixture-transport";

/** Load the API singleton only after the memory-only fetch interceptor is installed. */
export function StoreToolsApprovedFixture({ state }: { state: StoreToolsScenario }) {
  const [Console, setConsole] = useState<ComponentType<{ canManage: boolean }> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    const priorFetch = window.fetch;
    const transport = createStoreToolsFixtureTransport({ state, origin: window.location.origin });
    const interceptedFetch: typeof window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.pathname.startsWith("/api/")) return transport.fetch(input, init);
      if (url.origin !== window.location.origin || !["GET", "HEAD"].includes(method)) return Promise.resolve(new Response("Local fixture request blocked", { status: 403 }));
      return priorFetch(input, init);
    };
    window.fetch = interceptedFetch;
    (window as unknown as { __CELEBIX_STORE_TOOLS_QA__: unknown }).__CELEBIX_STORE_TOOLS_QA__ = { state, snapshot: transport.snapshot };
    void import("@/components/settings/StoreToolsConsole").then(module => { if (mounted) setConsole(() => module.StoreToolsConsole); }).catch(() => { if (mounted) setFailed(true); });
    return () => {
      mounted = false;
      if (window.fetch === interceptedFetch) window.fetch = priorFetch;
      delete (window as unknown as { __CELEBIX_STORE_TOOLS_QA__?: unknown }).__CELEBIX_STORE_TOOLS_QA__;
    };
  }, [state]);
  function preventSessionWrites(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (form instanceof HTMLFormElement && /\/api\/session\/(logout|switch)/.test(form.action)) { event.preventDefault(); event.stopPropagation(); }
  }
  return <div style={{ display: "contents" }} onSubmitCapture={preventSessionWrites} data-evidence="mira-store-tools-approved-local-fixture" data-qa-state={state} data-qa-ready={!!Console}>
    <PanelLayoutClient model={{ storeSlug: "mira-store-tools-local-qa", storeDisplayName: "Güzide Kuyumcu", storeLogoUrl: null, membershipLabel: state === "readonly" ? "Görüntüleme yetkisi" : "Mağaza sahibi", analyticsAvailable: false, planCode: "growth", planVersion: 3, entitlementStatus: "active", locale: "tr-TR" }}>
      <SettingsWorkspace route="/settings/store-tools">
        {Console ? <Console canManage={state !== "readonly"} /> : <p role={failed ? "alert" : "status"}>{failed ? "Yerel önizleme açılamadı." : "Yerel önizleme hazırlanıyor…"}</p>}
      </SettingsWorkspace>
    </PanelLayoutClient>
  </div>;
}
