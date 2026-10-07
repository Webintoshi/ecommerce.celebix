import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { Window } from "happy-dom";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
const projection = { gtmContainerId: "GTM-ABC123", ads: null, verificationToken: null };
const props = { storeId: "11111111-1111-4111-8111-111111111111", hostname: "fixture.invalid", nonce: "validNonce123456789", projection };
function component(pathname = "/products/example") { return componentLoader({ "next/navigation": { usePathname: () => pathname } })<{ GoogleMarketingConsent: React.ComponentType<typeof props> }>(new URL("./GoogleMarketingConsent.tsx", import.meta.url)).GoogleMarketingConsent; }
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
