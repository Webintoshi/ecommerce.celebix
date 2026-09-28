import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, useState } from "react";
import { renderToString } from "react-dom/server";
import { compile, mounted } from "./mira-final-test-support.ts";
import { analyticsFixturePayload, analyticsFixtureResponse, createAnalyticsFixtureState } from "../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/analytics/analytics-fixture-data.ts";

type RequestRecord = { url: URL; signal?: AbortSignal | null; cache?: RequestCache; credentials?: RequestCredentials };
type Transport = (record: RequestRecord, state: ReturnType<typeof createAnalyticsFixtureState>) => Promise<Response>;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const textOf = (host: any) => host.textContent.replace(/\s+/g, " ");
const money = (value: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value / 100);

async function workspace(initialHref: string, run: (context: { host: any; window: any; requests: RequestRecord[]; href: () => string; navigate: (href: string) => Promise<void> }) => Promise<void>, transport?: Transport, setup?: (window: any) => void) {
  const requests: RequestRecord[] = [], state = createAnalyticsFixtureState();
  let currentHref = initialHref, move: (href: string) => void = () => {};
  const Component = compile("components/analytics/CommerceAnalyticsWorkspace.tsx", {
    "next/navigation": {
      useSearchParams: () => new URL(currentHref, "https://panel.example.test").searchParams,
      useRouter: () => ({ push: (href: string) => move(href) }),
    },
    "next/link": { __esModule: true, default: ({ children, href, onClick, ...props }: any) => createElement("a", { ...props, href, onClick: (event: any) => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); move(String(href)); } } }, children) },
    "./ActiveVisitorsCard": { ActiveVisitorsCard: () => null },
  }).CommerceAnalyticsWorkspace;
  function Harness() {
    const [href, setHref] = useState(initialHref);
    currentHref = href; move = setHref;
    const query = new URL(href, "https://panel.example.test").searchParams;
    return createElement(Component, { tab: query.get("tab") ?? "overview", range: query.has("from") && query.has("to") ? "custom" : query.get("range") ?? "30d", compare: query.get("compare") === "1", customFrom: query.get("from") ?? undefined, customTo: query.get("to") ?? undefined, initialTimezone: query.get("timezone") ?? undefined });
  }
  const previousFetch = globalThis.fetch, previousNode = Object.getOwnPropertyDescriptor(globalThis, "Node");
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://panel.example.test");
    const record = { url, signal: init?.signal, cache: init?.cache, credentials: init?.credentials };
    requests.push(record);
    if (transport) return transport(record, state);
    const response = analyticsFixtureResponse(url.pathname.split("/").slice(3), url.href, state);
    assert.ok(response, `Unexpected workspace request: ${url.href}`);
    return response;
  }) as typeof fetch;
  try {
    await mounted(Harness, {}, async (host, window) => {
      await settle();
      await run({ host, window, requests, href: () => currentHref, navigate: async (href) => { await act(async () => move(href)); await settle(); } });
    }, (window) => {
      Object.defineProperty(globalThis, "Node", { configurable: true, value: window.Node });
      setup?.(window);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousNode) Object.defineProperty(globalThis, "Node", previousNode); else Reflect.deleteProperty(globalThis, "Node");
  }
}

async function clickElement(element: any) { assert.ok(element); await act(async () => element.click()); await settle(); }
async function change(window: any, element: any, value: string) {
  assert.ok(element);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await settle();
}
async function controlledInput(window: any, element: any, value: string) {
  assert.ok(element);
  // Happy DOM does not implement React's browser input-value tracker.
  const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
  assert.ok(key);
  await act(async () => { element.value = value; element[key].onChange({ target: element, currentTarget: element }); });
}
async function submit(window: any, form: any) { assert.ok(form); await act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle(); }

test("analytics fixture distinguishes independent counts, ordered cohorts, intentional absence and partial measurement", () => {
  const overview = analyticsFixturePayload("overview"), funnel = analyticsFixturePayload("funnel");
  const eventMap = (payload: any) => Object.fromEntries(payload.traffic.events.items.map((row: any) => [row.label, row.value]));
  assert.deepEqual(Object.keys(eventMap(overview)), ["product_view", "add_to_cart", "begin_checkout"]);
  assert.ok(eventMap(overview).add_to_cart > eventMap(overview).product_view);
  const cohort = Object.values(eventMap(funnel)) as number[];
  assert.equal(cohort.length, 6);
  assert.ok(cohort.every((value, index) => index === 0 || value <= cohort[index - 1]));
  assert.equal(analyticsFixturePayload("abandoned-carts").traffic, null);
  assert.equal(analyticsFixturePayload("abandoned-carts").status, "complete");
  assert.equal(analyticsFixturePayload("acquisition", new URLSearchParams("touch=first")).traffic, null);
  assert.equal(analyticsFixturePayload("acquisition", new URLSearchParams("touch=first")).status, "complete");
  assert.deepEqual(analyticsFixturePayload("acquisition").commerce.attribution.map((row) => row.touch), ["last", "last", "last", "last"]);
  assert.deepEqual(analyticsFixturePayload("acquisition", new URLSearchParams("touch=first")).commerce.attribution.map((row) => row.touch), ["first", "first", "first", "first"]);
  const partial = analyticsFixturePayload("overview", new URLSearchParams("range=90d"));
  assert.equal(partial.status, "degraded");
  assert.ok(partial.traffic?.summary.visitors);
  assert.equal(partial.traffic?.events, null);
  assert.equal(partial.traffic?.sources, null);
  assert.equal(partial.traffic?.metrics.path, null);
  assert.ok(partial.traffic?.metrics.referrer?.items.length);
  const products = analyticsFixturePayload("products");
  assert.ok(products.traffic?.views?.items.length);
  assert.ok(products.traffic?.adds?.items.length);
  const dual = analyticsFixturePayload("overview", new URLSearchParams("from=2026-09-01&to=2026-09-20&compare=1"));
  assert.deepEqual(dual.commerce.currencies.map((row) => row.currency), ["TRY", "EUR"]);
  assert.ok(dual.comparisonCommerce);
  assert.equal(dual.comparisonCommerce.rangeEnd, dual.range.start);
  const eur = analyticsFixturePayload("overview", new URLSearchParams("currency=EUR"));
  assert.deepEqual(eur.commerce.currencies.map((row) => row.currency), ["EUR"]);
  assert.equal(eur.traffic, null);
  const state = createAnalyticsFixtureState();
  for (const legacy of ["dashboard", "connection", "summary", "metrics", "settings"])
    assert.equal(analyticsFixtureResponse([legacy], "https://panel.example.test/api/analytics/" + legacy, state), null, `${legacy}: legacy handler owns this route`);
});

test("real overview renders titleless data with separate cohort and product reads", async () => {
  await workspace("/analytics", async ({ host, requests }) => {
    const content = textOf(host);
    assert.ok(content.includes(money(12_845_000)));
    assert.match(content, /12\.680/);
    assert.ok(host.querySelector('svg[role="img"]'));
    const headings = host.querySelectorAll("h1");
    assert.equal(headings.length, 1);
    assert.equal(headings[0].className, "sr-only");
    assert.ok(host.querySelector('[aria-label="Dönüşüm içgörüsü"]'));
    assert.match(content, /4\.250 oturum/);
    assert.match(content, /Keten Ceket/);
    assert.deepEqual(requests.map(({ url }) => url.pathname).sort(), ["/api/analytics/funnel", "/api/analytics/overview", "/api/analytics/products"]);
    for (const request of requests) { assert.equal(request.credentials, "same-origin"); assert.equal(request.cache, "no-store"); assert.equal(request.url.searchParams.get("range"), "30d"); assert.equal(request.url.searchParams.has("tab"), false); }
  });
});

test("all five real tabs accept the fixture contracts and keep intentional traffic absence quiet", async () => {
  for (const tab of ["funnel", "carts", "acquisition", "products"] as const) {
    await workspace(`/analytics?tab=${tab}`, async ({ host, requests }) => {
      assert.equal(host.querySelector('[role="alert"]'), null, `${tab}: parser failure`);
      assert.ok(host.querySelector("table"), `${tab}: expected real data table`);
      assert.equal(host.querySelector('[role="tab"][aria-selected="true"]').id, `analytics-tab-${tab}`);
      assert.equal(requests.length, 1);
      if (tab === "carts") assert.doesNotMatch(textOf(host), /Trafik verisi alınamıyor|Ölçümde gecikme veya eksik veri/);
      if (tab === "acquisition") assert.equal(host.querySelectorAll('table[aria-label="Trafik kaynakları"] tbody tr').length, 4);
    });
  }
  await workspace("/analytics?tab=acquisition&touch=first", async ({ host }) => {
    assert.doesNotMatch(textOf(host), /Trafik verisi alınamıyor|Ölçümde gecikme veya eksik veri/);
    assert.match(textOf(host), /İlk temasta ziyaretçi adımları ölçülmüyor/);
    assert.equal(host.querySelectorAll('table[aria-label="Trafik kaynakları"] tbody tr').length, 4);
  });
});

test("first-touch provider degradation stays quiet while real worker delays remain visible", async () => {
  for (const worker of [{ retry: 0, deadLetter: 0, oldestPendingSeconds: 18 }, { retry: 1, deadLetter: 0, oldestPendingSeconds: 18 }, { retry: 0, deadLetter: 1, oldestPendingSeconds: 18 }, { retry: 0, deadLetter: 0, oldestPendingSeconds: 301 }]) {
    await workspace("/analytics?tab=acquisition&touch=first&range=90d", async ({ host }) => {
      const delayed = worker.retry > 0 || worker.deadLetter > 0 || worker.oldestPendingSeconds > 300;
      assert.equal(Boolean(host.querySelector(".warning")), delayed);
      assert.doesNotMatch(textOf(host), /Trafik verisi alınamıyor/);
      assert.match(textOf(host), /İlk temasta ziyaretçi adımları ölçülmüyor/);
      assert.ok(host.querySelector('table[aria-label="Trafik kaynakları"]'));
    }, async (record) => {
      const payload = analyticsFixturePayload("acquisition", record.url.searchParams);
      payload.status = "degraded";
      Object.assign(payload.commerce.worker, worker);
      return Response.json(payload);
    });
  }
});

test("missing traffic with a delayed commerce worker never claims commerce freshness", async () => {
  await workspace("/analytics?range=30d", async ({ host }) => {
    const content = textOf(host);
    assert.match(content, /Veriler gecikiyor/);
    assert.match(content, /Satış ve sepet verileri gecikiyor[.]/);
    assert.doesNotMatch(content, /Satış verileri güncel|Satış ve sepet verileri güncel|Veriler güncel/);
    assert.ok(content.includes(money(12_845_000)));
  }, async (record) => {
    const report = record.url.pathname.split("/").at(-1)!;
    const payload = analyticsFixturePayload(report, record.url.searchParams);
    if (report === "overview") {
      payload.traffic = null;
      payload.status = "degraded";
      payload.commerce.worker.retry = 1;
    }
    return Response.json(payload);
  });
});

test("empty and partially measured periods remain distinct without fabricated journey zeros", async () => {
  await workspace("/analytics?range=7d", async ({ host }) => {
    assert.match(textOf(host), /Bu dönemde satış yok/);
    assert.equal(host.querySelector('svg[role="img"]'), null);
    assert.ok([...host.querySelectorAll("a")].some((link: any) => link.href.includes("range=90d")));
  });
  await workspace("/analytics?range=90d", async ({ host }) => {
    assert.ok(textOf(host).includes(money(12_845_000)));
    assert.match(textOf(host), /12\.680/);
    assert.match(textOf(host), /Kaynak ölçümü alınamıyor/);
    assert.equal(host.querySelector(".journey"), null);
    assert.ok(host.querySelector('svg[role="img"]'));
    assert.match(textOf(host), /google\.com/);
  });
  await workspace("/analytics?tab=products&range=90d", async ({ host }) => {
    const cells = [...host.querySelectorAll("tbody tr:first-child td")].map((cell: any) => cell.textContent);
    assert.ok(cells.filter((value: string) => value === "—").length >= 2);
    assert.ok(textOf(host).includes(money(4_110_400)));
  });
});

test("a failed period has a recoverable retry that performs a fresh request", async () => {
  await workspace("/analytics?range=today", async ({ host, requests }) => {
    assert.match(textOf(host), /Veri alınamadı/);
    await clickElement([...host.querySelectorAll("button")].find((button: any) => button.textContent === "Yeniden dene"));
    assert.equal(host.querySelector('[role="alert"]'), null);
    assert.ok(textOf(host).includes(money(12_845_000)));
    assert.equal(requests.filter(({ url }) => url.pathname === "/api/analytics/overview").length, 2);
  });
});

test("an aborted slow report cannot replace the newly selected period", async () => {
  const pending = new Map<string, (response: Response) => void>();
  await workspace("/analytics?range=30d", async ({ host, window, requests }) => {
    const stale = requests.find(({ url }) => url.pathname === "/api/analytics/overview" && url.searchParams.get("range") === "30d");
    assert.ok(stale);
    await change(window, host.querySelector('select[aria-label="Tarih aralığı"]'), "7d");
    assert.equal(stale.signal?.aborted, true);
    assert.match(textOf(host), /Bu dönemde satış yok/);
    await act(async () => { for (const [report, release] of pending) release(Response.json(analyticsFixturePayload(report, new URLSearchParams("range=30d")))); });
    await settle();
    assert.match(textOf(host), /Bu dönemde satış yok/);
    assert.ok(!textOf(host).includes(money(12_845_000)));
    assert.doesNotMatch(textOf(host), /Keten Ceket|4\.250 oturum/);
    assert.equal(requests.filter(({ url }) => url.pathname === "/api/analytics/overview" && url.searchParams.get("range") === "7d").length, 1);
  }, async (record, state) => record.url.searchParams.get("range") === "30d"
    ? new Promise<Response>((resolve) => { pending.set(record.url.pathname.split("/").at(-1)!, resolve); })
    : analyticsFixtureResponse(record.url.pathname.split("/").slice(3), record.url.href, state)!);
});

test("a failed supplementary cohort report preserves the main commerce report and product report", async () => {
  await workspace("/analytics?range=30d", async ({ host }) => {
    assert.equal(host.querySelector('[role="alert"]'), null);
    assert.ok(textOf(host).includes(money(12_845_000)));
    assert.match(textOf(host), /Keten Ceket/);
    assert.equal(host.querySelector(".journey"), null);
    assert.equal(host.querySelector('[aria-label="Dönüşüm içgörüsü"]'), null);
  }, async (record, state) => record.url.pathname.endsWith("/funnel")
    ? Response.json({ code: "unavailable" }, { status: 503 })
    : analyticsFixtureResponse(record.url.pathname.split("/").slice(3), record.url.href, state)!);
});

test("tab links and keyboard navigation retain shared filters and remove stale dimensions", async () => {
  await workspace("/analytics?tab=products&range=30d&compare=1&currency=TRY&search=Keten&page=3&brand=96000000-0000-4000-8000-000000000011", async ({ host, window, href }) => {
    const funnel = host.querySelector('#analytics-tab-funnel');
    const destination = new URL(funnel.href);
    assert.equal(destination.searchParams.get("compare"), "1");
    assert.equal(destination.searchParams.get("currency"), "TRY");
    assert.equal(destination.searchParams.has("search"), false);
    assert.equal(destination.searchParams.has("brand"), false);
    assert.equal(destination.searchParams.has("page"), false);
    await clickElement(funnel);
    assert.equal(new URL(href(), "https://panel.example.test").searchParams.get("tab"), "funnel");
    const current = host.querySelector('#analytics-tab-funnel');
    await act(async () => current.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })));
    await settle();
    assert.equal(new URL(href(), "https://panel.example.test").searchParams.get("tab"), "products");
    assert.equal(window.document.activeElement.id, "analytics-tab-products");
  });
});

test("dimension filters, clear action and custom dates change the query while preserving focus", async () => {
  await workspace("/analytics?tab=products&range=30d&compare=1&page=2", async ({ host, window, href }) => {
    const form = host.querySelector('form[aria-label="Analitik boyut filtreleri"]');
    form.querySelector('[name="search"]').value = "Keten";
    await submit(window, form);
    let query = new URL(href(), "https://panel.example.test").searchParams;
    assert.equal(query.get("search"), "Keten"); assert.equal(query.get("page"), "1"); assert.equal(query.get("compare"), "1");
    assert.equal(host.querySelectorAll('table[aria-label="Ürün performansı"] tbody tr').length, 1);
    const clear = [...host.querySelectorAll("a")].find((link: any) => link.textContent === "Filtreleri temizle");
    await clickElement(clear);
    query = new URL(href(), "https://panel.example.test").searchParams;
    assert.equal(query.has("search"), false); assert.equal(query.get("range"), "30d");
    const disclosure = host.querySelector("details.filterDisclosure");
    disclosure.open = true;
    const dateInputs = host.querySelectorAll('input[type="date"]');
    await controlledInput(window, dateInputs[0], "2026-09-01");
    await controlledInput(window, dateInputs[1], "2026-08-20");
    const beforeInvalidDate = href();
    await submit(window, dateInputs[0].closest("form"));
    assert.equal(href(), beforeInvalidDate);
    assert.ok(host.querySelector('#analytics-date-error[role="alert"]'));
    await controlledInput(window, dateInputs[1], "2026-09-20");
    await submit(window, dateInputs[0].closest("form"));
    query = new URL(href(), "https://panel.example.test").searchParams;
    assert.equal(query.get("from"), "2026-09-01"); assert.equal(query.get("to"), "2026-09-20");
    assert.equal(query.has("range"), false); assert.equal(query.has("compare"), false); assert.equal(query.has("page"), false);
    assert.match(textOf(host), /EUR/);
    const fresh = host.querySelector("details.filterDisclosure");
    fresh.open = true; fresh.querySelector("input").focus();
    await act(async () => fresh.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(fresh.open, false); assert.equal(window.document.activeElement, fresh.querySelector("summary"));
  });
});

test("comparison control toggles a query-backed previous period without duplicate loads", async () => {
  await workspace("/analytics?range=30d", async ({ host, href, requests }) => {
    const compare = () => [...host.querySelectorAll("button")].find((button: any) => button.textContent.trim() === "Kıyasla");
    await clickElement(compare());
    assert.equal(new URL(href(), "https://panel.example.test").searchParams.get("compare"), "1");
    assert.equal(compare().getAttribute("aria-pressed"), "true");
    assert.match(textOf(host), /Önceki döneme göre/);
    const conversion = [...host.querySelectorAll(".metricTile")].find((tile: any) => tile.querySelector(".metricLabel")?.textContent === "Satın alma oranı");
    assert.ok(conversion);
    assert.equal(conversion.querySelector("small").textContent, "Önceki döneme göre 0 puan");
    assert.equal(conversion.querySelector("small").className, "metricNote", "rounded zero has no negative trend");
    assert.equal(requests.filter(({ url }) => url.pathname.endsWith("/overview") && url.searchParams.get("compare") === "1").length, 1);
    await clickElement(compare());
    assert.equal(new URL(href(), "https://panel.example.test").searchParams.has("compare"), false);
    assert.equal(compare().getAttribute("aria-pressed"), "false");
  });
});

test("comparison and chart currency selection retain separate money and previous boundary alignment", async () => {
  await workspace("/analytics?from=2026-09-01&to=2026-09-20&compare=1", async ({ host, requests }) => {
    const currency = host.querySelector('[aria-label="Grafik para birimi"]');
    assert.ok(currency);
    assert.ok(textOf(host).includes(money(12_845_000)));
    assert.ok(textOf(host).includes(money(186_400, "EUR")));
    const before = requests.length;
    await clickElement([...currency.querySelectorAll("button")].find((button: any) => button.textContent === "EUR"));
    assert.equal(requests.length, before, "chart currency is local presentation state");
    assert.equal(currency.querySelector('[aria-pressed="true"]').textContent, "EUR");
    const chart = host.querySelector('section[aria-label="Satış ritmi"]');
    assert.ok(chart.textContent.includes(money(186_400, "EUR")));
    assert.match(chart.textContent, /Önceki dönem/);
    assert.ok(chart.querySelectorAll('svg[role="img"] path').length >= 3);
  });
});

test("comparison chart aligns day one when current and previous ranges have different day counts", () => {
  const Chart = compile("components/analytics/SalesTrendChart.tsx").SalesTrendChart;
  const chart = renderToString(createElement(Chart, {
    points: [{ label: "30 Eyl", value: 5_000, orders: 1 }],
    comparisonPoints: [{ label: "28 Eyl", value: 10_000, orders: 2 }, { label: "29 Eyl", value: 7_500, orders: 1 }],
    currency: "TRY", totalMinor: 5_000,
  }));
  const current = chart.match(/<path d="([^"]+)" class="current"/);
  const previous = chart.match(/<path d="([^"]+)" class="prior"/);
  assert.ok(current); assert.ok(previous);
  assert.match(current[1], /^M12[.]00 /);
  assert.match(previous[1], /^M12[.]00 .*L628[.]00 /);
  assert.match(chart, /<circle cx="12"/);
  assert.match(chart, /style="left:1[.]875%;/);
  assert.doesNotMatch(chart, /NaN|Infinity/);
});

test("mobile filter sheet contains focus and restores background access while desktop filters stay nonmodal", async () => {
  const setup = (width: number) => (window: any) => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => {
      const media = new window.EventTarget();
      const maximum = query.match(/max-width:\s*(\d+)px/), minimum = query.match(/min-width:\s*(\d+)px/);
      Object.assign(media, { media: query, matches: (!maximum || width <= Number(maximum[1])) && (!minimum || width >= Number(minimum[1])), onchange: null, addListener() {}, removeListener() {} });
      return media;
    } });
    window.document.body.style.overflow = "scroll";
    const background = window.document.createElement("button");
    background.id = "outside-analytics"; background.textContent = "Background action"; background.inert = false;
    const alreadyInert = window.document.createElement("button");
    alreadyInert.id = "already-inert"; alreadyInert.inert = true;
    window.document.body.append(background, alreadyInert);
  };
  await workspace("/analytics?tab=products", async ({ host, window }) => {
    const details = host.querySelector("details.filterDisclosure"), summary = details.querySelector("summary");
    await clickElement(summary);
    await settle();
    const dialog = details.querySelector('[role="dialog"][aria-modal="true"][aria-label="Analiz filtreleri"]');
    assert.ok(dialog);
    const close = dialog.querySelector("button.filterClose");
    const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    const last: any = focusable.at(-1);
    assert.equal(window.document.activeElement, close);
    assert.equal(window.document.getElementById("outside-analytics").inert, true);
    assert.equal(window.document.body.style.overflow, "hidden");
    await act(async () => { last.focus(); last.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    assert.equal(window.document.activeElement, close);
    await act(async () => close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    assert.equal(window.document.activeElement, last);
    // Happy DOM's focus() is not reentrant; a bubbling focusin exercises the
    // guard without its nested native-focus loop. The inert background is above.
    await act(async () => window.document.getElementById("outside-analytics").dispatchEvent(new window.FocusEvent("focusin", { bubbles: true })));
    assert.equal(window.document.activeElement, close);
    await clickElement(close);
    await settle();
    assert.equal(details.open, false);
    assert.equal(window.document.activeElement, summary);
    assert.equal(window.document.getElementById("outside-analytics").inert, false);
    assert.equal(window.document.getElementById("already-inert").inert, true);
    assert.equal(window.document.body.style.overflow, "scroll");
  }, undefined, setup(390));
  await workspace("/analytics?tab=products", async ({ host, window }) => {
    const details = host.querySelector("details.filterDisclosure");
    await clickElement(details.querySelector("summary"));
    await settle();
    assert.equal(details.querySelector('[role="dialog"]'), null);
    assert.equal(details.querySelector('[aria-modal="true"]'), null);
    assert.equal(window.document.getElementById("outside-analytics").inert, false);
    assert.equal(window.document.body.style.overflow, "scroll");
    await act(async () => window.document.getElementById("outside-analytics").focus());
    assert.equal(window.document.activeElement.id, "outside-analytics");
  }, undefined, setup(1440));
});
