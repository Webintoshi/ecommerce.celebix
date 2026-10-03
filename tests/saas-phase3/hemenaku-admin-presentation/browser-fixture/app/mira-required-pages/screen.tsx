"use client";

import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CONTENT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { createRequiredPagesFixtureTransport, FIXTURE_STORE_ID, type RequiredPagesScenario } from "./fixture-transport";

type EditorProps = { storeId: string; kind: "page"; recordId?: string; returnTo: string; canManage: boolean; aiEnabled: boolean };
type ConsoleProps = { kind: "page"; canManage: boolean; embedded: boolean };
type Transport = ReturnType<typeof createRequiredPagesFixtureTransport>;
type FixtureWindow = Window & { __miraRequiredPagesLocal?: { transports: Map<RequiredPagesScenario, Transport>; active: Transport; state: RequiredPagesScenario } };

/** Production components plus a synthetic, fail-closed browser transport. */
export function RequiredPagesFixture({ state, view = "list", recordId }: { state: RequiredPagesScenario; view?: "list" | "edit" | "new"; recordId?: string }) {
  const [parts, setParts] = useState<{ Console: ComponentType<ConsoleProps>; Editor: ComponentType<EditorProps> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeState, setActiveState] = useState(state);
  useEffect(() => {
    let mounted = true;
    const fixtureWindow = window as FixtureWindow;
    const previousFetch = window.fetch;
    const existing = fixtureWindow.__miraRequiredPagesLocal;
    // Production links intentionally omit fixture query parameters. Preserve the
    // current scenario on those navigations, especially read-only access.
    const selectedState = state === "loaded" && existing ? existing.state : state;
    setActiveState(selectedState);
    const transport = existing?.transports.get(selectedState) ?? createRequiredPagesFixtureTransport({ state: selectedState, origin: window.location.origin });
    const transports = existing?.transports ?? new Map<RequiredPagesScenario, Transport>();
    transports.set(selectedState, transport);
    fixtureWindow.__miraRequiredPagesLocal = { transports, active: transport, state: selectedState };
    const interceptedFetch: typeof window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.pathname.startsWith("/api/")) return fixtureWindow.__miraRequiredPagesLocal?.active.fetch(input, init) ?? Promise.resolve(Response.json({ code: "unavailable" }, { status: 503 }));
      if (url.origin !== window.location.origin || !["GET", "HEAD"].includes(method)) return Promise.resolve(new Response("Local fixture request blocked", { status: 403 }));
      return previousFetch(input, init);
    };
    window.fetch = interceptedFetch;
    // Load the API singletons only after the local interceptor exists.
    void Promise.all([
      import("@/components/merchant-admin/MerchantModuleConsole"),
      import("@/components/content/MerchantContentEditor"),
    ]).then(([consoleModule, editorModule]) => {
      if (mounted) setParts({ Console: consoleModule.MerchantModuleConsole, Editor: editorModule.MerchantContentEditor });
    }).catch(() => { if (mounted) setFailed(true); });
    return () => {
      mounted = false;
      if (window.fetch === interceptedFetch) window.fetch = previousFetch;
      // Keep local records across edit → list navigation. A full reload resets them.
    };
  }, [state]);

  function blockSessionWrites(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (form instanceof HTMLFormElement && /\/api\/session\/(logout|switch)/.test(form.action)) { event.preventDefault(); event.stopPropagation(); }
  }
  const canManage = activeState !== "readonly";
  const returnTo = `/content/pages${activeState === "loaded" ? "" : `?state=${activeState}`}`;
  return <div style={{ display: "contents" }} onSubmitCapture={blockSessionWrites} data-evidence="mira-required-pages-local-fixture" data-qa-state={activeState} data-qa-ready={!!parts}>
    <PanelLayoutClient model={{ storeSlug: "mira-required-pages-local-qa", storeDisplayName: "Güzide Kuyumcu", storeLogoUrl: null, membershipLabel: canManage ? "Mağaza sahibi" : "Görüntüleme yetkisi", analyticsAvailable: false, planCode: "growth", planVersion: 3, entitlementStatus: "active", locale: "tr" }}>
      {parts ? view === "list" ? <PanelWorkspaceShell title="İçerik" tabs={CONTENT_WORKSPACE_TABS}><parts.Console kind="page" embedded canManage={canManage} /></PanelWorkspaceShell> : <parts.Editor storeId={FIXTURE_STORE_ID} kind="page" recordId={view === "edit" ? recordId : undefined} returnTo={returnTo} canManage={canManage} aiEnabled={false} /> : <p role={failed ? "alert" : "status"}>{failed ? "Yerel önizleme açılamadı." : "Yerel önizleme hazırlanıyor…"}</p>}
    </PanelLayoutClient>
  </div>;
}
