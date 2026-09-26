import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import type { Shipment, ShippingQuoteSession } from "@celebix/saas-contracts";

type Api = typeof import("../../lib/shipping-ui/client.ts").shippingFulfillmentApi;
const ID = "9f000000-0000-4000-8000-000000000001";
const SECOND = "9f000000-0000-4000-8000-000000000002";
function quote(): ShippingQuoteSession {
  return { credential: "a".repeat(40), status: "quoted", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), currency: "TRY", packages: [{ widthCm: 20, depthCm: 20, heightCm: 10, weightKg: 0.015 }], options: [{ id: SECOND, handlerCode: "test", handlerName: "Örnek Kargo", desiKg: 1.4, priceCents: 7900, codFeeCents: 1500, currency: "TRY" }] };
}
function shipment(status: Shipment["status"] = "ready"): Shipment {
  return { id: SECOND, providerCode: "basit_kargo", direction: "outgoing", status, carrier: "Örnek Kargo", trackingNumber: "TRACK-1", barcode: "BAR-1", codAmountCents: 0, currency: "TRY", items: [], events: [], label: { available: false }, version: 1, createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function api(overrides: Partial<Api> = {}): Api {
  return { currentShipmentForOrder: async () => null, quote: async () => quote(), createShipment: async () => shipment(), shipmentAction: async () => shipment(), shipmentLabelUrl: () => "/label", shipment: async () => shipment(), ...overrides };
}
async function mounted(client: Api, verify: (container: HTMLElement, browser: Window, render: (id: string, version: number) => Promise<void>) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/orders/test" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, FormData: browser.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("./OrderShipmentConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name === "@/components/orders/OrderActionDialog") return { OrderActionDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: React.ReactNode; footer: React.ReactNode }) => createElement("section", { "aria-label": title, hidden: !open, "data-dialog": true }, children, footer) };
    if (name === "@/lib/shipping-ui/client") return { shippingFulfillmentApi: client, ShippingFulfillmentApiError: class extends Error {} };
    if (name === "./order-shipment.module.css") return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Component = compiled.exports.OrderShipmentConsole as React.ComponentType<{ orderId: string; orderVersion: number }>;
  const container = browser.document.createElement("main");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const render = async (id: string, version: number) => {
    await act(async () => { root.render(createElement(Component, { orderId: id, orderVersion: version })); });
    await act(async () => { await new Promise((done) => setTimeout(done, 5)); });
  };
  try { await render(ID, 1); await verify(container as unknown as HTMLElement, browser, render); }
  finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}
function button(container: HTMLElement, label: string) { return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((entry) => entry.textContent?.trim() === label); }
async function open(container: HTMLElement) { await act(async () => { button(container, "Kargo seçenekleri")!.click(); }); }
async function submit(container: HTMLElement, browser: Window) { await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); }); }
async function fill(container: HTMLElement, name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const propsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"))!;
  const props = (input as unknown as Record<string, { onChange: (event: { target: { value: string } }) => void }>)[propsKey];
  await act(async () => props.onChange({ target: { value } }));
}

test("shipment load error never becomes a false empty state and offers a read retry", async () => {
  let calls = 0;
  await mounted(api({ currentShipmentForOrder: async () => { if (++calls === 1) throw new Error("private provider failure"); return null; } }), async (container) => {
    assert.equal(button(container, "Kargo seçenekleri"), undefined);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /tamamlanamadı/);
    assert.doesNotMatch(container.textContent ?? "", /private provider failure/);
    await act(async () => { button(container, "Tekrar dene")!.click(); });
    assert.equal(calls, 2);
    assert.ok(button(container, "Kargo seçenekleri"));
  });
});

test("package precision, entered values and complete COD quote price survive a failed quote and closing", async () => {
  let calls = 0;
  let quotedWeight = 0;
  await mounted(api({ quote: async (_id, _version, packages) => { quotedWeight = packages[0].weightKg; if (++calls === 1) throw new Error("failed"); return quote(); } }), async (container, browser) => {
    await open(container);
    const weight = container.querySelector<HTMLInputElement>('input[name="weightKg"]')!;
    assert.equal(weight.min, "0.001"); assert.equal(weight.step, "0.001");
    await fill(container, "weightKg", "0.015");
    await submit(container, browser);
    assert.equal(quotedWeight, 0.015);
    assert.equal(weight.value, "0.015");
    await act(async () => { button(container, "Vazgeç")!.click(); });
    await open(container);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="weightKg"]')?.value, "0.015");
    await submit(container, browser);
    assert.match(container.querySelector(".option b")?.textContent ?? "", /94,00/);
    assert.ok(button(container, "Gönderiyi oluştur"));
    await fill(container, "heightCm", "11");
    assert.equal(button(container, "Gönderiyi oluştur"), undefined);
    assert.ok(button(container, "Kargo teklifi al"));
  });
});

test("a late quote from the old order version is ignored and cannot create a shipment", async () => {
  const oldQuote = deferred<ShippingQuoteSession>();
  const versions: number[] = [];
  let creates = 0;
  let requestSignal: AbortSignal | undefined;
  await mounted(api({ quote: async (_id, version, _packages, signal) => { versions.push(version); if (version === 1) { requestSignal = signal; return oldQuote.promise; } return quote(); }, createShipment: async () => { creates++; return shipment(); } }), async (container, browser, render) => {
    await open(container);
    await fill(container, "weightKg", "0.015");
    await submit(container, browser);
    await render(ID, 2);
    assert.equal(requestSignal?.aborted, true);
    await act(async () => oldQuote.resolve(quote()));
    assert.equal(button(container, "Gönderiyi oluştur"), undefined);
    assert.equal(creates, 0);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="weightKg"]')?.value, "0.015");
    await submit(container, browser);
    assert.deepEqual(versions, [1, 2]);
    await act(async () => { button(container, "Gönderiyi oluştur")!.click(); });
    assert.equal(creates, 1);
  });
});

test("changing orders hides the old shipment immediately and ignores its delayed load", async () => {
  const oldShipment = deferred<Shipment | null>();
  await mounted(api({ currentShipmentForOrder: async (id) => id === ID ? oldShipment.promise : null }), async (container, _browser, render) => {
    assert.equal(button(container, "Kargo seçenekleri"), undefined);
    await render(SECOND, 1);
    assert.ok(button(container, "Kargo seçenekleri"));
    await act(async () => oldShipment.resolve(shipment()));
    assert.equal(container.textContent?.includes("TRACK-1"), false);
    assert.ok(button(container, "Kargo seçenekleri"));
  });
});

test("returned shipments expose no refresh or cancellation and retain label preparation", async () => {
  let operations = 0;
  await mounted(api({ currentShipmentForOrder: async () => shipment("returned"), shipmentAction: async () => { operations++; return shipment("returned"); } }), async (container) => {
    assert.equal(button(container, "Durumu güncelle"), undefined);
    assert.equal(button(container, "Gönderiyi iptal et"), undefined);
    assert.equal(button(container, "İade başlat"), undefined);
    assert.ok(button(container, "Etiket hazırla"));
    assert.equal(operations, 0);
  });
});
