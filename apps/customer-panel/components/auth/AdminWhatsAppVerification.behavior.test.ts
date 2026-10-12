import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, withEditor } from "../settings/design/design-editor-test-utils.ts";
import type { AdminLoginClient } from "../../lib/admin-login-security-ui/client.ts";
import type { AdminLoginPublicState } from "../../lib/admin-login-security-ui/model.ts";
const model=await import("../../lib/admin-login-security-ui/model.ts");
const {AdminWhatsAppVerification:Screen}=compile<any>(new URL("./AdminWhatsAppVerification.tsx",import.meta.url),{"../../lib/admin-login-security-ui/model.ts":model});
const state:AdminLoginPublicState={schemaVersion:1,phase:"phone",purpose:"login",displayName:"Butik Siora",maskedPhone:null,challengeId:null,expiresAt:null,resendAt:null,enrolled:false,backupCodesRemaining:0};
const coded:AdminLoginPublicState={...state,phase:"code",enrolled:true,maskedPhone:"+90 ••• 1234",challengeId:"challenge",expiresAt:"2099-01-01T00:00:00.000Z",backupCodesRemaining:10};
function client(overrides:Partial<AdminLoginClient>={}):AdminLoginClient{return{state:async()=>state,send:async()=>coded,verify:async()=>({...coded,phase:"complete"}),recover:async()=>({...coded,phase:"complete"}),resume:async()=>coded,...overrides};}
async function settle(){await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
async function submit(window:any,container:HTMLElement){await React.act(async()=>{container.querySelector("form")?.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));});await settle();}
test("enrollment sends manually and phone error preserves buffer and retry key",async()=>{
 const writes:any[]=[];await withEditor(async({render,container,window,change})=>{
  await render(React.createElement(Screen,{initialState:state,client:client({send:async(body,key)=>{writes.push([body,key]);throw Error("PRIVATE SQL ERROR");}})}));await settle();assert.equal(writes.length,0);
  const phone=container.querySelector<HTMLInputElement>('[name="phone"]')!;await change(phone,"+90 532 123 45 67");await submit(window,container);await submit(window,container);
  assert.equal(phone.value,"+90 532 123 45 67");assert.deepEqual(writes[0][0],{phone:"+905321234567"});assert.equal(writes[0][1],writes[1][1]);assert.ok(container.querySelector('[role="alert"]'));assert.ok(!container.textContent?.includes("PRIVATE"));
  await change(phone,"+905321234568");await submit(window,container);assert.notEqual(writes[1][1],writes[2][1]);
 });
});
test("OTP paste leading zeros unchecked remember and explicit resend preserve input",async()=>{
 const writes:any[]=[];const destinations:string[]=[];await withEditor(async({render,container,window,change,click})=>{
  await render(React.createElement(Screen,{initialState:coded,client:client({verify:async(body,key)=>{writes.push([body,key]);throw Error("fail");}}),navigate:(url:string)=>destinations.push(url)}));await settle();
  const code=container.querySelector<HTMLInputElement>('[name="code"]')!;await change(code,"00 12-34");assert.equal(code.value,"001234");assert.equal(container.querySelector<HTMLInputElement>('[name="rememberDevice"]')?.checked,false);
  await submit(window,container);await submit(window,container);assert.deepEqual(writes[0][0],{code:"001234",rememberDevice:false});assert.equal(writes[0][1],writes[1][1]);assert.equal(code.value,"001234");
  await click(container.querySelector('[data-resend]')!);assert.equal(code.value,"001234");assert.deepEqual(destinations,[]);
 });
});
test("trusted resume happens once and completion uses only constant server completion path",async()=>{
 let resumes=0,sends=0;const destinations:string[]=[];const adapter=client({resume:async()=>{resumes++;return{...coded,phase:"complete"};},send:async()=>{sends++;return coded;}});
 await withEditor(async({render,container})=>{
  await render(React.createElement(React.StrictMode,null,React.createElement(Screen,{initialState:{...coded,challengeId:null},client:adapter,navigate:(url:string)=>destinations.push(url)})));await settle();
  assert.equal(resumes,1);assert.equal(sends,0);assert.deepEqual(destinations,["/auth/admin-login/complete"]);assert.equal(container.querySelector("input"),null);
 });
});
test("recovery submits unused backup code without device trust and is absent during enrollment",async()=>{
 const writes:any[]=[];const destinations:string[]=[];await withEditor(async({render,container,window,change,click})=>{
  await render(React.createElement(Screen,{initialState:coded,client:client({recover:async(body,key)=>{writes.push([body,key]);return{...coded,phase:"complete"};}}),navigate:(url:string)=>destinations.push(url)}));await settle();
  await click(container.querySelector('[data-use-backup]')!);assert.equal(container.querySelector('[name="rememberDevice"]'),null);await change(container.querySelector<HTMLInputElement>('[name="backupCode"]')!,"AAAA-BBBB");await submit(window,container);assert.deepEqual(writes[0][0],{backupCode:"AAAA-BBBB"});assert.deepEqual(destinations,["/auth/admin-login/complete"]);
 });
 await withEditor(async({render,container})=>{await render(React.createElement(Screen,{initialState:state,client:client()}));await settle();assert.equal(container.querySelector('[data-use-backup]'),null);});
});
test("new backup batch needs save acknowledgement before proceeding and no plaintext persistence",async()=>{
 const codes=Array.from({length:10},(_,i)=>`RECOVERY-${i}`),destinations:string[]=[];
 await withEditor(async({render,container,click,window})=>{
  await render(React.createElement(Screen,{initialState:{...coded,phase:"backup_codes",backupCodes:codes},client:client(),navigate:(url:string)=>destinations.push(url)}));await settle();
  assert.equal(container.querySelectorAll('[data-backup-code]').length,10);assert.ok(container.querySelector('[data-download-backups]'));assert.equal(container.querySelector<HTMLButtonElement>('[data-complete]')?.disabled,true);
  await click(container.querySelector('[name="savedBackupCodes"]')!);await click(container.querySelector('[data-complete]')!);assert.deepEqual(destinations,["/auth/admin-login/complete"]);assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
 });
});
test("pending submit blocks duplicate commands and countdown is local",async()=>{
 let writes=0;let resolve:any;const pending=new Promise<AdminLoginPublicState>(done=>{resolve=done;});
 await withEditor(async({render,container,window,change})=>{
  await render(React.createElement(Screen,{initialState:{...coded,resendAt:"2099-01-01T00:00:00.000Z"},client:client({verify:async()=>{writes++;return pending;}})}));await settle();assert.equal(container.querySelector<HTMLButtonElement>('[data-resend]')?.disabled,true);
  await change(container.querySelector<HTMLInputElement>('[name="code"]')!,"001234");await submit(window,container);await submit(window,container);assert.equal(writes,1);assert.equal(container.querySelector<HTMLInputElement>('[name="code"]')?.disabled,true);
  await React.act(async()=>resolve({...coded,phase:"backup_codes",backupCodes:Array.from({length:10},(_,i)=>`CODE-${i}`)}));
 });
});

test("uncertain delivery offers manual state check without polling or duplicate provider send",async()=>{
 let sends=0,reads=0;await withEditor(async({render,container,window,change,click})=>{
  await render(React.createElement(Screen,{initialState:state,client:client({send:async()=>{sends++;throw new model.AdminSecurityUiError("delivery_uncertain");},state:async()=>{reads++;return coded;}})}));await settle();
  await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,"+905321234567");await submit(window,container);assert.equal(reads,0);assert.match(container.textContent!,/Otomatik tekrar gönderilmedi/);await click(container.querySelector('[data-check-status]')!);await settle();assert.equal(reads,1);assert.equal(sends,1);assert.ok(container.querySelector('[name="code"]'));
 });
});
test("after an uncertain send, manual status check permits a deliberate new code with a new operation",async()=>{
 const writes:string[]=[];let reads=0;
 await withEditor(async({render,container,window,change,click})=>{
  await render(React.createElement(Screen,{initialState:state,client:client({send:async(_body,key)=>{writes.push(key);throw new model.AdminSecurityUiError("delivery_uncertain");},state:async()=>{reads++;return {...state,resendAt:"2000-01-01T00:00:00.000Z"};}})}));await settle();
  const phone=container.querySelector<HTMLInputElement>('[name="phone"]')!;
  await change(phone,"+905321234567");await submit(window,container);await submit(window,container);
  assert.equal(writes[0],writes[1]);assert.equal(reads,0);
  await click(container.querySelector('[data-check-status]')!);await settle();await submit(window,container);
  assert.equal(reads,1);assert.notEqual(writes[2],writes[1]);assert.equal(phone.value,"+905321234567");
 });
});
test("manual status check keeps enrollment resend closed during the provider cooldown",async()=>{
 let sends=0;
 await withEditor(async({render,container,window,change,click})=>{
  await render(React.createElement(Screen,{initialState:state,client:client({send:async()=>{sends++;throw new model.AdminSecurityUiError("delivery_uncertain");},state:async()=>({...state,resendAt:"2099-01-01T00:00:00.000Z"})})}));await settle();
  await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,"+905321234567");await submit(window,container);await click(container.querySelector('[data-check-status]')!);await settle();
  assert.equal(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled,true);await submit(window,container);assert.equal(sends,1);
 });
});
test("expired pending offers explicit safe restart with original store destination and preserves identity",async()=>{
 await withEditor(async({render,container,window,change})=>{
  const restartUrl="/auth/login?destination=admin.guzidekuyumcu.com.tr";
  await render(React.createElement(Screen,{initialState:coded,restartUrl,client:client({verify:async()=>{throw new model.AdminSecurityUiError("pending_expired");}})}));await settle();await change(container.querySelector<HTMLInputElement>('[name="code"]')!,"001234");await submit(window,container);const restart=container.querySelector<HTMLAnchorElement>('[data-restart-login]');assert.equal(restart?.getAttribute("href"),restartUrl);assert.equal(restart?.textContent,"Girişi yeniden başlat");assert.equal(container.querySelector("form"),null);assert.match(container.textContent!,/Butik Siora/);
 });
});
