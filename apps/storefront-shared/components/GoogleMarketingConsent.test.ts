import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Window } from "happy-dom";
import type { PublicGoogleMarketingProjection } from "../../../packages/saas-contracts/src/google-marketing/index.ts";
import { componentLoader, withProductBrowser as withBaseProductBrowser } from "./product-variant-media-test-utils.ts";
import { STOREFRONT_COMMERCE_EVENT } from "../lib/analytics/events.ts";
const projection = { gtmContainerId: "GTM-ABC123", ads: null, verificationToken: null };
const props = { storeId: "11111111-1111-4111-8111-111111111111", hostname: "fixture.invalid", nonce: "validNonce123456789", projection };
async function withProductBrowser(run: Parameters<typeof withBaseProductBrowser>[0]) {
  await withBaseProductBrowser(async (browser) => { markDocumentNonce(props.nonce); await run(browser); });
}
type ConsentProps = Omit<typeof props, "projection"> & { projection: PublicGoogleMarketingProjection; preferencesPlacement?: "floating" | "footer" };
function component(pathname = "/products/example") { return componentLoader({ "next/navigation": { usePathname: () => pathname } })<{ GoogleMarketingConsent: React.ComponentType<ConsentProps> }>(new URL("./GoogleMarketingConsent.tsx", import.meta.url)).GoogleMarketingConsent; }
test("first visit keeps the banner closed without recording consent or loading Google; manual preferences retain equal choices", async () => {
  const Consent = component();
  await withProductBrowser(async ({ container, render, click }) => {
    // Simulate load completion locally; never execute or request a Google script in this fixture.
    Object.assign((window as unknown as Window).happyDOM.settings, { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true });
    await render(React.createElement(Consent, props));
    assert.ok(!container.querySelector('[role="region"][aria-label="Çerez tercihleri"]'));
    assert.equal(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`), null);
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    await click('button[aria-expanded="false"]');
    assert.ok(container.querySelector('[data-google-consent="granted"]'));
    assert.ok(container.querySelector('[data-google-consent="denied"]'));
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    assert.equal(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`), null);
    await click('[data-google-consent="denied"]');
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    assert.equal(container.querySelector('[data-google-consent="granted"]'), null);
    await click('button[aria-expanded="false"]');
    assert.ok(container.querySelector('[data-google-consent="granted"]'));
  });
});
test("acceptance loads one GTM script across strict effects and preferences remain available", async () => {
  const Consent = component();
  await withProductBrowser(async ({ container, render, click }) => {
    Object.assign((window as unknown as Window).happyDOM.settings, { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true });
    await render(React.createElement(React.StrictMode, null, React.createElement(Consent, props)));
    await openPreferences();
    await click('[data-google-consent="granted"]');
    assert.equal(document.querySelectorAll('script[src*="googletagmanager"]').length, 1);
    assert.equal((document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement)?.nonce, props.nonce);
    assert.ok(container.querySelector('button[aria-expanded="false"]'));
  });
});
for (const choice of ["granted", "denied"] as const) {
  test(`footer preferences remove the floating control after ${choice} and still reopen the choice`, async () => {
    const Consent = component();
    await withProductBrowser(async ({ container, render, click }) => {
      localGoogleScripts();
      const footer = document.createElement("footer");
      footer.setAttribute("data-google-consent-preferences-host", "");
      document.body.append(footer);
      await render(React.createElement(React.StrictMode, null, React.createElement(Consent, { ...props, preferencesPlacement: "footer" })));
      await openPreferences();
      await click(`[data-google-consent="${choice}"]`);
      assert.equal(container.querySelector('[role="region"][aria-label="Çerez tercihleri"]'), null);
      assert.ok(!document.querySelector(".google-consent-preferences"), "footer mode must not leave a floating preferences control");
      assert.equal(JSON.parse(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`)!).value, choice);
      const trigger = footer.querySelector("button");
      assert.ok(trigger, "saved preferences remain available inside the footer");
      await React.act(async () => trigger.click());
      assert.ok(container.querySelector('[data-google-consent="granted"]'));
      assert.equal(footer.querySelector("button"), null);
      await click(`[data-google-consent="${choice}"]`);
      assert.equal(container.querySelector('[role="region"][aria-label="Çerez tercihleri"]'), null);
      assert.ok(footer.querySelector("button"));
      assert.equal(document.querySelectorAll('script[src*="googletagmanager"]').length, choice === "granted" ? 1 : 0);
    });
  });
}
test("saved footer consent stays hidden without a footer and follows a delayed or replaced footer", async () => {
  const Consent = component();
  await withProductBrowser(async ({ container, render }) => {
    localGoogleScripts(); storedConsent("denied");
    await render(React.createElement(Consent, { ...props, preferencesPlacement: "footer" }));
    assert.ok(!container.querySelector("button"), "saved footer preferences stay hidden when no footer is present");
    const footer = document.createElement("footer");
    footer.setAttribute("data-google-consent-preferences-host", "");
    await React.act(async () => document.body.append(footer));
    assert.ok(footer.querySelector("button"));
    const nextFooter = footer.cloneNode(false) as HTMLElement;
    await React.act(async () => footer.replaceWith(nextFooter));
    assert.ok(nextFooter.querySelector("button"));
    assert.equal(document.querySelector(".google-consent-preferences"), null);
  });
});
test("a captured result signal rechecks payment proof on the same pathname after an initial pending result", async () => {
  const Consent = component("/checkout/payment/result"); const previousFetch=globalThis.fetch;let requests=0;
  const purchase={transactionId:"22222222-2222-4222-8222-222222222222",valueCents:1000,currency:"TRY"};
  globalThis.fetch=(async()=>{requests++;return Response.json({purchase:requests===1?null:purchase});}) as typeof fetch;
  try {await withProductBrowser(async({render})=>{
    Object.assign((window as unknown as Window).happyDOM.settings,{disableJavaScriptFileLoading:true,handleDisabledFileLoadingAsSuccess:true});
    window.localStorage.setItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`,JSON.stringify({version:1,value:"granted",expires:Date.now()+60000}));
    await render(React.createElement(Consent,props));
    const script=document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement;
    await React.act(async()=>script.onload?.(new window.Event("load") as unknown as Event));
    assert.equal(requests,1);
    await React.act(async()=>window.dispatchEvent(new window.Event("celebix:google-payment-captured")));
    assert.equal(requests,2);
    const layer=(window as unknown as {dataLayer:unknown[]}).dataLayer;
    assert.equal(layer.filter(value=>value&&typeof value==="object"&&(value as {event?:string}).event==="purchase").length,1);
    await React.act(async()=>window.dispatchEvent(new window.Event("celebix:google-payment-captured")));
    assert.equal(layer.filter(value=>value&&typeof value==="object"&&(value as {event?:string}).event==="purchase").length,1);
  });}finally{globalThis.fetch=previousFetch;}
});
test("server captured-result component requests one reread without remounting the persistent consent component", async () => {
  const load=componentLoader({"next/navigation":{usePathname:()=>"/checkout/payment/result"}});
  const Consent=load<{GoogleMarketingConsent:React.ComponentType<typeof props>}>(new URL("./GoogleMarketingConsent.tsx",import.meta.url)).GoogleMarketingConsent;
  const Signal=load<{GoogleMarketingCapturedResultSignal:React.ComponentType<{sessionId:string;version:number}>}>(new URL("./GoogleMarketingCapturedResultSignal.tsx",import.meta.url)).GoogleMarketingCapturedResultSignal;
  const previousFetch=globalThis.fetch;let requests=0;globalThis.fetch=(async()=>{requests++;return Response.json({purchase:null});}) as typeof fetch;
  try{await withProductBrowser(async({render})=>{
    Object.assign((window as unknown as Window).happyDOM.settings,{disableJavaScriptFileLoading:true,handleDisabledFileLoadingAsSuccess:true});
    window.localStorage.setItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`,JSON.stringify({version:1,value:"granted",expires:Date.now()+60000}));
    await render(React.createElement(React.Fragment,null,React.createElement(Consent,props),null));
    const script=document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement;
    await React.act(async()=>script.onload?.(new window.Event("load") as unknown as Event));assert.equal(requests,1);
    const captured=React.createElement(Signal,{sessionId:"22222222-2222-4222-8222-222222222222",version:2});
    await render(React.createElement(React.Fragment,null,React.createElement(Consent,props),captured));assert.equal(requests,2);
    await render(React.createElement(React.Fragment,null,React.createElement(Consent,props),captured));assert.equal(requests,2);
  });}finally{globalThis.fetch=previousFetch;}
});
test("captured result signals cannot fetch or convert after consent is denied",async()=>{
 const Consent=component("/checkout/payment/result");const previousFetch=globalThis.fetch;let requests=0;globalThis.fetch=(async()=>{requests++;return Response.json({purchase:null});}) as typeof fetch;
 try{await withProductBrowser(async({render,click})=>{await render(React.createElement(Consent,props));await openPreferences();await click('[data-google-consent="denied"]');await React.act(async()=>window.dispatchEvent(new window.Event("celebix:google-payment-captured")));assert.equal(requests,0);assert.equal(document.querySelector('script[src*="googletagmanager"]'),null);});}finally{globalThis.fetch=previousFetch;}
});

async function openPreferences() {
  const trigger = document.querySelector<HTMLButtonElement>(".google-consent-preferences, .google-consent-preferences-inline");
  assert.ok(trigger, "manual consent preferences remain available");
  await React.act(async () => trigger.click());
}
function localGoogleScripts() {
  Object.assign((window as unknown as Window).happyDOM.settings, { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true });
  let reloads = 0;
  Object.defineProperty(window.location, "reload", { configurable: true, value: () => { reloads++; } });
  return () => reloads;
}
function storedConsent(value: "granted" | "denied") {
  window.localStorage.setItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`, JSON.stringify({ version: 1, value, expires: Date.now() + 60000 }));
}
const consentKey = `celebix:google-consent:v1:${props.storeId}:${props.hostname}`;
async function withConsentTabs(value: "granted" | "denied", run: (tabs: Readonly<{
  mount(index: number): Promise<void>;
  remount(index: number): Promise<void>;
  choose(index: number, value: "granted" | "denied"): Promise<void>;
  flush(): Promise<void>;
  write(index: number, value: string | null, key?: string): void;
  windows: Window[];
  reloads: number[];
  saved: Map<string, string>;
}>) => Promise<void>) {
  const Consent = component(), { createRoot } = await import("react-dom/client");
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const saved = new Map([[consentKey, JSON.stringify({ version: 1, value, expires: Date.now() + 60000 })]]);
  const windows = [0, 1].map(() => new Window({ url: "https://fixture.invalid/products/example", settings: { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true } }));
  const reloads = [0, 0], events: Array<{ index: number; key: string; oldValue: string | null; newValue: string | null }> = [];
  const activate = (index: number) => {
    const browser = windows[index]!;
    Object.assign(globalThis, { window: browser, document: browser.document, requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true });
    return browser;
  };
  function write(index: number, value: string | null, key = consentKey) {
    const oldValue = saved.get(key) ?? null;
    if (oldValue === value) return;
    if (value === null) saved.delete(key); else saved.set(key, value);
    events.push({ index: index === 0 ? 1 : 0, key, oldValue, newValue: value });
  }
  const roots = windows.map((browser, index) => {
    activate(index);
    Object.defineProperty(browser, "localStorage", { configurable: true, value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => write(index, value, key),
      removeItem: (key: string) => write(index, null, key),
    } });
    Object.defineProperty(browser.location, "reload", { configurable: true, value: () => { reloads[index]!++; } });
    markDocumentNonce(props.nonce);
    const container = browser.document.createElement("div"); browser.document.body.append(container);
    return createRoot(container as unknown as HTMLElement);
  });
  try {
    await run({
      windows, reloads, saved, write,
      async mount(index) { activate(index); await React.act(async () => roots[index]!.render(React.createElement(React.StrictMode, null, React.createElement(Consent, props)))); },
      async remount(index) {
        activate(index); await React.act(async () => roots[index]!.render(null));
        await React.act(async () => roots[index]!.render(React.createElement(React.StrictMode, null, React.createElement(Consent, props))));
      },
      async choose(index, value) {
        const browser = activate(index);
        await openPreferences();
        const button = browser.document.querySelector(`[data-google-consent="${value}"]`) as unknown as HTMLButtonElement;
        assert.ok(button);
        await React.act(async () => button.click());
      },
      async flush() {
        while (events.length) {
          const next = events.shift()!, browser = activate(next.index);
          await React.act(async () => browser.dispatchEvent(new browser.StorageEvent("storage", { key: next.key, ...(next.oldValue !== null ? { oldValue: next.oldValue } : {}), ...(next.newValue !== null ? { newValue: next.newValue } : {}), url: "https://fixture.invalid/products/example", storageArea: browser.localStorage })));
        }
      },
    });
  } finally {
    for (const [index, root] of roots.entries()) { activate(index); await React.act(async () => root.unmount()); await windows[index]!.happyDOM.close(); }
    Object.assign(globalThis, previous);
  }
}
for (const choice of ["granted", "denied"] as const) {
  test(`opening a second tab with saved ${choice} consent leaves both documents stable`, async () => {
    await withConsentTabs(choice, async (tabs) => {
      const saved = tabs.saved.get(consentKey);
      await tabs.mount(0); await tabs.flush();
      await tabs.mount(1); await tabs.flush();
      assert.deepEqual([...tabs.reloads], [0, 0]);
      assert.equal(tabs.saved.get(consentKey), saved);
      for (const browser of tabs.windows) assert.equal(browser.document.querySelectorAll('script[src*="googletagmanager"]').length, choice === "granted" ? 1 : 0);
    });
  });
}
test("an expiry-only saved-consent update from another tab keeps the current Google runtime", async () => {
  await withConsentTabs("granted", async (tabs) => {
    await tabs.mount(0); await tabs.mount(1); await tabs.flush();
    const script = tabs.windows[1]!.document.querySelector('script[src*="googletagmanager"]');
    tabs.write(0, JSON.stringify({ version: 1, value: "granted", expires: Date.now() + 120000 }));
    await tabs.flush();
    assert.deepEqual([...tabs.reloads], [0, 0]);
    assert.equal(tabs.windows[1]!.document.querySelector('script[src*="googletagmanager"]'), script);
  });
});
test("withdrawing consent in one tab stops both Google loaders with one reload per document", async () => {
  await withConsentTabs("granted", async (tabs) => {
    await tabs.mount(0); await tabs.mount(1); await tabs.flush();
    const scripts = tabs.windows.map((browser) => browser.document.querySelector('script[src*="googletagmanager"]') as unknown as HTMLScriptElement);
    const lateLoads = scripts.map((script) => script.onload);
    await tabs.choose(0, "denied"); await tabs.flush();
    assert.deepEqual([...tabs.reloads], [1, 1]);
    assert.equal(JSON.parse(tabs.saved.get(consentKey)!).value, "denied");
    for (const browser of tabs.windows) assert.equal(browser.document.querySelector('script[src*="googletagmanager"]'), null);
    tabs.write(0, JSON.stringify({ version: 1, value: "denied", expires: Date.now() + 120000 })); await tabs.flush();
    assert.deepEqual([...tabs.reloads], [1, 1]);
    for (const [index, browser] of tabs.windows.entries()) {
      const layer = (browser as unknown as { dataLayer: unknown[] }).dataLayer, before = layer.length;
      lateLoads[index]?.call(scripts[index]!, new browser.Event("load") as unknown as Event);
      assert.equal(layer.length, before, "withdrawn tabs cannot resume measurement through stale callbacks");
    }
    await tabs.remount(0); await tabs.remount(1); await tabs.flush();
    assert.deepEqual([...tabs.reloads], [1, 1], "restoring the withdrawn choice cannot restart a reload cycle");
    for (const browser of tabs.windows) assert.equal(browser.document.querySelector('script[src*="googletagmanager"]'), null);
  });
});
test("granting consent propagates once and the refreshed tab restores it without another reload", async () => {
  await withConsentTabs("denied", async (tabs) => {
    await tabs.mount(0); await tabs.mount(1); await tabs.flush();
    await tabs.choose(0, "granted"); await tabs.flush();
    assert.deepEqual([...tabs.reloads], [0, 1]);
    const saved = tabs.saved.get(consentKey);
    await tabs.remount(1); await tabs.flush();
    assert.deepEqual([...tabs.reloads], [0, 1]);
    assert.equal(tabs.saved.get(consentKey), saved);
    for (const browser of tabs.windows) assert.equal(browser.document.querySelectorAll('script[src*="googletagmanager"]').length, 1);
  });
});
test("unrelated store keys and session storage cannot reload tabs; clearing local storage withdraws consent", async () => {
  await withConsentTabs("granted", async (tabs) => {
    await tabs.mount(0); await tabs.mount(1); await tabs.flush();
    tabs.write(0, "changed", "celebix:storefront:favorites");
    tabs.write(0, "changed", `celebix:google-consent:v1:22222222-2222-4222-8222-222222222222:${props.hostname}`);
    tabs.write(0, "changed", `celebix:google-consent:v1:${props.storeId}:other.invalid`);
    await tabs.flush();
    const browser = tabs.windows[1]!;
    await React.act(async () => browser.dispatchEvent(new browser.StorageEvent("storage", { key: consentKey, storageArea: browser.sessionStorage })));
    assert.deepEqual([...tabs.reloads], [0, 0]);
    tabs.saved.clear();
    await React.act(async () => browser.dispatchEvent(new browser.StorageEvent("storage", { storageArea: browser.localStorage })));
    assert.deepEqual([...tabs.reloads], [0, 1]);
    assert.equal(browser.document.querySelector('script[src*="googletagmanager"]'), null);
  });
});
for (const replacement of [null, "broken", JSON.stringify({ version: 1, value: "granted", expires: 1 })]) {
  test(`removing or invalidating consent in another tab stops the granted runtime: ${replacement}`, async () => {
    await withConsentTabs("granted", async (tabs) => {
      await tabs.mount(0); await tabs.mount(1); await tabs.flush();
      tabs.write(0, replacement); await tabs.flush();
      assert.deepEqual([...tabs.reloads], [0, 1]);
      assert.equal(tabs.windows[1]!.document.querySelector('script[src*="googletagmanager"]'), null);
      assert.equal(tabs.saved.get(consentKey) ?? null, replacement);
    });
  });
}
test("a stored grant remains revocable through manual preferences without an automatic banner", async () => {
  const Consent = component();
  await withProductBrowser(async ({ container, render, click }) => {
    const reloads = localGoogleScripts(); storedConsent("granted");
    await render(React.createElement(Consent, props));
    assert.ok(!container.querySelector('[role="region"][aria-label="Çerez tercihleri"]'));
    assert.equal(document.querySelectorAll('script[src*="googletagmanager"]').length, 1);
    await openPreferences();
    await click('[data-google-consent="denied"]');
    assert.equal(JSON.parse(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`)!).value, "denied");
    assert.ok(!document.querySelector('script[src*="googletagmanager"]'));
    assert.equal(reloads(), 1);
  });
});
test("a newly connected container is adopted before consent without loading or reloading early", async () => {
  const Consent = component();
  await withProductBrowser(async ({ render, click }) => {
    const reloads = localGoogleScripts();
    await render(React.createElement(Consent, { ...props, projection: { ...projection, gtmContainerId: null } }));
    await render(React.createElement(Consent, props));
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    assert.equal(reloads(), 0);
    await openPreferences();
    await click('[data-google-consent="granted"]');
    assert.equal((document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement)?.src, "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123");
  });
});
test("replacing an unstarted container preserves denied consent and the document nonce", async () => {
  const Consent = component();
  await withProductBrowser(async ({ render, click }) => {
    const reloads = localGoogleScripts(); storedConsent("denied");
    await render(React.createElement(Consent, props));
    await render(React.createElement(Consent, { ...props, nonce: "nextRequestNonce123456", projection: { ...projection, gtmContainerId: "GTM-NEW456" } }));
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    assert.equal(reloads(), 0);
    await click('button[aria-expanded="false"]'); await click('[data-google-consent="granted"]');
    const script = document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement;
    assert.equal(script.src, "https://www.googletagmanager.com/gtm.js?id=GTM-NEW456");
    assert.equal(script.nonce, props.nonce);
  });
});
test("replacing a started container stops stale callbacks and events before one document reload", async () => {
  const Consent = component("/checkout/payment/result"); const previousFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = (async () => { requests++; return Response.json({ purchase: null }); }) as typeof fetch;
  try { await withProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("granted");
    await render(React.createElement(Consent, props));
    const script = document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement;
    const lateLoad = script.onload, initialRequests = requests;
    const replacement = { ...props, projection: { ...projection, gtmContainerId: "GTM-NEW456" } };
    await render(React.createElement(Consent, replacement));
    assert.equal(reloads(), 1);
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    const layer = (window as unknown as { dataLayer: unknown[] }).dataLayer, before = layer.length;
    await React.act(async () => {
      lateLoad?.call(script, new window.Event("load") as unknown as Event);
      window.dispatchEvent(new window.Event("celebix:google-payment-captured"));
      window.dispatchEvent(new window.CustomEvent(STOREFRONT_COMMERCE_EVENT, { detail: { name: "product_view", data: {} } }));
    });
    assert.equal(requests, initialRequests); assert.equal(layer.length, before);
    await render(React.createElement(Consent, { ...replacement, projection: { ...replacement.projection } }));
    assert.equal(reloads(), 1);
    assert.equal(JSON.parse(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`)!).value, "granted");
  }); } finally { globalThis.fetch = previousFetch; }
});
test("disconnect unmount stops an active loader and reloads once without changing saved consent", async () => {
  const Consent = component();
  await withProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("granted");
    await render(React.createElement(Consent, props));
    const script = document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement, lateLoad = script.onload;
    await render(null);
    assert.equal(reloads(), 1); assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    const layer = (window as unknown as { dataLayer: unknown[] }).dataLayer, before = layer.length;
    await React.act(async () => lateLoad?.call(script, new window.Event("load") as unknown as Event));
    assert.equal(layer.length, before);
    assert.equal(JSON.parse(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`)!).value, "granted");
  });
});
test("StrictMode with previously granted consent keeps one live loader and never reloads", async () => {
  const Consent = component();
  await withProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("granted");
    await render(React.createElement(React.StrictMode, null, React.createElement(Consent, props)));
    assert.equal(document.querySelectorAll('script[src*="googletagmanager"]').length, 1); assert.equal(reloads(), 0);
  });
});
test("pathname, nonce, projection reference and verification changes keep the existing loader", async () => {
  let pathname = "/products/example";
  const Consent = componentLoader({ "next/navigation": { usePathname: () => pathname } })<{ GoogleMarketingConsent: React.ComponentType<ConsentProps> }>(new URL("./GoogleMarketingConsent.tsx", import.meta.url)).GoogleMarketingConsent;
  await withProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("granted");
    await render(React.createElement(Consent, props));
    const script = document.querySelector('script[src*="googletagmanager"]'), layer = (window as unknown as { dataLayer: unknown[] }).dataLayer, before = layer.length;
    pathname = "/collections/example";
    await render(React.createElement(Consent, { ...props, nonce: "nextRequestNonce123456", projection: { ...projection, verificationToken: "verification-token" } }));
    assert.equal(document.querySelectorAll('script[src*="googletagmanager"]').length, 1);
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), script);
    assert.equal((script as HTMLScriptElement).nonce, props.nonce); assert.equal(layer.length, before); assert.equal(reloads(), 0);
  });
});
test("an unstarted denied loader can unmount without a document reload", async () => {
  const Consent = component();
  await withProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("denied");
    await render(React.createElement(Consent, props)); await render(null);
    assert.equal(reloads(), 0); assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
  });
});
function markDocumentNonce(nonce: string) {
  const marker = document.createElement("script"); marker.nonce = nonce;
  document.head.appendChild(marker);
}
test("first mount in an older RSC document reloads once before creating Google state or tags", async () => {
  const Consent = component();
  await withBaseProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("granted"); markDocumentNonce("oldDocumentNonce123456");
    const content = React.createElement(React.StrictMode, null, React.createElement(Consent, props));
    await render(content);
    assert.equal(reloads(), 1);
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    assert.equal((window as unknown as { dataLayer?: unknown[] }).dataLayer, undefined);
    await render(content); assert.equal(reloads(), 1);
  });
});
test("a matching fresh document nonce loads once with granted consent under StrictMode", async () => {
  const Consent = component();
  await withBaseProductBrowser(async ({ render }) => {
    const reloads = localGoogleScripts(); storedConsent("granted"); markDocumentNonce(props.nonce);
    await render(React.createElement(React.StrictMode, null, React.createElement(Consent, props)));
    assert.equal(reloads(), 0);
    assert.equal(document.querySelectorAll('script[src*="googletagmanager"]').length, 1);
    assert.equal((document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement).nonce, props.nonce);
  });
});
test("a document without a trusted initial nonce stays disabled without a reload loop", async () => {
  const Consent = component();
  await withBaseProductBrowser(async ({ render, click }) => {
    const reloads = localGoogleScripts();
    await render(React.createElement(React.StrictMode, null, React.createElement(Consent, props)));
    await openPreferences();
    await click('[data-google-consent="granted"]');
    assert.equal(reloads(), 0); assert.equal(document.querySelector('script[src*="googletagmanager"]') === null, true);
    assert.equal((window as unknown as { dataLayer?: unknown[] }).dataLayer, undefined);
    assert.equal(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`), null);
  });
});
