"use client";

import type {
  CustomerTag,
  CustomerDetail,
  InventoryCount,
  InventoryTransfer,
  PriceList,
  PurchaseOrder,
} from "@celebix/saas-contracts";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { CatalogExtraPreview } from "@/components/catalog-admin/CatalogExtraPreview";
import { CatalogImportPreparationConsole } from "@/components/catalog-admin/CatalogImportPreparationConsole";
import { ProductListConsole } from "@/components/catalog/ProductListConsole";
import { CustomerEditConsole } from "@/components/customers/CustomerEditConsole";
import { PanelDashboardPresentation } from "@/components/dashboard/PanelDashboardHomeView";
import {
  InventoryCountConsole,
  InventoryCountPresentation,
} from "@/components/inventory/InventoryCountConsole";
import {
  InventoryTransferConsole,
  InventoryTransferPresentation,
} from "@/components/inventory/InventoryTransferConsole";
import {
  PurchasingConsole,
  PurchasingDetailPresentation,
} from "@/components/inventory/PurchasingConsole";
import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { OrderPrintView } from "@/components/orders/OrderPrintView";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { PanelShell } from "@/components/panel/PanelShell";
import { PriceListConsole } from "@/components/pricing/PriceListConsole";
import { readyAuthority } from "@/lib/panel-ui/authority-slice";
import { createMerchantDashboardViewModel } from "@/lib/panel-ui/dashboard-model";
import type { InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";

const NOW = "2026-07-24T12:00:00.000Z";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_ID = "33333333-3333-4333-8333-333333333333";
const LOCATION_ID = "44444444-4444-4444-8444-444444444444";
const DESTINATION_ID = "55555555-5555-4555-8555-555555555555";
const LINE_ID = "66666666-6666-4666-8666-666666666666";
const VARIANT_ID = "77777777-7777-4777-8777-777777777777";
const COUNT_ID = "88888888-8888-4888-8888-888888888888";
const TRANSFER_ID = "99999999-9999-4999-8999-999999999999";
const PRICE_LIST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const MODEL = Object.freeze({
  storeSlug: "browser-kabul-magazasi",
  membershipLabel: "Mağaza sahibi",
  planCode: "growth",
  planVersion: 3,
  entitlementStatus: "active" as const,
  storefrontHostname: "browser-kabul-magazasi.celebix.site",
  locale: "tr-TR",
});

const DASHBOARD = createMerchantDashboardViewModel(
  MODEL,
  readyAuthority(Object.freeze({
    totalProducts: 12,
    activeProducts: 9,
    draftProducts: 3,
    productLimit: 100,
    activeVariants: 18,
    outOfStockVariants: 2,
    productsWithoutMedia: 1,
    activeMedia: 20,
  }), NOW),
  readyAuthority(Object.freeze({
    totalOrders: 24,
    pendingOrders: 4,
    fulfilledOrders: 18,
    revenueCents: 1_250_000,
    currency: "TRY",
    asOf: NOW,
  }), NOW),
  undefined,
  undefined,
  readyAuthority(Object.freeze({
    period: "month" as const,
    rangeStart: "2026-07-01T00:00:00.000Z",
    rangeEnd: NOW,
    generatedAt: NOW,
    currency: "TRY",
    revenueCents: 1_250_000,
    orders: Object.freeze({ total: 24, paid: 18, cancelled: 2, refunded: 1 }),
    customers: Object.freeze({ total: 42, newInPeriod: 7 }),
    catalog: Object.freeze({ activeProducts: 9, lowStockVariants: 2 }),
    series: Object.freeze([
      Object.freeze({ startsAt: "2026-07-01T00:00:00.000Z", orders: 3, revenueCents: 125_000 }),
      Object.freeze({ startsAt: "2026-07-08T00:00:00.000Z", orders: 5, revenueCents: 310_000 }),
      Object.freeze({ startsAt: "2026-07-15T00:00:00.000Z", orders: 6, revenueCents: 420_000 }),
      Object.freeze({ startsAt: "2026-07-22T00:00:00.000Z", orders: 4, revenueCents: 395_000 }),
    ]),
    topProducts: Object.freeze([
      Object.freeze({ productId: RESOURCE_ID, title: "Atlas Seramik Kupa", quantity: 12, revenueCents: 420_000 }),
      Object.freeze({ productId: VARIANT_ID, title: "Keten Günlük Çanta", quantity: 8, revenueCents: 280_000 }),
      Object.freeze({ productId: LINE_ID, title: "Minimal Masa Lambası", quantity: 6, revenueCents: 210_000 }),
    ]),
  }), NOW),
);

export const FIXTURE_PURCHASES = Object.freeze([
  Object.freeze({
    id: ORDER_ID,
    locationId: LOCATION_ID,
    supplierName: "Kalıcı Tedarikçi",
    status: "ordered",
    lines: Object.freeze([Object.freeze({
      id: LINE_ID,
      variantId: VARIANT_ID,
      orderedQuantity: 5,
      receivedQuantity: 3,
      unitCostCents: 1250,
      lineCostCents: 6250,
    })]),
    totalCostCents: 6250,
    version: 3,
    createdAt: NOW,
    updatedAt: NOW,
  }),
] as const) satisfies readonly PurchaseOrder[];

export const FIXTURE_COUNTS = Object.freeze([
  Object.freeze({
    id: COUNT_ID,
    locationId: LOCATION_ID,
    status: "counting",
    lines: Object.freeze([Object.freeze({
      id: LINE_ID,
      variantId: VARIANT_ID,
      expectedQuantity: 7,
      countedQuantity: 5,
    })]),
    version: 4,
    createdAt: NOW,
    updatedAt: NOW,
  }),
] as const) satisfies readonly InventoryCount[];

export const FIXTURE_TRANSFERS = Object.freeze([
  Object.freeze({
    id: TRANSFER_ID,
    sourceLocationId: LOCATION_ID,
    destinationLocationId: DESTINATION_ID,
    status: "in_transit",
    lines: Object.freeze([Object.freeze({
      id: LINE_ID,
      variantId: VARIANT_ID,
      quantity: 2,
    })]),
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
  }),
] as const) satisfies readonly InventoryTransfer[];

export const FIXTURE_PRICE_LISTS = Object.freeze([
  Object.freeze({
    id: PRICE_LIST_ID,
    name: "Perakende TRY",
    status: "draft",
    items: Object.freeze([Object.freeze({ variantId: VARIANT_ID, priceCents: 1250 })]),
    rules: Object.freeze([Object.freeze({ channel: "storefront", startsAt: NOW, priority: 10 })]),
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
  }),
] as const) satisfies readonly PriceList[];

const FIXTURE_TAGS = Object.freeze([]) satisfies readonly CustomerTag[];
const FIXTURE_CUSTOMER = Object.freeze({
  id: CUSTOMER_ID,
  status: "active",
  displayName: "Ada Yılmaz",
  firstName: "Ada",
  lastName: "Yılmaz",
  email: "ada@example.test",
  phone: "+905551112233",
  orderCount: 1,
  totalSpentCents: 12_500,
  currency: "TRY",
  tags: Object.freeze([]),
  addresses: Object.freeze([]),
  consents: Object.freeze([]),
  notes: Object.freeze([]),
  segments: Object.freeze([]),
  version: 2,
  createdAt: NOW,
  updatedAt: NOW,
}) satisfies CustomerDetail;
type AcceptanceState = "loaded" | "empty" | "loading" | "error" | "unavailable" | "denied" | "conflict" | "replayed" | "verification_unavailable";

function inventoryTruthState<RecordType>(
  state: Exclude<AcceptanceState, "loaded" | "empty">,
  record: RecordType,
  messages: Readonly<Record<Exclude<AcceptanceState, "loaded" | "empty">, string>>,
): InventoryConsoleSnapshot<RecordType> {
  const phase = state === "unavailable" ? "error" : state;
  return Object.freeze({
    phase,
    ...(state === "conflict" || state === "replayed" || state === "verification_unavailable"
      ? { record }
      : {}),
    pending: false,
    locked: state === "verification_unavailable",
    message: messages[state],
  });
}

function InventoryTruthFixture({ state }: Readonly<{ state: AcceptanceState }>) {
  if (state === "loaded") return <InventoryCountConsole initialItems={FIXTURE_COUNTS} canManage />;
  if (state === "empty") return <InventoryCountConsole initialItems={Object.freeze([])} canManage />;
  const snapshot = inventoryTruthState(state, FIXTURE_COUNTS[0], Object.freeze({
    loading: "Stok sayımı yükleniyor…",
    error: "Stok sayımı yüklenemedi.",
    unavailable: "Stok sayımı hizmeti kullanılamıyor.",
    denied: "Bu stok sayımını görüntüleme yetkiniz yok.",
    conflict: "Stok sayımı başka bir işlemle çakıştı.",
    replayed: "İşlem daha önce tamamlandı; kalıcı kayıt yeniden yüklendi.",
    verification_unavailable: "İşlem sonucu doğrulanamıyor. Tam sayfa yenileme gereklidir.",
  }));
  return (
    <PanelPageShell>
      <PanelPageHeader title="Stok sayımı ayrıntısı" description="Kalıcı stok sayımı doğruluk durumu." />
      <InventoryCountPresentation
        state={snapshot}
        canManage
        onStart={() => undefined}
        onCommit={() => undefined}
        onCancel={() => undefined}
      />
    </PanelPageShell>
  );
}

function PurchasingTruthFixture({ state }: Readonly<{ state: AcceptanceState }>) {
  if (state === "loaded") return <PurchasingConsole initialItems={FIXTURE_PURCHASES} canManage />;
  if (state === "empty") return <PurchasingConsole initialItems={Object.freeze([])} canManage />;
  if (state === "denied") return <PurchasingConsole initialItems={Object.freeze([])} canRead={false} canManage={false} />;
  const snapshot = inventoryTruthState(state, FIXTURE_PURCHASES[0], Object.freeze({
    loading: "Satın alma kaydı yükleniyor…",
    error: "Satın alma kaydı yüklenemedi.",
    unavailable: "Satın alma hizmeti kullanılamıyor.",
    denied: "Bu satın alma kaydını görüntüleme yetkiniz yok.",
    conflict: "Satın alma kaydı başka bir işlemle çakıştı.",
    replayed: "Satın alma işlemi daha önce tamamlandı; kalıcı kayıt yeniden yüklendi.",
    verification_unavailable: "Satın alma işlemi sonucu doğrulanamıyor.",
  }));
  return (
    <PanelPageShell>
      <PanelPageHeader title="Satın alma ayrıntısı" description="Kalıcı satın alma doğruluk durumu." />
      <PurchasingDetailPresentation state={snapshot} canManage onOrder={() => undefined} onCancel={() => undefined} />
    </PanelPageShell>
  );
}

function TransferTruthFixture({ state }: Readonly<{ state: AcceptanceState }>) {
  if (state === "loaded") return <InventoryTransferConsole initialItems={FIXTURE_TRANSFERS} canManage />;
  if (state === "empty") return <InventoryTransferConsole initialItems={Object.freeze([])} canManage />;
  if (state === "denied") return <InventoryTransferConsole initialItems={Object.freeze([])} canRead={false} canManage={false} />;
  const snapshot = inventoryTruthState(state, FIXTURE_TRANSFERS[0], Object.freeze({
    loading: "Stok transferi yükleniyor…",
    error: "Stok transferi yüklenemedi.",
    unavailable: "Stok transferi hizmeti kullanılamıyor.",
    denied: "Bu stok transferini görüntüleme yetkiniz yok.",
    conflict: "Stok transferi başka bir işlemle çakıştı.",
    replayed: "Transfer işlemi daha önce tamamlandı; kalıcı kayıt yeniden yüklendi.",
    verification_unavailable: "Transfer işlemi sonucu doğrulanamıyor.",
  }));
  return (
    <PanelPageShell>
      <PanelPageHeader title="Stok transferi ayrıntısı" description="Kalıcı stok transferi doğruluk durumu." />
      <InventoryTransferPresentation state={snapshot} canManage onDispatch={() => undefined} onReceive={() => undefined} onCancel={() => undefined} />
    </PanelPageShell>
  );
}

function CustomerTruthFixture({ state }: Readonly<{ state: AcceptanceState }>) {
  const errors: Partial<Record<AcceptanceState, string>> = Object.freeze({
    denied: "Bu müşteriyi düzenleme yetkiniz yok.",
    error: "Müşteri bilgileri yüklenemedi.",
    unavailable: "Müşteri hizmeti şu anda kullanılamıyor.",
    conflict: "Bu müşteri sizden önce güncellendi. En güncel kaydı yükleyip tekrar deneyin.",
  });
  const initialError = errors[state] ?? "";
  return (
    <CustomerEditConsole
      customerId={CUSTOMER_ID}
      initialCustomer={state === "loaded" || state === "conflict" ? FIXTURE_CUSTOMER : undefined}
      initialError={initialError}
    />
  );
}

function PricingTruthFixture({ state }: Readonly<{ state: AcceptanceState }>) {
  if (state === "loaded") return <PriceListConsole initialItems={FIXTURE_PRICE_LISTS} initialTags={FIXTURE_TAGS} canRead canManage />;
  if (state === "empty") return <PriceListConsole initialItems={Object.freeze([])} initialTags={FIXTURE_TAGS} canRead canManage />;
  if (state === "denied") return <PriceListConsole initialItems={Object.freeze([])} initialTags={FIXTURE_TAGS} canRead={false} canManage={false} />;
  const phase = state === "unavailable" ? "unavailable" : state === "conflict" ? "conflict" : "error";
  return <PriceListConsole initialItems={Object.freeze([])} initialTags={FIXTURE_TAGS} initialPhase={phase} canRead canManage />;
}

function TargetRouteSurface({ pathname, state }: Readonly<{ pathname: string; state: AcceptanceState }>) {
  switch (pathname) {
    case "/":
      return <PanelDashboardPresentation dashboard={DASHBOARD} state="loaded" ordersState="loaded" analyticsState="loaded" onRefresh={() => undefined} />;
    case "/analytics":
      return <AnalyticsDashboard />;
    case "/orders/ORDER_ID/print":
      return <OrderPrintView orderId={ORDER_ID} />;
    case "/customers/CUSTOMER_ID/edit":
      return <CustomerTruthFixture state={state} />;
    case "/products/extras/RESOURCE_ID/preview":
      return <CatalogExtraPreview resourceId={RESOURCE_ID} />;
    case "/products/purchasing":
      return <PurchasingTruthFixture state={state} />;
    case "/products/inventory-counts":
      return <InventoryTruthFixture state={state} />;
    case "/products/transfers":
      return <TransferTruthFixture state={state} />;
    case "/products/price-lists":
      return <PricingTruthFixture state={state} />;
    case "/marketplaces":
      return <MerchantModuleConsole kind="marketplace_connection" canManage />;
    case "/accounting/invoicing-integration":
      return <MerchantModuleConsole kind="invoice_integration" canManage />;
    case "/marketing/email":
      return <MerchantModuleConsole kind="email_campaign" canManage />;
    case "/marketing/phone":
      return <MerchantModuleConsole kind="phone_campaign" canManage />;
    case "/marketing/whatsapp":
      return <MerchantModuleConsole kind="whatsapp_campaign" canManage />;
    case "/seo/fast-indexing":
      return <MerchantModuleConsole kind="indexing_request" canManage />;
    case "/seo/products":
      return <MerchantModuleConsole kind="seo_product_entry" canManage />;
    case "/products/shopify-converter":
      return <CatalogImportPreparationConsole format="shopify_csv" title="Shopify dönüştürücü" description="Seçilen yerel CSV dosyasını güvenli önizlemeye hazırlayın." canImport={state !== "denied"} />;
    case "/products":
      return <ProductListConsole />;
    case "/settings":
      return <MerchantModuleConsole kind="general_setting" canManage />;
    default:
      return null;
  }
}

export function FullParityFixture({
  pathname,
  state = "loaded",
}: Readonly<{
  pathname: string;
  state?: AcceptanceState;
}>) {
  return (
    <PanelShell model={MODEL}>
      <section data-target-route={pathname} data-target-state={state}>
        <TargetRouteSurface pathname={pathname} state={state} />
      </section>
    </PanelShell>
  );
}
