import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import {
  MERCHANT_MODULE_DEFINITIONS,
  getMerchantModuleDefinition,
} from "./merchant-admin-ui/presentation.ts";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const same = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => { slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next; dirty = true; };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] as { current: T }; },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++, prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (!prior || !same(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++, prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined;
      if (prior && same(prior.deps, deps)) return;
      prior?.cleanup?.();
      const cleanup = effect();
      slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}) };
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode, force = false) {
      if (force) dirty = true;
      for (let pass = 0; pass < 30; pass += 1) {
        if (dirty || latest === undefined) { dirty = false; cursor = 0; latest = component(); }
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
    isDirty() { return dirty; },
  };
}

function visit(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visit(child.props.children as ReactNode, visitor);
  });
}

function text(node: ReactNode): string {
  const values: string[] = [];
  const collect = (value: ReactNode) => {
    if (typeof value === "string" || typeof value === "number") values.push(String(value));
    else if (React.isValidElement<Record<string, unknown>>(value)) collect(value.props.children as ReactNode);
    else React.Children.forEach(value, collect);
  };
  collect(node);
  return values.join(" ");
}

async function compileAnalyticsDashboard(overrides: Readonly<{ dashboard(period: string): Promise<unknown>; export(period: string, format: string): Promise<unknown> }>) {
  const output = ts.transpileModule(await source("components/analytics/AnalyticsDashboard.tsx"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  class CompiledAnalyticsApiError extends Error { constructor(readonly code: "unavailable") { super(code); } }
  const module = { exports: {} as Record<string, unknown> };
  const component = ({ children, ...props }: Record<string, unknown>) => createElement("section", props, children as ReactNode);
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return runtime.runtime;
    if (specifier === "recharts") return { CartesianGrid: component, Line: component, LineChart: component, ResponsiveContainer: component, Tooltip: component, XAxis: component, YAxis: component };
    if (specifier === "@celebix/saas-contracts") return { ANALYTICS_PERIODS: ["today", "week", "month", "year"] };
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelPageShell: component,
      PanelPageHeader: ({ title, description }: { title: string; description?: string }) => createElement("header", null, title, description),
      PanelPanel: ({ title, children }: { title?: string; children?: ReactNode }) => createElement("section", null, title, children),
      PanelMetricCard: ({ label, value, detail }: { label: string; value: string; detail?: string }) => createElement("article", null, label, value, detail),
      PanelEmptyState: ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => createElement("section", null, title, description, action),
    };
    if (specifier === "@/lib/analytics-ui/client") return { AnalyticsApiError: CompiledAnalyticsApiError, analyticsApi: overrides };
    if (specifier === "./analytics-dashboard.module.css") return styles;
    throw new Error(`unexpected_analytics_module:${specifier}`);
  };
  const runtime = createHookRuntime();
  Function("require", "module", "exports", output)(requireModule, module, module.exports);
  return { AnalyticsDashboard: module.exports.AnalyticsDashboard as () => ReactNode, runtime };
}

function dashboard(period: string, revenueCents: number) {
  return { period, rangeStart: "2026-07-01T00:00:00.000Z", rangeEnd: "2026-07-22T15:00:00.000Z", generatedAt: "2026-07-22T15:00:00.000Z", currency: "TRY", revenueCents, orders: { total: 1, paid: 1, cancelled: 0, refunded: 0 }, customers: { total: 1, newInPeriod: 1 }, catalog: { activeProducts: 1, lowStockVariants: 0 }, series: [{ startsAt: "2026-07-01T00:00:00.000Z", orders: 1, revenueCents }], topProducts: [] };
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
    "role=\"img\"",
    "timeZone: \"UTC\"",
    "aria-label=\"Gelir zaman serisi; seçili dönemde kalıcı sipariş gelirini gösterir\"",
    "requestVersion",
  ]) {
    assert.match(value, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const unsupported of ["Canlı ziyaretçi", "Dönüşüm oranı", "Cihaz dağılımı", "Trafik kaynağı"]) {
    assert.doesNotMatch(value, new RegExp(unsupported));
  }
  assert.match(value, /error instanceof AnalyticsApiError/);
  assert.doesNotMatch(value, /caught[.]message|Error[.]message|console[.](log|error)/);
  assert.match(value, /formatMoney\(Number\(value\), dashboard[.]currency\)/);
  assert.doesNotMatch(value, /formatMoney\(Number\(value\) \* 100/);
  for (const label of ["Bugün", "Bu hafta", "Bu ay", "Bu yıl"]) assert.match(value, new RegExp(label));
});

test("period changes ignore stale results and export failures surface a stable message", async () => {
  let resolveMonth: ((value: unknown) => void) | undefined;
  let resolveWeek: ((value: unknown) => void) | undefined;
  const { AnalyticsDashboard, runtime } = await compileAnalyticsDashboard({
    dashboard(period) {
      if (period === "month") return new Promise((resolve) => { resolveMonth = resolve; });
      if (period === "week") return new Promise((resolve) => { resolveWeek = resolve; });
      return Promise.resolve(dashboard(period, 1));
    },
    async export() { throw new Error("network secret must not render"); },
  });
  let view = await runtime.flush(AnalyticsDashboard);
  let weekButton: React.ReactElement<Record<string, unknown>> | undefined;
  visit(view, (element) => { if (element.type === "button" && element.props.children === "Bu hafta") weekButton = element; });
  assert.ok(weekButton);
  (weekButton.props.onClick as () => void)();
  view = await runtime.flush(AnalyticsDashboard);
  resolveMonth?.(dashboard("month", 10_000));
  view = await runtime.flush(AnalyticsDashboard);
  let metricValues: string[] = [];
  visit(view, (element) => { if (element.props.label === "Gelir") metricValues.push(String(element.props.value)); });
  assert.doesNotMatch(metricValues.join(" "), /₺100[,.]00/);
  resolveWeek?.(dashboard("week", 25_000));
  view = await runtime.flush(AnalyticsDashboard);
  metricValues = [];
  visit(view, (element) => { if (element.props.label === "Gelir") metricValues.push(String(element.props.value)); });
  assert.match(metricValues.join(" "), /₺250[,.]00/);

  let csvButton: React.ReactElement<Record<string, unknown>> | undefined;
  visit(view, (element) => { if (element.type === "button" && element.props.children === "CSV dışa aktar") csvButton = element; });
  assert.ok(csvButton);
  (csvButton.props.onClick as () => void)();
  view = await runtime.flush(AnalyticsDashboard);
  assert.match(text(view), /Analitik verileri şu anda kullanılamıyor/);
  assert.doesNotMatch(text(view), /network secret/);
});

test("analytics cleanup suppresses stale updates and always revokes an export URL", async () => {
  let resolveDashboard: ((value: unknown) => void) | undefined;
  const pending = new Promise<unknown>((resolve) => { resolveDashboard = resolve; });
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
  visit(view, (element) => { if (element.type === "button" && element.props.children === "CSV dışa aktar") csvButton = element; });
  assert.ok(csvButton);
  const originalUrl = globalThis.URL;
  const originalDocument = globalThis.document;
  let revoked = 0;
  Object.defineProperty(globalThis, "URL", { configurable: true, value: { createObjectURL: () => "blob:analytics", revokeObjectURL: () => { revoked += 1; } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ href: "", download: "", click: () => { throw new Error("download_click_failed"); } }) } });
  try {
    (csvButton.props.onClick as () => void)();
    await ready.runtime.flush(ready.AnalyticsDashboard);
    assert.equal(revoked, 1);
  } finally {
    Object.defineProperty(globalThis, "URL", { configurable: true, value: originalUrl });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

test("changing period during an export preserves export ownership until that export settles", async () => {
  let resolveExport: ((value: unknown) => void) | undefined;
  const { AnalyticsDashboard, runtime } = await compileAnalyticsDashboard({
    dashboard: async (period) => dashboard(period, 25_000),
    export: () => new Promise((resolve) => { resolveExport = resolve; }),
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
  Object.defineProperty(globalThis, "URL", { configurable: true, value: { createObjectURL: () => "blob:analytics", revokeObjectURL: () => undefined } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ href: "", download: "", click: () => undefined }) } });
  try {
    view = await runtime.flush(AnalyticsDashboard);
    let restored: React.ReactElement<Record<string, unknown>> | undefined;
    visit(view, (element) => { if (element.type === "button" && element.props.children === "CSV dışa aktar") restored = element; });
    assert.ok(restored);
    assert.equal(restored.props.disabled, false);
  } finally {
    Object.defineProperty(globalThis, "URL", { configurable: true, value: originalUrl });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

test("analytics dashboard root preserves the page-shell grid contract", async () => {
  const css = await source("components/analytics/analytics-dashboard.module.css");
  assert.match(css, /[.]root\s*\{[^}]*display:\s*grid[^}]*gap:\s*1[.]5rem[^}]*min-width:\s*0/s);
});

test("analytics page is behind server access and analytics capability only", async () => {
  const page = await source("app/analytics/page.tsx");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /analytics[.]read/);
  assert.match(page, /<AnalyticsDashboard/);
  assert.match(page, /<PanelAnalyticsView/);
  assert.doesNotMatch(page, /tenantContext=|storeId=|membershipId=|planId=/);
});

test("settings navigation exposes every working typed storefront page", async () => {
  const navigation = await source("lib/panel-ui/navigation.ts");
  for (const href of [
    "/settings/notifications",
    "/settings/theme",
    "/settings/hero-banner",
    "/settings/promotion-banner",
    "/settings/marquee",
  ]) assert.match(navigation, new RegExp(href));
  assert.match(navigation, /"\/analytics"/);
});

test("five typed storefront settings expose exact safe field contracts without secrets", () => {
  const contracts = [
    ["notification_setting", ["emailEnabled", "smsEnabled", "pushEnabled", "senderLabel", "replyToEmail"]],
    ["theme_setting", ["colorScheme", "headingStyle", "productCardStyle", "productImageRatio", "homeProductLimit", "showBrandStory"]],
    ["hero_banner", ["headline", "body", "imageUrl", "destination", "enabled"]],
    ["promotion_banner", ["headline", "body", "destination", "startsAt", "endsAt", "enabled"]],
    ["marquee_setting", ["items", "icon", "speed", "direction", "animation", "enabled"]],
  ] as const;
  for (const [kind, fields] of contracts) {
    const definition = getMerchantModuleDefinition(kind);
    assert.deepEqual(definition.fields.map(({ key }) => key), fields);
    assert.equal(definition.execution, "durable");
  }
  assert.deepEqual(getMerchantModuleDefinition("promotion_banner").fields.filter(({ key }) => key === "startsAt" || key === "endsAt").map(({ type }) => type), ["datetime", "datetime"]);
  assert.deepEqual(getMerchantModuleDefinition("marquee_setting").fields.map(({ type }) => type), ["string-list", "enum", "enum", "enum", "enum", "boolean"]);
  assert.deepEqual(getMerchantModuleDefinition("marquee_setting").fields.find(({ key }) => key === "icon")?.allowedValues, ["none", "sparkle", "truck", "shield"]);
  assert.equal(MERCHANT_MODULE_DEFINITIONS.length, 33);
  assert.equal(JSON.stringify(MERCHANT_MODULE_DEFINITIONS).match(/secret|password|credential|token|api.?key/gi), null);
});

test("typed setting pages remain server-authorized and do not send TenantContext to clients", async () => {
  for (const [path, kind] of [
    ["app/settings/notifications/page.tsx", "notification_setting"],
    ["app/settings/theme/page.tsx", "theme_setting"],
    ["app/settings/hero-banner/page.tsx", "hero_banner"],
    ["app/settings/promotion-banner/page.tsx", "promotion_banner"],
    ["app/settings/marquee/page.tsx", "marquee_setting"],
  ] as const) {
    const value = await source(path);
    assert.match(value, /requireServerPanelAccess\(\)/);
    assert.match(value, new RegExp(`kind=\"${kind}\"`));
    assert.match(value, /configuration[.]manage/);
    assert.doesNotMatch(value, /tenantContext=|storeId=|membershipId=|secret|password|token/i);
  }
});

test("dashboard model links to analytics only after the real route exists", async () => {
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const view = await source("components/dashboard/PanelDashboardHomeView.tsx");
  assert.match(model, /href:\s*"\/analytics"/);
  assert.match(view, /\/analytics/);
  assert.doesNotMatch(`${model}\n${view}`, /liveVisitors|conversionRate|deviceBreakdown|trafficSource/);
});
