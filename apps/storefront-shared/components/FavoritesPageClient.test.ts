import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { favoritesStorageKey } from "../lib/favorites.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const first = "19f37ebc-1f95-42fe-ac47-a8f995689a73";
const second = "1e3cfb71-99be-4ef3-9d17-8e8fdb8d2ee6";
const storageKey = favoritesStorageKey("fixture.invalid");

function loadFavorites() {
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
    "./ProductGrid": { ProductGrid: ({ products }: { products: { id: string }[] }) => React.createElement("ul", null, products.map(({ id }) => React.createElement("li", { key: id }, id))) },
  });
  const { FavoritesPageClient } = load<{ FavoritesPageClient: React.ComponentType<{ locale: string; cardStyle: string; imageRatio: string }> }>(new URL("./FavoritesPageClient.tsx", import.meta.url));
  const { FavoriteButton } = load<{ FavoriteButton: React.ComponentType<{ productId: string; productTitle: string }> }>(new URL("./FavoriteButton.tsx", import.meta.url));
  const { FavoriteStatusProvider, useFavoriteStatus } = load<{ FavoriteStatusProvider: React.ComponentType<React.PropsWithChildren>; useFavoriteStatus: () => { count: number } }>(new URL("./FavoriteStatusProvider.tsx", import.meta.url));
  function Count() { return React.createElement("output", null, useFavoriteStatus().count); }
  return React.createElement(FavoriteStatusProvider, null,
    React.createElement(Count),
    React.createElement(FavoriteButton, { productId: first, productTitle: "İlk ürün" }),
    React.createElement(FavoriteButton, { productId: second, productTitle: "İkinci ürün" }),
    React.createElement(FavoritesPageClient, { locale: "tr", cardStyle: "compact", imageRatio: "portrait" }),
  );
}

function session(ids: readonly string[]) {
  return Response.json({ outcome: "found", snapshot: { favorites: ids.map((productId) => ({ productId })) } });
}

function resolveProducts(ids: readonly string[]) {
  return Response.json({ items: ids.map((id) => ({ id, slug: "ornek", title: "Örnek ürün", currency: "TRY", status: "active", priceCents: 100, available: true, variants: [], media: [] })) });
}

function deferredResponse() {
  let complete!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => { complete = resolve; });
  return { promise, complete };
}

test("an empty favorite list offers a localized product link instead of product preparation text", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ outcome: "unauthenticated" }));
  await withProductBrowser(async ({ container, render }) => {
    await render(loadFavorites());
    assert.ok(!container.textContent?.includes("Ürünler hazırlanıyor"));
    assert.equal(container.querySelector("a")?.textContent, "Tüm ürünleri gör");
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/urunler");
  });
});

test("a signed-in removal ignores an earlier session response and reconciles all views", async (context) => {
  const staleSession = deferredResponse();
  const removal = deferredResponse();
  let sessionRequests = 0;
  context.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url === "/api/account/session") return ++sessionRequests === 1 ? staleSession.promise : session([]);
    if (url === "/api/account/favorites") return removal.promise;
    return resolveProducts(JSON.parse(String(init?.body)).productIds);
  });
  await withProductBrowser(async ({ container, render, click }) => {
    window.localStorage.setItem(storageKey, JSON.stringify([first]));
    document.cookie = "__Host-celebix_account_csrf=test; Secure; Path=/";
    await render(loadFavorites());
    assert.equal(container.querySelector("output")?.textContent, "1");
    await click(".favorite-button");
    assert.equal(container.querySelector(".favorite-button")?.getAttribute("aria-pressed"), "false");
    assert.equal(container.querySelector("output")?.textContent, "0");
    await React.act(async () => staleSession.complete(session([first])));
    assert.equal(container.querySelector("output")?.textContent, "0");
    assert.equal(sessionRequests, 1);
    await React.act(async () => removal.complete(Response.json({ outcome: "removed", version: 1, replayed: false })));
    assert.equal(sessionRequests, 2);
    assert.equal(window.localStorage.getItem(storageKey), "[]");
    assert.equal(container.querySelector(".favorite-button")?.getAttribute("aria-pressed"), "false");
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/urunler");
  });
});

test("serializes repeated toggles of one product, permits an independent product, and rolls back failed mutations", async (context) => {
  const remote = new Set([first, second]);
  const requests: { productId: string; enabled: boolean; finish(ok: boolean): void }[] = [];
  context.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url === "/api/account/session") return session([...remote]);
    if (url === "/api/favorites/resolve") return resolveProducts(JSON.parse(String(init?.body)).productIds);
    const { productId, enabled } = JSON.parse(String(init?.body));
    const request = deferredResponse();
    requests.push({ productId, enabled, finish(ok) {
      if (ok) {
        if (enabled) remote.add(productId);
        else remote.delete(productId);
        request.complete(Response.json({ outcome: enabled ? "created" : "removed", version: 1, replayed: false }));
      } else request.complete(new Response(null, { status: 503 }));
    } });
    return request.promise;
  });
  await withProductBrowser(async ({ container, render, click }) => {
    document.cookie = "__Host-celebix_account_csrf=test; Secure; Path=/";
    await render(loadFavorites());
    await click(".favorite-button:nth-of-type(1)");
    await click(".favorite-button:nth-of-type(1)");
    await click(".favorite-button:nth-of-type(2)");
    assert.equal(container.querySelector("output")?.textContent, "1");
    assert.deepEqual(requests.map(({ productId, enabled }) => [productId, enabled]), [[first, false], [second, false]]);
    await React.act(async () => requests[1]!.finish(true));
    await React.act(async () => requests[0]!.finish(false));
    assert.deepEqual(requests.map(({ productId, enabled }) => [productId, enabled]), [[first, false], [second, false], [first, true]]);
    await React.act(async () => requests[2]!.finish(true));
    assert.deepEqual(Array.from(container.querySelectorAll("li"), (item) => item.textContent), [first]);
    await click(".favorite-button:nth-of-type(1)");
    assert.equal(container.querySelector("output")?.textContent, "0");
    await React.act(async () => requests[3]!.finish(false));
    assert.equal(container.querySelector("output")?.textContent, "1");
    assert.equal(container.querySelector(".favorite-button")?.getAttribute("aria-pressed"), "true");
  });
});

test("a stale product response cannot restore a removed guest favorite when the session request fails", async (context) => {
  const staleProducts = deferredResponse();
  let resolutions = 0;
  context.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url === "/api/account/session") return new Response(null, { status: 503 });
    if (url === "/api/favorites/resolve") {
      if (++resolutions === 1) return staleProducts.promise;
      return resolveProducts(JSON.parse(String(init?.body)).productIds);
    }
    assert.fail(`Guest selection sent an unexpected request to ${url}`);
  });
  await withProductBrowser(async ({ container, render, click }) => {
    window.localStorage.setItem(storageKey, JSON.stringify([first, second]));
    await render(loadFavorites());
    await click(".favorite-button:nth-of-type(1)");
    await React.act(async () => staleProducts.complete(resolveProducts([first, second])));
    assert.equal(window.localStorage.getItem(storageKey), JSON.stringify([second]));
    assert.equal(container.querySelector("output")?.textContent, "1");
    assert.deepEqual(Array.from(container.querySelectorAll("li"), (item) => item.textContent), [second]);
  });
});
