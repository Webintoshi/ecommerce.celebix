"use client";

import { AbandonedCartConsole, AbandonedCartDetailConsole } from "@/components/orders/AbandonedCartConsole";
import { OrderDraftEditor } from "@/components/orders/OrderDraftEditor";
import { OrderDraftListConsole } from "@/components/orders/OrderDraftListConsole";
import { QuickOrderLinksConsole } from "@/components/orders/QuickOrderLinksConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";

import { ORDER_ADJACENT_CART_ID, ORDER_ADJACENT_DRAFT_ID } from "./order-adjacent-data";

const MODEL = Object.freeze({
  analyticsAvailable: false,
  storeSlug: "mira-order-adjacent-fixture",
  membershipLabel: "Mağaza sahibi",
  planCode: "growth",
  planVersion: 3,
  entitlementStatus: "active" as const,
  storefrontHostname: "mira-order-adjacent.example.test",
  locale: "tr-TR",
});

function OrderAdjacentSurface({ view }: Readonly<{ view: string }>) {
  switch (view) {
    case "drafts":
      return <OrderDraftListConsole canManage />;
    case "draft-new":
      return <OrderDraftEditor canManage />;
    case "draft-edit":
      return <OrderDraftEditor draftId={ORDER_ADJACENT_DRAFT_ID} canManage />;
    case "quick-links":
      return <QuickOrderLinksConsole />;
    case "abandoned-carts":
      return <AbandonedCartConsole />;
    case "abandoned-cart-detail":
      return <AbandonedCartDetailConsole cartId={ORDER_ADJACENT_CART_ID} canManage />;
    default:
      return <PanelPageShell><PanelPageHeader title="Desteklenmeyen fixture görünümü" description="Bu yerel kabul görünümü tanımlı değil." /></PanelPageShell>;
  }
}

export function OrderAdjacentFixture({ view }: Readonly<{ view: string }>) {
  return <PanelLayoutClient model={MODEL}><OrderAdjacentSurface view={view} /></PanelLayoutClient>;
}
