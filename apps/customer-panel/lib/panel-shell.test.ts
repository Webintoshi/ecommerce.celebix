import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import {
  isPanelNavigationPathActive,
  PANEL_NAVIGATION,
} from "./panel-ui/navigation.ts";

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

class HookTestHost {
  readonly children: HookTestHost[] = [];
  focusCount = 0;

  constructor(
    readonly type: string,
    readonly props: HookTestProps,
    private readonly documentState: { activeElement: HookTestHost | null },
  ) {}

  contains(candidate: HookTestHost | null): boolean {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }

  focus(): void {
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
  documentState: { activeElement: HookTestHost | null },
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
    host.children.push(...renderNode(node.props.children, `${path}.${node.type}`));
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
    if (specifier === "lucide-react") {
      return { Home: Icon, Package: Icon, Plus: Icon, Settings: Icon };
    }
    if (specifier === "next/link") return Link;
    if (specifier === "next/navigation") return { usePathname: () => pathname };
    if (specifier === "@/lib/panel-ui/navigation") {
      return { isPanelNavigationPathActive, PANEL_NAVIGATION };
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

test("desktop shell carries exact donor tokens, widths, topbar, and supported navigation", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  const layout = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(css, /#2A2A2A/i);
  assert.match(css, /#F9F9F9/i);
  assert.match(css, /#FF6A00/i);
  assert.match(css, /15rem/);
  assert.match(css, /15\.5rem/);
  assert.match(css, /16rem/);
  assert.match(css, /min-width:\s*1025px/);
  assert.match(layout, /panel-topbar-actions/);
});

test("products/new marks only the Yeni ürün link as the current page", async () => {
  const html = await renderPanelNavigation("/products/new");
  const currentLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)]
    .map(([link]) => ({
      href: link.match(/href="([^"]+)"/)?.[1],
      label: link.replace(/<[^>]*>/g, ""),
    }));

  assert.deepEqual(currentLinks, [{ href: "/products/new", label: "Yeni ürün" }]);
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
  assert.match(dock, /label:\s*"Ana"/);
  assert.match(dock, /label:\s*"Ürünler"/);
  assert.match(dock, />Menü<\/span>/);
  assert.doesNotMatch(dock, /Sipariş|Toshi|Müşteri|Bildirim/);
  assert.match(css, /max-width:\s*1024px/);
  assert.match(css, /min-width:\s*1025px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /--panel-keyboard-inset/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("crossing into desktop closes an open mobile drawer and releases its modal effects", async () => {
  type Listener = (event: Record<string, unknown>) => void;
  const windowListeners = new Map<string, Set<Listener>>();
  const mediaListeners = new Set<Listener>();
  const documentState: {
    activeElement: HookTestHost | null;
    body: { style: { overflow: string } };
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

  try {
    const PanelSidebar = await compileHookTestComponent(
      "components/panel/PanelSidebar.tsx",
      (specifier) => {
        if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
        if (specifier === "react") return harness.react;
        if (specifier === "lucide-react") return { X: Icon };
        if (specifier === "next/link") return Link;
        if (specifier === "./LogoutButton") return { LogoutButton };
        if (specifier === "./PanelNavigation") return { PanelNavigation };
        if (specifier === "./panel-shell.module.css") return styles;
        throw new Error(`unexpected_panel_sidebar_import:${specifier}`);
      },
    );
    const PanelMobileDock: HookTestComponent = (dockProps) => harness.jsxRuntime.jsx("button", {
      ref: dockProps.menuButtonRef,
      "aria-controls": "panel-mobile-drawer",
      "aria-expanded": dockProps.menuOpen,
      onClick: dockProps.onMenuToggle,
      children: "Menü",
    });
    const PanelTopbarChromeProvider: HookTestComponent = (providerProps) => providerProps.children;
    const PanelLayoutClient = await compileHookTestComponent(
      "components/panel/PanelLayoutClient.tsx",
      (specifier) => {
        if (specifier === "react/jsx-runtime") return harness.jsxRuntime;
        if (specifier === "react") return harness.react;
        if (specifier === "next/navigation") return { usePathname: () => "/" };
        if (specifier === "./PanelMobileDock") return { PanelMobileDock };
        if (specifier === "./PanelSidebar") return { PanelSidebar };
        if (specifier === "./PanelTopbarChrome") {
          return { PanelTopbarChromeProvider };
        }
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
      false,
    );
    assert.equal(documentState.body.style.overflow, "clip");
    assert.equal(windowListeners.get("keydown")?.size ?? 0, 0);
    assert.equal(documentState.activeElement, desktopMenuButton);
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
