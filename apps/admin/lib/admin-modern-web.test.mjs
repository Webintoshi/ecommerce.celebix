import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchAdminJson } from "./admin-client-fetch.ts";
import { isActionableEnter } from "./keyboard.ts";
import { pollWhileVisible } from "./visible-polling.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function mockGlobal(context, key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, key, original);
    else delete globalThis[key];
  });
}

test("the sign-in form connects each label and identifies saved credentials", () => {
  const login = source("app/admin/login/page.tsx");
  assert.match(login, /htmlFor="admin-email"/);
  assert.match(login, /id="admin-email"[\s\S]*?autoComplete="username"/);
  assert.match(login, /htmlFor="admin-password"/);
  assert.match(login, /id="admin-password"[\s\S]*?autoComplete="current-password"/);
  assert.match(login, /new FormData\(event.currentTarget\)/);
});

test("editable page and email previews share an isolated HTML rendering boundary", () => {
  for (const path of ["components/admin/PageForm.tsx", "app/admin/pazarlama/email/page.tsx"]) {
    const preview = source(path);
    assert.match(preview, /<IsolatedHtmlPreview\b/);
    assert.doesNotMatch(preview, /dangerouslySetInnerHTML/);
  }
  const frame = source("components/admin/IsolatedHtmlPreview.tsx");
  assert.match(frame, /sandbox=""/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /default-src 'none'/);
});

test("collection editing and deletion use titled native modal dialogs", () => {
  const categories = source("components/admin/CategoryManager.tsx");
  assert.match(categories, /<dialog\s+ref=\{formDialog\}/);
  assert.match(categories, /<dialog\s+ref=\{deleteDialog\}/);
  assert.match(categories, /formDialog\.current, isFormOpen/);
  assert.match(categories, /deleteDialog\.current, Boolean\(deleteConfirm\)/);
  assert.match(categories, /\.showModal\(\)/);
  assert.match(categories, /onClose=\{\(\) => \{ setIsFormOpen\(false\)/);
  assert.match(categories, /onClose=\{\(\) => \{ setDeleteConfirm\(null\)/);
});

test("custom Enter actions use composition-aware input handling", () => {
  for (const path of [
    "app/admin/ayarlar/hero-banner/page.tsx",
    "app/admin/muhasebe/page.tsx",
    "components/admin/CustomerForm.tsx",
    "components/admin/product-wizard/steps/StepBasicInfo.tsx",
    "components/admin/ToshiAssistant.tsx",
  ]) {
    assert.match(source(path), /if \(isActionableEnter\((e|event)\)/, path);
  }
});

test("Enter handling waits for composition to finish in browsers and Safari", () => {
  const keyboard = (key, isComposing = false, keyCode = 13) => ({ key, nativeEvent: { isComposing }, keyCode });
  assert.equal(isActionableEnter(keyboard("Enter")), true);
  assert.equal(isActionableEnter(keyboard("Enter", true)), false);
  assert.equal(isActionableEnter(keyboard("Enter", false, 229)), false);
  assert.equal(isActionableEnter(keyboard("Escape")), false);
});

test("dashboard and analytics poll only through the visible-page scheduler", () => {
  assert.match(source("app/admin/AdminDashboardClient.tsx"), /pollWhileVisible\(async \(signal\)/);
  assert.match(source("app/admin/analizler/page.tsx"), /pollWhileVisible\(async \(signal\)/);
});

test("visibility polling aborts outstanding work, restarts once, and cleans up", async (context) => {
  const document = new EventTarget();
  document.visibilityState = "hidden";
  const timers = new Map();
  let timerId = 0;
  const window = {
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
  };
  mockGlobal(context, "window", window);
  mockGlobal(context, "document", document);

  const requests = [];
  const stop = pollWhileVisible((signal) => new Promise((resolve) => requests.push({ signal, resolve })), 100);
  const setVisibility = (value) => {
    document.visibilityState = value;
    document.dispatchEvent(new Event("visibilitychange"));
  };

  assert.equal(requests.length, 0);
  setVisibility("visible");
  assert.equal(requests.length, 1);
  assert.equal(timers.size, 0);
  setVisibility("hidden");
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve();
  await Promise.resolve();
  assert.equal(timers.size, 0);

  setVisibility("visible");
  assert.equal(requests.length, 2);
  requests[1].resolve();
  await Promise.resolve();
  assert.equal(timers.size, 1);
  stop();
  assert.equal(timers.size, 0);
  setVisibility("hidden");
  setVisibility("visible");
  assert.equal(requests.length, 2);
});

test("admin requests retain the timeout and observe cancellation from their callers", async (context) => {
  const controller = new AbortController();
  mockGlobal(context, "window", { setTimeout, clearTimeout });
  context.mock.method(globalThis, "fetch", (_input, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const request = fetchAdminJson("/api/analytics/live", { init: { signal: controller.signal } });
  controller.abort();
  await assert.rejects(request, { status: 408 });
  await assert.rejects(fetchAdminJson("/api/analytics/live", { timeoutMs: 5 }), { status: 408 });
});

test("dashboard counters share the reduced-motion animation hook", () => {
  for (const path of [
    "app/admin/AdminDashboardClient.tsx",
    "components/admin/LiveVisitors.tsx",
    "components/admin/AbandonedCartsWidget.tsx",
  ]) {
    assert.match(source(path), /useAnimatedCounter\(value\b/, path);
  }
  assert.match(source("lib/use-animated-counter.ts"), /prefers-reduced-motion: reduce/);
});

test("product images request responsive widths and defer off-screen thumbnails", () => {
  const products = source("app/admin/urunler/ProductsPageClient.tsx");
  const thumbnails = products.match(/<Image\s+src=\{product\.images\[0\]\}[\s\S]*?\/>/g);
  assert.equal(thumbnails?.length, 3);
  for (const thumbnail of thumbnails) assert.match(thumbnail, /\bsizes=/);
  assert.equal(thumbnails.filter((thumbnail) => thumbnail.includes('loading="lazy"')).length, 2);
});
