import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as contracts from "@celebix/saas-contracts";
import * as selection from "../../lib/barcode-labels/selection.ts";
import * as documentHelpers from "../../lib/barcode-labels/document.ts";
import * as barcodes from "../../lib/barcode-labels/barcodes.ts";
import * as geometry from "../../lib/barcode-labels/preview-geometry.ts";
import * as mutations from "../../lib/barcode-labels/idempotent-mutation.ts";
import * as templateState from "../../lib/barcode-labels/template-state.ts";
import * as templates from "../../lib/barcode-labels/system-templates.ts";

const PRODUCT = "95000000-0000-4000-8000-000000000001";
const FIRST = "95000000-0000-4000-8000-000000000002";
const SECOND = "95000000-0000-4000-8000-000000000003";
const NOW = "2026-09-26T12:00:00.000Z";
const first: contracts.BarcodeLabelVariantRow = {
  productId: PRODUCT,
  productVersion: 4,
  variantId: FIRST,
  variantVersion: 7,
  productTitle: "Pamuk bluz",
  variantTitle: "S",
  sku: "BLUZ-S",
  priceCents: 24990,
  currency: "TRY",
  stock: 3,
  trackInventory: true,
  attributes: {},
  status: "active",
  updatedAt: NOW,
};
const second: contracts.BarcodeLabelVariantRow = {
  ...first,
  variantId: SECOND,
  variantVersion: 11,
  productTitle: "Keten etek",
  variantTitle: "M",
  sku: "ETEK-M",
  barcode: "ABC-123",
  stock: 8,
};
type Request = Readonly<{
  path: string;
  method: string;
  body?: Record<string, unknown>;
  headers: Headers;
}>;
type Harness = Readonly<{
  container: HTMLElement;
  browser: Window;
  requests: Request[];
  printed: string[];
  reserved(): number;
  cancelled(): number;
  releasePrint(): void;
  releaseLibrary(): void;
}>;

async function mounted(
  verify: (harness: Harness) => Promise<void>,
  canManage = true,
  holdPrint = false,
  holdLibrary = false,
) {
  const browser = new Window({
    url: "https://panel.example.test/products/barcode-labels",
  });
  browser.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  browser.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new browser.Event("close"));
  };
  const requests: Request[] = [],
    printed: string[] = [];
  let reservations = 0,
    cancellations = 0;
  let releasePrint = () => {};
  let releaseLibrary = () => {};
  const libraryGate = holdLibrary
    ? new Promise<void>((resolve) => {
        releaseLibrary = resolve;
      })
    : Promise.resolve();
  const printGate = holdPrint
    ? new Promise<void>((resolve) => {
        releasePrint = resolve;
      })
    : Promise.resolve();
  const response = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fakeFetch: typeof fetch = async (input, init) => {
    const path = String(input),
      method = init?.method ?? "GET";
    requests.push({
      path,
      method,
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
    });
    if (method !== "GET") {
      if (path === "/api/catalog/barcodes/internal/ean13")
        return response({
          succeeded: [],
          failed: [{ variantId: FIRST, code: "version_conflict" }],
          replayed: false,
        });
      if (path === "/api/catalog/barcode-print-jobs/v2") {
        await printGate;
        return response({ code: "version_conflict" }, 409);
      }
      return response({ code: "forbidden" }, 403);
    }
    if (path.startsWith("/api/catalog/barcode-labels/v2?"))
      return response({
        items: [first, second],
        catalogTotal: 2,
        storeName: "Örnek mağaza",
      });
    if (path === "/api/catalog/onboarding/options")
      return response({
        categories: [],
        resources: [],
        locations: [],
        channels: [],
      });
    if (path === "/api/catalog/barcode-label-templates") {
      await libraryGate;
      return response({
        items: holdLibrary
          ? [
              {
                id: PRODUCT,
                name: "Mağaza varsayılanı",
                config:
                  templates.getSystemBarcodeLabelTemplate("retail-50x30")!
                    .config,
                status: "active",
                isDefault: true,
                version: 1,
                createdAt: NOW,
                updatedAt: NOW,
              },
            ]
          : [],
      });
    }
    if (path === "/api/catalog/barcode-print-jobs")
      return response({ items: [] });
    throw new Error(`unexpected_request:${method}:${path}`);
  };
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    Event: browser.Event,
    MouseEvent: browser.MouseEvent,
    KeyboardEvent: browser.KeyboardEvent,
    FormData: browser.FormData,
    location: browser.location,
    confirm: () => true,
    fetch: fakeFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const source = await readFile(
    process.env.BARCODE_STUDIO_BEHAVIOR_SOURCE ??
      new URL("./BarcodeLabelStudio.tsx", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const imports: Record<string, unknown> = {
    "@celebix/saas-contracts": contracts,
    "@/lib/barcode-labels/selection.ts": selection,
    "@/lib/barcode-labels/document.ts": documentHelpers,
    "@/lib/barcode-labels/barcodes.ts": barcodes,
    "@/lib/barcode-labels/preview-geometry.ts": geometry,
    "@/lib/barcode-labels/idempotent-mutation.ts": mutations,
    "@/lib/barcode-labels/template-state.ts": templateState,
    "@/lib/barcode-labels/system-templates.ts": templates,
    "@/lib/barcode-labels/print-window.ts": {
      reservePrintWindow: () => {
        reservations++;
        return {};
      },
      completePrintWindow: (_window: unknown, path: string) =>
        printed.push(path),
      cancelPrintWindow: () => {
        cancellations++;
      },
    },
    "./BarcodePreview": {
      BarcodePreview: ({ item }: { item: documentHelpers.LabelDocumentItem }) =>
        createElement(
          "div",
          {
            "aria-label": `Etiket önizlemesi: ${item.source.productTitle}`,
            "data-preview-variant": item.variantId,
            "data-preview-quantity": item.quantity,
          },
          createElement(
            "span",
            { role: "img", "aria-label": `Barkod ${item.barcode.value}` },
            item.barcode.value,
          ),
        ),
    },
  };
  Function(
    "require",
    "module",
    "exports",
    output,
  )(
    (name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react")
        return new Proxy(
          {},
          { get: () => () => createElement("svg", { "aria-hidden": true }) },
        );
      if (name.endsWith(".css")) return {};
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`unexpected_import:${name}`);
    },
    module,
    module.exports,
  );
  const { createRoot } = await import("react-dom/client");
  const browserContainer = browser.document.createElement("main");
  browser.document.body.append(browserContainer);
  const container = browserContainer as unknown as HTMLElement;
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(
          module.exports.BarcodeLabelStudio as React.ComponentType<{
            canManage: boolean;
            storeName: string;
          }>,
          { canManage, storeName: "Örnek mağaza" },
        ),
      ),
    );
    await act(async () => {
      await new Promise((done) => setTimeout(done, 30));
    });
    assert.equal(
      container.querySelectorAll("tbody tr").length,
      2,
      "real contract parsing loaded both variants",
    );
    await verify({
      container,
      browser,
      requests,
      printed,
      reserved: () => reservations,
      cancelled: () => cancellations,
      releasePrint,
      releaseLibrary,
    });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals)
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

function button(container: HTMLElement, label: string, byAria = false) {
  const found = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((entry) =>
    byAria
      ? entry.getAttribute("aria-label") === label
      : entry.textContent?.trim() === label,
  );
  assert.ok(found, `button ${label} exists`);
  return found;
}
async function click(container: HTMLElement, label: string, byAria = false) {
  await act(async () => button(container, label, byAria).click());
}
function quantity(container: HTMLElement, title: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[aria-label="${title} etiket adedi"]`,
  );
  assert.ok(input, `quantity for ${title} exists`);
  return input;
}
function row(container: HTMLElement, title: string) {
  const found = [
    ...container.querySelectorAll<HTMLTableRowElement>("tbody tr"),
  ].find((entry) => entry.textContent?.includes(title));
  assert.ok(found, `row for ${title} exists`);
  return found;
}
function labelled<T extends HTMLElement>(
  container: HTMLElement,
  label: string,
  selector: string,
) {
  const found = [...container.querySelectorAll<HTMLLabelElement>("label")].find(
    (entry) => {
      const copy = entry.cloneNode(true) as HTMLLabelElement;
      copy
        .querySelectorAll("input, select, textarea")
        .forEach((control) => control.remove());
      return copy.textContent?.trim() === label;
    },
  );
  const control = found?.querySelector<T>(selector);
  assert.ok(control, `labelled ${label} control exists`);
  return control;
}
async function change(
  input: HTMLInputElement | HTMLSelectElement,
  value: string,
  browser: Window,
) {
  const prototype =
    input.tagName === "SELECT"
      ? browser.HTMLSelectElement.prototype
      : browser.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(
      new browser.Event(input.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }) as unknown as Event,
    );
  });
}
async function choose(container: HTMLElement, title: string) {
  const checkbox = row(container, title).querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  assert.ok(checkbox);
  await act(async () => checkbox.click());
}
async function step(container: HTMLElement, number: number) {
  const labels = ["Ürünleri seç", "Etiketi düzenle", "Baskıyı hazırla"];
  const navigation = container.querySelector<HTMLElement>(
    'nav[aria-label="Etiket hazırlama adımları"]',
  );
  assert.ok(navigation);
  const target = [
    ...navigation.querySelectorAll<HTMLButtonElement>("button"),
  ].find((entry) => entry.textContent?.includes(labels[number - 1]!));
  assert.ok(target);
  await act(async () => target.click());
}

test("focusing an unselected quantity never silently adds a label", async () => {
  await mounted(async ({ container }) => {
    const input = quantity(container, second.productTitle);
    await act(async () => input.focus());
    assert.equal(
      row(container, second.productTitle).querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!.checked,
      false,
    );
    assert.equal(input.value, "0");
    assert.equal(container.querySelector("[data-preview-variant]"), null);
  });
});

test("editing an unselected quantity builds its snapshot and zero removes it", async () => {
  await mounted(
    async ({ container, browser, requests, printed, cancelled }) => {
      await change(quantity(container, second.productTitle), "3", browser);
      assert.equal(
        row(container, second.productTitle).querySelector<HTMLInputElement>(
          'input[type="checkbox"]',
        )!.checked,
        true,
      );
      assert.equal(
        container
          .querySelector("[data-preview-variant]")
          ?.getAttribute("data-preview-variant"),
        SECOND,
      );
      assert.equal(
        container
          .querySelector("[data-preview-variant]")
          ?.getAttribute("data-preview-quantity"),
        "3",
      );
      await step(container, 3);
      await click(container, "Yazdır");
      const request = requests.find(
        (entry) =>
          entry.method === "POST" &&
          entry.path === "/api/catalog/barcode-print-jobs/v2",
      );
      assert.ok(request);
      assert.deepEqual(request.body?.targets, [
        { variantId: SECOND, expectedVersion: 11, quantity: 3 },
      ]);
      assert.equal(
        printed.length,
        0,
        "version conflict must never open output",
      );
      assert.equal(cancelled(), 1);
      await step(container, 1);
      await change(quantity(container, second.productTitle), "0", browser);
      assert.equal(
        row(container, second.productTitle).querySelector<HTMLInputElement>(
          'input[type="checkbox"]',
        )!.checked,
        false,
      );
      assert.equal(container.querySelector("[data-preview-variant]"), null);
    },
  );
});

test("selection step exposes quantity operations and internal generation with the original version proof", async () => {
  await mounted(async ({ container, requests }) => {
    await choose(container, first.productTitle);
    const panel = container.querySelector<HTMLElement>(
      'section[aria-label="Ürün seçimi"]',
    );
    assert.ok(panel);
    assert.ok(
      [...panel.querySelectorAll("button")].some((entry) =>
        /Her varyanttan 1/.test(entry.textContent ?? ""),
      ),
      "quantity mode is available before output setup",
    );
    const generate = [
      ...panel.querySelectorAll<HTMLButtonElement>("button"),
    ].find((entry) => /Dahili barkod oluştur/.test(entry.textContent ?? ""));
    assert.ok(
      generate,
      "missing barcode can be resolved on the selection step",
    );
    await act(async () => generate.click());
    const request = requests.find(
      (entry) => entry.path === "/api/catalog/barcodes/internal/ean13",
    );
    assert.ok(request);
    assert.equal(
      request.headers.get("x-celebix-internal-barcode-format"),
      "ean13",
    );
    assert.deepEqual(request.body?.targets, [
      { variantId: FIRST, expectedVersion: 7 },
    ]);
    assert.equal(
      row(container, first.productTitle).querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!.checked,
      true,
    );
  });
});

test("preview navigation reaches a valid selected variant after the first missing barcode", async () => {
  await mounted(async ({ container }) => {
    await choose(container, first.productTitle);
    await choose(container, second.productTitle);
    assert.equal(container.querySelector("[data-preview-variant]"), null);
    const previous = button(container, "Önceki etiket", true);
    assert.equal(previous.disabled, false);
    await click(container, "Sonraki etiket", true);
    assert.equal(
      container
        .querySelector("[data-preview-variant]")
        ?.getAttribute("data-preview-variant"),
      SECOND,
    );
    await click(container, "Önceki etiket", true);
    assert.equal(container.querySelector("[data-preview-variant]"), null);
  });
});

test("SKU barcode source shows the SKU value in the row and preview", async () => {
  await mounted(async ({ container, browser }) => {
    await choose(container, first.productTitle);
    await step(container, 2);
    await change(
      labelled<HTMLSelectElement>(container, "Barkod kaynağı", "select"),
      "sku",
      browser,
    );
    await step(container, 1);
    const table = row(container, first.productTitle).closest("table")!;
    const headers = [...table.querySelectorAll("thead th")];
    const index = headers.findIndex((entry) =>
      /^Barkod/.test(entry.textContent?.trim() ?? ""),
    );
    assert.ok(index >= 0);
    assert.match(
      row(container, first.productTitle).cells[index]!.textContent ?? "",
      /BLUZ-S/,
    );
    assert.doesNotMatch(
      row(container, first.productTitle).cells[index]!.textContent ?? "",
      /Barkod yok/,
    );
    assert.equal(
      container.querySelector('[role="img"][aria-label="Barkod BLUZ-S"]')
        ?.textContent,
      "BLUZ-S",
    );
  });
});

test("print history can be opened and closed from every preparation step", async () => {
  await mounted(async ({ container }) => {
    for (const number of [1, 2, 3]) {
      await step(container, number);
      await click(container, "Baskı geçmişi");
      const dialog = container.querySelector<HTMLDialogElement>("dialog[open]");
      assert.ok(dialog, `history opens from step ${number}`);
      assert.match(dialog.textContent ?? "", /Henüz baskı işi yok/);
      await click(container, "Baskı geçmişi kapat", true);
      assert.equal(container.querySelector("dialog[open]"), null);
    }
  });
});

test("A4 start cell stays within the 48-cell document contract even with a larger grid", async () => {
  await mounted(async ({ container, browser }) => {
    await choose(container, second.productTitle);
    await step(container, 2);
    await change(
      labelled<HTMLSelectElement>(container, "Hazır şablon", "select"),
      "a4-4x12",
      browser,
    );
    await change(
      labelled<HTMLInputElement>(container, "Satır", "input"),
      "20",
      browser,
    );
    await step(container, 3);
    const start = labelled<HTMLInputElement>(
      container,
      "İlk hücreyi atla",
      "input",
    );
    assert.equal(start.max, "47");
    await change(start, "75", browser);
    assert.equal(start.value, "47");
  });
});

test("read-only users may preview but never mutate templates, generate barcodes or print", async () => {
  await mounted(async ({ container, requests, printed, reserved }) => {
    await choose(container, second.productTitle);
    assert.ok(
      container.querySelector("[data-preview-variant]"),
      "valid selection must reach the output permission gate",
    );
    for (const number of [1, 2, 3]) {
      await step(container, number);
      const controls = [
        ...container.querySelectorAll<HTMLButtonElement>("button"),
      ].filter((entry) =>
        /Dahili barkod oluştur|Mağaza şablonu olarak kaydet|Yeni şablon kaydet|Değişiklikleri kaydet|^Yazdır$|PDF|ZPL 203|ZPL 300/.test(
          entry.textContent?.trim() ?? "",
        ),
      );
      for (const control of controls) {
        assert.equal(
          control.disabled,
          true,
          `read-only action disabled: ${control.textContent}`,
        );
        await act(async () => control.click());
      }
    }
    assert.equal(button(container, "Yazdır").disabled, true);
    assert.equal(
      requests.some((entry) => entry.method !== "GET"),
      false,
    );
    assert.equal(reserved(), 0);
    assert.deepEqual(printed, []);
  }, false);
});

test("pending print locks working selection, configuration and history until the response settles", async () => {
  await mounted(
    async ({ container, requests, releasePrint, printed }) => {
      await choose(container, second.productTitle);
      await step(container, 3);
      await click(container, "Yazdır");
      try {
        const navigation = container.querySelector(
          'nav[aria-label="Etiket hazırlama adımları"]',
        )!;
        assert.ok(
          [...navigation.querySelectorAll<HTMLButtonElement>("button")].every(
            (control) => control.disabled,
          ),
          "step changes are blocked while the original print is pending",
        );
        assert.equal(
          button(container, "Baskı geçmişi").disabled,
          true,
          "history cannot overwrite a pending print",
        );
        await choose(container, first.productTitle);
        assert.equal(
          row(container, first.productTitle).querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
          )!.checked,
          false,
        );
        assert.equal(
          requests.filter((request) => request.method === "POST").length,
          1,
        );
        assert.deepEqual(printed, []);
      } finally {
        await act(async () => {
          releasePrint();
        });
      }
      assert.equal(button(container, "Baskı geçmişi").disabled, false);
    },
    true,
    true,
  );
});

test("quick label selection at the label limit leaves the current selection step intact", async () => {
  await mounted(async ({ container, browser }) => {
    await change(quantity(container, second.productTitle), "5000", browser);
    await click(
      container,
      `${first.productTitle} için bir etiket hazırla`,
      true,
    );
    assert.equal(
      container.querySelector<HTMLElement>('section[aria-label="Ürün seçimi"]')!
        .hidden,
      false,
    );
    assert.equal(quantity(container, second.productTitle).value, "5000");
    assert.equal(
      row(container, first.productTitle).querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!.checked,
      false,
    );
  });
});

test("a delayed default template never replaces the name the user has already entered", async () => {
  await mounted(
    async ({ container, browser, releaseLibrary }) => {
      await step(container, 2);
      const name = labelled<HTMLInputElement>(container, "Şablon adı", "input");
      await change(name, "Vitrin etiketi", browser);
      await act(async () => releaseLibrary());
      assert.equal(name.value, "Vitrin etiketi");
    },
    true,
    false,
    true,
  );
});

test("starting output commits the chosen template before a delayed store default arrives", async () => {
  await mounted(
    async ({ container, releaseLibrary, releasePrint, requests }) => {
      await choose(container, second.productTitle);
      await step(container, 3);
      await click(container, "Yazdır");
      try {
        await act(async () => releaseLibrary());
        assert.equal(
          labelled<HTMLInputElement>(container, "Şablon adı", "input").value,
          "Mağaza etiketi",
        );
        assert.deepEqual(
          requests.find((request) => request.method === "POST")?.body?.template,
          { kind: "system", key: "retail-50x30" },
        );
      } finally {
        await act(async () => releasePrint());
      }
    },
    true,
    true,
    true,
  );
});
