import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, withEditor } from "../settings/design/design-editor-test-utils.ts";

function navigationAt(pathname: string) {
  return compile<any>(new URL("./PanelNavigation.tsx", import.meta.url), {
    "@/lib/panel-ui/navigation": compile(new URL("../../lib/panel-ui/navigation.ts", import.meta.url)),
    "next/navigation": { usePathname: () => pathname },
    "next/link": { __esModule: true, default: ({ children, ...props }: any) => React.createElement("a", props, children) },
  }).PanelNavigation;
}

test("cashier desktop and drawer show only explicitly granted overview and order destinations", async () => {
  const PanelNavigation = navigationAt("/");
  for (const mode of ["desktop", "drawer"]) for (const cashierOverviewAvailable of [false, true]) for (const cashierOrdersAvailable of [false, true]) {
    await withEditor(async ({ container, render, change }) => {
      await render(React.createElement(PanelNavigation, { mode, navigationMode: "register", cashierOverviewAvailable, cashierOrdersAvailable }));
      const overview = container.querySelector('a[href="/"]');
      assert.equal(Boolean(overview), cashierOverviewAvailable);
      assert.equal(overview?.textContent, cashierOverviewAvailable ? "Genel Bakış" : undefined);
      assert.equal(overview?.getAttribute("aria-current"), cashierOverviewAvailable ? "page" : undefined);
      assert.equal(Boolean(container.querySelector('a[href="/orders"]')), cashierOrdersAvailable);
      for (const href of ["/orders/quick-links", "/accounting/receivables", "/products", "/products/new"]) assert.ok(container.querySelector(`a[href="${href}"]`), href);
      for (const href of ["/analytics", "/customers", "/settings", "/orders/payment-links", "/orders/abandoned-carts"]) assert.equal(container.querySelector(`a[href="${href}"]`), null, href);
      const search = container.querySelector<HTMLInputElement>("input")!;
      await change(search, "genel bakış");
      assert.equal(Boolean(container.querySelector('a[href="/"]')), cashierOverviewAvailable);
      await change(search, "siparişler");
      assert.equal(Boolean(container.querySelector('a[href="/orders"]')), cashierOrdersAvailable);
      await change(search, "");
      assert.equal(Boolean(container.querySelector('a[href="/"]')), cashierOverviewAvailable);
      assert.equal(Boolean(container.querySelector('a[href="/orders"]')), cashierOrdersAvailable);
    });
  }
});

test("cashier overview search keeps arrow navigation and Escape query clearing", async () => {
  const PanelNavigation = navigationAt("/products");
  await withEditor(async ({ window, container, render, change }) => {
    await render(React.createElement(PanelNavigation, { mode: "desktop", navigationMode: "register", cashierOverviewAvailable: true }));
    const search = container.querySelector<HTMLInputElement>("input")!;
    await change(search, "genel");
    search.focus();
    await React.act(async () => search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }) as unknown as Event));
    assert.equal(window.document.activeElement?.getAttribute("href"), "/");
    assert.equal(container.querySelector('a[href="/"]')?.getAttribute("aria-current"), null);
    search.focus();
    await React.act(async () => search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event));
    assert.equal(search.value, "");
    assert.ok(container.querySelector('a[href="/orders/quick-links"]'));
    assert.ok(container.querySelector('a[href="/products"]'));
  });
});
