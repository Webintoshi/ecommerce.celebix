import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { Window } from "happy-dom";
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
test("banner gives equal accept and reject controls with no initial Google loader", async () => {
  const Consent = component();
  await withProductBrowser(async ({ container, render, click }) => {
    // Simulate load completion locally; never execute or request a Google script in this fixture.
    Object.assign((window as unknown as Window).happyDOM.settings, { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true });
    await render(React.createElement(Consent, props));
    assert.ok(container.querySelector('[role="region"][aria-label="Çerez tercihleri"]'));
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
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
 try{await withProductBrowser(async({render,click})=>{await render(React.createElement(Consent,props));await click('[data-google-consent="denied"]');await React.act(async()=>window.dispatchEvent(new window.Event("celebix:google-payment-captured")));assert.equal(requests,0);assert.equal(document.querySelector('script[src*="googletagmanager"]'),null);});}finally{globalThis.fetch=previousFetch;}
});

function localGoogleScripts() {
  Object.assign((window as unknown as Window).happyDOM.settings, { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true });
  let reloads = 0;
  Object.defineProperty(window.location, "reload", { configurable: true, value: () => { reloads++; } });
  return () => reloads;
}
function storedConsent(value: "granted" | "denied") {
  window.localStorage.setItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`, JSON.stringify({ version: 1, value, expires: Date.now() + 60000 }));
}
test("a newly connected container is adopted before consent without loading or reloading early", async () => {
  const Consent = component();
  await withProductBrowser(async ({ render, click }) => {
    const reloads = localGoogleScripts();
    await render(React.createElement(Consent, { ...props, projection: { ...projection, gtmContainerId: null } }));
    await render(React.createElement(Consent, props));
    assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
    assert.equal(reloads(), 0);
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
    await click('[data-google-consent="granted"]');
    assert.equal(reloads(), 0); assert.equal(document.querySelector('script[src*="googletagmanager"]') === null, true);
    assert.equal((window as unknown as { dataLayer?: unknown[] }).dataLayer, undefined);
    assert.equal(window.localStorage.getItem(`celebix:google-consent:v1:${props.storeId}:${props.hostname}`), null);
  });
});
