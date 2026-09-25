import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import {
  MERCHANT_MODULE_DEFINITIONS,
  getMerchantModuleDefinition,
} from "./merchant-admin-ui/presentation.ts";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("commerce analytics workspace exposes URL-stable tabs, honest formulas, degraded traffic and worker health", async () => {
  const [componentSource, workspaceModel, page, chart] = await Promise.all([
    source("components/analytics/CommerceAnalyticsWorkspace.tsx"),
    source("lib/analytics-ui/workspace.ts"),
    source("app/analytics/page.tsx"),
    source("components/analytics/SalesTrendChart.tsx"),
  ]);
  const component = `${componentSource}\n${workspaceModel}\n${chart}`;
  for (const label of [
    "Genel bakış",
    "Dönüşüm",
    "Sepetler",
    "Kaynaklar",
    "Ürünler",
    "Bugün",
    "Özel aralık",
    "Kıyasla",
    "Grafik para birimi",
    "Trafik verisi alınamıyor",
    "Satış ve sepet verileri güncel",
    "Ölçüm durumu",
    "Hatalı",
    "İlk temasta ziyaretçi adımları ölçülmüyor",
    "Oturum",
    "Hemen çıkma",
    "Ort. oturum",
    "Sayfalar",
    "Yönlendirenler",
    "Cihazlar",
    "Ülkeler",
    "Satış ritmi",
  ])
    assert.match(component, new RegExp(label));
  for (const range of ["today", "7d", "30d", "90d"])
    assert.match(componentSource, new RegExp(`<option value="${range}">`));
  for (const tab of ["overview", "funnel", "carts", "acquisition", "products"])
    assert.match(component, new RegExp(`\\[?\"${tab}\"`));
  for (const route of [
    "overview",
    "funnel",
    "abandoned-carts",
    "acquisition",
    "products",
  ])
    assert.match(component, new RegExp(`/api/analytics/${route}`));
  assert.match(component, /paidOrders\s*\/\s*traffic[.]visitors/);
  assert.match(
    component,
    /bucket[.]recoveredCarts\s*\/\s*bucket[.]abandonedCarts/,
  );
  for (const event of [
    "product_view",
    "add_to_cart",
    "view_cart",
    "begin_checkout",
    "payment_method_selected",
  ])
    assert.match(component, new RegExp(event));
  assert.match(component, /Öncekinden/);
  assert.match(component, /İlk adımdan/);
  assert.match(component, /Kayıp/);
  assert.match(component, /AbortController/);
  assert.doesNotMatch(
    component,
    /websiteId|connectionId|customerEmail|customerPhone|console[.](log|error)/,
  );
  assert.match(component, /analyticsTrafficMetric\(data[.]traffic/);
  assert.match(component, /firstTouch \? \[\] : acquisitionRows\(data[.]traffic\)/);
  assert.match(component, /query[.]set\("range", range\)/);
  assert.match(page, /searchParams/);
  assert.match(page, /CommerceAnalyticsWorkspace/);
});

test("analytics moves the honest active visitor card into a titleless sticky topbar", async () => {
  const [workspace, component, poller] = await Promise.all([
    source("components/analytics/CommerceAnalyticsWorkspace.tsx"),
    source("components/analytics/ActiveVisitorsCard.tsx"),
    source("lib/analytics-ui/active-visitors.ts"),
  ]);
  assert.match(workspace, /<PanelTopbarBridge[\s\S]*?hideHeading[\s\S]*?context=\{<div className=\{styles[.]topbarLiveMetric\}><ActiveVisitorsCard \/><\/div>\}/);
  assert.match(workspace, /<h1 className="sr-only">Analizler<\/h1>/);
  assert.doesNotMatch(workspace, /className=\{styles[.]pageHeader\}/);
  assert.doesNotMatch(workspace, /aria-label="İçerik yolu"/);
  assert.doesNotMatch(workspace, /Mağazanızın performansını detaylı verilerle analiz edin[.]/);
  assert.match(component, /Şu anda sitenizde/);
  assert.match(component, /Veri alınamıyor/);
  assert.match(component, /Analytics kuruluyor/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /api[.]active/);
  assert.match(poller, /30_000/);
  assert.doesNotMatch(component, /websiteId|connectionId|console[.](log|error)/);
});

test("Mira analytics presentation has one h1, accessible responsive tabs and no fabricated features", async () => {
  const [component, css] = await Promise.all([
    source("components/analytics/CommerceAnalyticsWorkspace.tsx"),
    source("components/analytics/commerce-analytics-workspace.module.css"),
  ]);
  const tree = ts.createSourceFile(
    "CommerceAnalyticsWorkspace.tsx",
    component,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );
  let h1Count = 0;
  const inspect = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(tree) === "h1"
    )
      h1Count += 1;
    ts.forEachChild(node, inspect);
  };
  inspect(tree);
  assert.equal(h1Count, 1);
  assert.match(component, /role="tablist"/);
  assert.match(component, /role="tab"/);
  assert.match(component, /aria-selected=/);
  assert.match(component, /onKeyDown=/);
  assert.doesNotMatch(component, /Ziyaretçi & Dönüşüm|previousRevenue|topProducts/);
  assert.match(component, /<SalesTrendChart/);
  assert.match(component, /key=\{`\$\{tab\}:\$\{serialized\}`\}/);
  assert.match(component, /<h1 className="sr-only">Analizler<\/h1>/);
  assert.match(component, /Ölçüm durumu/);
  assert.match(component, /setFrom\(customFrom \?\? ""\)/);
  assert.match(component, /current[.]find\(\(row\) => row[.]currency === chartCurrency\) \?\? current\[0\]/);
  assert.match(component, /<nav aria-label="Ürün listesi sayfaları"/);
  assert.match(component, /<span aria-disabled="true">Önceki<\/span>/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /[.]topbarLiveMetric\s*\{[^}]*--ink:\s*#292929;[^}]*--line:\s*#e7e7e3;/);
  assert.match(css, /[.]topbarLiveMetric > article \{[^}]*min-height: 44px;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?[.]topbarLiveMetric > article span\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\);/);
  assert.doesNotMatch(css, /[.]topbarLiveMetric > article span\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(component, /İstanbul\s*%|Ankara\s*%|Sadık müşteriler|Pasif müşteriler/);
  assert.doesNotMatch(component, /Analiz Raporu Oluştur|Özel Rapor Talebi/);
  assert.doesNotMatch(component, /284[.]590|489[.]020|156[.]300/);
});

test("sales chart renders positive geometry before browser measurement", async () => {
  const output = ts.transpileModule(
    await source("components/analytics/SalesTrendChart.tsx"),
    {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const styles = new Proxy({}, { get: (_target, property) => String(property) });
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "./sales-trend-chart.module.css")
      return { __esModule: true, default: styles };
    throw new Error(`unexpected_sales_chart_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, module, module.exports);
  const Chart = module.exports.SalesTrendChart as React.ComponentType<{
    points: readonly { label: string; value: number; orders: number }[];
    currency: string;
    totalMinor: number;
  }>;
  const chart = renderToString(createElement(Chart, {
    points: [
      { label: "1 Eyl", value: 0, orders: 0 },
      { label: "2 Eyl", value: 10_000, orders: 1 },
      { label: "3 Eyl", value: 5_000, orders: 1 },
    ],
    currency: "TRY",
    totalMinor: 15_000,
  }));
  assert.match(chart, /<svg[^>]*viewBox="0 0 640 210"[^>]*role="img"/);
  assert.match(chart, /aria-label="Seçili dönemde toplam satış/);
  assert.match(chart, /M12[.]00 184[.]00 L320[.]00 16[.]00 L628[.]00 100[.]00/);
  assert.doesNotMatch(chart, /NaN|Infinity/);

  const empty = renderToString(createElement(Chart, {
    points: [], currency: "TRY", totalMinor: 0,
  }));
  assert.match(empty, /Bu dönemde satış yok/);
});

test("analytics settings show durable thresholds without exposing provider authority and keep automation fail-closed", async () => {
  const [component, page] = await Promise.all([
    source("components/analytics/AnalyticsSettingsConsole.tsx"),
    source("app/settings/analytics/page.tsx"),
  ]);
  for (const label of [
    "Analitik ayarları",
    "Terk adayı süresi",
    "Terk edilmiş süresi",
    "Recovery link geçerliliği",
    "Otomatik recovery",
    "Mesaj limiti",
    "Tracking policy",
    "Session replay kapalı",
    "Analitiği etkinleştir",
    "Kaydet",
  ])
    assert.match(component, new RegExp(label));
  assert.match(component, /\/api\/analytics\/settings/);
  assert.match(component, /\/api\/analytics\/connection/);
  assert.match(component, /idempotency-key/);
  assert.match(component, /automaticRecoveryEnabled/);
  assert.match(component, /disabled/);
  assert.doesNotMatch(
    component,
    /websiteId|apiToken|password|secret|console[.](log|error)/i,
  );
  assert.match(page, /configuration[.]manage/);
});

test("abandoned cart recovery surface supports reopening and explicit copy", async () => {
  const component = await source("components/orders/AbandonedCartConsole.tsx");
  for (const proof of [
    "Bağlantıyı kopyala",
    "Dönüşüm tamamlanana kadar",
    "navigator.clipboard.writeText",
    "İletişim kuruldu",
    "Merchant notu",
    "recordRecoveryAttempt",
  ])
    assert.match(component, new RegExp(proof));
  assert.doesNotMatch(
    component,
    /Tek kullanımlık|yalnız bir kez kullanılabilir/,
  );
});

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const same = (
    left: readonly unknown[] | undefined,
    right: readonly unknown[],
  ) =>
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        slots[index] =
          typeof next === "function"
            ? (next as (current: T) => T)(slots[index] as T)
            : next;
        dirty = true;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(
      callback: T,
      deps: readonly unknown[],
    ) {
      const index = cursor++,
        prior = slots[index] as
          { deps: readonly unknown[]; value: T } | undefined;
      if (!prior || !same(prior.deps, deps))
        slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++,
        prior = slots[index] as
          { deps: readonly unknown[]; cleanup?: () => void } | undefined;
      if (prior && same(prior.deps, deps)) return;
      prior?.cleanup?.();
      const cleanup = effect();
      slots[index] = {
        deps: [...deps],
        ...(typeof cleanup === "function" ? { cleanup } : {}),
      };
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode, force = false) {
      if (force) dirty = true;
      for (let pass = 0; pass < 30; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("analytics_console_hook_flush_exhausted");
    },
    unmount() {
      for (const slot of slots) {
        const cleanup = (slot as { cleanup?: () => void } | undefined)?.cleanup;
        cleanup?.();
      }
      dirty = false;
    },
    isDirty() {
      return dirty;
    },
  };
}

function visit(
  node: ReactNode,
  visitor: (element: React.ReactElement<Record<string, unknown>>) => void,
) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visit(child.props.children as ReactNode, visitor);
  });
}

function text(node: ReactNode): string {
  const values: string[] = [];
  const collect = (value: ReactNode) => {
    if (typeof value === "string" || typeof value === "number")
      values.push(String(value));
    else if (React.isValidElement<Record<string, unknown>>(value))
      collect(value.props.children as ReactNode);
    else React.Children.forEach(value, collect);
  };
  collect(node);
  return values.join(" ");
}

async function compileAnalyticsDashboard(
  overrides: Readonly<{
    dashboard(period: string): Promise<unknown>;
    export(period: string, format: string): Promise<unknown>;
  }>,
) {
  const output = ts.transpileModule(
    await source("components/analytics/AnalyticsDashboard.tsx"),
    {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const styles = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === "__esModule"
          ? true
          : property === "default"
            ? styles
            : String(property),
    },
  );
  class CompiledAnalyticsApiError extends Error {
    constructor(readonly code: "unavailable") {
      super(code);
    }
  }
  const module = { exports: {} as Record<string, unknown> };
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("section", props, children as ReactNode);
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return runtime.runtime;
    if (specifier === "recharts")
      return {
        CartesianGrid: component,
        Line: component,
        LineChart: component,
        ResponsiveContainer: component,
        Tooltip: component,
        XAxis: component,
        YAxis: component,
      };
    if (specifier === "@celebix/saas-contracts")
      return { ANALYTICS_PERIODS: ["today", "week", "month", "year"] };
    if (specifier === "@/components/panel/PanelPageShell")
      return {
        PanelPageShell: component,
        PanelPageHeader: ({
          title,
          description,
        }: {
          title: string;
          description?: string;
        }) => createElement("header", null, title, description),
        PanelPanel: ({
          title,
          children,
        }: {
          title?: string;
          children?: ReactNode;
        }) => createElement("section", null, title, children),
        PanelMetricCard: ({
          label,
          value,
          detail,
        }: {
          label: string;
          value: string;
          detail?: string;
        }) => createElement("article", null, label, value, detail),
        PanelEmptyState: ({
          title,
          description,
          action,
        }: {
          title: string;
          description: string;
          action?: ReactNode;
        }) => createElement("section", null, title, description, action),
      };
    if (specifier === "@/lib/analytics-ui/client")
      return {
        AnalyticsApiError: CompiledAnalyticsApiError,
        analyticsApi: overrides,
      };
    if (specifier === "./analytics-dashboard.module.css") return styles;
    throw new Error(`unexpected_analytics_module:${specifier}`);
  };
  const runtime = createHookRuntime();
  Function(
    "require",
    "module",
    "exports",
    output,
  )(requireModule, module, module.exports);
  return {
    AnalyticsDashboard: module.exports.AnalyticsDashboard as () => ReactNode,
    runtime,
  };
}

function dashboard(period: string, revenueCents: number) {
  return {
    period,
    rangeStart: "2026-07-01T00:00:00.000Z",
    rangeEnd: "2026-07-22T15:00:00.000Z",
    generatedAt: "2026-07-22T15:00:00.000Z",
    currency: "TRY",
    revenueCents,
    orders: { total: 1, paid: 1, cancelled: 0, refunded: 0 },
    customers: { total: 1, newInPeriod: 1 },
    catalog: { activeProducts: 1, lowStockVariants: 0 },
    series: [{ startsAt: "2026-07-01T00:00:00.000Z", orders: 1, revenueCents }],
    topProducts: [],
  };
}

test("analytics renders only durable commerce aggregates and finite controls", async () => {
  const value = await source("components/analytics/AnalyticsDashboard.tsx");
  for (const label of [
    "Gelir",
    "Sipariş",
    "Yeni müşteri",
    "Düşük stok",
    "today",
    "week",
    "month",
    "year",
    "analyticsApi.dashboard",
    "analyticsApi.export",
    "LineChart",
    'role="img"',
    'timeZone: "UTC"',
    'aria-label="Gelir zaman serisi; seçili dönemde kalıcı sipariş gelirini gösterir"',
    "requestVersion",
  ]) {
    assert.match(
      value,
      new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  for (const unsupported of [
    "Canlı ziyaretçi",
    "Dönüşüm oranı",
    "Cihaz dağılımı",
    "Trafik kaynağı",
  ]) {
    assert.doesNotMatch(value, new RegExp(unsupported));
  }
  assert.match(value, /error instanceof AnalyticsApiError/);
  assert.doesNotMatch(
    value,
    /caught[.]message|Error[.]message|console[.](log|error)/,
  );
  assert.match(value, /formatMoney\(Number\(value\), dashboard[.]currency\)/);
  assert.doesNotMatch(value, /formatMoney\(Number\(value\) \* 100/);
  for (const label of ["Bugün", "Bu hafta", "Bu ay", "Bu yıl"])
    assert.match(value, new RegExp(label));
});

test("period changes ignore stale results and export failures surface a stable message", async () => {
  let resolveMonth: ((value: unknown) => void) | undefined;
  let resolveWeek: ((value: unknown) => void) | undefined;
  const { AnalyticsDashboard, runtime } = await compileAnalyticsDashboard({
    dashboard(period) {
      if (period === "month")
        return new Promise((resolve) => {
          resolveMonth = resolve;
        });
      if (period === "week")
        return new Promise((resolve) => {
          resolveWeek = resolve;
        });
      return Promise.resolve(dashboard(period, 1));
    },
    async export() {
      throw new Error("network secret must not render");
    },
  });
  let view = await runtime.flush(AnalyticsDashboard);
  let weekButton: React.ReactElement<Record<string, unknown>> | undefined;
  visit(view, (element) => {
    if (element.type === "button" && element.props.children === "Bu hafta")
      weekButton = element;
  });
  assert.ok(weekButton);
  (weekButton.props.onClick as () => void)();
  view = await runtime.flush(AnalyticsDashboard);
  resolveMonth?.(dashboard("month", 10_000));
  view = await runtime.flush(AnalyticsDashboard);
  let metricValues: string[] = [];
  visit(view, (element) => {
    if (element.props.label === "Gelir")
      metricValues.push(String(element.props.value));
  });
  assert.doesNotMatch(metricValues.join(" "), /₺100[,.]00/);
  resolveWeek?.(dashboard("week", 25_000));
  view = await runtime.flush(AnalyticsDashboard);
  metricValues = [];
  visit(view, (element) => {
    if (element.props.label === "Gelir")
      metricValues.push(String(element.props.value));
  });
  assert.match(metricValues.join(" "), /₺250[,.]00/);

  let csvButton: React.ReactElement<Record<string, unknown>> | undefined;
  visit(view, (element) => {
    if (
      element.type === "button" &&
      element.props.children === "CSV dışa aktar"
    )
      csvButton = element;
  });
  assert.ok(csvButton);
  (csvButton.props.onClick as () => void)();
  view = await runtime.flush(AnalyticsDashboard);
  assert.match(text(view), /Analitik verileri şu anda kullanılamıyor/);
  assert.doesNotMatch(text(view), /network secret/);
});

test("analytics cleanup suppresses stale updates and always revokes an export URL", async () => {
  let resolveDashboard: ((value: unknown) => void) | undefined;
  const pending = new Promise<unknown>((resolve) => {
    resolveDashboard = resolve;
  });
  const { AnalyticsDashboard, runtime } = await compileAnalyticsDashboard({
    dashboard: () => pending,
    export: async () => "title,revenue\nDurable,25000\n",
  });
  await runtime.flush(AnalyticsDashboard);
  runtime.unmount();
  resolveDashboard?.(dashboard("month", 25_000));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtime.isDirty(), false);

  const ready = await compileAnalyticsDashboard({
    dashboard: async () => dashboard("month", 25_000),
    export: async () => "title,revenue\nDurable,25000\n",
  });
  let view = await ready.runtime.flush(ready.AnalyticsDashboard);
  view = await ready.runtime.flush(ready.AnalyticsDashboard);
  let csvButton: React.ReactElement<Record<string, unknown>> | undefined;
  visit(view, (element) => {
    if (
      element.type === "button" &&
      element.props.children === "CSV dışa aktar"
    )
      csvButton = element;
  });
  assert.ok(csvButton);
  const originalUrl = globalThis.URL;
  const originalDocument = globalThis.document;
  let revoked = 0;
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: {
      createObjectURL: () => "blob:analytics",
      revokeObjectURL: () => {
        revoked += 1;
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        href: "",
        download: "",
        click: () => {
          throw new Error("download_click_failed");
        },
      }),
    },
  });
  try {
    (csvButton.props.onClick as () => void)();
    await ready.runtime.flush(ready.AnalyticsDashboard);
    assert.equal(revoked, 1);
  } finally {
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: originalUrl,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  }
});

test("changing period during an export preserves export ownership until that export settles", async () => {
  let resolveExport: ((value: unknown) => void) | undefined;
  const { AnalyticsDashboard, runtime } = await compileAnalyticsDashboard({
    dashboard: async (period) => dashboard(period, 25_000),
    export: () =>
      new Promise((resolve) => {
        resolveExport = resolve;
      }),
  });
  let view = await runtime.flush(AnalyticsDashboard);
  view = await runtime.flush(AnalyticsDashboard);
  let csvButton: React.ReactElement<Record<string, unknown>> | undefined;
  let weekButton: React.ReactElement<Record<string, unknown>> | undefined;
  visit(view, (element) => {
    if (element.type !== "button") return;
    if (element.props.children === "CSV dışa aktar") csvButton = element;
    if (element.props.children === "Bu hafta") weekButton = element;
  });
  assert.ok(csvButton);
  assert.ok(weekButton);
  (csvButton.props.onClick as () => void)();
  view = await runtime.flush(AnalyticsDashboard);
  assert.match(text(view), /CSV hazırlanıyor/);
  (weekButton.props.onClick as () => void)();
  view = await runtime.flush(AnalyticsDashboard);
  assert.match(text(view), /CSV hazırlanıyor/);
  resolveExport?.("title,revenue\nDurable,25000\n");
  const originalUrl = globalThis.URL;
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: {
      createObjectURL: () => "blob:analytics",
      revokeObjectURL: () => undefined,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({ href: "", download: "", click: () => undefined }),
    },
  });
  try {
    view = await runtime.flush(AnalyticsDashboard);
    let restored: React.ReactElement<Record<string, unknown>> | undefined;
    visit(view, (element) => {
      if (
        element.type === "button" &&
        element.props.children === "CSV dışa aktar"
      )
        restored = element;
    });
    assert.ok(restored);
    assert.equal(restored.props.disabled, false);
  } finally {
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: originalUrl,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  }
});

test("analytics dashboard root preserves the page-shell grid contract", async () => {
  const css = await source(
    "components/analytics/analytics-dashboard.module.css",
  );
  assert.match(
    css,
    /[.]root\s*\{[^}]*display:\s*grid[^}]*gap:\s*1[.]5rem[^}]*min-width:\s*0/s,
  );
});

test("analytics page is behind server access and analytics capability only", async () => {
  const page = await source("app/analytics/page.tsx");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /analytics[.]read/);
  assert.match(page, /<CommerceAnalyticsWorkspace/);
  assert.doesNotMatch(page, /<AnalyticsDashboard|<PanelAnalyticsView/);
  assert.doesNotMatch(page, /tenantContext=|storeId=|membershipId=|planId=/);
});

test("settings navigation exposes the unified design workspace and working settings", async () => {
  const navigation = await source("lib/panel-ui/navigation.ts");
  for (const href of ["/settings/notifications", "/settings/design"])
    assert.match(navigation, new RegExp(href));
  for (const legacyHref of [
    "/settings/theme",
    "/settings/hero-banner",
    "/settings/promotion-banner",
    "/settings/marquee",
  ])
    assert.doesNotMatch(navigation, new RegExp(`item\\([^\\n]+${legacyHref}`));
  assert.match(navigation, /"\/analytics"/);
});

test("five typed storefront settings expose exact safe field contracts without secrets", () => {
  const contracts = [
    [
      "notification_setting",
      [
        "orderNotificationsEnabled",
        "notificationEmail",
        "senderLabel",
        "replyToEmail",
      ],
    ],
    [
      "theme_setting",
      [
        "colorScheme",
        "headingStyle",
        "productCardStyle",
        "productImageRatio",
        "homeProductLimit",
        "showBrandStory",
      ],
    ],
    ["hero_banner", ["headline", "body", "assetId", "destination", "enabled"]],
    [
      "promotion_banner",
      ["headline", "body", "destination", "startsAt", "endsAt", "enabled"],
    ],
    [
      "marquee_setting",
      ["items", "icon", "speed", "direction", "animation", "enabled"],
    ],
  ] as const;
  for (const [kind, fields] of contracts) {
    const definition = getMerchantModuleDefinition(kind);
    assert.deepEqual(
      definition.fields.map(({ key }) => key),
      fields,
    );
    assert.equal(definition.execution, "durable");
  }
  assert.deepEqual(
    getMerchantModuleDefinition("promotion_banner")
      .fields.filter(({ key }) => key === "startsAt" || key === "endsAt")
      .map(({ type }) => type),
    ["datetime", "datetime"],
  );
  assert.deepEqual(
    getMerchantModuleDefinition("marquee_setting").fields.map(
      ({ type }) => type,
    ),
    ["string-list", "enum", "enum", "enum", "enum", "boolean"],
  );
  assert.deepEqual(
    getMerchantModuleDefinition("marquee_setting").fields.find(
      ({ key }) => key === "icon",
    )?.allowedValues,
    ["none", "sparkle", "truck", "shield"],
  );
  assert.equal(MERCHANT_MODULE_DEFINITIONS.length, 34);
  assert.equal(
    JSON.stringify(MERCHANT_MODULE_DEFINITIONS).match(
      /secret|password|credential|token|api.?key/gi,
    ),
    null,
  );
});

test("typed setting pages remain server-authorized and do not send TenantContext to clients", async () => {
  const notifications = await source("app/settings/notifications/page.tsx");
  assert.match(notifications, /requireServerPanelAccess\(\)/);
  assert.match(notifications, /kind="notification_setting"/);
  assert.match(notifications, /configuration[.]manage/);
  assert.doesNotMatch(
    notifications,
    /tenantContext=|storeId=|membershipId=|secret|password|token/i,
  );

  for (const [path, section] of [
    ["app/settings/hero-banner/page.tsx", "hero"],
    ["app/settings/promotion-banner/page.tsx", "promotion"],
    ["app/settings/marquee/page.tsx", "announcement"],
  ] as const) {
    const value = await source(path);
    assert.match(value, /requireServerPanelAccess\(\)/);
    assert.match(
      value,
      new RegExp(`redirect\\(\"/settings/design\\?section=${section}\"\\)`),
    );
    assert.doesNotMatch(
      value,
      /tenantContext=|storeId=|membershipId=|secret|password|token/i,
    );
  }
  const themePage = await source("app/settings/theme/page.tsx");
  const designWorkspace = await source(
    "components/settings/design/DesignWorkspace.tsx",
  );
  const designStepEditor = await source(
    "components/settings/design/DesignStepEditor.tsx",
  );
  assert.match(themePage, /requireServerPanelAccess\(\)/);
  assert.match(themePage, /redirect\("\/settings\/design\?section=theme"\)/);
  assert.match(designWorkspace, /DesignStepEditor/);
  assert.match(designStepEditor, /StarterThemeComposer/);
  assert.match(designWorkspace, /canManage/);
  assert.doesNotMatch(
    themePage,
    /tenantContext=|storeId=|membershipId=|secret|password|token/i,
  );
});

test("dashboard model links to analytics only after the real route exists", async () => {
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const view = await source("components/dashboard/PanelDashboardHomeView.tsx");
  assert.match(model, /href:\s*"\/analytics"/);
  assert.match(view, /\/analytics/);
  assert.match(view, /createActiveVisitorPoller/);
  assert.doesNotMatch(
    `${model}\n${view}`,
    /conversionRate|deviceBreakdown|trafficSource/,
  );
});
