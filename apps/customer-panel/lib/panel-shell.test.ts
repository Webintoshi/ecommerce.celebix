import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as ReactModule from "react";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import type { OrderListItem } from "@celebix/saas-contracts";
import {
  getPanelRoutePresentation,
  isPanelNavigationPathActive,
  isPanelNavigationPathExact,
  PANEL_NAVIGATION,
} from "./panel-ui/navigation.ts";
import type { PanelChromeModel } from "./panel-ui/chrome-model.ts";
import { readyAuthority, unavailableAuthority } from "./panel-ui/authority-slice.ts";
import { createMerchantDashboardViewModel } from "./panel-ui/dashboard-model.ts";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

type HookTestProps = Record<string, unknown> & { children?: HookTestNode };
type HookTestComponent = (props: HookTestProps) => HookTestNode;
type HookTestNode = HookTestElement | HookTestNode[] | string | number | boolean | null | undefined;

interface HookTestElement {
  type: string | symbol | HookTestComponent;
  props: HookTestProps;
}

interface HookEffect {
  cleanup?: () => void;
  create: () => void | (() => void);
  deps?: readonly unknown[];
}

interface HookInstance {
  cursor: number;
  effects: Map<number, HookEffect>;
  hooks: unknown[];
  pendingEffects: Map<number, HookEffect>;
}

interface HookTestDocumentState {
  activeElement: HookTestHost | null;
  canReceiveFocus?: (element: HookTestHost) => boolean;
}

class HookTestHost {
  readonly children: HookTestHost[] = [];
  focusCount = 0;
  focusAttemptCount = 0;
  parent: HookTestHost | null = null;

  constructor(
    readonly type: string,
    readonly props: HookTestProps,
    private readonly documentState: HookTestDocumentState,
  ) {}

  contains(candidate: HookTestHost | null): boolean {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }

  isWithinClassName(className: string): boolean {
    let current: HookTestHost | null = this;
    while (current) {
      if (typeof current.props.className === "string"
        && current.props.className.split(/\s+/).includes(className)) return true;
      current = current.parent;
    }
    return false;
  }

  focus(): void {
    this.focusAttemptCount += 1;
    if (this.documentState.canReceiveFocus?.(this) === false) return;
    this.focusCount += 1;
    this.documentState.activeElement = this;
  }

  querySelectorAll(): HookTestHost[] {
    const descendants = this.children.flatMap((child): HookTestHost[] => [
      child,
      ...child.querySelectorAll(),
    ]);
    return descendants.filter((element) => (
      (element.type === "a" && typeof element.props.href === "string")
      || (element.type === "button" && !element.props.disabled)
      || (typeof element.props.tabIndex === "number" && element.props.tabIndex !== -1)
    ));
  }
}

function sameDependencies(left?: readonly unknown[], right?: readonly unknown[]): boolean {
  return left !== undefined
    && right !== undefined
    && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

function createPanelInteractionHarness(
  root: HookTestComponent,
  props: HookTestProps,
  documentState: HookTestDocumentState,
) {
  const fragment = Symbol("hook-test-fragment");
  const instances = new Map<string, HookInstance>();
  const seenInstances = new Set<string>();
  let activeInstance: HookInstance | null = null;
  let hosts: HookTestHost[] = [];
  let renderRequested = true;
  let rootComponent = root;

  function requireActiveInstance(): HookInstance {
    assert.ok(activeInstance, "hook rendered outside a component");
    return activeInstance;
  }

  function nextHook(instance: HookInstance): number {
    const index = instance.cursor;
    instance.cursor += 1;
    return index;
  }

  const react = {
    createContext<T>(initialValue: T) {
      const context = {
        current: initialValue,
        Provider(providerProps: HookTestProps) {
          context.current = providerProps.value as T;
          return providerProps.children;
        },
      };
      return context;
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T {
      const instance = requireActiveInstance();
      const index = nextHook(instance);
      const previous = instance.hooks[index] as { callback: T; deps: readonly unknown[] } | undefined;
      if (previous && sameDependencies(previous.deps, deps)) return previous.callback;
      instance.hooks[index] = { callback, deps };
      return callback;
    },
    useContext<T>(context: { current: T }): T {
      return context.current;
    },
    useEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
      const instance = requireActiveInstance();
      const index = nextHook(instance);
      const previous = instance.effects.get(index);
      if (!previous || !sameDependencies(previous.deps, deps)) {
        instance.pendingEffects.set(index, { create, deps });
      }
    },
    useRef<T>(initialValue: T): { current: T } {
      const instance = requireActiveInstance();
      const index = nextHook(instance);
      if (!instance.hooks[index]) instance.hooks[index] = { current: initialValue };
      return instance.hooks[index] as { current: T };
    },
    useState<T>(initialValue: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] {
      const instance = requireActiveInstance();
      const index = nextHook(instance);
      type StateCell = {
        value: T;
        set: (next: T | ((current: T) => T)) => void;
      };
      let cell = instance.hooks[index] as StateCell | undefined;
      if (!cell) {
        cell = {
          value: typeof initialValue === "function"
            ? (initialValue as () => T)()
            : initialValue,
          set(next) {
            cell!.value = typeof next === "function"
              ? (next as (current: T) => T)(cell!.value)
              : next;
            renderRequested = true;
          },
        };
        instance.hooks[index] = cell;
      }
      return [cell.value, cell.set];
    },
  };

  const jsxRuntime = {
    Fragment: fragment,
    jsx(type: HookTestElement["type"], elementProps: HookTestProps): HookTestElement {
      return { type, props: elementProps ?? {} };
    },
    jsxs(type: HookTestElement["type"], elementProps: HookTestProps): HookTestElement {
      return { type, props: elementProps ?? {} };
    },
  };

  function renderNode(node: HookTestNode, path: string): HookTestHost[] {
    if (node === null || node === undefined || typeof node === "boolean") return [];
    if (typeof node === "string" || typeof node === "number") return [];
    if (Array.isArray(node)) {
      return node.flatMap((child, index) => renderNode(child, `${path}.${index}`));
    }
    if (typeof node.type === "symbol") return renderNode(node.props.children, `${path}.fragment`);
    if (typeof node.type === "function") {
      const componentPath = `${path}.${node.type.name || "anonymous"}`;
      const instance = instances.get(componentPath) ?? {
        cursor: 0,
        effects: new Map(),
        hooks: [],
        pendingEffects: new Map(),
      };
      instances.set(componentPath, instance);
      seenInstances.add(componentPath);
      instance.cursor = 0;
      instance.pendingEffects.clear();
      const previousInstance = activeInstance;
      activeInstance = instance;
      const output = node.type(node.props);
      activeInstance = previousInstance;
      return renderNode(output, `${componentPath}.output`);
    }

    const host = new HookTestHost(node.type, node.props, documentState);
    const ref = node.props.ref as { current: HookTestHost | null } | undefined;
    if (ref) ref.current = host;
    const children = renderNode(node.props.children, `${path}.${node.type}`);
    for (const child of children) child.parent = host;
    host.children.push(...children);
    hosts.push(host);
    return [host];
  }

  function commitEffects(): void {
    for (const [path, instance] of instances) {
      if (seenInstances.has(path)) continue;
      for (const effect of instance.effects.values()) effect.cleanup?.();
      instances.delete(path);
    }
    for (const path of seenInstances) {
      const instance = instances.get(path)!;
      for (const [index, pending] of instance.pendingEffects) {
        instance.effects.get(index)?.cleanup?.();
        const cleanup = pending.create();
        instance.effects.set(index, {
          ...pending,
          cleanup: typeof cleanup === "function" ? cleanup : undefined,
        });
      }
      instance.pendingEffects.clear();
    }
  }

  function flush(): void {
    let renderCount = 0;
    while (renderRequested) {
      assert.ok(renderCount < 10, "hook interaction render loop did not settle");
      renderCount += 1;
      renderRequested = false;
      seenInstances.clear();
      hosts = [];
      renderNode(jsxRuntime.jsx(rootComponent, props), "root");
      if (documentState.activeElement && !hosts.includes(documentState.activeElement)) {
        documentState.activeElement = null;
      }
      commitEffects();
    }
  }

  function unmount(): void {
    for (const instance of instances.values()) {
      for (const effect of instance.effects.values()) effect.cleanup?.();
    }
    instances.clear();
    hosts = [];
  }

  return {
    flush,
    hosts: () => hosts,
    jsxRuntime,
    react,
    setRoot(nextRoot: HookTestComponent) {
      rootComponent = nextRoot;
      renderRequested = true;
    },
    unmount,
  };
}

async function compileHookTestComponent(
  path: string,
  requireModule: (specifier: string) => unknown,
): Promise<HookTestComponent> {
  const componentSource = await source(path);
  const output = ts.transpileModule(componentSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)(
    requireModule,
    compiledModule,
    compiledModule.exports,
  );
  const exportName = path.split("/").at(-1)?.replace(/\.tsx$/, "");
  const component = exportName ? compiledModule.exports[exportName] : undefined;
  assert.equal(typeof component, "function", `missing compiled component: ${exportName}`);
  return component as HookTestComponent;
}

async function renderPanelNavigation(pathname: string): Promise<string> {
  const navigationSource = await source("components/panel/PanelNavigation.tsx");
  const output = ts.transpileModule(navigationSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const Link = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement("a", props, children);
  const compiledModule: {
    exports: { PanelNavigation?: ComponentType<{ mode: "desktop" | "drawer" }> };
  } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return ReactModule;
    if (specifier === "lucide-react") {
      return { BadgeCheck: Icon, BadgeDollarSign: Icon, BadgePercent: Icon, BarChart3: Icon, Calculator: Icon, ChevronDown: Icon, Code2: Icon, CreditCard: Icon, FileText: Icon, Gauge: Icon, Gift: Icon, Home: Icon, Languages: Icon, Layers3: Icon, Link2: Icon, ListTree: Icon, Mail: Icon, Map: Icon, Megaphone: Icon, MessageCircle: Icon, Newspaper: Icon, Package: Icon, Palette: Icon, Percent: Icon, Phone: Icon, PieChart: Icon, Puzzle: Icon, ReceiptText: Icon, ScanBarcode: Icon, ScrollText: Icon, Search: Icon, SearchCheck: Icon, Settings: Icon, Settings2: Icon, Share2: Icon, ShieldCheck: Icon, ShoppingBag: Icon, ShoppingCart: Icon, SlidersHorizontal: Icon, Star: Icon, Store: Icon, Tags: Icon, Truck: Icon, Upload: Icon, Users: Icon, Warehouse: Icon };
    }
    if (specifier === "next/link") return Link;
    if (specifier === "next/navigation") return { usePathname: () => pathname };
    if (specifier === "@/lib/panel-ui/navigation") {
      return { isPanelNavigationPathActive, isPanelNavigationPathExact, PANEL_NAVIGATION };
    }
    if (specifier === "./panel-shell.module.css") {
      const styles = new Proxy({}, {
        get: (_target, property) => property === "__esModule"
          ? true
          : property === "default"
            ? styles
            : String(property),
      });
      return styles;
    }
    throw new Error(`unexpected_panel_navigation_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(
    requireModule,
    compiledModule,
    compiledModule.exports,
  );
  assert.ok(compiledModule.exports.PanelNavigation);
  return renderToStaticMarkup(createElement(compiledModule.exports.PanelNavigation, { mode: "desktop" }));
}

async function createInteractivePanelNavigation(pathname: string) {
  const documentState: HookTestDocumentState = { activeElement: null };
  const EmptyRoot: HookTestComponent = () => null;
  const harness = createPanelInteractionHarness(EmptyRoot, { mode: "desktop" }, documentState);
  const Icon = (props: HookTestProps) => harness.jsxRuntime.jsx("svg", props);
  const Link: HookTestComponent = ({ children, ...props }) => harness.jsxRuntime.jsx("a", { ...props, children });
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule"
      ? true
      : property === "default"
        ? styles
        : String(property),
  });
  const PanelNavigation = await compileHookTestComponent(
    "components/panel/PanelNavigation.tsx",
    (specifier) => {
      if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
      if (specifier === "react") return harness.react;
      if (specifier === "lucide-react") {
        return new Proxy({ __esModule: true }, { get: (_target, property) => property === "__esModule" ? true : Icon });
      }
      if (specifier === "next/link") return Link;
      if (specifier === "next/navigation") return { usePathname: () => pathname };
      if (specifier === "@/lib/panel-ui/navigation") {
        return { isPanelNavigationPathActive, isPanelNavigationPathExact, PANEL_NAVIGATION };
      }
      if (specifier === "./panel-shell.module.css") return styles;
      throw new Error(`unexpected_interactive_panel_navigation_import:${specifier}`);
    },
  );
  harness.setRoot(PanelNavigation);
  harness.flush();
  return harness;
}

type DashboardPresentationInput = Readonly<{
  dashboard: ReturnType<typeof createMerchantDashboardViewModel>;
  state: "loading" | "loaded" | "error";
  analyticsState?: "loading" | "loaded" | "error";
  recentOrders?: readonly OrderListItem[];
  recentOrdersState?: "loading" | "loaded" | "error";
}>;

async function renderPanelDashboard(
  model: PanelChromeModel,
  presentation?: DashboardPresentationInput,
): Promise<string> {
  const viewSource = await source("components/dashboard/PanelDashboardHomeView.tsx");
  const output = ts.transpileModule(viewSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule: {
    exports: {
      PanelDashboardHomeView?: ComponentType;
      PanelDashboardPresentation?: ComponentType<DashboardPresentationInput & { onRefresh: () => void }>;
    };
  } = { exports: {} };
  const PanelActionButton = ({ children, href }: { children?: ReactNode; href: string }) =>
    createElement("a", { href }, children);
  const PanelMetricCard = ({ detail, label, value }: {
    detail?: string;
    label: string;
    value: string;
  }) => createElement(
    "article",
    null,
    createElement("span", null, label),
    createElement("strong", null, value),
    detail ? createElement("small", null, detail) : null,
  );
  const PanelPageHeader = ({ actions, description, title }: {
    actions?: ReactNode;
    description?: string;
    title: string;
  }) => createElement(
    "header",
    null,
    createElement("h1", null, title),
    description ? createElement("p", null, description) : null,
    actions,
  );
  const PanelPageShell = ({ children }: { children?: ReactNode }) =>
    createElement("section", null, children);
  const PanelPanel = ({ children, title }: { children?: ReactNode; title?: string }) =>
    createElement("section", null, title ? createElement("h2", null, title) : null, children);
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule"
      ? true
      : property === "default"
        ? styles
        : String(property),
  });
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "lucide-react") {
      const Icon = (props: Record<string, unknown>) => createElement("svg", props);
      return { CalendarDays: Icon, Globe2: Icon, PackageCheck: Icon, Store: Icon };
    }
    if (specifier === "@celebix/saas-contracts") {
      return { ANALYTICS_PERIODS: ["today", "week", "month", "year"] };
    }
    if (specifier === "react") {
      return {
        useCallback: (callback: unknown) => callback,
        useEffect: () => undefined,
        useRef: (value: unknown) => ({ current: value }),
        useState: (value: unknown) => [value, () => undefined],
      };
    }
    if (specifier === "recharts") {
      const ChartContainer = ({ children, data }: {
        children?: ReactNode;
        data?: readonly Readonly<{ label: string; value: number }>[];
      }) => createElement(
        "div",
        data
          ? {
            "data-chart-labels": data.map(({ label }) => label).join("|"),
            "data-chart-values": data.map(({ value }) => value).join(","),
          }
          : null,
        children,
      );
      const ChartPrimitive = () => null;
      return {
        Bar: ChartPrimitive,
        BarChart: ChartContainer,
        CartesianGrid: ChartPrimitive,
        Line: ChartPrimitive,
        LineChart: ChartContainer,
        ResponsiveContainer: ChartContainer,
        Tooltip: ChartPrimitive,
        XAxis: ChartPrimitive,
        YAxis: ChartPrimitive,
      };
    }
    if (specifier === "@/components/panel/PanelPageShell") {
      return { PanelActionButton, PanelMetricCard, PanelPageHeader, PanelPageShell, PanelPanel };
    }
    if (specifier === "@/components/panel/PanelLayoutClient") {
      return { usePanelChromeModel: () => model };
    }
    if (specifier === "@/components/panel/PanelTopbarChrome") {
      return { PanelTopbarBridge: ({ actions }: { actions?: ReactNode }) => actions ?? null };
    }
    if (specifier === "@/lib/catalog-ui/client") {
      return { catalogApi: { getDashboardSummary: async () => undefined } };
    }
    if (specifier === "@/lib/order-ui/client") {
      return { orderApi: { getDashboardSummary: async () => undefined } };
    }
    if (specifier === "@/lib/abandoned-cart-ui/client") {
      return { abandonedCartApi: { getSummary: async () => undefined } };
    }
    if (specifier === "@/lib/customer-ui/client") {
      return { customerApi: { summary: async () => undefined } };
    }
    if (specifier === "@/lib/analytics-ui/client") {
      return { analyticsApi: { dashboard: async () => undefined } };
    }
    if (specifier === "@/lib/panel-ui/dashboard-model") {
      return { createMerchantDashboardViewModel };
    }
    if (specifier === "./panel-dashboard.module.css") return styles;
    throw new Error(`unexpected_panel_dashboard_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(
    requireModule,
    compiledModule,
    compiledModule.exports,
  );
  if (presentation) {
    assert.ok(compiledModule.exports.PanelDashboardPresentation);
    return renderToStaticMarkup(createElement(compiledModule.exports.PanelDashboardPresentation, {
      ...presentation,
      onRefresh: () => undefined,
    }));
  }
  assert.ok(compiledModule.exports.PanelDashboardHomeView);
  return renderToStaticMarkup(createElement(compiledModule.exports.PanelDashboardHomeView));
}

test("topbar chrome exposes a provider, page bridge, and dedicated action portal", async () => {
  const topbar = await source("components/panel/PanelTopbarChrome.tsx");
  assert.match(topbar, /PanelTopbarChromeProvider/);
  assert.match(topbar, /PanelTopbarBridge/);
  assert.match(topbar, /panel-topbar-actions/);
  assert.match(topbar, /createPortal/);
  assert.match(topbar, /new Map<symbol, PanelTopbarChromeSnapshot>/);
  assert.match(topbar, /const owner = Symbol\("panel-topbar-owner"\)/);
  assert.match(topbar, /return Object\.freeze\(/);
  assert.match(topbar, /const wasActive = \[\.\.\.registrations\.keys\(\)\]\.at\(-1\) === owner/);
  assert.match(topbar, /registrations\.delete\(owner\)/);
  assert.match(topbar, /\[\.\.\.registrations\.values\(\)\]\.at\(-1\) \?\? null/);
  assert.match(topbar, /publish\(\{ title: state\.title, subtitle: state\.subtitle \}\)/);
  assert.doesNotMatch(topbar, /publish\(\{[^}]*actions/s);
});

test("page shell exports the fixed Hemenaku-derived primitive set without donor imports", async () => {
  const pageShell = await source("components/panel/PanelPageShell.tsx");
  const styles = await source("components/panel/panel-shell.module.css");
  for (const name of [
    "PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge",
    "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState",
    "PanelActionButton", "PanelEmptyState",
  ]) assert.match(pageShell, new RegExp("export function " + name));
  assert.doesNotMatch(pageShell, /apps\/admin|@\/components\/admin|\/api\/admin|supabase/i);
  assert.match(pageShell, /styles\.pageActions/);
  assert.match(styles, /\.pageActions,[\s\S]*?display: flex/);
  assert.match(
    styles,
    /@media \(min-width: 1025px\)\s*\{\s*\.pageActions\s*\{\s*display: none;\s*\}\s*\}/,
  );
});

test("server layout projects TenantContext before entering the client shell", async () => {
  const layout = await source("app/(panel)/layout.tsx");
  const shell = await source("components/panel/PanelShell.tsx");
  const client = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(layout, /createPanelChromeModel\(tenantContext\)/);
  assert.match(layout, /PanelShell model=/);
  assert.doesNotMatch(client, /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
  assert.doesNotMatch(shell, /tenantContext/);
});

test("desktop shell carries exact donor tokens, fixed width, topbar, and supported navigation", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  const layout = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(css, /#2A2A2A/i);
  assert.match(css, /#F9F9F9/i);
  assert.match(css, /#FF6A00/i);
  assert.match(css, /\.desktopSidebar\s*\{[\s\S]*?width:\s*15[.]3125rem;/);
  assert.match(css, /\.workspace\s*\{[\s\S]*?margin-left:\s*15[.]3125rem;/);
  assert.doesNotMatch(css, /width:\s*(?:15\.5|16)rem/);
  assert.match(css, /min-width:\s*1025px/);
  assert.match(layout, /panel-topbar-actions/);
});

test("desktop topbar matches the shared Hemenaku management-header anatomy on every route", async () => {
  const layout = await source("components/panel/PanelLayoutClient.tsx");
  const utilities = await source("components/panel/PanelTopbarUtilities.tsx");
  const styles = await source("components/panel/panel-shell.module.css");

  assert.match(layout, />ORTAK ADMİN</);
  assert.match(layout, /styles[.]desktopTopbarEyebrow/);
  assert.match(layout, /styles[.]desktopTopbarTitle/);
  assert.match(layout, /PanelTopbarUtilities/);
  assert.match(utilities, /Bildirim merkezi/);
  assert.match(utilities, /Bana Sorun/);
  assert.match(utilities, /href="\/settings\/notifications"/);
  assert.match(styles, /[.]desktopTopbar\s*\{[\s\S]*?min-height:\s*5[.]5rem;/);
  assert.match(styles, /[.]desktopTopbarEyebrow\s*\{[\s\S]*?letter-spacing:/);
  assert.match(styles, /[.]desktopTopbarUtilities\s*\{[\s\S]*?display:\s*flex;/);
  assert.doesNotMatch(`${layout}\n${utilities}`, /TenantContext|principal|issuer|subject|storeId|membershipId|\/api\/admin|supabase/i);
});

test("desktop sidebar matches the approved compact Celebix navigation anatomy", async () => {
  const navigation = await renderPanelNavigation("/");
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  const logout = await source("components/panel/LogoutButton.tsx");
  const css = await source("components/panel/panel-shell.module.css");

  assert.match(navigation, />Giriş</);
  assert.match(navigation, />SEO Araçları</);
  assert.doesNotMatch(navigation, />Özet</);
  assert.doesNotMatch(navigation, />Analizler</);
  assert.doesNotMatch(navigation, />Kurulum</);

  assert.match(sidebar, /\/Logo\/celebix-beyaz-logo[.]svg/);
  assert.match(sidebar, /styles[.]sidebarAccount/);
  assert.match(sidebar, /styles[.]sidebarAvatar/);
  assert.doesNotMatch(sidebar, /className=\{styles[.]merchantIdentity\}/);
  assert.match(logout, /LogOut/);
  assert.match(logout, /:\s*"Çıkış"/);
  const navigationSource = await source("components/panel/PanelNavigation.tsx");
  assert.match(navigationSource, /discounts:\s*Percent/);
  assert.match(navigationSource, /content:\s*FileText/);
  assert.match(navigationSource, /settings:\s*Settings/);
  assert.match(navigationSource, /seo:\s*Search/);

  assert.match(css, /\.brandMark\s*\{[\s\S]*?width:\s*8rem;/);
  assert.match(css, /\.brandMark\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.navigationLabel\s*\{[\s\S]*?font-size:\s*0[.]9375rem;/);
  assert.match(css, /\.sidebarFooter\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(css, /\.sidebarAvatar\s*\{[\s\S]*?width:\s*1[.]75rem;/);
});

test("desktop navigation exposes accessible dropdown groups and opens only the active family initially", async () => {
  const harness = await createInteractivePanelNavigation("/products/collections");
  try {
    const toggles = () => harness.hosts().filter((host) => (
      host.type === "button" && typeof host.props["aria-controls"] === "string"
    ));
    const toggle = (label: string) => toggles().find((host) => host.props["aria-label"] === label);
    const children = (id: string) => harness.hosts().find((host) => host.props.id === id);

    assert.equal(toggles().length, 9);
    assert.equal(toggle("Ürünler alt menüsünü kapat")?.props["aria-expanded"], true);
    assert.equal(children("panel-nav-catalog-desktop")?.props.hidden, false);
    assert.equal(toggle("Siparişler alt menüsünü aç")?.props["aria-expanded"], false);
    assert.equal(children("panel-nav-orders-desktop")?.props.hidden, true);

    const ordersToggle = toggle("Siparişler alt menüsünü aç");
    assert.ok(ordersToggle);
    (ordersToggle.props.onClick as () => void)();
    harness.flush();
    assert.equal(toggle("Siparişler alt menüsünü kapat")?.props["aria-expanded"], true);
    assert.equal(children("panel-nav-orders-desktop")?.props.hidden, false);

    const catalogToggle = toggle("Ürünler alt menüsünü kapat");
    assert.ok(catalogToggle);
    (catalogToggle.props.onClick as () => void)();
    harness.flush();
    assert.equal(toggle("Ürünler alt menüsünü aç")?.props["aria-expanded"], false);
    assert.equal(children("panel-nav-catalog-desktop")?.props.hidden, true);
  } finally {
    harness.unmount();
  }
});

test("sidebar uses the approved white Celebix logo from a local immutable asset", async () => {
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  assert.match(sidebar, /\/Logo\/celebix-beyaz-logo[.]svg/);
  assert.match(sidebar, /styles[.]brandMark/);
  assert.doesNotMatch(sidebar, /https?:\/\//);

  const logo = await source("public/Logo/celebix-beyaz-logo.svg");
  assert.match(logo, /viewBox="240 240 1540 390"/);
  assert.match(logo, /fill="#FAF9F9"/);
  assert.match(logo, /fill="#FE6100"/);
});

test("desktop topbar follows route transitions while the active bridge keeps precedence", async () => {
  const documentState: HookTestDocumentState & {
    body: { style: { overflow: string } };
    documentElement: { style: { removeProperty: () => void; setProperty: () => void } };
  } = {
    activeElement: null,
    body: { style: { overflow: "" } },
    documentElement: { style: { removeProperty() {}, setProperty() {} } },
  };
  const desktopQuery = {
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerHeight: 900,
      matchMedia: () => desktopQuery,
      visualViewport: undefined,
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentState });

  let pathname = "/";
  type ChromePublisher = (state: { title: string; subtitle?: string } | null) => void;
  const bridge = { publish: null as ChromePublisher | null };
  const EmptyRoot: HookTestComponent = () => null;
  const harness = createPanelInteractionHarness(EmptyRoot, {
    model: { membershipLabel: "Merchant", storeSlug: "demo" },
    children: "content",
  }, documentState);
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule"
      ? true
      : property === "default"
        ? styles
        : String(property),
  });
  const PanelSidebar: HookTestComponent = () => harness.jsxRuntime.jsx("aside", {});
  const PanelMobileDock: HookTestComponent = () => harness.jsxRuntime.jsx("nav", {});
  const PanelTopbarUtilities: HookTestComponent = () => harness.jsxRuntime.jsx("nav", {});
  const PanelTopbarChromeProvider: HookTestComponent = (props) => {
    bridge.publish = props.onChange as ChromePublisher;
    return props.children;
  };

  try {
    const PanelLayoutClient = await compileHookTestComponent(
      "components/panel/PanelLayoutClient.tsx",
      (specifier) => {
        if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
        if (specifier === "react") return harness.react;
        if (specifier === "next/navigation") return { usePathname: () => pathname };
        if (specifier === "@/lib/panel-ui/navigation") return { getPanelRoutePresentation };
        if (specifier === "./PanelMobileDock") return { PanelMobileDock };
        if (specifier === "./PanelSidebar") return { PanelSidebar };
        if (specifier === "./PanelTopbarChrome") return { PanelTopbarChromeProvider };
        if (specifier === "./PanelTopbarUtilities") return { PanelTopbarUtilities };
        if (specifier === "./panel-shell.module.css") return styles;
        throw new Error(`unexpected_panel_layout_import:${specifier}`);
      },
    );
    const topbarText = (tagName: "strong" | "span") => harness.hosts().find((host) => (
      host.type === tagName && host.isWithinClassName("desktopTopbar")
    ))?.props.children;
    const renderRoute = (nextPathname: string) => {
      pathname = nextPathname;
      harness.setRoot(PanelLayoutClient);
      harness.flush();
    };

    for (const [nextPathname, expectedTitle] of [
      ["/", "Özet"],
      ["/products", "Ürün kataloğu"],
      ["/products/new", "Yeni ürün oluştur"],
      ["/products/product-123", "Ürün ayrıntısı"],
      ["/orders", "Siparişler"],
      ["/orders/quick-links", "Hızlı Siparişler"],
      ["/orders/order-123", "Sipariş ayrıntısı"],
      ["/setup", "Kurulum durumu"],
    ] as const) {
      renderRoute(nextPathname);
      assert.equal(topbarText("strong"), expectedTitle);
    }

    renderRoute("/products");
    assert.ok(bridge.publish);
    bridge.publish({ title: "Köprü başlığı", subtitle: "Köprü açıklaması" });
    harness.flush();
    assert.equal(topbarText("strong"), "Köprü başlığı");
    assert.equal(topbarText("span"), "ORTAK ADMİN");

    renderRoute("/setup");
    assert.equal(topbarText("strong"), "Kurulum durumu");
    assert.equal(topbarText("span"), "ORTAK ADMİN");

    assert.ok(bridge.publish);
    bridge.publish({ title: "Kurulum köprüsü" });
    harness.flush();
    assert.equal(topbarText("strong"), "Kurulum köprüsü");
    bridge.publish(null);
    harness.flush();
    assert.equal(topbarText("strong"), "Kurulum durumu");
  } finally {
    harness.unmount();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("create routes expose the exact donor-approved create navigation child", async () => {
  const html = await renderPanelNavigation("/products/new");
  const currentLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)]
    .map(([link]) => ({
      href: link.match(/href="([^"]+)"/)?.[1],
      label: link.replace(/<[^>]*>/g, ""),
    }));

  assert.deepEqual(currentLinks, [{ href: "/products/new", label: "Yeni ürün" }]);
  assert.match(html, /href="\/products\/new"/);
});

test("detail routes keep their family open without claiming the index child as current", async () => {
  const html = await renderPanelNavigation("/products/11111111-1111-4111-8111-111111111111");
  const currentLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)];
  assert.deepEqual(currentLinks, []);
  assert.match(html, /aria-label="Ürünler alt menüsünü kapat"/);
  assert.match(html, /href="\/products"/);
});

test("content and settings hubs remain directly navigable", async () => {
  for (const [pathname, label] of [["/content", "İçerik"], ["/settings", "Ayarlar"]] as const) {
    const html = await renderPanelNavigation(pathname);
    const currentLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)]
      .map(([link]) => ({
        href: link.match(/href="([^"]+)"/)?.[1],
        label: link.replace(/<[^>]*>/g, ""),
      }));
    assert.deepEqual(currentLinks, [{ href: pathname, label }]);
  }
});

test("orders/quick-links marks only Hızlı Siparişler as the current page", async () => {
  const html = await renderPanelNavigation("/orders/quick-links");
  const currentLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)]
    .map(([link]) => ({
      href: link.match(/href="([^"]+)"/)?.[1],
      label: link.replace(/<[^>]*>/g, ""),
    }));

  assert.deepEqual(currentLinks, [{ href: "/orders/quick-links", label: "Hızlı Siparişler" }]);
});

test("logout stays on the existing same-origin JSON mutation", async () => {
  const logout = await source("components/panel/LogoutButton.tsx");
  assert.match(logout, /fetch\(["']\/api\/session\/logout["']/);
  assert.match(logout, /method:\s*["']POST["']/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.match(logout, /application\/json/);
  assert.match(logout, /location\.assign\(["']\/login["']\)/);
  assert.doesNotMatch(logout, /document\.cookie|localStorage|sessionStorage/);
});

test("mobile drawer has dialog, Escape, backdrop, focus-return, and swipe-close behavior", async () => {
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  const layout = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /aria-modal="true"/);
  assert.match(sidebar, /Escape/);
  assert.match(sidebar, /onTouchStart/);
  assert.match(sidebar, /onTouchMove/);
  assert.match(sidebar, /onTouchEnd/);
  assert.match(sidebar, /\.focus\(\)/);
  assert.match(layout, /document\.body\.style\.overflow/);
});

test("mobile dock is exact, safe-area aware, 48px, reduced-motion, and breakpoint-correct", async () => {
  const dock = await source("components/panel/PanelMobileDock.tsx");
  const css = await source("components/panel/panel-shell.module.css");
  assert.match(dock, /label:\s*"Özet"/);
  assert.match(dock, /label:\s*"Siparişler"/);
  assert.match(dock, /label:\s*"Ürünler"/);
  assert.match(dock, />Menü<\/span>/);
  assert.doesNotMatch(dock, /Toshi|Müşteri|Bildirim/);
  assert.match(css, /max-width:\s*1024px/);
  assert.match(css, /min-width:\s*1025px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /--panel-keyboard-inset/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /[.]desktopSidebar\s*,\s*[.]desktopTopbar\s*\{\s*display:\s*none/u);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?[.]desktopSidebar\s*\{\s*display:\s*none/u);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?[.]desktopTopbar\s*\{[\s\S]*?display:\s*flex/u);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?[.]desktopTopbar > div:last-child\s*\{[\s\S]*?display:\s*none/u);
});

test("crossing into desktop closes an open mobile drawer and releases its modal effects", async () => {
  type Listener = (event: Record<string, unknown>) => void;
  const windowListeners = new Map<string, Set<Listener>>();
  const mediaListeners = new Set<Listener>();
  const documentState: {
    activeElement: HookTestHost | null;
    body: { style: { overflow: string } };
    canReceiveFocus?: (element: HookTestHost) => boolean;
    documentElement: { style: { removeProperty: () => void; setProperty: () => void } };
  } = {
    activeElement: null,
    body: { style: { overflow: "clip" } },
    documentElement: { style: { removeProperty() {}, setProperty() {} } },
  };
  const desktopQuery = {
    matches: false,
    media: "(min-width: 1025px)",
    addEventListener(type: string, listener: Listener) {
      assert.equal(type, "change");
      mediaListeners.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      assert.equal(type, "change");
      mediaListeners.delete(listener);
    },
  };
  const windowState = {
    innerHeight: 900,
    visualViewport: undefined,
    addEventListener(type: string, listener: Listener) {
      const listeners = windowListeners.get(type) ?? new Set<Listener>();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: Listener) {
      windowListeners.get(type)?.delete(listener);
    },
    matchMedia(query: string) {
      assert.equal(query, desktopQuery.media);
      return desktopQuery;
    },
  };
  documentState.canReceiveFocus = (element) => !(
    desktopQuery.matches && element.isWithinClassName("mobileDock")
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowState });
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentState });

  const EmptyRoot: HookTestComponent = () => null;
  const harness = createPanelInteractionHarness(EmptyRoot, {
    model: { membershipLabel: "Merchant", storeSlug: "demo" },
    children: "content",
  }, documentState);
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule"
      ? true
      : property === "default"
        ? styles
        : String(property),
  });
  const Link: HookTestComponent = (props) => harness.jsxRuntime.jsx("a", props);
  const Icon: HookTestComponent = (props) => harness.jsxRuntime.jsx("svg", props);
  const PanelNavigation: HookTestComponent = () => harness.jsxRuntime.jsx("a", {
    href: "/products",
    children: "Ürünler",
  });
  const LogoutButton: HookTestComponent = () => harness.jsxRuntime.jsx("button", {
    children: "Çıkış",
  });
  const drawerExit = { complete: null as (() => void) | null };

  try {
    const PanelSidebar = await compileHookTestComponent(
      "components/panel/PanelSidebar.tsx",
      (specifier) => {
        if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
        if (specifier === "react") return harness.react;
        if (specifier === "framer-motion") {
          const AnimatePresence: HookTestComponent = (props) => {
            const retainedChildren = harness.react.useRef<HookTestNode>(null);
            const exitPending = harness.react.useRef(false);
            const [, requestRender] = harness.react.useState(0);
            if (props.children) {
              retainedChildren.current = props.children;
              drawerExit.complete = null;
            } else if (retainedChildren.current) {
              drawerExit.complete = () => {
                retainedChildren.current = null;
                exitPending.current = true;
                requestRender((current) => current + 1);
              };
            }
            const retainingExit = Boolean(retainedChildren.current);
            harness.react.useEffect(() => {
              if (!exitPending.current) return;
              exitPending.current = false;
              (props.onExitComplete as (() => void) | undefined)?.();
            }, [props.onExitComplete, retainingExit]);
            return props.children ?? retainedChildren.current;
          };
          return {
            AnimatePresence,
            motion: { aside: "aside", button: "button" },
            useReducedMotion: () => false,
          };
        }
        if (specifier === "lucide-react") return { X: Icon };
        if (specifier === "next/image") return Link;
        if (specifier === "next/link") return Link;
        if (specifier === "./LogoutButton") return { LogoutButton };
        if (specifier === "./PanelNavigation") return { PanelNavigation };
        if (specifier === "./panel-shell.module.css") return styles;
        throw new Error(`unexpected_panel_sidebar_import:${specifier}`);
      },
    );
    const PanelMobileDock = await compileHookTestComponent(
      "components/panel/PanelMobileDock.tsx",
      (specifier) => {
        if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
        if (specifier === "lucide-react") return { Home: Icon, Menu: Icon, Package: Icon, ShoppingBag: Icon };
        if (specifier === "next/link") return Link;
        if (specifier === "@/lib/panel-ui/navigation") {
          return { isPanelNavigationPathActive };
        }
        if (specifier === "./panel-shell.module.css") return styles;
        throw new Error(`unexpected_panel_mobile_dock_import:${specifier}`);
      },
    );
    const PanelTopbarChromeProvider: HookTestComponent = (providerProps) => providerProps.children;
    const PanelTopbarUtilities: HookTestComponent = () => null;
    const PanelLayoutClient = await compileHookTestComponent(
      "components/panel/PanelLayoutClient.tsx",
      (specifier) => {
        if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
        if (specifier === "react") return harness.react;
        if (specifier === "next/navigation") return { usePathname: () => "/" };
        if (specifier === "@/lib/panel-ui/navigation") return { getPanelRoutePresentation };
        if (specifier === "./PanelMobileDock") return { PanelMobileDock };
        if (specifier === "./PanelSidebar") return { PanelSidebar };
        if (specifier === "./PanelTopbarChrome") {
          return { PanelTopbarChromeProvider };
        }
        if (specifier === "./PanelTopbarUtilities") return { PanelTopbarUtilities };
        if (specifier === "./panel-shell.module.css") return styles;
        throw new Error(`unexpected_panel_layout_import:${specifier}`);
      },
    );
    harness.setRoot(PanelLayoutClient);
    harness.flush();

    const menuButton = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-controls"] === "panel-mobile-drawer"
    ));
    assert.ok(menuButton);
    (menuButton.props.onClick as () => void)();
    harness.flush();

    assert.equal(documentState.body.style.overflow, "hidden");
    assert.equal(
      harness.hosts().some((host) => host.props.id === "panel-mobile-drawer"),
      true,
    );
    assert.equal(windowListeners.get("keydown")?.size, 1);
    documentState.activeElement = null;
    const trappedTab = {
      defaultPrevented: false,
      key: "Tab",
      shiftKey: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const listener of windowListeners.get("keydown") ?? []) listener(trappedTab);
    assert.equal(trappedTab.defaultPrevented, true);

    const closeButton = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-label"] === "Panel menüsünü kapat"
    ));
    assert.ok(closeButton);
    (closeButton.props.onClick as () => void)();
    harness.flush();

    assert.equal(documentState.body.style.overflow, "hidden");
    assert.equal(windowListeners.get("keydown")?.size, 1);
    assert.equal(
      harness.hosts().some((host) => host.props.id === "panel-mobile-drawer"),
      true,
    );
    const restoredMobileMenuButton = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-controls"] === "panel-mobile-drawer"
    ));
    assert.ok(restoredMobileMenuButton);
    assert.equal(restoredMobileMenuButton.focusCount, 0);
    assert.ok(drawerExit.complete);
    drawerExit.complete();
    harness.flush();

    const focusedMobileMenuButton = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-controls"] === "panel-mobile-drawer"
    ));
    assert.ok(focusedMobileMenuButton);
    assert.equal(documentState.body.style.overflow, "clip");
    assert.equal(windowListeners.get("keydown")?.size ?? 0, 0);
    assert.equal(
      harness.hosts().some((host) => host.props.id === "panel-mobile-drawer"),
      false,
    );
    assert.equal(documentState.activeElement, focusedMobileMenuButton);
    assert.equal(focusedMobileMenuButton.focusCount, 1);

    (focusedMobileMenuButton.props.onClick as () => void)();
    harness.flush();
    const closingBeforeResize = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-label"] === "Panel menüsünü kapat"
    ));
    assert.ok(closingBeforeResize);
    (closingBeforeResize.props.onClick as () => void)();
    harness.flush();

    desktopQuery.matches = true;
    for (const listener of mediaListeners) listener({ matches: true, media: desktopQuery.media });
    harness.flush();
    const hiddenMenuDuringExit = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-controls"] === "panel-mobile-drawer"
    ));
    assert.ok(hiddenMenuDuringExit);
    assert.equal(hiddenMenuDuringExit.focusAttemptCount, 0);
    assert.equal(documentState.body.style.overflow, "hidden");
    assert.ok(drawerExit.complete);
    drawerExit.complete();
    harness.flush();

    const resizedDesktopFocusTarget = harness.hosts().find((host) => (
      host.type === "main" && host.props.tabIndex === -1
    ));
    assert.ok(resizedDesktopFocusTarget);
    assert.equal(documentState.activeElement, resizedDesktopFocusTarget);
    assert.equal(resizedDesktopFocusTarget.focusCount, 1);

    desktopQuery.matches = false;
    for (const listener of mediaListeners) listener({ matches: false, media: desktopQuery.media });
    harness.flush();
    const reopenedMobileMenuButton = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-controls"] === "panel-mobile-drawer"
    ));
    assert.ok(reopenedMobileMenuButton);
    (reopenedMobileMenuButton.props.onClick as () => void)();
    harness.flush();
    assert.equal(documentState.body.style.overflow, "hidden");

    desktopQuery.matches = true;
    for (const listener of mediaListeners) listener({ matches: true, media: desktopQuery.media });
    harness.flush();

    const desktopMenuButton = harness.hosts().find((host) => (
      host.type === "button" && host.props["aria-controls"] === "panel-mobile-drawer"
    ));
    assert.ok(desktopMenuButton);
    assert.equal(desktopMenuButton.props["aria-expanded"], false);
    assert.equal(
      harness.hosts().some((host) => host.props.id === "panel-mobile-drawer"),
      true,
    );
    assert.equal(documentState.body.style.overflow, "hidden");
    assert.equal(windowListeners.get("keydown")?.size, 1);
    assert.equal(desktopMenuButton.focusAttemptCount, 0);
    assert.ok(drawerExit.complete);
    drawerExit.complete();
    harness.flush();

    assert.equal(
      harness.hosts().some((host) => host.props.id === "panel-mobile-drawer"),
      false,
    );
    assert.equal(documentState.body.style.overflow, "clip");
    assert.equal(windowListeners.get("keydown")?.size ?? 0, 0);
    const desktopFocusTarget = harness.hosts().find((host) => (
      host.type === "main" && host.props.tabIndex === -1
    ));
    assert.ok(desktopFocusTarget);
    assert.equal(documentState.activeElement, desktopFocusTarget);
    assert.equal(desktopFocusTarget.focusCount, 1);
    const releasedTab = {
      defaultPrevented: false,
      key: "Tab",
      shiftKey: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const listener of windowListeners.get("keydown") ?? []) listener(releasedTab);
    assert.equal(releasedTab.defaultPrevented, false);

    assert.equal(mediaListeners.size, 1);
    harness.unmount();
    assert.equal(mediaListeners.size, 0);
  } finally {
    harness.unmount();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("dashboard renders safe chrome, catalog, and durable order facts with truthful working actions", async () => {
  const page = await source("app/(panel)/page.tsx");
  const view = await source("components/dashboard/PanelDashboardHomeView.tsx");
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const combined = view + "\n" + model;
  assert.match(page, /PanelDashboardHomeView/);
  assert.match(view, /usePanelChromeModel/);
  assert.match(view, /createMerchantDashboardViewModel/);
  assert.match(model, /const legacy = createPanelDashboardModel\(chrome\)/);
  assert.match(combined, /\/products/);
  assert.match(combined, /\/products\/new/);
  assert.match(combined, /\/setup/);
  for (const capability of ["orders", "analytics", "customers", "carts"]) {
    assert.match(model, new RegExp(`unsupportedAuthority\\(\\s*\"${capability}\"`));
  }
  assert.doesNotMatch(view, /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
  assert.doesNotMatch(
    combined,
    /conversion(?:Rate|Total)|dönüşüm oranı|customerTotal|previousRevenue|currentRevenue|Toshi/i,
  );
  assert.match(view, /analyticsApi[.]dashboard\(analyticsPeriod[.]current\)/);
  assert.match(view, /loader[.]current[?][.]reload\("analytics"\)/);
  assert.match(view, /<Line[\s\S]*?isAnimationActive=\{false\}/);
  assert.match(view, /className=\{styles[.]dashboardMobileActions\}/);
  assert.match(await source("components/dashboard/panel-dashboard.module.css"), /@media \(max-width: 1024px\)[\s\S]*?[.]dashboardMobileActions\s*\{[\s\S]*?display:\s*flex/);
  assert.match(model, /orders[.]getDashboardSummary\(\)/);
  assert.match(combined, /"\/analytics"/);
  assert.doesNotMatch(view, /provider(?:Data|Payload)|TenantContext/i);
});

test("dashboard loads real durable summaries without tenant authority in the browser request", async () => {
  const view = await source("components/dashboard/PanelDashboardHomeView.tsx");
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const styles = await source("components/dashboard/panel-dashboard.module.css");
  assert.match(view, /createMerchantDashboardSliceLoader/);
  assert.match(model, /catalog[.]getDashboardSummary\(\)/);
  assert.match(view, /role="status"/);
  assert.match(view, /role="alert"/);
  assert.match(view, /Tekrar dene/);
  assert.match(view, /analyticsApi[.]dashboard\(analyticsPeriod[.]current\)/);
  assert.match(view, /ANALYTICS_PERIODS[.]includes\(nextPeriod\)/);
  assert.doesNotMatch(view, /console[.](?:log|warn|error)/);
  assert.doesNotMatch(view, /storeId|tenantId|principalId|membershipId|x-store|x-tenant/i);
  assert.match(styles, /[.]channelFilter,[\s\S]*?[.]retryButton\s*\{[\s\S]*?min-width:\s*48px;[\s\S]*?min-height:\s*48px;/);
  assert.match(styles, /[.]kpiRail\s*\{[\s\S]*?repeat\(5, minmax\(180px, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 1024px\)[\s\S]*?[.]insightGrid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration:\s*[.]01ms !important/);
});

test("dashboard preserves maximum-length facts inside mobile card bounds", async () => {
  const storeSlug = "s".repeat(63);
  const planCode = "p".repeat(100);
  const storefrontHostname = [
    "a".repeat(63),
    "b".repeat(63),
    "c".repeat(63),
    "d".repeat(61),
  ].join(".");
  assert.equal(storefrontHostname.length, 253);
  const html = await renderPanelDashboard(Object.freeze({
    storeSlug,
    membershipLabel: "Mağaza sahibi",
    planCode,
    planVersion: 9,
    entitlementStatus: "active",
    storefrontHostname,
    locale: "tr-TR",
  }));
  assert.match(html, new RegExp(storefrontHostname.replaceAll(".", "[.]")));
  assert.doesNotMatch(html, new RegExp(storeSlug));
  assert.doesNotMatch(html, new RegExp(planCode));

  const styles = await source("components/dashboard/panel-dashboard.module.css");
  assert.match(styles, /\.channelSummary strong\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(styles, /\.readinessBanner p\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(styles, /\.kpiViewport\s*\{[^}]*overflow-x:\s*auto;/);
});

test("dashboard presentation keeps the store-summary anatomy when analytics is unavailable", async () => {
  const chrome = Object.freeze({
    storeSlug: "pilot-store",
    membershipLabel: "Mağaza sahibi",
    planCode: "free_starter",
    planVersion: 1,
    entitlementStatus: "active",
    storefrontHostname: "pilot-store.celebix.site",
    locale: "tr-TR",
  });
  const summary = Object.freeze({
    totalProducts: 4,
    activeProducts: 3,
    draftProducts: 1,
    productLimit: 10,
    activeVariants: 6,
    outOfStockVariants: 2,
    productsWithoutMedia: 1,
    activeMedia: 7,
  });
  const dashboard = createMerchantDashboardViewModel(
    chrome,
    readyAuthority(summary, "2026-07-20T12:00:00.000Z"),
  );
  const html = await renderPanelDashboard(chrome, { dashboard, state: "loaded" });

  assert.equal((html.match(/role="listitem"/g) ?? []).length, 5);
  assert.match(html, /<h1 class="visuallyHidden">Mağaza özeti<\/h1>/);
  assert.match(html, /Satış özeti yüklenemedi/);
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 0);
  assert.match(html, /Doğrulanmış satış kanalı/);
  assert.match(html, />Analitiği görüntüle</);
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 5);
  for (const href of ["/analytics", "/products"]) {
    assert.match(html, new RegExp(`href="${href.replaceAll("/", "\\/")}"`));
  }
  assert.doesNotMatch(html, /Katalog dağılımı|Toplam ürün|Taslak ürün|\/api\/admin/);

  const pendingDashboard = createMerchantDashboardViewModel(
    Object.freeze({ ...chrome, storefrontHostname: undefined }),
    readyAuthority(summary, "2026-07-20T12:00:00.000Z"),
  );
  const pendingHtml = await renderPanelDashboard(chrome, { dashboard: pendingDashboard, state: "loaded" });
  assert.match(pendingHtml, /Satış kanalı bekleniyor/);
  assert.doesNotMatch(pendingHtml, /Doğrulanmış satış kanalı/);
});

test("dashboard presentation renders one retry control without stale ready data", async () => {
  const chrome = Object.freeze({
    storeSlug: "pilot-store",
    membershipLabel: "Mağaza sahibi",
    planCode: "free_starter",
    planVersion: 1,
    entitlementStatus: "active",
    storefrontHostname: "pilot-store.celebix.site",
    locale: "tr-TR",
  });
  const dashboard = createMerchantDashboardViewModel(chrome, unavailableAuthority(true));
  const html = await renderPanelDashboard(chrome, { dashboard, state: "error" });

  assert.equal((html.match(/>Tekrar dene<\/button>/g) ?? []).length, 1);
  assert.equal((html.match(/<button(?![^>]*disabled)[^>]*>/g) ?? []).length, 1);
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 5);
  assert.match(html, /Satış özeti yüklenemedi/);
  assert.doesNotMatch(html, /Katalog dağılımı|Toplam ürün|Taslak ürün|Etkin medya/);
});

test("dashboard presentation renders analytics loading ready and retry states without hiding ready slices", async () => {
  const chrome = Object.freeze({ storeSlug: "pilot-store", membershipLabel: "Mağaza sahibi", planCode: "free_starter", planVersion: 1, entitlementStatus: "active", storefrontHostname: "pilot-store.celebix.site", locale: "tr-TR" });
  const catalog = Object.freeze({ totalProducts: 4, activeProducts: 3, draftProducts: 1, productLimit: 10, activeVariants: 6, outOfStockVariants: 2, productsWithoutMedia: 1, activeMedia: 7 });
  const orders = Object.freeze({ totalOrders: 2, pendingOrders: 1, fulfilledOrders: 1, revenueCents: 100, currency: "TRY", asOf: "2026-07-22T12:00:00.000Z" });
  const carts = Object.freeze({ abandoned: 1, recovered: 0, lostValueCents: 10, recoveredValueCents: 0, currency: "TRY", asOf: "2026-07-22T12:00:00.000Z" });
  const customers = Object.freeze({ active: 1, archived: 0, consentedEmail: 1, totalSpentCents: 100, currency: "TRY", asOf: "2026-07-22T12:00:00.000Z" });
  const analytics = Object.freeze({ period: "month" as const, rangeStart: "2026-07-01T00:00:00.000Z", rangeEnd: "2026-07-22T12:00:00.000Z", generatedAt: "2026-07-22T12:00:00.000Z", currency: "TRY", revenueCents: 125000, orders: { total: 12, paid: 10, cancelled: 1, refunded: 1 }, customers: { total: 30, newInPeriod: 4 }, catalog: { activeProducts: 8, lowStockVariants: 2 }, series: [], topProducts: [] });
  const base = createMerchantDashboardViewModel(chrome, readyAuthority(catalog, analytics.generatedAt), readyAuthority(orders, orders.asOf), readyAuthority(carts, carts.asOf), readyAuthority(customers, customers.asOf), unavailableAuthority(true));
  const ready = createMerchantDashboardViewModel(chrome, readyAuthority(catalog, analytics.generatedAt), readyAuthority(orders, orders.asOf), readyAuthority(carts, carts.asOf), readyAuthority(customers, customers.asOf), readyAuthority(analytics, analytics.generatedAt));
  const loading = await renderPanelDashboard(chrome, { dashboard: base, state: "loaded", analyticsState: "loading" });
  const rendered = await renderPanelDashboard(chrome, { dashboard: ready, state: "loaded", analyticsState: "loaded" });
  const failed = await renderPanelDashboard(chrome, { dashboard: base, state: "loaded", analyticsState: "error" });
  for (const html of [loading, rendered, failed]) {
    assert.match(html, /Toplam satış/);
    assert.match(html, /1 sipariş işlem bekliyor/);
    assert.match(html, /pilot-store[.]celebix[.]site/);
    assert.match(html, /En çok satanlar/);
  }
  assert.match(loading, /Satış özeti yükleniyor/);
  assert.match(rendered, /Bu ay/);
  assert.match(rendered, /1[,.]250/);
  assert.match(failed, /Satış özeti yüklenemedi/);
  assert.match(failed, />Tekrar dene<\/button>/);
});

test("dashboard presentation follows the ikas store-summary anatomy using only durable facts", async () => {
  const chrome = Object.freeze({ storeSlug: "pilot-store", membershipLabel: "Mağaza sahibi", planCode: "growth", planVersion: 3, entitlementStatus: "active", storefrontHostname: "pilot-store.celebix.site", locale: "tr-TR" });
  const catalog = Object.freeze({ totalProducts: 14, activeProducts: 11, draftProducts: 3, productLimit: 100, activeVariants: 24, outOfStockVariants: 2, productsWithoutMedia: 1, activeMedia: 20 });
  const orders = Object.freeze({ totalOrders: 12, pendingOrders: 3, fulfilledOrders: 8, revenueCents: 125_000, currency: "TRY", asOf: "2026-07-22T12:00:00.000Z" });
  const analytics = Object.freeze({
    period: "month" as const,
    rangeStart: "2026-07-01T00:00:00.000Z",
    rangeEnd: "2026-07-22T12:00:00.000Z",
    generatedAt: "2026-07-22T12:00:00.000Z",
    currency: "TRY",
    revenueCents: 125_000,
    orders: { total: 12, paid: 10, cancelled: 1, refunded: 1 },
    customers: { total: 30, newInPeriod: 4 },
    catalog: { activeProducts: 11, lowStockVariants: 2 },
    series: [{ startsAt: "2026-07-01T00:00:00.000Z", orders: 2, revenueCents: 20_000 }],
    topProducts: [{ productId: "11111111-1111-4111-8111-111111111111", title: "Atlas Kupa", quantity: 5, revenueCents: 50_000 }],
  });
  const dashboard = createMerchantDashboardViewModel(
    chrome,
    readyAuthority(catalog, analytics.generatedAt),
    readyAuthority(orders, orders.asOf),
    undefined,
    undefined,
    readyAuthority(analytics, analytics.generatedAt),
  );
  const html = await renderPanelDashboard(chrome, { dashboard, state: "loaded", analyticsState: "loaded" });

  for (const copy of [
    "Doğrulanmış satış kanalı",
    "Bu ay",
    "Toplam satış",
    "Sipariş sayısı",
    "Yeni müşteri",
    "Aktif ürün",
    "İadeler",
    "Satış kanalları",
    "En çok satanlar",
    "Büyüme metrikleri",
    "İade edilen sipariş",
    "Ortalama sipariş tutarı",
    "Düşük stok",
    "Toplam müşteri",
    "Atlas Kupa",
    "pilot-store.celebix.site",
    "3 sipariş işlem bekliyor",
    "Hızlı sipariş",
    "Ürün ekle",
    "Yapılacaklar",
    "3 sipariş işlem bekliyor",
    "2 stok uyarısı",
    "1 üründe medya eksik",
    "Müşteri görünümü",
    "Siparişleri görüntüle",
  ]) assert.match(html, new RegExp(copy, "i"));
  assert.doesNotMatch(html, /Tüm operasyonlar/);
  assert.match(html, /aria-label="Mağaza performans metrikleri"/);
  assert.match(html, /aria-label="Kalıcı satış grafiği"/);
  assert.match(html, /href="\/orders"/);
  assert.doesNotMatch(html, /Oturum sayısı|Dönüşüm oranı|Ziyaretçi|Katalog dağılımı/);
  assert.doesNotMatch(html, /Etkin mağaza|Mağaza sahibi|free_starter|\/api\/admin/);
});

test("dashboard presents newest durable order rows with canonical detail actions", async () => {
  const chrome = Object.freeze({ storeSlug: "pilot-store", membershipLabel: "Mağaza sahibi", planCode: "growth", planVersion: 3, entitlementStatus: "active", storefrontHostname: "pilot-store.celebix.site", locale: "tr-TR" });
  const dashboard = createMerchantDashboardViewModel(chrome, unavailableAuthority(true));
  const recentOrders = Object.freeze([
    Object.freeze({
      id: "11111111-1111-4111-8111-111111111111",
      orderNumber: "HMK-1042",
      source: "storefront",
      customerName: "Ada Lovelace",
      customerEmail: "ada@example.com",
      currency: "TRY",
      totalCents: 14_990,
      status: "confirmed",
      paymentStatus: "completed",
      itemCount: 1,
      createdAt: "2026-07-21T09:30:00.000Z",
      updatedAt: "2026-07-21T09:30:00.000Z",
      version: 4,
    }),
    Object.freeze({
      id: "22222222-2222-4222-8222-222222222222",
      orderNumber: "HMK-1041",
      source: "quick_link",
      customerName: "Grace Hopper",
      customerEmail: "grace@example.com",
      currency: "TRY",
      totalCents: 8_500,
      status: "preparing",
      paymentStatus: "processing",
      itemCount: 2,
      createdAt: "2026-07-20T08:15:00.000Z",
      updatedAt: "2026-07-20T08:15:00.000Z",
      version: 2,
    }),
  ] satisfies readonly OrderListItem[]);

  const html = await renderPanelDashboard(chrome, {
    dashboard,
    state: "error",
    recentOrders,
    recentOrdersState: "loaded",
  });

  assert.match(html, /Son siparişler/);
  assert.ok(html.indexOf("HMK-1042") < html.indexOf("HMK-1041"));
  for (const copy of ["Ada Lovelace", "Grace Hopper", "Onaylandı", "Hazırlanıyor", "Ödendi", "İşleniyor"]) {
    assert.match(html, new RegExp(copy));
  }
  assert.match(html, /₺149,90/);
  assert.match(html, /dateTime="2026-07-21T09:30:00[.]000Z"/);
  assert.match(html, /href="\/orders\/11111111-1111-4111-8111-111111111111"/);
  assert.doesNotMatch(html, /ada@example[.]com|grace@example[.]com|storeId|tenantId|principalId|membershipId/);
  assert.match(
    await source("components/dashboard/panel-dashboard.module.css"),
    /[.]recentOrdersTable td:first-child a\s*\{[^}]*min-height:\s*48px;/,
  );
});

test("dashboard home loads five newest orders through the existing same-origin order client", async () => {
  const recentOrder = Object.freeze({
    id: "11111111-1111-4111-8111-111111111111",
    orderNumber: "HMK-1042",
    source: "storefront",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    totalCents: 14_990,
    status: "confirmed",
    paymentStatus: "completed",
    itemCount: 1,
    createdAt: "2026-07-21T09:30:00.000Z",
    updatedAt: "2026-07-21T09:30:00.000Z",
    version: 4,
  }) satisfies OrderListItem;
  const listInputs: unknown[] = [];
  const EmptyRoot: HookTestComponent = () => null;
  const harness = createPanelInteractionHarness(EmptyRoot, {}, { activeElement: null });
  const Wrapper: HookTestComponent = ({ children, ...props }) => harness.jsxRuntime.jsx("div", { ...props, children });
  const PanelActionButton: HookTestComponent = ({ children, href }) => harness.jsxRuntime.jsx("a", { href, children });
  const Icon: HookTestComponent = (props) => harness.jsxRuntime.jsx("svg", props);
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule"
      ? true
      : property === "default"
        ? styles
        : String(property),
  });
  const dashboardModel = Object.freeze({
    title: "Özet",
    description: "Kalıcı mağaza özeti",
    chromeCards: Object.freeze([]),
    catalog: Object.freeze({ state: "unavailable", retryable: true }),
    orders: Object.freeze({ state: "unsupported", capability: "orders", retryable: false }),
    carts: Object.freeze({ state: "unsupported", capability: "carts", retryable: false }),
    customers: Object.freeze({ state: "unsupported", capability: "customers", retryable: false }),
    analytics: Object.freeze({ state: "unsupported", capability: "analytics", retryable: false }),
  });

  const Home = await compileHookTestComponent(
    "components/dashboard/PanelDashboardHomeView.tsx",
    (specifier) => {
      if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
      if (specifier === "react") return harness.react;
      if (specifier === "lucide-react") return { CalendarDays: Icon, Globe2: Icon, PackageCheck: Icon, Store: Icon };
      if (specifier === "recharts") return new Proxy({}, { get: () => Wrapper });
      if (specifier === "@celebix/saas-contracts") return { ANALYTICS_PERIODS: ["today", "week", "month", "year"] };
      if (specifier === "@/components/panel/PanelPageShell") return { PanelActionButton, PanelPageShell: Wrapper };
      if (specifier === "@/components/panel/PanelLayoutClient") return { usePanelChromeModel: () => ({}) };
      if (specifier === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: Wrapper };
      if (specifier === "@/lib/catalog-ui/client") return { catalogApi: { getDashboardSummary: async () => ({}) } };
      if (specifier === "@/lib/order-ui/client") return {
        orderApi: {
          getDashboardSummary: async () => ({}),
          async listOrders(input: unknown) {
            listInputs.push(input);
            return Object.freeze({ items: Object.freeze([recentOrder]) });
          },
        },
      };
      if (specifier === "@/lib/abandoned-cart-ui/client") return { abandonedCartApi: { getSummary: async () => ({}) } };
      if (specifier === "@/lib/customer-ui/client") return { customerApi: { summary: async () => ({}) } };
      if (specifier === "@/lib/panel-ui/dashboard-model") return {
        createMerchantDashboardSliceLoader: () => ({ reload() {}, reloadAll() {}, dispose() {} }),
        createMerchantDashboardViewModel: () => dashboardModel,
      };
      if (specifier === "./panel-dashboard.module.css") return styles;
      throw new Error(`unexpected_dashboard_home_import:${specifier}`);
    },
  );
  harness.setRoot(Home);
  try {
    harness.flush();
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.flush();

    assert.deepEqual(listInputs, [{ pageSize: 5, sort: "newest" }]);
    assert.equal(
      harness.hosts().some((host) => host.type === "a"
        && host.props.href === `/orders/${recentOrder.id}`
        && host.props.children === recentOrder.orderNumber),
      true,
    );
  } finally {
    harness.unmount();
  }
});

interface CssTestElement {
  attributes?: Readonly<Record<string, string>>;
  classNames?: readonly string[];
  parent?: CssTestElement;
  states?: readonly string[];
  tagName: string;
}

interface CssTestDeclaration {
  important: boolean;
  order: number;
  property: string;
  selector: string;
  specificity: readonly [number, number, number];
  value: string;
}

type CssTestColor = readonly [number, number, number, number];

function selectorSpecificity(selector: string): readonly [number, number, number] {
  const normalized = selector.replace(/:global\(([^)]+)\)/g, "$1");
  const ids = normalized.match(/#[\w-]+/g)?.length ?? 0;
  const classes = normalized.match(/\.[\w-]+/g)?.length ?? 0;
  const attributes = normalized.match(/\[[^\]]+\]/g)?.length ?? 0;
  const pseudos = normalized.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g)?.length ?? 0;
  const elements = normalized
    .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?/g, " ")
    .split(/[\s>+~]+/)
    .filter((part) => /^[a-z][\w-]*$/i.test(part)).length;
  return [ids, classes + attributes + pseudos, elements];
}

function splitSelectorList(selectors: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selectors.length; index += 1) {
    const character = selectors[index]!;
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      result.push(selectors.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(selectors.slice(start).trim());
  return result.filter(Boolean);
}

function mediaApplies(query: string, viewportWidth: number): boolean {
  if (/prefers-reduced-motion/i.test(query)) return false;
  const minimums = [...query.matchAll(/min-width:\s*([\d.]+)px/gi)]
    .map((match) => Number(match[1]));
  const maximums = [...query.matchAll(/max-width:\s*([\d.]+)px/gi)]
    .map((match) => Number(match[1]));
  return minimums.every((minimum) => viewportWidth >= minimum)
    && maximums.every((maximum) => viewportWidth <= maximum);
}

function parseApplicableCss(css: string, viewportWidth: number): CssTestDeclaration[] {
  const declarations: CssTestDeclaration[] = [];
  const input = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let order = 0;

  function closingBrace(openingBrace: number): number {
    let depth = 1;
    let quote = "";
    for (let index = openingBrace + 1; index < input.length; index += 1) {
      const character = input[index]!;
      if (quote) {
        if (character === quote && input[index - 1] !== "\\") quote = "";
        continue;
      }
      if (character === "\"" || character === "'") quote = character;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) return index;
    }
    assert.fail("unterminated CSS block");
  }

  function visit(start: number, end: number): void {
    let cursor = start;
    while (cursor < end) {
      const openingBrace = input.indexOf("{", cursor);
      if (openingBrace === -1 || openingBrace >= end) return;
      const prelude = input.slice(cursor, openingBrace).trim();
      const endBrace = closingBrace(openingBrace);
      assert.ok(endBrace <= end, `CSS block escapes its parent: ${prelude}`);
      const bodyStart = openingBrace + 1;
      if (/^@media\b/i.test(prelude)) {
        if (mediaApplies(prelude, viewportWidth)) visit(bodyStart, endBrace);
      } else if (!prelude.startsWith("@")) {
        const parsed = input.slice(bodyStart, endBrace)
          .split(";")
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .map((declaration) => {
            const colon = declaration.indexOf(":");
            assert.ok(colon > 0, `invalid CSS declaration: ${declaration}`);
            const property = declaration.slice(0, colon).trim().toLowerCase();
            const rawValue = declaration.slice(colon + 1).trim();
            const important = /\s*!important\s*$/i.test(rawValue);
            order += 1;
            return {
              important,
              order,
              property,
              value: rawValue.replace(/\s*!important\s*$/i, "").trim(),
            };
          });
        for (const selector of splitSelectorList(prelude)) {
          const specificity = selectorSpecificity(selector);
          for (const declaration of parsed) {
            declarations.push({ ...declaration, selector, specificity });
          }
        }
      }
      cursor = endBrace + 1;
    }
  }

  visit(0, input.length);
  return declarations;
}

function selectorChain(selector: string): {
  combinators: (" " | ">")[];
  compounds: string[];
} {
  const compounds: string[] = [];
  const combinators: (" " | ">")[] = [];
  for (const [groupIndex, group] of selector
    .replace(/:global\(([^)]+)\)/g, "$1")
    .split(/\s*>\s*/)
    .entries()) {
    const descendants = group.trim().split(/\s+/).filter(Boolean);
    for (const [descendantIndex, compound] of descendants.entries()) {
      if (compounds.length > 0) {
        combinators.push(groupIndex > 0 && descendantIndex === 0 ? ">" : " ");
      }
      compounds.push(compound);
    }
  }
  return { combinators, compounds };
}

function compoundMatches(element: CssTestElement, compound: string): boolean {
  const tagName = compound.match(/^[a-z][\w-]*/i)?.[0];
  if (tagName && tagName.toLowerCase() !== element.tagName.toLowerCase()) return false;
  for (const [, className] of compound.matchAll(/\.([\w-]+)/g)) {
    if (!element.classNames?.includes(className!)) return false;
  }
  for (const match of compound.matchAll(/\[([\w-]+)(?:\s*=\s*["']?([^"'\]]+)["']?)?\]/g)) {
    const [, name, expected] = match;
    if (!element.attributes || !(name! in element.attributes)) return false;
    if (expected !== undefined && element.attributes[name!] !== expected) return false;
  }
  for (const [, pseudo] of compound.matchAll(/:([\w-]+)(?:\([^)]*\))?/g)) {
    if (!element.states?.includes(pseudo!)) return false;
  }
  return true;
}

function selectorMatches(element: CssTestElement, selector: string): boolean {
  const { combinators, compounds } = selectorChain(selector);
  function matchesAt(candidate: CssTestElement | undefined, index: number): boolean {
    if (!candidate || !compoundMatches(candidate, compounds[index]!)) return false;
    if (index === 0) return true;
    if (combinators[index - 1] === ">") return matchesAt(candidate.parent, index - 1);
    for (let ancestor = candidate.parent; ancestor; ancestor = ancestor.parent) {
      if (matchesAt(ancestor, index - 1)) return true;
    }
    return false;
  }
  return compounds.length > 0 && matchesAt(element, compounds.length - 1);
}

function winningDeclaration(
  declarations: readonly CssTestDeclaration[],
  element: CssTestElement,
  properties: readonly string[],
): CssTestDeclaration | undefined {
  const candidates = declarations.filter((declaration) => (
    properties.includes(declaration.property) && selectorMatches(element, declaration.selector)
  ));
  return candidates.sort((left, right) => {
    if (left.important !== right.important) return left.important ? 1 : -1;
    for (let index = 0; index < 3; index += 1) {
      if (left.specificity[index] !== right.specificity[index]) {
        return left.specificity[index]! - right.specificity[index]!;
      }
    }
    return left.order - right.order;
  }).at(-1);
}

function parseCssColor(value: string): CssTestColor {
  const normalized = value.trim().toLowerCase();
  const named: Record<string, CssTestColor> = {
    black: [0, 0, 0, 1],
    transparent: [0, 0, 0, 0],
    white: [255, 255, 255, 1],
  };
  if (named[normalized]) return named[normalized];
  const hex = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
      1,
    ];
  }
  const functional = normalized.match(/^rgba?\((.*)\)$/)?.[1];
  assert.ok(functional, `unsupported CSS color: ${value}`);
  const [channelsPart, alphaPart] = functional.includes(",")
    ? [functional.split(",").slice(0, 3).join(" "), functional.split(",")[3]]
    : functional.split(/\s*\/\s*/);
  const channels = channelsPart!.trim().split(/[\s,]+/).map((channel) => (
    channel.endsWith("%") ? Number.parseFloat(channel) * 2.55 : Number.parseFloat(channel)
  ));
  assert.equal(channels.length, 3, `invalid CSS color: ${value}`);
  const alpha = alphaPart === undefined
    ? 1
    : alphaPart.trim().endsWith("%")
      ? Number.parseFloat(alphaPart) / 100
      : Number.parseFloat(alphaPart);
  return [channels[0]!, channels[1]!, channels[2]!, alpha];
}

function resolveCssValue(
  declarations: readonly CssTestDeclaration[],
  element: CssTestElement,
  value: string,
): string {
  const variable = value.trim().match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1];
  if (!variable) return value;
  for (let current: CssTestElement | undefined = element; current; current = current.parent) {
    const declaration = winningDeclaration(declarations, current, [variable]);
    if (declaration) return resolveCssValue(declarations, current, declaration.value);
  }
  assert.fail(`unresolved CSS variable: ${variable}`);
}

function compositeColor(foreground: CssTestColor, background: CssTestColor): CssTestColor {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
    alpha,
  ];
}

function effectiveBackground(
  declarations: readonly CssTestDeclaration[],
  element: CssTestElement,
): CssTestColor {
  const ancestry: CssTestElement[] = [];
  for (let current: CssTestElement | undefined = element; current; current = current.parent) {
    ancestry.unshift(current);
  }
  return ancestry.reduce<CssTestColor>((background, current) => {
    const declaration = winningDeclaration(declarations, current, ["background", "background-color"]);
    return declaration
      ? compositeColor(parseCssColor(resolveCssValue(declarations, current, declaration.value)), background)
      : background;
  }, [255, 255, 255, 1]);
}

function effectiveForeground(
  declarations: readonly CssTestDeclaration[],
  element: CssTestElement,
  background: CssTestColor,
): { color: CssTestColor; declaration: CssTestDeclaration } {
  for (let current: CssTestElement | undefined = element; current; current = current.parent) {
    const declaration = winningDeclaration(declarations, current, ["color"]);
    if (declaration) {
      return {
        color: compositeColor(
          parseCssColor(resolveCssValue(declarations, current, declaration.value)),
          background,
        ),
        declaration,
      };
    }
  }
  assert.fail(`no cascaded color for ${element.tagName}`);
}

function contrastRatio(foreground: CssTestColor, background: CssTestColor): number {
  const luminance = (color: CssTestColor) => color.slice(0, 3)
    .map((channel) => {
      const normalized = channel! / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel! * [0.2126, 0.7152, 0.0722][index]!, 0);
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function shellElements() {
  const root: CssTestElement = { tagName: "html", states: ["root"] };
  const shell: CssTestElement = { tagName: "div", classNames: ["shell"], parent: root };
  const sidebar: CssTestElement = { tagName: "aside", classNames: ["desktopSidebar"], parent: shell };
  const drawer: CssTestElement = { tagName: "aside", classNames: ["drawerSurface"], parent: shell };
  const dock: CssTestElement = { tagName: "nav", classNames: ["mobileDock"], parent: shell };
  const desktopMerchantIdentity: CssTestElement = {
    tagName: "div",
    classNames: ["merchantIdentity"],
    parent: sidebar,
  };
  const topbar: CssTestElement = { tagName: "header", classNames: ["desktopTopbar"], parent: shell };
  const navigationChildren: CssTestElement = {
    tagName: "div",
    classNames: ["navigationChildren"],
    parent: { tagName: "div", classNames: ["drawerNavigation"], parent: drawer },
  };
  const sidebarFooter: CssTestElement = {
    tagName: "footer",
    classNames: ["sidebarFooter"],
    parent: drawer,
  };
  const activeDockLink: CssTestElement = {
    tagName: "a",
    attributes: { "aria-current": "page" },
    parent: dock,
  };
  const activeDockButton: CssTestElement = {
    tagName: "button",
    attributes: { "aria-expanded": "true" },
    parent: dock,
  };
  return {
    activeDockButton,
    activeDockButtonLabel: { tagName: "span", parent: activeDockButton } satisfies CssTestElement,
    activeDockLabel: { tagName: "span", parent: activeDockLink } satisfies CssTestElement,
    activeDockLink,
    dock,
    drawer,
    drawerChildLink: {
      tagName: "a",
      classNames: ["navigationLink"],
      parent: navigationChildren,
    } satisfies CssTestElement,
    drawerClose: {
      tagName: "button",
      classNames: ["drawerClose"],
      parent: { tagName: "header", classNames: ["drawerHeader"], parent: drawer },
    } satisfies CssTestElement,
    drawerLogout: {
      tagName: "button",
      classNames: ["logout-button"],
      parent: sidebarFooter,
    } satisfies CssTestElement,
    desktopMerchantSecondary: {
      tagName: "small",
      parent: desktopMerchantIdentity,
    } satisfies CssTestElement,
    drawerMerchantSecondary: {
      tagName: "small",
      parent: { tagName: "div", classNames: ["merchantIdentity"], parent: drawer },
    } satisfies CssTestElement,
    root,
    shell,
    sidebar,
    topbarSubtitle: {
      tagName: "span",
      classNames: ["desktopTopbarEyebrow"],
      parent: topbar,
    } satisfies CssTestElement,
  };
}

function assertDashboardPrimaryAction(css: string): { contrast: number; target: number } {
  const declarations = parseApplicableCss(css, 390);
  const elements = shellElements();
  const action: CssTestElement = {
    tagName: "a",
    classNames: ["primaryAction"],
    parent: {
      tagName: "div",
      classNames: ["pageActions"],
      parent: { tagName: "header", classNames: ["pageHeader"], parent: elements.shell },
    },
  };
  const background = effectiveBackground(declarations, action);
  const foreground = effectiveForeground(declarations, action, background);
  const contrast = contrastRatio(foreground.color, background);
  const minHeight = winningDeclaration(declarations, action, ["min-height"]);
  assert.ok(minHeight, "dashboard primary action has no applicable min-height");
  const target = lengthInPixels(minHeight.value);
  const failures = [
    ...(contrast < 4.5
      ? [`effective contrast is ${contrast.toFixed(2)}:1 from ${foreground.declaration.selector}`]
      : []),
    ...(target < 48
      ? [`effective min-height is ${target}px from ${minHeight.selector}`]
      : []),
  ];
  assert.deepEqual(failures, [], `dashboard primary action ${failures.join("; ")}`);
  assert.deepEqual(background.slice(0, 3).map(Math.round), [255, 106, 0], "primary orange");
  return { contrast, target };
}

function lengthInPixels(value: string): number {
  const match = value.match(/^([\d.]+)(px|rem)$/);
  assert.ok(match, `unsupported CSS length: ${value}`);
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

function assertMinimumShellTargets(css: string): void {
  const declarations = parseApplicableCss(css, 390);
  const elements = shellElements();
  const targets: readonly [string, CssTestElement, readonly string[]][] = [
    ["drawer close", elements.drawerClose, ["min-width", "min-height"]],
    ["drawer child navigation", elements.drawerChildLink, ["min-height"]],
    ["drawer logout", elements.drawerLogout, ["min-height"]],
    ["mobile dock link", elements.activeDockLink, ["min-width", "min-height"]],
    ["mobile dock button", { tagName: "button", parent: elements.dock }, ["min-width", "min-height"]],
  ];
  for (const [label, element, properties] of targets) {
    for (const property of properties) {
      const declaration = winningDeclaration(declarations, element, [property]);
      assert.ok(declaration, `${label} has no applicable ${property}`);
      assert.ok(
        lengthInPixels(declaration.value) >= 48,
        `${label} effective ${property} is ${declaration.value} from ${declaration.selector}`,
      );
    }
  }
}

function assertDesktopMinimumShellTargets(css: string): void {
  const declarations = parseApplicableCss(css, 1440);
  const elements = shellElements();
  const navigationChildren: CssTestElement = {
    tagName: "div",
    classNames: ["navigationChildren"],
    parent: { tagName: "section", classNames: ["navigationGroup"], parent: elements.sidebar },
  };
  const sidebarFooter: CssTestElement = {
    tagName: "div",
    classNames: ["sidebarFooter"],
    parent: elements.sidebar,
  };
  const targets: readonly [string, CssTestElement][] = [
    ["desktop child navigation", { tagName: "a", classNames: ["navigationLink"], parent: navigationChildren }],
    ["desktop logout", { tagName: "button", classNames: ["logout-button"], parent: sidebarFooter }],
  ];
  for (const [label, element] of targets) {
    const declaration = winningDeclaration(declarations, element, ["min-height"]);
    assert.ok(declaration, `${label} has no applicable min-height`);
    assert.ok(
      lengthInPixels(declaration.value) >= 48,
      `${label} effective min-height is ${declaration.value} from ${declaration.selector}`,
    );
  }
}

function assertPanelDataTableReadability(css: string): void {
  const declarations = parseApplicableCss(css, 320);
  const shell: CssTestElement = { tagName: "section", classNames: ["pageShell"] };
  const scroll: CssTestElement = { tagName: "div", classNames: ["tableScroll"], parent: shell };
  const table: CssTestElement = { tagName: "table", parent: scroll };
  const row: CssTestElement = { tagName: "tr", parent: table };
  const cells: readonly [string, CssTestElement][] = [
    ["header", { tagName: "th", parent: row }],
    ["cell", { tagName: "td", parent: row }],
  ];
  const layout = winningDeclaration(declarations, table, ["table-layout"]);
  assert.notEqual(layout?.value, "fixed", "shared table must not fix a three-column layout at 320px");
  const tableMinWidth = winningDeclaration(declarations, table, ["min-width"]);
  assert.ok(tableMinWidth, "shared table has no readable auto-layout floor");
  assert.ok(lengthInPixels(tableMinWidth.value) >= 512, `shared table readable floor is ${tableMinWidth.value}`);
  for (const [label, cell] of cells) {
    assert.equal(winningDeclaration(declarations, cell, ["text-align"])?.value, "left", `${label} alignment`);
    assert.equal(winningDeclaration(declarations, cell, ["vertical-align"])?.value, "top", `${label} vertical alignment`);
    assert.equal(winningDeclaration(declarations, cell, ["overflow-wrap"])?.value, "anywhere", `${label} wrapping`);
    const minWidth = winningDeclaration(declarations, cell, ["min-width"]);
    assert.ok(minWidth, `${label} has no minimum readable width`);
    assert.ok(lengthInPixels(minWidth.value) >= 48, `${label} minimum readable width is ${minWidth.value}`);
    const padding = winningDeclaration(declarations, cell, ["padding"]);
    assert.ok(padding, `${label} has no padding`);
    assert.ok(lengthInPixels(padding.value) >= 8, `${label} padding is ${padding.value}`);
  }
}

function assertSmallShellContrast(css: string): void {
  const elements = shellElements();
  const contrastCases: readonly [string, CssTestElement, number][] = [
    ["desktop merchant membership secondary", elements.desktopMerchantSecondary, 1440],
    ["drawer merchant membership secondary", elements.drawerMerchantSecondary, 390],
    ["desktop topbar subtitle", elements.topbarSubtitle, 1440],
    ["active mobile dock link label", elements.activeDockLabel, 390],
    ["expanded mobile dock button label", elements.activeDockButtonLabel, 390],
  ];
  for (const [label, element, viewportWidth] of contrastCases) {
    const declarations = parseApplicableCss(css, viewportWidth);
    const background = effectiveBackground(declarations, element);
    const foreground = effectiveForeground(declarations, element, background);
    const ratio = contrastRatio(foreground.color, background);
    assert.ok(
      ratio >= 4.5,
      `${label} effective contrast is ${ratio.toFixed(2)}:1; winning color ${foreground.declaration.value} from ${foreground.declaration.selector}`,
    );
  }

  const declarations = parseApplicableCss(css, 390);
  const activeRail: CssTestElement = {
    tagName: "span",
    classNames: ["activeRail"],
    parent: elements.drawerChildLink,
  };
  const tokens: readonly [string, CssTestElement, readonly string[], string][] = [
    ["orange active rail", activeRail, ["background", "background-color"], "#FF6A00"],
    [
      "drawer focus ring",
      { ...elements.drawerClose, states: ["focus-visible"] },
      ["box-shadow"],
      "0 0 0 2px rgb(254 97 0 / 32%)",
    ],
    [
      "dock focus ring",
      { ...elements.activeDockButton, states: ["focus-visible"] },
      ["box-shadow"],
      "inset 0 0 0 2px rgb(254 97 0 / 32%)",
    ],
  ];
  for (const [label, element, properties, expected] of tokens) {
    const declaration = winningDeclaration(declarations, element, properties);
    assert.ok(declaration, `${label} has no applicable ${properties.join("/")}`);
    assert.equal(declaration.value.toLowerCase(), expected.toLowerCase(), `${label} cascade winner`);
  }
}

function assertDonorCardGeometry(css: string): void {
  const panel: CssTestElement = { tagName: "section", classNames: ["panel"] };
  const metric: CssTestElement = { tagName: "article", classNames: ["metric"] };
  const elements = {
    panel,
    panelHeading: { tagName: "h2", parent: panel } satisfies CssTestElement,
    metric,
    metricContext: { tagName: "small", parent: metric } satisfies CssTestElement,
    metricLabel: { tagName: "span", parent: metric } satisfies CssTestElement,
    metricValue: { tagName: "strong", parent: metric } satisfies CssTestElement,
  };

  const cases: readonly [
    string,
    number,
    CssTestElement,
    readonly string[],
    string,
  ][] = [
    ["panel border", 390, elements.panel, ["border"], "1px solid #E3E7EE"],
    ["panel radius", 390, elements.panel, ["border-radius"], "1rem"],
    ["panel surface", 390, elements.panel, ["background", "background-color"], "#FFFFFF"],
    ["panel shadow", 390, elements.panel, ["box-shadow"], "0 8px 18px rgba(17, 24, 39, 0.045)"],
    ["panel mobile padding", 390, elements.panel, ["padding"], "1rem"],
    ["panel heading size", 390, elements.panelHeading, ["font-size"], "0.98rem"],
    ["panel heading weight", 390, elements.panelHeading, ["font-weight"], "600"],
    ["panel heading leading", 390, elements.panelHeading, ["line-height"], "1.5"],
    ["panel heading tracking", 390, elements.panelHeading, ["letter-spacing"], "-0.025em"],
    ["panel heading color", 390, elements.panelHeading, ["color"], "#1F2937"],
    ["panel heading spacing", 390, elements.panelHeading, ["margin"], "0 0 1rem"],
    ["panel desktop padding", 1440, elements.panel, ["padding"], "1.5rem"],
    ["metric border", 390, elements.metric, ["border"], "1px solid #E3E7EE"],
    ["metric radius", 390, elements.metric, ["border-radius"], "1rem"],
    ["metric surface", 390, elements.metric, ["background", "background-color"], "#FFFFFF"],
    ["metric shadow", 390, elements.metric, ["box-shadow"], "0 4px 12px rgba(17, 24, 39, 0.035)"],
    ["metric height", 390, elements.metric, ["min-height"], "124px"],
    ["metric gap", 390, elements.metric, ["gap"], "0"],
    ["metric mobile padding", 390, elements.metric, ["padding"], "0.875rem"],
    ["metric desktop padding", 1440, elements.metric, ["padding"], "1.25rem"],
    ["metric label size", 390, elements.metricLabel, ["font-size"], "13px"],
    ["metric label weight", 390, elements.metricLabel, ["font-weight"], "500"],
    ["metric label leading", 390, elements.metricLabel, ["line-height"], "1.5"],
    ["metric label color", 390, elements.metricLabel, ["color"], "#6B7280"],
    ["metric value spacing", 390, elements.metricValue, ["margin-top"], "0.5rem"],
    ["metric value size", 390, elements.metricValue, ["font-size"], "1.55rem"],
    ["metric desktop value size", 1440, elements.metricValue, ["font-size"], "1.8rem"],
    ["metric value weight", 390, elements.metricValue, ["font-weight"], "600"],
    ["metric value leading", 390, elements.metricValue, ["line-height"], "1.5"],
    ["metric value tracking", 390, elements.metricValue, ["letter-spacing"], "-0.035em"],
    ["metric value color", 390, elements.metricValue, ["color"], "#1F2937"],
    ["metric context spacing", 390, elements.metricContext, ["margin-top"], "1rem"],
    ["metric context size", 390, elements.metricContext, ["font-size"], "0.75rem"],
    ["metric context weight", 390, elements.metricContext, ["font-weight"], "500"],
    ["metric context leading", 390, elements.metricContext, ["line-height"], "1rem"],
    ["metric context color", 390, elements.metricContext, ["color"], "#6B7280"],
  ];

  for (const [label, viewportWidth, element, properties, expected] of cases) {
    const declaration = winningDeclaration(parseApplicableCss(css, viewportWidth), element, properties);
    assert.ok(declaration, `${label} has no applicable ${properties.join("/")}`);
    assert.equal(declaration.value.toLowerCase(), expected.toLowerCase(), `${label} cascade winner`);
  }
}

test("panel and dashboard metrics retain the pinned donor card geometry", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  assertDonorCardGeometry(css);

  for (const [override, expectedFailure] of [
    [`.panel { border-radius: 20px; }`, /panel radius cascade winner/],
    [`.panel { box-shadow: none; }`, /panel shadow cascade winner/],
    [`.metric { min-height: 112px; }`, /metric height cascade winner/],
    [`.metric { gap: 0.5rem; }`, /metric gap cascade winner/],
    [`.metric > span { font-size: 12px; }`, /metric label size cascade winner/],
    [`.metric > strong { font-weight: 700; }`, /metric value weight cascade winner/],
    [`.metric > small { margin-top: 0.5rem; }`, /metric context spacing cascade winner/],
    [
      `@media (min-width: 1280px) { .metric { padding: 1rem; } }`,
      /metric desktop padding cascade winner/,
    ],
  ] as const) {
    assert.throws(() => assertDonorCardGeometry(`${css}\n${override}`), expectedFailure);
  }
});

test("dashboard primary action keeps effective AA contrast and a 48px target", async () => {
  const css = `${await source("app/globals.css")}\n${await source("components/panel/panel-shell.module.css")}`;
  for (const [override, expectedFailure] of [
    [`.shell .primaryAction { color: white; }`, /effective contrast is 2\.87:1/],
    [`.shell .primaryAction { min-height: 44px; }`, /effective min-height is 44px/],
  ] as const) {
    assert.throws(() => assertDashboardPrimaryAction(`${css}\n${override}`), expectedFailure);
  }
  assertDashboardPrimaryAction(css);
});

test("drawer and dock controls keep an effective 48px minimum target", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  for (const [override, expectedFailure] of [
    [`.drawerClose { min-height: 44px; }`, /drawer close effective min-height is 44px/],
    [
      `.drawerSurface .drawerNavigation .navigationChildren .navigationLink { min-height: 38px; }`,
      /drawer child navigation effective min-height is 38px/,
    ],
    [
      `.drawerSurface .sidebarFooter .logout-button { min-height: 42px; }`,
      /drawer logout effective min-height is 42px/,
    ],
    [
      `.shell .mobileDock a, .shell .mobileDock button { min-height: 40px; }`,
      /mobile dock link effective min-height is 40px/,
    ],
  ] as const) {
    assert.throws(() => assertMinimumShellTargets(`${css}\n${override}`), expectedFailure);
  }
  assertMinimumShellTargets(css);
});

test("desktop child navigation and logout keep an effective 48px minimum target", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  for (const [override, expectedFailure] of [
    [`.navigationChildren .navigationLink { min-height: 32px; }`, /desktop child navigation effective min-height is 32px/],
    [`.sidebarFooter .logout-button { min-height: 42px; }`, /desktop logout effective min-height is 42px/],
  ] as const) {
    assert.throws(() => assertDesktopMinimumShellTargets(`${css}\n${override}`), expectedFailure);
  }
  assertDesktopMinimumShellTargets(css);
});

test("shared panel data table keeps aligned padded readable cells without fixing column count", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  assertPanelDataTableReadability(css);
  for (const [override, expectedFailure] of [
    [`.tableScroll th { text-align: center; }`, /header alignment/],
    [`.tableScroll td { padding: 0.25rem; }`, /cell padding is 0\.25rem/],
    [`.tableScroll td { min-width: 1rem; }`, /cell minimum readable width is 1rem/],
    [`.tableScroll table { min-width: 20rem; }`, /shared table readable floor is 20rem/],
    [`.tableScroll table { table-layout: fixed; }`, /must not fix a three-column layout/],
  ] as const) {
    assert.throws(() => assertPanelDataTableReadability(`${css}\n${override}`), expectedFailure);
  }
});

test("effective small shell text colors meet AA without weakening orange brand or focus tokens", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  const logo = await source("public/Logo/celebix-beyaz-logo.svg");
  assert.match(sidebar, /<Image src="\/Logo\/celebix-beyaz-logo\.svg"/);
  assert.match(logo, /fill="#FE6100"/i);
  for (const [override, expectedFailure] of [
    [
      `.merchantIdentity small { color: rgb(255 255 255 / 48%); }`,
      /desktop merchant membership secondary effective contrast is 4\.08:1/,
    ],
    [
      `@media (min-width: 1025px) {
        .shell .desktopTopbar span { color: #9CA3AF; }
      }`,
      /desktop topbar subtitle effective contrast is 2\.53:1/,
    ],
    [
      `@media (max-width: 1024px) {
        .mobileDock a[aria-current="page"] {
          background: rgb(255 106 0 / 10%);
          color: #FF6A00;
        }
      }`,
      /active mobile dock link label effective contrast is 2\.57:1/,
    ],
    [
      `@media (max-width: 1024px) {
        .mobileDock button[aria-expanded="true"] {
          background: rgb(255 106 0 / 10%);
          color: #FF6A00;
        }
      }`,
      /expanded mobile dock button label effective contrast is 2\.57:1/,
    ],
  ] as const) {
    assert.throws(() => assertSmallShellContrast(`${css}\n${override}`), expectedFailure);
  }
  assertSmallShellContrast(css);
});

test("quick-order builder keeps private authority out of client props and advertises accessible drawer controls", async () => {
  const consoleSource = await source("components/orders/QuickOrderLinksConsole.tsx");
  const css = await source("components/orders/quick-order-links.module.css");
  assert.doesNotMatch(consoleSource, /(?:tenantId|storeId|principalId|membershipId|planId|tokenDigest|sealedToken|providerConfigId)\b/);
  assert.match(consoleSource, /aria-(?:label|live|modal)|role="dialog"/);
  assert.match(consoleSource, /onKeyDown|Escape/);
  assert.match(css, /min-(?:height|width):\s*48px/);
});
