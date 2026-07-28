import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type { Product, ProductVariant, QuickOrderLinkListItem } from "@celebix/saas-contracts";

const ROOT = new URL("../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");
const LINK_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-21T09:30:00.000Z";
const EXPIRES_AT = "2026-07-22T09:30:00.000Z";
const SHARE_URL = `https://shop.example.com/odeme/hizli/${"a".repeat(43)}`;

const listItem = Object.freeze({
  id: LINK_ID,
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  firstProductName: "Atlas Kupa",
  itemCount: 1,
  status: "active" as const,
  currency: "TRY",
  totalCents: 14_500,
  expiresAt: EXPIRES_AT,
  createdAt: NOW,
  version: 1,
}) satisfies QuickOrderLinkListItem;

const address = Object.freeze({
  recipientName: "Ada Lovelace",
  phone: "+905551112233",
  line1: "Örnek Sokak 1",
  district: "Kadıköy",
  city: "İstanbul",
  postalCode: "34710",
  country: "TR",
});

const intent = Object.freeze({
  items: Object.freeze([Object.freeze({ variantId: VARIANT_ID, quantity: 2 })]),
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  shippingAddress: address,
  billingAddress: address,
  customerNote: "Zili çalmayın.",
  internalLabel: "VIP",
  shippingCents: 1_000,
  discountCents: 500,
  expiryHours: 24 as const,
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MountedNode = {
  type: string;
  props: Record<string, unknown>;
  children: readonly (MountedNode | string)[];
  target: { focus(): void; focused: boolean };
};

function createHookRuntime(deferEffects = false) {
  const slots: unknown[] = [];
  const pendingEffects: Array<() => void> = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const sameDeps = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next;
        dirty = true;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior === undefined || !sameDeps(prior.deps, deps)) slots[index] = { deps: [...deps], value: factory() };
      return (slots[index] as { value: T }).value;
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior === undefined || !sameDeps(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void; generation: number } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return;
      const generation = (prior?.generation ?? 0) + 1;
      slots[index] = { deps: [...deps], cleanup: prior?.cleanup, generation };
      const run = () => {
        const current = slots[index] as { deps: readonly unknown[]; cleanup?: () => void; generation: number } | undefined;
        if (current?.generation !== generation) return;
        current.cleanup?.();
        const cleanup = effect();
        slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}), generation };
      };
      if (deferEffects) pendingEffects.push(run);
      else run();
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode) {
      for (let pass = 0; pass < 30; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("quick_order_console_hook_flush_exhausted");
    },
    async flushEffects() {
      const effects = pendingEffects.splice(0);
      for (const effect of effects) effect();
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

function mount(node: ReactNode, focusLog: string[], path = "root"): readonly (MountedNode | string)[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child, index) => mount(child, focusLog, `${path}.${index}`));
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === React.Fragment) return mount(node.props.children as ReactNode, focusLog, `${path}.fragment`);
  if (typeof node.type === "function") {
    const Component = node.type as (props: Record<string, unknown>) => ReactNode;
    return mount(Component(node.props), focusLog, `${path}.${Component.name || "component"}`);
  }
  if (typeof node.type !== "string") return [];
  const target = {
    focused: false,
    focus() { this.focused = true; focusLog.push(path); },
  };
  const ref = (node.props as { ref?: unknown }).ref;
  if (typeof ref === "function") ref(target);
  else if (ref && typeof ref === "object" && "current" in ref) (ref as { current: unknown }).current = target;
  return [{
    type: node.type,
    props: node.props,
    children: mount(node.props.children as ReactNode, focusLog, `${path}.${node.type}`),
    target,
  }];
}

function mountedNodes(tree: readonly (MountedNode | string)[]): MountedNode[] {
  const nodes: MountedNode[] = [];
  for (const child of tree) {
    if (typeof child === "string") continue;
    nodes.push(child, ...mountedNodes(child.children));
  }
  return nodes;
}

function mountedText(node: MountedNode | string): string {
  return typeof node === "string" ? node : node.children.map(mountedText).join("");
}

async function createMountedQuickOrderConsole(
  api: Record<string, unknown>,
  clipboardWrite: (value: string) => Promise<void> = async () => {},
  options: Readonly<{ deferEffects?: boolean }> = {},
) {
  const output = ts.transpileModule(await source("components/orders/QuickOrderLinksConsole.tsx"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const hooks = createHookRuntime(options.deferEffects);
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const Wrapper = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("div", props, children);
  const shell = {
    PanelPageHeader: ({ title, description }: { title: string; description: string }) => createElement("header", null, createElement("h1", null, title), createElement("p", null, description)),
    PanelPageShell: Wrapper,
    PanelStatusBadge: Wrapper,
  };
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  class CompiledQuickLinkUiApiError extends Error {
    constructor(readonly code: string) { super(code); }
  }
  const timers = new Map<number, () => unknown>();
  let timerId = 0;
  const opened: Array<{ opener: unknown; closed: boolean; location: { replaced: string; replace(value: string): void }; close(): void }> = [];
  const fakeWindow = {
    setTimeout(callback: () => unknown) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    open() {
      const tab = {
        opener: undefined as unknown,
        closed: false,
        location: { replaced: "", replace(value: string) { this.replaced = value; } },
        close() { this.closed = true; },
      };
      opened.push(tab);
      return tab;
    },
  };
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier === "@/lib/quick-link-ui/client") return { QuickLinkUiApiError: CompiledQuickLinkUiApiError, quickLinkUi: Object.freeze(api) };
    if (specifier === "@celebix/saas-contracts") return {};
    if (specifier === "./quick-order-links.module.css") return styles;
    throw new Error(`unexpected_quick_order_console_import:${specifier}`);
  };
  Function("require", "module", "exports", "window", "navigator", output)(
    requireModule,
    compiled,
    compiled.exports,
    fakeWindow,
    { clipboard: { writeText: clipboardWrite } },
  );
  const Console = compiled.exports.QuickOrderLinksConsole as () => ReactNode;
  assert.equal(typeof Console, "function");
  let latest: ReactNode;
  const focusLog: string[] = [];
  return {
    ApiError: CompiledQuickLinkUiApiError,
    focusLog,
    opened,
    async render() {
      latest = await hooks.flush(() => Console());
      return mount(latest, focusLog);
    },
    async runTimers() {
      const pending = [...timers.values()];
      timers.clear();
      await Promise.all(pending.map((callback) => callback()));
    },
    async runEffects() {
      await hooks.flushEffects();
    },
  };
}

async function fillMountedQuickOrderForm(
  console: Awaited<ReturnType<typeof createMountedQuickOrderConsole>>,
  values: Readonly<{ email?: string; address?: string; note?: string }> = {},
) {
  let tree = await console.render();
  let nodes = mountedNodes(tree);
  const search = nodes.find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "atlas" } });
  await console.render();
  await console.runTimers();
  tree = await console.render();
  nodes = mountedNodes(tree);
  const resultButton = nodes.find((node) => node.type === "button" && /Standart/.test(mountedText(node)))!;
  (resultButton.props.onClick as () => void)();
  tree = await console.render();
  nodes = mountedNodes(tree);
  const change = (predicate: (node: MountedNode) => boolean, value: string) => {
    const input = nodes.find(predicate);
    assert.ok(input, `mounted input not found for ${value}`);
    (input.props.onChange as (event: unknown) => void)({ target: { value } });
  };
  change((node) => node.props.autoComplete === "name", "Ada Lovelace");
  change((node) => node.props.autoComplete === "email", values.email ?? "ada@example.com");
  change((node) => node.props.autoComplete === "tel", "+905551112233");
  change((node) => node.props.autoComplete === "shipping name", "Ada Lovelace");
  change((node) => node.props.autoComplete === "shipping tel", "+905551112233");
  change((node) => node.props.autoComplete === "shipping address-level2", "İstanbul");
  change((node) => node.props.autoComplete === "shipping address-line1", values.address ?? "Örnek Sokak 1");
  if (values.note !== undefined) {
    change((node) => node.type === "textarea" && node.props.maxLength === 2_000, values.note);
  }
  return console.render();
}

test("quick-link client uses exact same-origin routes, idempotency, and allowed create intent", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const calls: Array<[string, RequestInit]> = [];
  const bodies = [
    { items: [listItem] },
    { url: SHARE_URL, expiresAt: EXPIRES_AT },
    { id: LINK_ID, status: "cancelled", version: 2, expiresAt: EXPIRES_AT, updatedAt: NOW, replayed: false },
    { url: SHARE_URL, expiresAt: EXPIRES_AT },
    { url: SHARE_URL, expiresAt: EXPIRES_AT },
    { status: "active", version: 1 },
    { status: "revoked", version: 2 },
  ];
  const client = createQuickLinkUiClient({
    fetch: async (input, init) => {
      calls.push([String(input), init ?? {}]);
      return response(bodies.shift(), String(input).endsWith("/cancel") ? 200 : 200);
    },
    randomUUID: () => OPERATION_ID,
    catalog: { async listProducts() { return Object.freeze({ items: Object.freeze([]) }); }, async getProduct() { throw new Error("not used"); } },
  });

  const listed = await client.listLinks({ pageSize: 20, status: "active" });
  const created = await client.createLink(intent);
  const cancelled = await client.cancelLink(LINK_ID, 1);
  const duplicated = await client.duplicateLink(LINK_ID);
  const revealed = await client.revealUrl(LINK_ID);
  const activated = await client.activateProvider();
  const revoked = await client.revokeProvider();

  assert.deepEqual(calls.map(([path]) => path), [
    "/api/orders/quick-links?pageSize=20&status=active",
    "/api/orders/quick-links",
    `/api/orders/quick-links/${LINK_ID}/cancel`,
    `/api/orders/quick-links/${LINK_ID}/duplicate`,
    `/api/orders/quick-links/${LINK_ID}/url`,
    "/api/orders/quick-links/provider/activate",
    "/api/orders/quick-links/provider/revoke",
  ]);
  assert.deepEqual(calls[0]?.[1], { method: "GET", credentials: "same-origin", cache: "no-store" });
  for (const index of [1, 2, 3, 5, 6]) {
    const headers = new Headers(calls[index]?.[1].headers);
    assert.equal(calls[index]?.[1].method, "POST");
    assert.equal(calls[index]?.[1].credentials, "same-origin");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("idempotency-key"), OPERATION_ID);
  }
  assert.equal(new Headers(calls[4]?.[1].headers).has("idempotency-key"), false);
  assert.deepEqual(JSON.parse(String(calls[1]?.[1].body)), intent);
  assert.deepEqual(JSON.parse(String(calls[2]?.[1].body)), { expectedVersion: 1 });
  assert.deepEqual(JSON.parse(String(calls[3]?.[1].body)), {});
  assert.deepEqual(JSON.parse(String(calls[4]?.[1].body)), {});
  assert.equal(JSON.stringify(calls[1]?.[1].body).includes("productName"), false);
  assert.equal(JSON.stringify(calls[1]?.[1].body).includes("price"), false);
  assert.equal(listed.items[0]?.id, LINK_ID);
  assert.equal(created.url, SHARE_URL);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(duplicated.url, SHARE_URL);
  assert.equal(revealed.url, SHARE_URL);
  assert.deepEqual(activated, { status: "active", version: 1 });
  assert.deepEqual(revoked, { status: "revoked", version: 2 });
  assert.equal([listed, listed.items, listed.items[0], created, cancelled, duplicated, revealed, activated, revoked].every(Object.isFrozen), true);
});

test("hosted payment method picker and create body expose no provider authority", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const calls: Array<[string, RequestInit]> = [];
  const client = createQuickLinkUiClient({
    fetch: async (input, init) => {
      calls.push([String(input), init ?? {}]);
      return calls.length === 1
        ? response({ items: [{ id: "55555555-5555-4555-8555-555555555555", label: "iyzico Checkout Form", requiresIdentity: true, requiresItemType: true }] })
        : response({ url: SHARE_URL, expiresAt: EXPIRES_AT });
    },
    randomUUID: () => OPERATION_ID,
  });
  const methods = await client.listPaymentMethods();
  await client.createLink({
    ...intent,
    paymentMethodId: methods[0]!.id,
    identityNumber: "10000000146",
    items: [{ variantId: VARIANT_ID, quantity: 2, itemType: "PHYSICAL" }],
  });
  assert.deepEqual(methods, [{ id: "55555555-5555-4555-8555-555555555555", label: "iyzico Checkout Form", requiresIdentity: true, requiresItemType: true }]);
  assert.equal(calls[0]?.[0], "/api/orders/quick-links/payment-methods");
  const body = JSON.parse(String(calls[1]?.[1].body));
  assert.equal(body.paymentMethodId, methods[0]!.id);
  assert.equal(body.identityNumber, "10000000146");
  assert.equal(body.items[0].itemType, "PHYSICAL");
  assert.doesNotMatch(JSON.stringify(body), /storeId|profileId|providerCode|providerConfigId|execution/i);
});

test("create retries can reuse one explicit operation identity", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  let randomCalls = 0;
  const calls: RequestInit[] = [];
  const client = createQuickLinkUiClient({
    fetch: async (_input, init) => { calls.push(init ?? {}); return response({ url: SHARE_URL, expiresAt: EXPIRES_AT }); },
    randomUUID: () => { randomCalls += 1; return OPERATION_ID; },
  });

  const operationId = client.newCreateOperationId();
  await client.createLink(intent, operationId);
  await client.createLink(intent, operationId);

  assert.equal(operationId, OPERATION_ID);
  assert.equal(randomCalls, 1);
  assert.deepEqual(calls.map((init) => new Headers(init.headers).get("idempotency-key")), [OPERATION_ID, OPERATION_ID]);
  await assert.rejects(() => client.createLink(intent, "not-a-uuid"), /quick_link_ui_client_invalid/);
});

test("catalog search uses real active products and exposes only selectable variant display data", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const storeId = "55555555-5555-4555-8555-555555555555";
  const product = Object.freeze({
    id: PRODUCT_ID,
    storeId,
    slug: "atlas-kupa",
    title: "Atlas Kupa",
    status: "active" as const,
    currency: "TRY",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  }) satisfies Product;
  const variants = Object.freeze([
    Object.freeze({
      id: VARIANT_ID,
      productId: PRODUCT_ID,
      storeId,
      title: "Turuncu",
      sku: "ATLAS-TR",
      priceCents: 7_000,
      stockTracking: true,
      stockQuantity: 4,
      status: "active" as const,
      attributes: Object.freeze({ renk: "Turuncu" }),
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    }),
    Object.freeze({
      id: "66666666-6666-4666-8666-666666666666",
      productId: PRODUCT_ID,
      storeId,
      title: "Arşiv",
      priceCents: 9_000,
      stockTracking: false,
      stockQuantity: 0,
      status: "archived" as const,
      attributes: Object.freeze({}),
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    }),
  ]) satisfies readonly ProductVariant[];
  const listCalls: unknown[] = [];
  const detailCalls: string[] = [];
  const client = createQuickLinkUiClient({
    fetch: async () => response({}),
    randomUUID: () => OPERATION_ID,
    catalog: {
      async listProducts(input) { listCalls.push(input); return Object.freeze({ items: Object.freeze([product]) }); },
      async getProduct(id) { detailCalls.push(id); return Object.freeze({ product, variants }); },
    },
  });

  const results = await client.searchProducts("atlas-tr");
  assert.deepEqual(listCalls, [{ status: "active" }]);
  assert.deepEqual(detailCalls, [PRODUCT_ID]);
  assert.deepEqual(results, [Object.freeze({
    title: "Atlas Kupa",
    variants: Object.freeze([Object.freeze({
      variantId: VARIANT_ID,
      title: "Turuncu",
      sku: "ATLAS-TR",
      priceCents: 7_000,
      availableQuantity: 4,
    })]),
  })]);
  assert.equal(JSON.stringify(results).includes(storeId), false);
  assert.equal(JSON.stringify(results).includes(PRODUCT_ID), false);
  assert.equal(Object.isFrozen(results), true);
  assert.equal(Object.isFrozen(results[0]?.variants), true);
  assert.deepEqual(await client.searchProducts("   "), []);
});

test("catalog search traverses bounded pages, caps detail concurrency, and stops at twelve matches", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const storeId = "55555555-5555-4555-8555-555555555555";
  const product = (index: number) => Object.freeze({
    id: `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222`,
    storeId,
    slug: `urun-${index}`,
    title: index < 6 ? `Başka ${index}` : `Atlas ${index}`,
    status: "active" as const,
    currency: "TRY" as const,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  }) satisfies Product;
  const pages = [
    Object.freeze({ items: Object.freeze(Array.from({ length: 6 }, (_, index) => product(index + 1))), nextCursor: "page_two" }),
    Object.freeze({ items: Object.freeze(Array.from({ length: 10 }, (_, index) => product(index + 7))), nextCursor: "page_three" }),
    Object.freeze({ items: Object.freeze(Array.from({ length: 10 }, (_, index) => product(index + 17))) }),
  ];
  const listCalls: unknown[] = [];
  let activeDetails = 0;
  let maximumActiveDetails = 0;
  let releaseDetails: (() => void) | undefined;
  let detailGate = new Promise<void>((resolve) => { releaseDetails = resolve; });
  const detailStarted: number[] = [];
  const client = createQuickLinkUiClient({
    fetch: async () => response({}),
    randomUUID: () => OPERATION_ID,
    catalog: {
      async listProducts(input) {
        listCalls.push(input);
        return pages[listCalls.length - 1] ?? Object.freeze({ items: Object.freeze([]) });
      },
      async getProduct(id) {
        activeDetails += 1;
        maximumActiveDetails = Math.max(maximumActiveDetails, activeDetails);
        detailStarted.push(Number(id.slice(0, 8)));
        await detailGate;
        activeDetails -= 1;
        const selected = [...pages[0].items, ...pages[1].items, ...pages[2].items].find((item) => item.id === id)!;
        return Object.freeze({
          product: selected,
          variants: Object.freeze([Object.freeze({
            id: `${id.slice(0, 8)}-3333-4333-8333-333333333333`,
            productId: id,
            storeId,
            title: "Standart",
            priceCents: 1_000,
            stockTracking: false,
            stockQuantity: 0,
            status: "active" as const,
            attributes: Object.freeze({}),
            createdAt: NOW,
            updatedAt: NOW,
            version: 1,
          })]),
        });
      },
    },
  });

  const pending = client.searchProducts("atlas");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(detailStarted.length, 4, "only four catalog details may be in flight");
  releaseDetails?.();
  for (let pass = 0; pass < 10; pass += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (activeDetails > 0) {
      detailGate = Promise.resolve();
      releaseDetails?.();
    }
  }
  const results = await pending;

  assert.deepEqual(listCalls, [
    { status: "active" },
    { status: "active", cursor: "page_two" },
    { status: "active", cursor: "page_three" },
  ]);
  assert.equal(results.length, 12);
  assert.equal(maximumActiveDetails, 4);
  assert.equal(detailStarted.length, 20, "detail loading stops once a batch reaches the result cap");
});

test("client maps finite conflict and readiness errors and rejects hostile response shapes", async () => {
  const { QuickLinkUiApiError, createQuickLinkUiClient } = await import("./client.ts");
  const conflict = createQuickLinkUiClient({
    fetch: async () => response({ code: "version_conflict", detail: "private" }, 409),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => conflict.cancelLink(LINK_ID, 1),
    (error: unknown) => error instanceof QuickLinkUiApiError && error.code === "version_conflict" && !error.message.includes("private"),
  );
  const readiness = createQuickLinkUiClient({
    fetch: async () => response({ code: "provider_not_ready" }, 409),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => readiness.createLink(intent),
    (error: unknown) => error instanceof QuickLinkUiApiError && error.code === "provider_not_ready" && /PayTR/.test(error.message),
  );
  const hostile = createQuickLinkUiClient({
    fetch: async () => response({ items: [{ ...listItem, tokenDigest: "secret" }] }),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => hostile.listLinks(),
    (error: unknown) => error instanceof QuickLinkUiApiError && error.code === "unavailable",
  );
});

test("share responses preserve Task 7 canonical six-digit PostgreSQL timestamps", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const expiresAt = "2026-07-22T09:30:00.123456Z";
  const client = createQuickLinkUiClient({
    fetch: async () => response({ url: SHARE_URL, expiresAt }),
    randomUUID: () => OPERATION_ID,
  });
  assert.deepEqual(await client.createLink(intent), { url: SHARE_URL, expiresAt });
});

test("mounted search clears stale rows, aborts obsolete work, and keeps semantic keyboard focus", async () => {
  let resolveOld: ((value: readonly unknown[]) => void) | undefined;
  let oldSignal: AbortSignal | undefined;
  const productResult = (title: string) => Object.freeze([Object.freeze({
    title,
    variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]),
  })]);
  const console = await createMountedQuickOrderConsole({
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts(query: string, options?: { signal?: AbortSignal }) {
      if (query === "eski") {
        oldSignal = options?.signal;
        return new Promise<readonly unknown[]>((resolve) => { resolveOld = resolve; });
      }
      return productResult(query === "yeni" ? "Yeni Ürün" : "Atlas Kupa");
    },
  });
  let tree = await console.render();
  let nodes = mountedNodes(tree);
  let search = nodes.find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;

  (search.props.onChange as (event: unknown) => void)({ target: { value: "atlas" } });
  tree = await console.render();
  assert.match(tree.map(mountedText).join(""), /Ürünler aranıyor/);
  await console.runTimers();
  tree = await console.render();
  assert.match(tree.map(mountedText).join(""), /Atlas Kupa/);

  nodes = mountedNodes(tree);
  search = nodes.find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "eski" } });
  tree = await console.render();
  assert.doesNotMatch(tree.map(mountedText).join(""), /Atlas Kupa/, "prior-query rows hide during debounce");
  const oldTimer = console.runTimers();
  await new Promise<void>((resolve) => setImmediate(resolve));

  nodes = mountedNodes(await console.render());
  search = nodes.find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "yeni" } });
  tree = await console.render();
  assert.equal(oldSignal?.aborted, true, "the obsolete catalog search is actively aborted");
  resolveOld?.(productResult("Eski Ürün"));
  await oldTimer;
  tree = await console.render();
  assert.doesNotMatch(tree.map(mountedText).join(""), /Eski Ürün/);
  await console.runTimers();
  tree = await console.render();

  nodes = mountedNodes(tree);
  assert.match(tree.map(mountedText).join(""), /Yeni Ürün/);
  assert.equal(nodes.some((node) => node.props.role === "listbox" || node.props.role === "option"), false);
  assert.equal(nodes.some((node) => node.type === "ul" && node.props["aria-label"] === "Katalog arama sonuçları"), true);
  assert.equal(nodes.some((node) => node.type === "li" && /Yeni Ürün/.test(mountedText(node))), true);
  search = nodes.find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  assert.equal("aria-expanded" in search.props, false);
  const resultButton = nodes.find((node) => node.type === "button" && /Standart/.test(mountedText(node)))!;
  let prevented = false;
  (search.props.onKeyDown as (event: unknown) => void)({ key: "ArrowDown", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(resultButton.target.focused, true);
  (resultButton.props.onKeyDown as (event: unknown) => void)({ key: "Escape", preventDefault() {} });
  assert.equal(search.target.focused, true);
});

test("query change invalidates in-flight search before deferred effect cleanup", async () => {
  let oldSignal: AbortSignal | undefined;
  let resolveOld: ((value: readonly unknown[]) => void) | undefined;
  const console = await createMountedQuickOrderConsole({
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts(query: string, options?: { signal?: AbortSignal }) {
      if (query === "eski") {
        oldSignal = options?.signal;
        return new Promise<readonly unknown[]>((resolve) => { resolveOld = resolve; });
      }
      return Object.freeze([]);
    },
  }, async () => {}, { deferEffects: true });
  let tree = await console.render();
  await console.runEffects();
  tree = await console.render();
  let search = mountedNodes(tree).find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "eski" } });
  await console.render();
  await console.runEffects();
  const oldTimer = console.runTimers();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(oldSignal);

  tree = await console.render();
  search = mountedNodes(tree).find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "yeni" } });
  const abortedAtEventBoundary = oldSignal?.aborted;
  resolveOld?.(Object.freeze([Object.freeze({
    title: "Eski Ürün",
    variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]),
  })]));
  await oldTimer;
  tree = await console.render();
  const textContent = tree.map(mountedText).join("");

  assert.equal(abortedAtEventBoundary, true, "the input event aborts obsolete work before passive effects run");
  assert.doesNotMatch(textContent, /Eski Ürün/, "an old promise cannot publish between commit and effect cleanup");
  assert.match(textContent, /Ürünler aranıyor/);
});

test("mounted create refreshes durable rows before clipboard and reports copy failure separately", async () => {
  const events: string[] = [];
  let listCalls = 0;
  let createdIntent: unknown;
  let createdOperationId: unknown;
  const console = await createMountedQuickOrderConsole({
    newCreateOperationId() { events.push("operation"); return OPERATION_ID; },
    async listLinks() {
      listCalls += 1;
      events.push(`list:${listCalls}`);
      return Object.freeze({ items: Object.freeze(listCalls === 1 ? [] : [listItem]) });
    },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]) })]); },
    async createLink(value: unknown, operationId: unknown) {
      events.push("create");
      createdIntent = value;
      createdOperationId = operationId;
      return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT });
    },
  }, async (value) => {
    events.push(`clipboard:${value}`);
    throw new Error("permission denied");
  });
  const tree = await fillMountedQuickOrderForm(console);
  const form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  const rendered = await console.render();
  const textContent = rendered.map(mountedText).join("");

  assert.equal(createdOperationId, OPERATION_ID);
  assert.deepEqual(events, ["list:1", "operation", "create", "list:2", `clipboard:${SHARE_URL}`]);
  assert.equal((createdIntent as { customerEmail: string }).customerEmail, "ada@example.com");
  assert.match(textContent, /Ödeme linki oluşturuldu/);
  assert.match(textContent, /panoya kopyalanamadı/);
  assert.match(textContent, /Ada Lovelace/);
  assert.doesNotMatch(textContent, /Hızlı sipariş linki oluşturulamadı/);
});

test("mounted iyzico builder requires real identity and explicit item type without browser authority", async () => {
  const methodId = "55555555-5555-4555-8555-555555555555";
  let createdIntent: Record<string, unknown> | undefined;
  const console = await createMountedQuickOrderConsole({
    newCreateOperationId() { return OPERATION_ID; },
    async listPaymentMethods() { return Object.freeze([Object.freeze({ id: methodId, label: "iyzico Checkout Form", requiresIdentity: true, requiresItemType: true })]); },
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]) })]); },
    async createLink(value: Record<string, unknown>) { createdIntent = value; return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT }); },
  });
  let tree = await fillMountedQuickOrderForm(console);
  let nodes = mountedNodes(tree);
  const method = nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Ödeme yöntemi")!;
  (method.props.onChange as (event: unknown) => void)({ target: { value: methodId } });
  tree = await console.render();
  nodes = mountedNodes(tree);
  const identity = nodes.find((node) => node.type === "input" && node.props["aria-label"] === "Alıcı kimlik numarası")!;
  (identity.props.onChange as (event: unknown) => void)({ target: { value: "10000000146" } });
  const itemType = nodes.find((node) => node.type === "select" && /ürün tipi/.test(String(node.props["aria-label"])))!;
  (itemType.props.onChange as (event: unknown) => void)({ target: { value: "PHYSICAL" } });
  tree = await console.render();
  const form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });

  assert.equal(createdIntent?.paymentMethodId, methodId);
  assert.equal(createdIntent?.identityNumber, "10000000146");
  assert.deepEqual(createdIntent?.items, [{ variantId: VARIANT_ID, quantity: 1, itemType: "PHYSICAL" }]);
  assert.doesNotMatch(JSON.stringify(createdIntent), /storeId|profileId|providerCode|providerConfigId|execution/i);
});

test("mounted ambiguous create retry reuses its operation identity", async () => {
  const operationIds: unknown[] = [];
  let operationCalls = 0;
  let createCalls = 0;
  let ambiguousError: Error;
  const console = await createMountedQuickOrderConsole({
    newCreateOperationId() { operationCalls += 1; return OPERATION_ID; },
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]) })]); },
    async createLink(_value: unknown, operationId: unknown) {
      createCalls += 1;
      operationIds.push(operationId);
      if (createCalls === 1) throw ambiguousError;
      return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT });
    },
  });
  ambiguousError = new console.ApiError("commit_unknown");
  let tree = await fillMountedQuickOrderForm(console);
  let form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  tree = await console.render();
  assert.match(tree.map(mountedText).join(""), /commit_unknown/);

  form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  tree = await console.render();

  assert.equal(operationCalls, 1);
  assert.deepEqual(operationIds, [OPERATION_ID, OPERATION_ID]);
  assert.match(tree.map(mountedText).join(""), /Ödeme linki oluşturuldu/);
});

test("explicit Temizle abandons ambiguous create identity before rebuilding the same intent", async () => {
  const NEXT_OPERATION_ID = "88888888-8888-4888-8888-888888888888";
  const operationIds: unknown[] = [];
  let operationCalls = 0;
  let createCalls = 0;
  let ambiguousError: Error;
  const console = await createMountedQuickOrderConsole({
    newCreateOperationId() { operationCalls += 1; return operationCalls === 1 ? OPERATION_ID : NEXT_OPERATION_ID; },
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]) })]); },
    async createLink(_value: unknown, operationId: unknown) {
      createCalls += 1;
      operationIds.push(operationId);
      if (createCalls === 1) throw ambiguousError;
      return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT });
    },
  });
  ambiguousError = new console.ApiError("commit_unknown");
  let tree = await fillMountedQuickOrderForm(console);
  let form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  tree = await console.render();
  const clear = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Temizle")!;
  (clear.props.onClick as () => void)();
  await console.render();

  tree = await fillMountedQuickOrderForm(console);
  form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  tree = await console.render();

  assert.equal(operationCalls, 2);
  assert.deepEqual(operationIds, [OPERATION_ID, NEXT_OPERATION_ID]);
  assert.match(tree.map(mountedText).join(""), /Ödeme linki oluşturuldu/);
});

test("mounted create canonicalizes email and textarea line breaks to the Task 7 contract", async () => {
  let createdIntent: typeof intent | undefined;
  const console = await createMountedQuickOrderConsole({
    newCreateOperationId() { return OPERATION_ID; },
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]) })]); },
    async createLink(value: typeof intent) { createdIntent = value; return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT }); },
  });
  const tree = await fillMountedQuickOrderForm(console, {
    email: " Ada@Example.COM ",
    address: "Örnek Sokak\nNo: 1",
    note: "Zili çalmayın.\r\nKapıya bırakın.",
  });
  const form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });

  assert.equal(createdIntent?.customerEmail, "ada@example.com");
  assert.equal(createdIntent?.shippingAddress.line1, "Örnek Sokak No: 1");
  assert.equal(createdIntent?.billingAddress.line1, "Örnek Sokak No: 1");
  assert.equal(createdIntent?.customerNote, "Zili çalmayın. Kapıya bırakın.");
});

test("mounted builder caps distinct catalog lines at one hundred with an item-local error", async () => {
  const variants = Object.freeze(Array.from({ length: 101 }, (_, index) => Object.freeze({
    variantId: `${String(index + 1).padStart(8, "0")}-3333-4333-8333-333333333333`,
    title: `Varyant ${index + 1}`,
    priceCents: 1_000,
  })));
  const console = await createMountedQuickOrderConsole({
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants })]); },
  });
  let tree = await console.render();
  let search = mountedNodes(tree).find((node) => node.type === "input" && node.props.placeholder === "Ürün ara…")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "atlas" } });
  await console.render();
  await console.runTimers();
  for (let index = 0; index < 101; index += 1) {
    tree = await console.render();
    const button = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node).includes(`Varyant ${index + 1}SKU yok`))!;
    (button.props.onClick as () => void)();
  }
  tree = await console.render();
  const nodes = mountedNodes(tree);

  assert.equal(nodes.filter((node) => node.type === "input" && node.props.type === "number").length, 100);
  assert.match(tree.map(mountedText).join(""), /En fazla 100 farklı katalog varyantı/);
  const selected = nodes.find((node) => node.type === "section" && node.props["aria-label"] === "Seçilen sipariş kalemleri")!;
  assert.equal(selected.props["aria-describedby"], "quick-order-items-error");
});

test("mounted builder rejects an excessive discount at the discount field without masking total", async () => {
  let createCalls = 0;
  const console = await createMountedQuickOrderConsole({
    newCreateOperationId() { return OPERATION_ID; },
    async listLinks() { return Object.freeze({ items: Object.freeze([]) }); },
    async searchProducts() { return Object.freeze([Object.freeze({ title: "Atlas Kupa", variants: Object.freeze([Object.freeze({ variantId: VARIANT_ID, title: "Standart", priceCents: 7_000 })]) })]); },
    async createLink() { createCalls += 1; return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT }); },
  });
  let tree = await fillMountedQuickOrderForm(console);
  let nodes = mountedNodes(tree);
  const amountInputs = nodes.filter((node) => node.type === "input" && node.props.inputMode === "decimal");
  assert.equal(amountInputs.length, 2);
  (amountInputs[1]!.props.onChange as (event: unknown) => void)({ target: { value: "100" } });
  tree = await console.render();
  assert.doesNotMatch(tree.map(mountedText).join(""), /Toplam₺0,00/, "negative total is not silently clamped to zero");
  const form = mountedNodes(tree).find((node) => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  tree = await console.render();
  nodes = mountedNodes(tree);
  const discount = nodes.filter((node) => node.type === "input" && node.props.inputMode === "decimal")[1]!;

  assert.equal(createCalls, 0);
  assert.equal(discount.props["aria-invalid"], true);
  assert.equal(discount.props["aria-describedby"], "quick-order-discount-error");
  assert.match(tree.map(mountedText).join(""), /İndirim, ara toplam ile kargo toplamını aşamaz/);
});

test("mounted next-page failure preserves loaded rows and cursor with an inline retry", async () => {
  const secondItem = Object.freeze({
    ...listItem,
    id: "77777777-7777-4777-8777-777777777777",
    customerName: "Grace Hopper",
    customerEmail: "grace@example.com",
  });
  let listCalls = 0;
  const console = await createMountedQuickOrderConsole({
    async listLinks(input: { cursor?: string }) {
      listCalls += 1;
      if (listCalls === 1) return Object.freeze({ items: Object.freeze([listItem]), nextCursor: "next_page" });
      assert.equal(input.cursor, "next_page");
      if (listCalls === 2) throw new Error("offline");
      return Object.freeze({ items: Object.freeze([secondItem]) });
    },
  });
  let tree = await console.render();
  let more = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Daha fazla yükle")!;
  (more.props.onClick as () => void)();
  tree = await console.render();
  let textContent = tree.map(mountedText).join("");

  assert.match(textContent, /Ada Lovelace/);
  assert.doesNotMatch(textContent, /Linkler yüklenemediLinkler yüklenemedi/);
  const retry = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Sayfayı tekrar dene")!;
  assert.ok(retry);
  (retry.props.onClick as () => void)();
  tree = await console.render();
  textContent = tree.map(mountedText).join("");

  assert.equal(listCalls, 3);
  assert.match(textContent, /Ada Lovelace/);
  assert.match(textContent, /Grace Hopper/);
  assert.equal(mountedNodes(tree).some((node) => node.type === "button" && mountedText(node) === "Daha fazla yükle"), false);
});

test("mounted list renders loading, empty, error, desktop, and mobile states", async () => {
  let resolveList: ((value: unknown) => void) | undefined;
  const loadingConsole = await createMountedQuickOrderConsole({
    async listLinks() { return new Promise((resolve) => { resolveList = resolve; }); },
  });
  let tree = await loadingConsole.render();
  assert.match(tree.map(mountedText).join(""), /Linkler yükleniyor/);
  resolveList?.(Object.freeze({ items: Object.freeze([]) }));
  tree = await loadingConsole.render();
  const emptyText = tree.map(mountedText).join("");
  assert.match(emptyText, /Henüz hızlı sipariş linki oluşturulmadı/);
  for (const label of ["Sipariş Detayı", "Teslimat Bilgileri", "Sipariş Özeti", "Müşteri Notu", "Dahili Etiket", "Ödeme Yöntemi", "Oluşturulan Linkler"]) {
    assert.match(emptyText, new RegExp(label));
  }
  assert.doesNotMatch(emptyText, /Müşteri ara/);

  const errorConsole = await createMountedQuickOrderConsole({ async listLinks() { throw new Error("offline"); } });
  tree = await errorConsole.render();
  assert.match(tree.map(mountedText).join(""), /Linkler yüklenemedi/);
  assert.ok(mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Tekrar dene"));

  const lifecycleItems = Object.freeze((["active", "opened", "paid", "cancelled", "expired"] as const).map((status, index) => Object.freeze({
    ...listItem,
    id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    status,
  })));
  const loadedConsole = await createMountedQuickOrderConsole({ async listLinks() { return Object.freeze({ items: lifecycleItems }); } });
  tree = await loadedConsole.render();
  const nodes = mountedNodes(tree);
  assert.equal(nodes.some((node) => node.props.className === "desktopTable"), true);
  assert.equal(nodes.some((node) => node.props.className === "mobileCards"), true);
  assert.equal(nodes.some((node) => node.type === "table" && node.props["aria-label"] === "Oluşturulan hızlı sipariş linkleri"), true);
  for (const label of ["Aktif", "Açıldı", "Ödendi", "İptal", "Süresi doldu"]) assert.match(tree.map(mountedText).join(""), new RegExp(label));
});

test("mounted link actions use reveal, clipboard, safe open, duplicate, and durable refresh", async () => {
  const clipboard: string[] = [];
  const revealIds: string[] = [];
  const duplicateIds: string[] = [];
  let listCalls = 0;
  const console = await createMountedQuickOrderConsole({
    async listLinks() { listCalls += 1; return Object.freeze({ items: Object.freeze([listItem]) }); },
    async revealUrl(id: string) { revealIds.push(id); return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT }); },
    async duplicateLink(id: string) { duplicateIds.push(id); return Object.freeze({ url: SHARE_URL, expiresAt: EXPIRES_AT }); },
  }, async (value) => { clipboard.push(value); });
  let tree = await console.render();
  let nodes = mountedNodes(tree);
  (nodes.find((node) => node.type === "button" && node.props["aria-label"] === "Linki kopyala")!.props.onClick as () => void)();
  tree = await console.render();
  nodes = mountedNodes(tree);
  (nodes.find((node) => node.type === "button" && node.props["aria-label"] === "Ödeme sayfasını aç")!.props.onClick as () => void)();
  tree = await console.render();
  nodes = mountedNodes(tree);
  (nodes.find((node) => node.type === "button" && node.props["aria-label"] === "Kopyasını oluştur")!.props.onClick as () => void)();
  tree = await console.render();

  assert.deepEqual(revealIds, [LINK_ID, LINK_ID]);
  assert.deepEqual(clipboard, [SHARE_URL]);
  assert.equal(console.opened.length, 1);
  assert.equal(console.opened[0]?.opener, null);
  assert.equal(console.opened[0]?.location.replaced, SHARE_URL);
  assert.deepEqual(duplicateIds, [LINK_ID]);
  assert.equal(listCalls, 2);
  assert.match(tree.map(mountedText).join(""), /Linkin kopyası oluşturuldu/);
});

test("mounted cancel conflict refreshes authoritative rows and moves focus to results", async () => {
  let conflict: Error;
  let listCalls = 0;
  const console = await createMountedQuickOrderConsole({
    async listLinks() {
      listCalls += 1;
      return Object.freeze({ items: Object.freeze([listCalls === 1 ? listItem : Object.freeze({ ...listItem, status: "cancelled", version: 2 })]) });
    },
    async cancelLink() { throw conflict; },
  });
  conflict = new console.ApiError("version_conflict");
  let tree = await console.render();
  const cancel = mountedNodes(tree).find((node) => node.type === "button" && node.props["aria-label"] === "Linki iptal et")!;
  (cancel.props.onClick as () => void)();
  tree = await console.render();

  assert.equal(listCalls, 2);
  assert.match(tree.map(mountedText).join(""), /İptal/);
  assert.match(tree.map(mountedText).join(""), /version_conflict/);
  assert.equal(console.focusLog.length > 0, true);
});

test("responsive table/cards, 48px targets, and visible focus stay in the accepted panel tokens", async () => {
  const styles = await source("components/orders/quick-order-links.module.css");
  assert.match(styles, /#F9F9F9/i);
  assert.match(styles, /#FF6A00/i);
  assert.match(styles, /#E1E6EF/i);
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)[^]*\.desktopTable\s*\{\s*display:\s*none/s);
  assert.match(styles, /@media\s*\(min-width:\s*1025px\)[^]*\.mobileCards\s*\{\s*display:\s*none/s);
  assert.match(styles, /prefers-reduced-motion/);
});

test("client and console contain no browser authority, private provider material, or donor runtime", async () => {
  const combined = (await Promise.all([
    source("lib/quick-link-ui/client.ts"),
    source("components/orders/QuickOrderLinksConsole.tsx"),
  ])).join("\n");
  assert.match(combined, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(combined, /TenantContext|storeId|tenantId|principalId|membershipId|providerConfigId|tokenDigest|sealedToken/i);
  assert.doesNotMatch(combined, /document\.cookie|localStorage|sessionStorage|authorization|x-celebix|\/api\/admin|supabase/i);
  assert.doesNotMatch(combined, /apps\/admin|fetchAdminJson|buildStorefrontUrl|sonner/i);
});
