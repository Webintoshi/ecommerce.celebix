"use client";

import { useEffect, useState } from "react";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { InStoreSalesConsole } from "@/components/orders/InStoreSalesConsole";
import { MODEL } from "../mira-catalog/catalog-fixture";
import { createPosFixtureTransport, type PosScenario } from "./fixture-transport";

/** Render the actual POS component against memory-only local records. */
export function PosApprovedFixture({ scenario, mutation }: { scenario: PosScenario; mutation: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previousFetch = window.fetch;
    const transport = createPosFixtureTransport({ scenario, mutation, origin: window.location.origin });
    const storageKey = `celebix-in-store-operation:${transport.scopeKey}`;
    if (transport.recoveryMarker) window.localStorage.setItem(storageKey, JSON.stringify(transport.recoveryMarker));
    const interceptedFetch: typeof window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      if (url.pathname.startsWith("/api/")) return transport.fetch(input, init);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.origin !== window.location.origin || !["GET", "HEAD"].includes(method)) return Promise.resolve(new Response("Local fixture request blocked", { status: 403 }));
      return previousFetch(input, init);
    };
    window.fetch = interceptedFetch;
    (window as unknown as { __CELEBIX_POS_QA__: unknown }).__CELEBIX_POS_QA__ = { scenario, scopeKey: transport.scopeKey, snapshot: transport.snapshot };
    setReady(true);
    return () => {
      if (window.fetch === interceptedFetch) window.fetch = previousFetch;
      window.localStorage.removeItem(storageKey);
      delete (window as unknown as { __CELEBIX_POS_QA__?: unknown }).__CELEBIX_POS_QA__;
    };
  }, [scenario, mutation]);
  return <PanelLayoutClient model={{ ...MODEL, storeSlug: "mira-pos-qa", membershipLabel: scenario === "readonly" ? "Görüntüleme yetkisi" : "Mağaza sahibi", storefrontHostname: "fixture.example.test", analyticsAvailable: false }}>
    <div data-evidence="mira-pos-approved-local-fixture" data-qa-ready={ready} data-qa-scenario={scenario}>
      {ready ? <InStoreSalesConsole /> : <p role="status">Test ekranı hazırlanıyor…</p>}
    </div>
  </PanelLayoutClient>;
}
