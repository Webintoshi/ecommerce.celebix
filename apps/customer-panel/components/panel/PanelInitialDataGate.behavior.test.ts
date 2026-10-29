import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement, useEffect, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

type GateProps = Readonly<{ pending: boolean; children?: ReactNode; scopeKey?: string }>;
type Gate = React.ComponentType<GateProps>;
type Boundary = React.ComponentType<{ scopeKey: string; children?: ReactNode }>;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function mounted(verify: (options: {
  host: HTMLElement;
  Gate: Gate;
  Boundary: Boundary;
  render: (child: ReactNode, pathname?: string) => Promise<void>;
  hydrate: (html: string, child: ReactNode, pathname?: string) => Promise<unknown[]>;
}) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/orders" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let pathname = "/orders";
  async function compile(file: string, dependencies: Record<string, unknown> = {}) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const result = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, reportDiagnostics: true });
    assert.equal(result.diagnostics?.length, 0);
    const compiled: { exports: Record<string, unknown> } = { exports: {} };
    Function("require", "module", "exports", result.outputText)((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/navigation") return { usePathname: () => pathname };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (name in dependencies) return dependencies[name];
      throw new Error(`unexpected_import:${name}`);
    }, compiled, compiled.exports);
    return compiled.exports;
  }
  const loader = await compile("./PanelRouteLoading.tsx");
  const compiled = await compile("./PanelInitialDataGate.tsx", { "./PanelRouteLoading": loader });
  const Gate = compiled.PanelInitialDataGate as Gate;
  const Boundary = compiled.PanelInitialDataBoundary as Boundary;
  const host = browser.document.createElement("main");
  browser.document.body.append(host);
  let root: Root | undefined;
  const render = async (child: ReactNode, nextPathname = pathname) => {
    pathname = nextPathname;
    await act(async () => {
      root ??= createRoot(host as unknown as HTMLElement);
      root.render(child);
    });
  };
  const hydrate = async (html: string, child: ReactNode, nextPathname = pathname) => {
    pathname = nextPathname;
    assert.equal(root, undefined);
    host.innerHTML = html;
    const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(host as unknown as HTMLElement, child, { onRecoverableError: error => errors.push(error) }); });
    return errors;
  };
  try { await verify({ host: host as unknown as HTMLElement, Gate, Boundary, render, hydrate }); }
  finally {
    await act(async () => root?.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

function assertLoading(host: HTMLElement, expected: boolean) {
  assert.equal(Boolean(host.querySelector('img[src="/brand/celebix-manyetik.svg"]')), expected);
  const page = host.querySelector("article")!;
  assert.ok(page);
  assert.equal(Boolean(page.closest("[hidden]")), expected);
  assert.equal(Boolean(page.closest("[inert]")), expected);
  assert.equal(Boolean(page.closest('[aria-hidden="true"]')), expected);
}

test("initial pending keeps child effects and form buffers mounted while concealing the page", async () => {
  await mounted(async ({ host, Gate, render }) => {
    let mounts = 0, unmounts = 0;
    function Page() {
      useEffect(() => { mounts += 1; return () => { unmounts += 1; }; }, []);
      return createElement("article", null, createElement("input", { defaultValue: "Kaydedilmemiş not" }));
    }
    await render(createElement(Gate, { pending: true }, createElement(Page)));
    assertLoading(host, true);
    assert.equal(mounts, 1);
    const field = host.querySelector("input")!;
    field.value = "Düzenlenen not";
    await render(createElement(Gate, { pending: false }, createElement(Page)));
    assertLoading(host, false);
    assert.equal(host.querySelector("input"), field);
    assert.equal(field.value, "Düzenlenen not");
    assert.equal(unmounts, 0);
  });
});

test("all critical initial reads must settle before the page is revealed", async () => {
  await mounted(async ({ host, Gate, render }) => {
    const first = deferred(), second = deferred();
    function Page() {
      const [settled, setSettled] = useState(0);
      useEffect(() => {
        void first.promise.then(() => setSettled(value => value + 1));
        void second.promise.then(() => setSettled(value => value + 1));
      }, []);
      return createElement(Gate, { pending: settled < 2 }, createElement("article", null, `${settled} kaynak hazır`));
    }
    await render(createElement(Page));
    assertLoading(host, true);
    await act(async () => first.resolve());
    assertLoading(host, true);
    assert.match(host.textContent ?? "", /1 kaynak hazır/);
    await act(async () => second.resolve());
    assertLoading(host, false);
  });
});

test("a failed initial read reveals its actionable error instead of leaving the loader active", async () => {
  await mounted(async ({ host, Gate, render }) => {
    const request = deferred();
    function Page() {
      const [phase, setPhase] = useState("loading");
      useEffect(() => { void request.promise.then(() => setPhase("ready"), () => setPhase("error")); }, []);
      return createElement(Gate, { pending: phase === "loading" }, createElement("article", null,
        phase === "error" ? createElement("div", { role: "alert" }, "Veriler alınamadı", createElement("button", null, "Yeniden dene")) : "Hazırlanıyor"));
    }
    await render(createElement(Page));
    await act(async () => request.reject(new Error("offline")));
    assertLoading(host, false);
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /Yeniden dene/);
  });
});

test("same-page background refresh never conceals an already settled page", async () => {
  await mounted(async ({ host, Gate, render }) => {
    const page = createElement("article", null, "Kayıtlar");
    await render(createElement(Gate, { pending: true }, page));
    await render(createElement(Gate, { pending: false }, page));
    await render(createElement(Gate, { pending: true }, page));
    assertLoading(host, false);
  });
});

test("pathname and same-route resource changes start a fresh initial readiness cycle", async () => {
  await mounted(async ({ host, Gate, render }) => {
    const page = createElement("article", null, "Kayıt");
    await render(createElement(Gate, { pending: false, scopeKey: "first" }, page));
    await render(createElement(Gate, { pending: true, scopeKey: "first" }, page), "/products");
    assertLoading(host, true);
    await render(createElement(Gate, { pending: false, scopeKey: "first" }, page));
    await render(createElement(Gate, { pending: true, scopeKey: "second" }, page));
    assertLoading(host, true);
  });
});

test("late work from an unmounted route cannot reveal the new route", async () => {
  await mounted(async ({ host, Gate, render }) => {
    const oldRequest = deferred(), newRequest = deferred();
    function Page({ request }: { request: ReturnType<typeof deferred> }) {
      const [pending, setPending] = useState(true);
      useEffect(() => { void request.promise.then(() => setPending(false)); }, [request]);
      return createElement(Gate, { pending }, createElement("article", null, "Kayıt"));
    }
    await render(createElement(Page, { key: "old", request: oldRequest }));
    await render(createElement(Page, { key: "new", request: newRequest }), "/products");
    await act(async () => oldRequest.resolve());
    assertLoading(host, true);
    await act(async () => newRequest.resolve());
    assertLoading(host, false);
  });
});

test("StrictMode replay settles normally without losing the mounted content", async () => {
  await mounted(async ({ host, Gate, render }) => {
    const page = createElement("article", null, "Kayıtlar");
    await render(createElement(React.StrictMode, null, createElement(Gate, { pending: true }, page)));
    assertLoading(host, true);
    await render(createElement(React.StrictMode, null, createElement(Gate, { pending: false }, page)));
    assertLoading(host, false);
    await render(createElement(React.StrictMode, null, createElement(Gate, { pending: true }, page)));
    assertLoading(host, false);
  });
});

test("the page boundary keeps one loader until differently timed sibling reads settle", async () => {
  await mounted(async ({ host, Gate, Boundary, render }) => {
    const first = deferred(), second = deferred();
    function Page() {
      const [firstPending, setFirstPending] = useState(true);
      const [secondPending, setSecondPending] = useState(true);
      useEffect(() => {
        void first.promise.then(() => setFirstPending(false));
        void second.promise.then(() => setSecondPending(false));
      }, []);
      return createElement(Boundary, { scopeKey: "/shipping" },
        createElement(Gate, { pending: firstPending }, createElement("article", null, "Teslimat")),
        createElement(Gate, { pending: secondPending }, createElement("article", null, "Kargo")));
    }
    await render(createElement(Page), "/shipping");
    assertLoading(host, true);
    assert.equal(host.querySelectorAll('img[src="/brand/celebix-manyetik.svg"]').length, 1);
    const loader = host.querySelector("img");
    await act(async () => first.resolve());
    assertLoading(host, true);
    assert.equal(host.querySelector("img"), loader);
    await act(async () => second.resolve());
    assertLoading(host, false);
  });
});

test("a same-commit sequential reader replaces the finished reader without exposing a skeleton", async () => {
  await mounted(async ({ host, Gate, Boundary, render }) => {
    const metadata = deferred(), balances = deferred();
    function Balances() {
      const [pending, setPending] = useState(true);
      useEffect(() => { void balances.promise.then(() => setPending(false)); }, []);
      return createElement(Gate, { pending }, createElement("article", null, "Depo stokları"));
    }
    function Page() {
      const [pending, setPending] = useState(true);
      useEffect(() => { void metadata.promise.then(() => setPending(false)); }, []);
      return createElement(Boundary, { scopeKey: "/stock" }, pending
        ? createElement(Gate, { pending: true }, createElement("article", null, "Depolar"))
        : createElement(Balances));
    }
    await render(createElement(Page), "/stock");
    const loader = host.querySelector("img");
    await act(async () => metadata.resolve());
    assertLoading(host, true);
    assert.equal(host.querySelector("img"), loader);
    await act(async () => balances.resolve());
    assertLoading(host, false);
  });
});

test("an RSC loading marker hands off to the mounted client reader in the same commit", async () => {
  await mounted(async ({ host, Gate, Boundary, render }) => {
    const rsc = deferred(), data = deferred();
    function ClientPage() {
      const [pending, setPending] = useState(true);
      useEffect(() => { void data.promise.then(() => setPending(false)); }, []);
      return createElement(Gate, { pending }, createElement("article", null, "Siparişler"));
    }
    function StreamedPage() {
      React.use(rsc.promise);
      return createElement(ClientPage);
    }
    await render(createElement(Boundary, { scopeKey: "/orders" }, createElement(React.Suspense, {
      fallback: createElement(Gate, { pending: true }, createElement("article", null, "RSC")),
    }, createElement(StreamedPage))));
    const loader = host.querySelector("img");
    await act(async () => rsc.resolve());
    assertLoading(host, true);
    assert.equal(host.querySelector("img"), loader);
    await act(async () => data.resolve());
    assertLoading(host, false);
  });
});

test("a loading-only gate releases the page when unmounted, including under StrictMode", async () => {
  await mounted(async ({ host, Gate, Boundary, render }) => {
    const page = (pending: boolean) => createElement(React.StrictMode, null,
      createElement(Boundary, { scopeKey: "/products" },
        pending ? createElement(Gate, { pending: true }, null) : null,
        createElement("article", null, "Ürünler")));
    await render(page(true), "/products");
    assertLoading(host, true);
    await render(page(false));
    assertLoading(host, false);
  });
});

test("terminal errors release an aggregate page and background or late readers never re-mask it", async () => {
  await mounted(async ({ host, Gate, Boundary, render }) => {
    const page = (pending: boolean, late = false) => createElement(Boundary, { scopeKey: "/orders" },
      createElement(Gate, { pending }, createElement("article", null, createElement("button", null, "Yeniden dene"))),
      late ? createElement(Gate, { pending: true }, createElement("aside", null, "Arka plan")) : null);
    await render(page(true));
    assertLoading(host, true);
    await render(page(false));
    assertLoading(host, false);
    await render(page(true, true));
    assertLoading(host, false);
    assert.ok(host.querySelector("button"));
  });
});

test("new route scopes ignore late old-route work and start their own readiness cycle", async () => {
  await mounted(async ({ host, Gate, Boundary, render }) => {
    const oldRequest = deferred(), newRequest = deferred();
    function Reader({ request }: { request: ReturnType<typeof deferred> }) {
      const [pending, setPending] = useState(true);
      useEffect(() => { void request.promise.then(() => setPending(false)); }, [request]);
      return createElement(Gate, { pending }, createElement("article", null, "Kayıt"));
    }
    const route = (scopeKey: string, request: ReturnType<typeof deferred>) => createElement(Boundary, { scopeKey }, createElement(Reader, { key: scopeKey, request }));
    await render(route("/old", oldRequest), "/old");
    await render(route("/new", newRequest), "/new");
    await act(async () => oldRequest.resolve());
    assertLoading(host, true);
    await act(async () => newRequest.resolve());
    assertLoading(host, false);
    await render(createElement(Boundary, { scopeKey: "/static" }, createElement("article", null, "Hazır sayfa")), "/static");
    assertLoading(host, false);
  });
});

test("SSR conceals children before hydration, while a page without async readers opens on layout", async () => {
  await mounted(async ({ host, Boundary, render }) => {
    const page = createElement(Boundary, { scopeKey: "/settings" }, createElement("article", null, "Ayarlar"));
    const html = renderToStaticMarkup(page);
    assert.match(html, /data-panel-initial-loading="true"/);
    assert.match(html, /hidden="" inert="" aria-hidden="true"/);
    await render(page, "/settings");
    assertLoading(host, false);
  });
});

test("completed SSR pending declarations survive selective hydration until both code and data are ready", async () => {
  await mounted(async ({ host, Gate, Boundary, hydrate }) => {
    const data = deferred();
    function DataPage() {
      const [pending, setPending] = useState(true);
      useEffect(() => { void data.promise.then(() => setPending(false)); }, []);
      return createElement(Gate, { pending }, createElement("article", null, "Sunucudan gelen iskelet"));
    }
    const ServerChunk = React.lazy(() => ({ then(resolve: (value: { default: typeof DataPage }) => void) { resolve({ default: DataPage }); } }) as unknown as Promise<{ default: typeof DataPage }>);
    let resolveChunk!: (value: { default: typeof DataPage }) => void;
    const chunk = new Promise<{ default: typeof DataPage }>(resolve => { resolveChunk = resolve; });
    const ClientChunk = React.lazy(() => chunk);
    const tree = (Chunk: typeof ServerChunk) => createElement(Boundary, { scopeKey: "/orders" }, createElement(React.Suspense, {
      fallback: createElement(Gate, { pending: true }, createElement("article", null, "Kod yükleniyor")),
    }, createElement(Chunk)));
    const html = renderToString(tree(ServerChunk));
    assert.match(html, /<!--\$-->/);
    const errors = await hydrate(html, tree(ClientChunk));
    assertLoading(host, true);
    await act(async () => resolveChunk({ default: DataPage }));
    assertLoading(host, true);
    await act(async () => data.resolve());
    assertLoading(host, false);
    assert.deepEqual(errors, []);
  });
});
