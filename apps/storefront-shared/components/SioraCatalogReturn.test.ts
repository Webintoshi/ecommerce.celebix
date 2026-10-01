import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type CatalogModule = {
  useCatalogScrollRestoration: (storefrontId: string, pathname: string, overlayOpen: boolean) => void;
  sioraCatalogReturnRoute: (storefrontId: string) => string | null;
};
const STORE = "siora-fixture";
const KEY = `celebix:siora:${STORE}:catalog-return`;
const PRODUCT = "/urun/example";
const ROUTE = "/urunler?q=coat&sort=price";
function fixture() {
  const module = componentLoader()<CatalogModule>(new URL("../themes/siora/useCatalogScrollRestoration.ts", import.meta.url));
  function Harness() { module.useCatalogScrollRestoration(STORE, window.location.pathname, false); return null; }
  return { ...module, Harness };
}
function token(overrides: Record<string, unknown> = {}) {
  const value = { route: ROUTE, productPath: PRODUCT, requestedAt: Date.now(), bound: false, ...overrides };
  window.sessionStorage.setItem(KEY, JSON.stringify(value));
  return value;
}

test("catalog return binds once to the current entry, preserves Next state and survives a same-entry reload", async () => {
  const { Harness, sioraCatalogReturnRoute } = fixture();
  await withProductBrowser(async ({ render }) => {
    const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", { children: ["urun", {}] }], unrelated: "keep" };
    window.history.replaceState(nextState, "", PRODUCT);
    const original = token();
    const replace = window.history.replaceState.bind(window.history);
    let replacements = 0;
    window.history.replaceState = (data, unused, url) => { replacements += 1; replace(data, unused, url); };
    assert.equal(sioraCatalogReturnRoute(STORE), null, "an unconsumed token cannot authorize back");
    await render(React.createElement(Harness));
    assert.equal(sioraCatalogReturnRoute(STORE), ROUTE);
    assert.deepEqual(window.history.state, { ...nextState, celebixSioraCatalogReturn: { storefrontId: STORE, requestedAt: original.requestedAt } });
    assert.equal(JSON.parse(window.sessionStorage.getItem(KEY)!).bound, true);
    assert.equal(replacements, 1);
    await render(null);
    const state = window.history.state;
    await render(React.createElement(Harness));
    assert.deepEqual(window.history.state, state, "reload does not replace the consumed entry binding");
    assert.equal(replacements, 1, "a consumed token does not write history again");
    assert.equal(sioraCatalogReturnRoute(STORE), ROUTE);
  });
});

test("catalog to product to checkout to the same product cannot rebind the consumed token", async () => {
  const { Harness, sioraCatalogReturnRoute } = fixture();
  await withProductBrowser(async ({ render }) => {
    window.history.replaceState({ __NA: true }, "", PRODUCT);
    token();
    await render(React.createElement(Harness));
    assert.equal(sioraCatalogReturnRoute(STORE), ROUTE);
    await render(null);
    window.history.pushState({ __NA: true, checkout: true }, "", "/checkout");
    window.history.pushState({ __NA: true, freshProductEntry: true }, "", PRODUCT);
    await render(React.createElement(Harness));
    assert.equal(sioraCatalogReturnRoute(STORE), null, "a return within seconds still uses the safe catalog fallback");
    assert.equal(window.history.state.celebixSioraCatalogReturn, undefined);
    assert.equal(JSON.parse(window.sessionStorage.getItem(KEY)!).bound, true);
  });
});

test("only a fresh valid token can bind, and consumed tokens require the exact entry marker", async () => {
  const { Harness, sioraCatalogReturnRoute } = fixture();
  await withProductBrowser(async ({ render }) => {
    for (const invalid of [
      { route: "https://foreign.invalid/urunler" }, { route: "/urunler?unknown=1" }, { route: "/account" },
      { productPath: "/urun/other" }, { requestedAt: Date.now() - 31_000 }, { requestedAt: Date.now() + 60_000 },
    ]) {
      window.history.replaceState({ __NA: true }, "", PRODUCT);
      token(invalid);
      await render(React.createElement(Harness));
      assert.equal(sioraCatalogReturnRoute(STORE), null);
      assert.equal(window.history.state.celebixSioraCatalogReturn, undefined);
      await render(null);
    }
    const valid = token({ bound: true });
    for (const marker of [undefined, { storefrontId: "other", requestedAt: valid.requestedAt }, { storefrontId: STORE, requestedAt: valid.requestedAt - 1 }]) {
      window.history.replaceState({ celebixSioraCatalogReturn: marker }, "", PRODUCT);
      assert.equal(sioraCatalogReturnRoute(STORE), null);
    }
    window.history.replaceState({ celebixSioraCatalogReturn: { storefrontId: STORE, requestedAt: valid.requestedAt } }, "", PRODUCT);
    token({ bound: true, requestedAt: Date.now() - 30 * 60_000 });
    assert.equal(sioraCatalogReturnRoute(STORE), null);
  });
});

test("a new catalog product click resets consumption and stores only supported catalog parameters", async () => {
  const { Harness } = fixture();
  await withProductBrowser(async ({ container, render }) => {
    window.history.replaceState({ __NA: true }, "", "/urunler?q=coat&tracking=ignore");
    token({ bound: true });
    await render(React.createElement(Harness));
    const link = document.createElement("a");
    link.href = PRODUCT;
    link.addEventListener("click", event => event.preventDefault());
    container.append(link);
    await React.act(async () => link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    const saved = JSON.parse(window.sessionStorage.getItem(KEY)!);
    assert.equal(saved.bound, false);
    assert.equal(saved.productPath, PRODUCT);
    assert.equal(saved.route, "/urunler?q=coat");
  });
});

test("denied storage and server rendering cannot authorize catalog back", async () => {
  const { Harness, sioraCatalogReturnRoute } = fixture();
  await withProductBrowser(async ({ render }) => {
    window.history.replaceState({ __NA: true }, "", PRODUCT);
    const storage = window.sessionStorage;
    const original = storage.getItem.bind(storage);
    storage.getItem = () => { throw new Error("denied"); };
    try {
      await render(React.createElement(Harness));
      assert.equal(sioraCatalogReturnRoute(STORE), null);
      assert.equal(window.history.state.celebixSioraCatalogReturn, undefined);
    } finally { storage.getItem = original; }
  });
  assert.equal(sioraCatalogReturnRoute(STORE), null);
});
