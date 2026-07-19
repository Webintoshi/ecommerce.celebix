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
