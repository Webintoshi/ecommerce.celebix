"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { parseOrderEditPreview, parseOrderEditResult, parseOrderEditWorkspace, type OrderEditIntent, type OrderEditPreview } from "@celebix/saas-contracts";
import type { OrderEditStorage, OrderEditUiClient } from "@/lib/order-edit-ui/client";
import { EDIT_WORKSPACE, ORDER_ID, PRINT_ORDER, SHIPMENT, fixtureQuote } from "./fixture-data";
import styles from "./fixture.module.css";

type Modules = {
  Layout: ComponentType<{ model: any; children: ReactNode }>;
  Shell: ComponentType<{ children: ReactNode }>;
  Drawer: ComponentType<{ orderId: string; onClose: () => void; onSaved: () => void; client: OrderEditUiClient; storage: OrderEditStorage }>;
  Shipment: ComponentType<{ orderId: string; orderVersion: number }>;
  Print: ComponentType<{ orderId: string }>;
  EditError: new (code: string, status: number) => Error;
};
const MODEL = { analyticsAvailable: false, storeSlug: "orders-urbanist-fixture", membershipLabel: "Mağaza sahibi", planCode: "growth", planVersion: 3, entitlementStatus: "active" as const, storefrontHostname: "orders-urbanist.example.test", locale: "tr-TR" };
function memoryStorage(): OrderEditStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
function editPreview(intent: OrderEditIntent): OrderEditPreview {
  const subtotal = intent.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents - line.discountCents, 0);
  const total = subtotal + intent.shippingCents - intent.discountCents;
  return parseOrderEditPreview({ orderId: ORDER_ID, expectedVersion: 1, fingerprint: "a".repeat(64), beforeTotalCents: EDIT_WORKSPACE.totalCents, afterSubtotalCents: subtotal, afterShippingCents: intent.shippingCents, afterDiscountCents: intent.discountCents, afterTotalCents: total, collectedCents: 1000000, settlementDiscountCents: 10000, dueCents: Math.max(0, total - 1010000), refundDueCents: Math.max(0, 1010000 - total), stockChanges: [], commissionDeltaCents: null });
}

/** Actual production views, with strictly local synthetic authority and no network fallback. */
export function OrdersUrbanistFixture({ view, scenario }: { view: string; scenario: string }) {
  const [modules, setModules] = useState<Modules>();
  const [failure, setFailure] = useState("");
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [client, setClient] = useState<OrderEditUiClient>();
  const [storage] = useState(memoryStorage);
  useEffect(() => {
    let cancelled = false;
    const originalFetch = window.fetch;
    let reads = 0;
    window.fetch = async (input, init) => {
      const request = new Request(new URL(input instanceof Request ? input.url : String(input), window.location.href), input instanceof Request ? input : init);
      const url = new URL(request.url);
      if (url.origin !== window.location.origin || url.search) return Response.json({ code: "membership_denied" }, { status: 403 });
      if (request.method === "GET" && url.pathname === `/api/orders/${ORDER_ID}`) return scenario === "error" ? Response.json({ code: "unavailable" }, { status: 503 }) : Response.json(PRINT_ORDER);
      if (request.method === "GET" && url.pathname === `/api/orders/${ORDER_ID}/shipping/shipments`) {
        if (scenario === "error" && reads++ === 0) return Response.json({ code: "unavailable" }, { status: 503 });
        return Response.json({ shipment: scenario === "existing" ? SHIPMENT : null });
      }
      if (request.method === "POST" && url.pathname === `/api/orders/${ORDER_ID}/shipping/quotes`) {
        try {
          const body = await request.json();
          if (Object.keys(body).sort().join(",") !== "expectedOrderVersion,operationId,packages" || body.expectedOrderVersion !== 1 || !/^[a-f0-9-]{36}$/.test(body.operationId)) throw new Error("invalid fixture quote");
          return Response.json({ quote: fixtureQuote(body.packages) });
        } catch { return Response.json({ code: "invalid_input" }, { status: 400 }); }
      }
      return Response.json({ code: "membership_denied" }, { status: 403 });
    };
    // Clients capture fetch during module evaluation, so install the local transport first.
    void Promise.all([
      import("@/components/panel/PanelLayoutClient"), import("@/components/panel/PanelPageShell"),
      import("@/components/orders/OrderEditDrawer"), import("@/components/orders/OrderPrintView"),
      import("@/components/shipping/OrderShipmentConsole"), import("@/lib/order-edit-ui/client"),
    ]).then(([layout, shell, drawer, print, shipping, edit]) => {
      if (cancelled) return;
      let workspaceReads = 0, writes = 0;
      const memoryClient: OrderEditUiClient = {
        newId: () => crypto.randomUUID(),
        workspace: async () => {
          if (scenario === "loading") return new Promise(() => {});
          if (scenario === "error" && workspaceReads++ === 0) throw new edit.OrderEditUiError("unavailable", 503);
          return scenario === "readonly" ? parseOrderEditWorkspace({ ...EDIT_WORKSPACE, source: "marketplace", canEdit: false, canEditPrices: false, blockReason: "provider_managed" }) : EDIT_WORKSPACE;
        },
        products: async () => ({ items: [{ productId: "94000000-0000-4000-8000-000000002001", variantId: "94000000-0000-4000-8000-000000002002", productName: "14 Ayar İnce Altın Bileklik", variantName: "17 cm", sku: "BLK-017", unitPriceCents: 679000 }], hasMore: false }),
        preview: async (_id, intent) => editPreview(intent),
        apply: async (_id, value) => {
          if (scenario === "uncertain" && writes++ === 0) throw new edit.OrderEditUiError("unavailable", 503);
          return parseOrderEditResult({ orderId: ORDER_ID, version: 2, operationId: value.operationId, replayed: writes > 1, preview: editPreview(value.intent) });
        },
      };
      setClient(memoryClient);
      setModules({ Layout: layout.PanelLayoutClient, Shell: shell.PanelPageShell, Drawer: drawer.OrderEditDrawer, Shipment: shipping.OrderShipmentConsole, Print: print.OrderPrintView, EditError: edit.OrderEditUiError });
    }).catch(error => { if (!cancelled) setFailure(String(error)); });
    return () => { cancelled = true; window.fetch = originalFetch; };
  }, [scenario]);
  if (failure) return <p role="alert">{failure}</p>;
  if (!modules || !client) return <p role="status">Yerel örnek hazırlanıyor…</p>;
  const { Layout, Shell, Drawer, Shipment, Print } = modules;
  if (view === "print") return <div data-fixture="orders-urbanist-print" data-qa-ready="true"><Print orderId={ORDER_ID} /></div>;
  return <Layout model={MODEL}><Shell><div data-fixture={`orders-urbanist-${view}`} data-qa-ready="true" className={styles.surface}>
    <h1 className="sr-only">Sipariş yerel kabul görünümü</h1>
    {view === "shipping" ? <section className={styles.card}><h2>Kargo</h2><Shipment orderId={ORDER_ID} orderVersion={1} /></section> : <>
      <div className={styles.launcher}><strong>{PRINT_ORDER.orderNumber}</strong><button type="button" onClick={() => { setNotice(""); setOpen(true); }}>Siparişi düzenle</button></div>
      {notice ? <p role="status">{notice}</p> : null}
      {open ? <Drawer orderId={ORDER_ID} client={client} storage={storage} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setNotice("Örnek kayıt bellekte tamamlandı."); }} /> : null}
    </>}
  </div></Shell></Layout>;
}
