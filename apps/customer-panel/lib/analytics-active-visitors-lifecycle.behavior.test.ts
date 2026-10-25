import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, useState } from "react";

import { compile, mounted } from "./mira-final-test-support.ts";
import { analyticsFixtureResponse, createAnalyticsFixtureState } from "../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/analytics/analytics-fixture-data.ts";

test("workspace shares one live snapshot and poller across real topbar portals, loading and report switches", async (context) => {
  const previousFetch = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  context.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: number, ...args: unknown[]) => {
    if (delay !== 30_000) return realTimeout(callback, delay, ...args);
    const id = ++timerId;
    timers.set(id, callback);
    return id;
  }) as typeof setTimeout);
  context.mock.method(globalThis, "clearTimeout", ((id: ReturnType<typeof setTimeout>) => {
    if (!timers.delete(Number(id))) realClearTimeout(id);
  }) as typeof clearTimeout);

  const fixture = createAnalyticsFixtureState();
  const overviewReplies: Array<() => void> = [];
  const activeSignals: AbortSignal[] = [];
  let activeRequests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://panel.example.test");
    if (url.pathname === "/api/analytics/active") {
      activeRequests += 1;
      activeSignals.push((input instanceof Request ? input.signal : init?.signal)!);
      return Response.json({schemaVersion: 1, status: "ready", activeVisitors: activeRequests === 1 ? 12 : 0, asOf: "2026-10-26T10:00:00.000Z"});
    }
    const response = analyticsFixtureResponse(url.pathname.split("/").slice(3), url.href, fixture);
    assert.ok(response, url.href);
    return url.pathname === "/api/analytics/overview" ? new Promise<Response>((resolve) => overviewReplies.push(() => resolve(response))) : response;
  }) as typeof fetch;

  const chrome = compile("components/panel/PanelTopbarChrome.tsx");
  let href = "/analytics?range=30d";
  let navigate: (next: string) => void = () => {};
  let topbar: any;
  const Component = compile("components/analytics/CommerceAnalyticsWorkspace.tsx", {
    "@/components/panel/PanelTopbarChrome": chrome,
    "next/navigation": {useSearchParams: () => new URL(href, "https://panel.example.test").searchParams, useRouter: () => ({push: (next: string) => navigate(next)})},
  }).CommerceAnalyticsWorkspace;
  const onChromeChange = () => {};
  function Harness() {
    const [current, setCurrent] = useState(href);
    href = current;
    navigate = setCurrent;
    const query = new URL(current, "https://panel.example.test").searchParams;
    return createElement(chrome.PanelTopbarChromeProvider, {onChange: onChromeChange, targets: {"panel-topbar-context": topbar, "panel-topbar-actions": null}},
      createElement(Component, {tab: query.get("tab") ?? "overview", range: query.get("range") ?? "30d"}));
  }
  const flush = () => act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
  try {
    await mounted(Harness, {}, async (host, window) => {
      await flush();
      assert.equal(activeRequests, 1);
      assert.match(topbar.textContent, /12 ziyaretçi/);
      await act(async () => overviewReplies.shift()!());
      await flush();
      assert.equal(activeRequests, 1, "loading-to-ready must reuse the live request and snapshot");
      assert.match(host.querySelector('[aria-label="Canlı ziyaretçiler"]').textContent, /12ziyaretçi/);
      assert.equal(topbar.textContent, "");

      await act(async () => navigate("/analytics?range=7d&currency=EUR"));
      await flush();
      assert.match(topbar.textContent, /12 ziyaretçi/);
      assert.equal(activeRequests, 1, "a report filter must not restart live polling");
      await act(async () => overviewReplies.shift()!());
      await flush();
      assert.match(host.querySelector('[aria-label="Canlı ziyaretçiler"]').textContent, /12ziyaretçi/);
      assert.equal(activeRequests, 1);

      await act(async () => navigate("/analytics?tab=carts&range=7d"));
      await flush();
      assert.match(topbar.textContent, /12 ziyaretçi/);
      assert.equal(activeRequests, 1, "changing report presentation must not create another poller");
      assert.equal(timers.size, 1);

      const [id, callback] = timers.entries().next().value!;
      timers.delete(id);
      await act(async () => callback());
      await flush();
      assert.equal(activeRequests, 2, "only the thirty-second timer starts the next request");
      assert.match(topbar.textContent, /0 ziyaretçi/);
      assert.equal(timers.size, 1);

      Object.defineProperty(window.document, "visibilityState", {configurable: true, value: "hidden"});
      await act(async () => window.document.dispatchEvent(new window.Event("visibilitychange")));
      assert.equal(timers.size, 0);
      assert.equal(activeRequests, 2);
      Object.defineProperty(window.document, "visibilityState", {configurable: true, value: "visible"});
      await act(async () => window.document.dispatchEvent(new window.Event("visibilitychange")));
      await flush();
      assert.equal(activeRequests, 3, "visibility resume triggers exactly one refresh");
      assert.equal(timers.size, 1);
    }, (window) => {
      Object.defineProperty(window.document, "visibilityState", {configurable: true, value: "visible"});
      topbar = window.document.createElement("div");
      window.document.body.append(topbar);
    });
    assert.equal(timers.size, 0, "workspace unmount cancels the single live timer");
    assert.equal(activeSignals.length, 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
