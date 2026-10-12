import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, withEditor } from "./design/design-editor-test-utils.ts";
import type { AdminSecurityClient } from "../../lib/admin-login-security-ui/client.ts";
const {AdminLoginSecurityConsole:Screen}=compile<any>(new URL("./AdminLoginSecurityConsole.tsx",import.meta.url));
const state={maskedPhone:"+90 ••• 1234",backupCodesRemaining:8,enabled:true,trustedDevices:[{deviceId:"device1",createdAt:"2026-10-12T12:00:00.000Z",expiresAt:"2026-11-11T12:00:00.000Z"}]};
function client(overrides:Partial<AdminSecurityClient>={}):AdminSecurityClient{return{state:async()=>state,forget:async()=>({...state,trustedDevices:[]}),start:async()=>({url:"https://panel.test/auth/admin-security/start",transfer:"ase1.nonce.cipher.tag"}),...overrides};}
async function settle(){await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
test("security shows public phone backup count device lifetime and all forget scopes",async()=>{
 const writes:any[]=[];await withEditor(async({render,container,click})=>{
  await render(React.createElement(Screen,{authorityOrigin:"https://id.test",client:client({forget:async(body,key)=>{writes.push([body,key]);return state;}})}));await settle();assert.match(container.textContent!,/1234/);assert.match(container.textContent!,/8 yedek kod/);assert.equal(container.querySelectorAll("time").length,2);
  await click(container.querySelector('[data-forget-current]')!);await click(container.querySelector('[data-forget-device]')!);await click(container.querySelector('[data-forget-all]')!);assert.deepEqual(writes.map(r=>r[0]),[{currentDevice:true},{deviceId:"device1"},{}]);
 });
});
test("failed forget preserves displayed devices and retries same key",async()=>{
 const writes:any[]=[];await withEditor(async({render,container,click})=>{
  await render(React.createElement(Screen,{authorityOrigin:"https://id.test",client:client({forget:async(body,key)=>{writes.push([body,key]);throw Error("DATABASE SECRET");}})}));await settle();
  await click(container.querySelector('[data-forget-device]')!);await click(container.querySelector('[data-forget-device]')!);assert.equal(writes[0][1],writes[1][1]);assert.ok(container.querySelector('[data-forget-device]'));assert.ok(!container.textContent?.includes("SECRET"));assert.ok(container.querySelector('[role="alert"]'));
 });
});
test("change phone and recovery refresh request fresh authorization and reject injected unsafe URL",async()=>{
 const purposes:any[]=[],destinations:string[]=[];await withEditor(async({render,container,click})=>{
  await render(React.createElement(Screen,{authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",client:client({start:async(body,key)=>{purposes.push([body,key]);return {url:purposes.length===1?"https://evil.test":"https://panel.test/auth/admin-security/start",transfer:"ase1.nonce.cipher.tag"};}}),submitHandoff:(handoff:any)=>destinations.push(handoff.url)}));await settle();
  await click(container.querySelector('[data-change-phone]')!);assert.deepEqual(destinations,[]);assert.ok(container.querySelector('[role="alert"]'));
  await click(container.querySelector('[data-regenerate-backups]')!);assert.deepEqual(purposes.map(r=>r[0]),[{purpose:"change_phone"},{purpose:"manage"}]);assert.deepEqual(destinations,["https://panel.test/auth/admin-security/start"]);
 });
});
test("initial read failure supports explicit retry and empty trusted device state",async()=>{
 let reads=0;await withEditor(async({render,container,click})=>{
  await render(React.createElement(Screen,{authorityOrigin:"https://id.test",client:client({state:async()=>{if(++reads===1)throw Error("failure");return{...state,trustedDevices:[]};}})}));await settle();assert.ok(container.querySelector('[data-security-retry]'));
  await click(container.querySelector('[data-security-retry]')!);await settle();assert.match(container.textContent!,/Hatırlanan cihaz yok/);assert.equal(reads,2);
 });
});

test("unfinished management retry needs explicit restart before a fresh operation key",async()=>{
 const model=compile<any>(new URL("../../lib/admin-login-security-ui/model.ts",import.meta.url)),writes:any[]=[],{AdminLoginSecurityConsole:RestartScreen}=compile<any>(new URL("./AdminLoginSecurityConsole.tsx",import.meta.url),{"../../lib/admin-login-security-ui/model.ts":model});
 await withEditor(async({render,container,click})=>{
  await render(React.createElement(RestartScreen,{authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",client:client({start:async(body,key)=>{writes.push([body,key]);throw new model.AdminSecurityUiError(writes.length===1?"management_restart_required":"unavailable");}})}));await settle();
  await click(container.querySelector('[data-change-phone]')!);assert.ok(container.querySelector('[data-restart-management]'));assert.equal(writes.length,1);
  await click(container.querySelector('[data-restart-management]')!);assert.equal(writes.length,2);assert.notEqual(writes[0][1],writes[1][1]);assert.deepEqual(writes[0][0],writes[1][0]);
  await click(container.querySelector('[data-change-phone]')!);assert.equal(writes[1][1],writes[2][1]);
 });
});
test("safe return message explains missing central device without showing query text",async()=>{
 await withEditor(async({render,container})=>{await render(React.createElement(Screen,{authorityOrigin:"https://id.test",returnMessage:"device_unavailable",client:client()}));await settle();assert.match(container.querySelector('[role="alert"]')?.textContent??"",/hatırlama bilgisi bulunamadı/);});
 await withEditor(async({render,container})=>{await render(React.createElement(Screen,{authorityOrigin:"https://id.test",returnMessage:"SERVER_SECRET",client:client()}));await settle();assert.equal(container.querySelector('[role="alert"]'),null);});
});
test("unenrolled member restarts normal login for enrollment without invoking management",async()=>{
 let starts=0;await withEditor(async({render,container,click})=>{
  await render(React.createElement(Screen,{authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",freshLoginUrl:"https://panel.test/auth/login?destination=admin.guzidekuyumcu.com.tr",client:client({state:async()=>({...state,maskedPhone:null,backupCodesRemaining:0}),start:async()=>{starts++;return{url:"https://panel.test/auth/admin-security/start",transfer:"ase1.nonce.cipher.tag"};}})}));await settle();
  const restart=container.querySelector<HTMLAnchorElement>('[data-enroll-login]');assert.ok(restart);assert.equal(restart.href,"https://panel.test/auth/login?destination=admin.guzidekuyumcu.com.tr");assert.equal(container.querySelector('[data-change-phone]'),null);assert.equal(container.querySelector<HTMLButtonElement>('[data-regenerate-backups]')!.disabled,true);await click(container.querySelector('[data-regenerate-backups]')!);assert.equal(starts,0);
 });
});
test("disabled rollout offers neutral availability message without management or enrollment start",async()=>{
 let starts=0;await withEditor(async({render,container})=>{await render(React.createElement(Screen,{authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",client:client({state:async()=>({...state,enabled:false,maskedPhone:null}),start:async()=>{starts++;throw Error("unexpected");}})}));await settle();assert.equal(container.querySelector('[data-change-phone]'),null);assert.equal(container.querySelector('[data-enroll-login]'),null);assert.match(container.textContent!,/etkinleştirildiğinde/);assert.equal(starts,0);});
});
