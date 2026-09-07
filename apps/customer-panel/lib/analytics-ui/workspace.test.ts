import assert from "node:assert/strict";
import test from "node:test";

type WorkspaceModule = typeof import("./workspace.ts");

async function workspace(): Promise<Partial<WorkspaceModule>> {
  return import("./workspace.ts").catch(() => ({}));
}

test("analytics tabs keep the complete merchant workflow and URL history state", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsTabHref, "function");
  assert.deepEqual(
    module.ANALYTICS_WORKSPACE_TABS?.map((tab) => tab.value),
    ["overview", "funnel", "carts", "acquisition", "products"],
  );
  assert.equal(
    module.analyticsTabHref?.(
      "tab=carts&range=30d&compare=1&search=baget&page=3",
      "products",
    ),
    "/analytics?tab=products&range=30d&compare=1&search=baget",
  );
  assert.equal(
    module.analyticsTabHref?.(
      "tab=products&range=30d&compare=1&search=baget&page=3",
      "products",
    ),
    "/analytics?tab=products&range=30d&compare=1&search=baget&page=3",
  );
  assert.equal(
    module.analyticsTabHref?.(
      "range=30d&compare=1&search=baget&page=3",
      "funnel",
    ),
    "/analytics?range=30d&compare=1&tab=funnel",
  );
});

test("overview detail navigation preserves shared analytics state", async () => {
  const module = await workspace();
  assert.equal(
    module.analyticsOverviewDetailHref?.(
      "tab=overview&from=2026-08-01&to=2026-08-31&timezone=Europe%2FIstanbul&compare=1&currency=TRY",
      "funnel",
    ),
    "/analytics?tab=funnel&from=2026-08-01&to=2026-08-31&timezone=Europe%2FIstanbul&compare=1&currency=TRY",
  );
});

test("analytics overview keeps PostgreSQL metrics visible when traffic is unavailable", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsOverviewMetrics, "function");
  const metrics = module.analyticsOverviewMetrics?.(
    {
      currency: "TRY",
      paidOrders: 4,
      grossRevenueMinor: 125_000,
    },
    null,
  );
  assert.deepEqual(
    metrics?.map((metric) => [metric.key, metric.value, metric.state]),
    [
      ["revenue", "₺1.250,00", "ready"],
      ["orders", "4", "ready"],
      ["visitors", "—", "unavailable"],
      ["average_order", "₺312,50", "ready"],
      ["conversion", "—", "unavailable"],
    ],
  );
});

test("zero orders keep average order value unavailable instead of inventing zero", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsOverviewMetrics, "function");
  const average = module.analyticsOverviewMetrics?.(
    { currency: "TRY", paidOrders: 0, grossRevenueMinor: 0 },
    12,
  ).find((metric) => metric.key === "average_order");

  assert.deepEqual(average, {
    key: "average_order",
    label: "Ortalama Sepet Tutarı",
    value: "—",
    state: "unavailable",
    source: "PostgreSQL",
  });
});

test("available zero and unavailable behavior metrics remain distinct", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsBehaviorValue, "function");
  assert.deepEqual(module.analyticsBehaviorValue?.(0), {
    state: "ready",
    value: "0",
  });
  assert.deepEqual(module.analyticsBehaviorValue?.(null), {
    state: "unavailable",
    value: "—",
  });
});

test("funnel stages use merchant language and expose every drop-off", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsFunnelStages, "function");
  const stages = module.analyticsFunnelStages?.({
    product_view: 100,
    add_to_cart: 40,
    view_cart: 30,
    begin_checkout: 20,
    payment_method_selected: 10,
    purchase: 8,
  });
  assert.deepEqual(
    stages?.map((stage) => [stage.label, stage.count, stage.dropoff]),
    [
      ["Ürün Görüntüleme", 100, null],
      ["Sepete Ekleme", 40, 60],
      ["Sepeti Görüntüleme", 30, 10],
      ["Checkout Başlatma", 20, 10],
      ["Ödeme Yöntemi", 10, 10],
      ["Satın Alma", 8, 2],
    ],
  );
});

test("missing funnel events never become fake zeroes", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsFunnelStages, "function");
  const stages = module.analyticsFunnelStages?.({ product_view: 10 });
  assert.equal(stages?.[0]?.count, 10);
  assert.equal(stages?.[1]?.count, null);
  assert.equal(stages?.[1]?.dropoff, null);
});

test("quick ranges preserve comparison and remove stale custom dates", async () => {
  const module = await workspace();
  assert.equal(typeof module.analyticsQueryHref, "function");
  assert.equal(
    module.analyticsQueryHref?.("from=2026-08-01&to=2026-08-31&compare=1", {
      range: "7d",
      from: null,
      to: null,
    }),
    "/analytics?compare=1&range=7d",
  );
});

test("commerce trends preserve paid orders and derive only matched paid conversion buckets", async () => {
  const module = await workspace();
  const trends = module.analyticsCommerceTrends?.(
    [
      {
        startsAt: "2026-09-01T00:00:00.000Z",
        currency: "TRY",
        paidOrders: 4,
      },
      {
        startsAt: "2026-09-02T00:00:00.000Z",
        currency: "TRY",
        paidOrders: 3,
      },
    ],
    [{ at: "2026-09-01T00:00:00.000Z", value: 40 }],
    "UTC",
  );

  assert.deepEqual(trends, {
    orders: [
      { label: "1 Eyl · TRY", value: 4 },
      { label: "2 Eyl · TRY", value: 3 },
    ],
    paidConversionPermille: [{ label: "1 Eyl · TRY", value: 100 }],
  });
  assert.equal(
    module.analyticsCommerceTrends?.([], null, "UTC").paidConversionPermille,
    null,
  );
});

test("traffic-only overview keeps real visitors visible without commerce buckets", async () => {
  const module = await workspace();
  assert.deepEqual(module.analyticsTrafficOnlyMetrics?.(23), [
    {
      key: "visitors",
      label: "Ziyaretçiler",
      value: "23",
      state: "ready",
      source: "Umami",
    },
  ]);
  assert.deepEqual(module.analyticsTrafficOnlyMetrics?.(null), [
    {
      key: "visitors",
      label: "Ziyaretçiler",
      value: "—",
      state: "unavailable",
      source: "Umami",
    },
  ]);
});

test("initial analytics request stays stable when the URL has no timezone", async () => {
  const module = await workspace();
  assert.equal(module.analyticsRequestQuery?.("tab=overview", "30d"), "range=30d");
  assert.equal(
    module.analyticsRequestQuery?.(
      "tab=overview&timezone=Europe%2FIstanbul",
      "30d",
    ),
    "timezone=Europe%2FIstanbul&range=30d",
  );
  assert.equal(
    module.analyticsRequestQuery?.("tab=overview", "30d", "UTC"),
    "timezone=UTC&range=30d",
  );
});
