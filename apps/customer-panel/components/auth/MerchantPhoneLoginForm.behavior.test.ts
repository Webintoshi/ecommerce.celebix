import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';
import {compile,withEditor} from '../settings/design/design-editor-test-utils.ts';
import type {MerchantPhoneLoginClient,MerchantPhoneLoginState} from './merchant-phone-login-client.ts';
const loginModule=compile<any>(new URL('./merchant-phone-login-client.ts',import.meta.url));
const {MerchantPhoneLoginForm:Form}=compile<any>(new URL('./MerchantPhoneLoginForm.tsx',import.meta.url),{'./merchant-phone-login-client.ts':loginModule});
const NOW=Date.parse('2026-10-13T12:00:00Z');const phone:MerchantPhoneLoginState={phase:'phone'};const code:MerchantPhoneLoginState={...phone,phase:'code',maskedPhone:'+90 ••• 2233',resendAt:new Date(NOW+60000).toISOString(),expiresAt:new Date(NOW+600000).toISOString()};
function client(overrides:Partial<MerchantPhoneLoginClient>={}):MerchantPhoneLoginClient{return{state:async()=>phone,start:async()=>code,resend:async()=>code,verify:async()=>({...phone,phase:'complete'}),...overrides};}
async function settle(){await React.act(async()=>{await new Promise(r=>setTimeout(r,0));});}
async function submit(window:any,container:HTMLElement){await React.act(async()=>container.querySelector('form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
test('manual phone then six-digit pasted leading-zero code focuses and completes through fixed path',async()=>{const calls:any[]=[],destinations:string[]=[];await withEditor(async({window,container,render,change})=>{await render(React.createElement(Form,{client:client({start:async body=>{calls.push(body);return code;},verify:async body=>{calls.push(body);return{...phone,phase:'complete'};}}),clock:()=>NOW,navigate:(path:string)=>destinations.push(path)}));await settle();assert.equal(calls.length,0);await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await submit(window,container);assert.equal(calls[0].phone,'+905551112233');const field=container.querySelector<HTMLInputElement>('[name="code"]')!;assert.equal(window.document.activeElement,field);assert.equal(field.autocomplete,'one-time-code');await change(field,'00 12-34');await submit(window,container);assert.equal(calls[1].code,'001234');assert.deepEqual(destinations,['/auth/merchant-phone/complete']);assert.equal(container.querySelector('[name="password"]'),null);assert.equal(container.querySelector('[name="rememberDevice"]'),null);});});
test('failed request retains phone/code and original operation; no polling or automatic send',async()=>{const calls:any[]=[];await withEditor(async({window,container,render,change})=>{await render(React.createElement(Form,{client:client({start:async body=>{calls.push(body);throw Error('DATABASE SECRET');}}),clock:()=>NOW}));await settle();await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await submit(window,container);await submit(window,container);assert.equal(calls[0].operationId,calls[1].operationId);assert.equal(container.querySelector<HTMLInputElement>('[name="phone"]')!.value,'0555 111 22 33');assert.ok(!container.textContent!.includes('SECRET'));assert.ok(container.querySelector('[role="alert"]'));await new Promise(r=>setTimeout(r,25));assert.equal(calls.length,2);});});
test('resend waits60 seconds manually; phone change retains original input and code verification buffer',async()=>{let now=NOW,sends=0;await withEditor(async({window,container,render,click,change})=>{await render(React.createElement(Form,{client:client({start:async()=>{sends++;return code;},resend:async()=>{sends++;return code;},verify:async()=>{throw Error();}}),clock:()=>now}));await settle();await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await submit(window,container);const resend=container.querySelector<HTMLButtonElement>('[data-resend]')!;assert.equal(resend.disabled,true);await change(container.querySelector<HTMLInputElement>('[name="code"]')!,'001234');await submit(window,container);assert.equal(container.querySelector<HTMLInputElement>('[name="code"]')!.value,'001234');await click(resend);assert.equal(sends,1);now+=61000;await React.act(async()=>window.document.dispatchEvent(new window.Event('visibilitychange')));await click(container.querySelector('[data-resend]')!);assert.equal(sends,2);await click(container.querySelector('[data-change-phone]')!);assert.equal(container.querySelector<HTMLInputElement>('[name="phone"]')!.value,'0555 111 22 33');});});
test('unavailable staged state provides safe retry without sends',async()=>{let sends=0;await withEditor(async({container,render})=>{await render(React.createElement(Form,{client:client({state:async()=>{throw Error('PRIVATE');},start:async()=>{sends++;return code;}})}));await settle();assert.equal(container.querySelector('form'),null);assert.ok(container.querySelector('[role="alert"]'));assert.equal(container.textContent!.includes('PRIVATE'),false);assert.equal(sends,0);});});
test('refresh resumes code through server pending phone and rate-limited first send has local manual countdown',async()=>{
 const {MerchantPhoneLoginError}=loginModule;
 let now=NOW,reads=0,sends=0;
 await withEditor(async({window,container,render,change})=>{
  await render(React.createElement(Form,{client:client({state:async()=>{reads++;return phone;},start:async()=>{sends++;throw new MerchantPhoneLoginError('rate_limited',60);}}),clock:()=>now}));await settle();
  await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await submit(window,container);
  assert.equal(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,true);
  now+=61000;await React.act(async()=>window.document.dispatchEvent(new window.Event('visibilitychange')));
  assert.equal(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,false);assert.equal(sends,1);assert.equal(reads,1);
 });
 const calls:any[]=[];
 await withEditor(async({container,render,click})=>{await render(React.createElement(Form,{client:client({state:async()=>({...code,resendAt:new Date(NOW-1000).toISOString()}),resend:async input=>{calls.push(input);return code;}}),clock:()=>NOW}));await settle();await click(container.querySelector('[data-resend]')!);assert.equal(calls.length,1);assert.deepEqual(Object.keys(calls[0]),['operationId']);});
});

test('phone access error preserves code and retry operation until an explicit manual restart',async()=>{
 const {MerchantPhoneLoginError}=loginModule;
 for(const errorCode of ['fresh_login_required','phone_conflict','not_ready']){
  const calls:any[]=[],destinations:string[]=[];let sends=0;
  await withEditor(async({window,container,render,change,click})=>{
   await render(React.createElement(Form,{client:client({start:async()=>{sends++;return code;},verify:async body=>{calls.push(body);throw new MerchantPhoneLoginError(errorCode);}}),clock:()=>NOW,navigate:(path:string)=>destinations.push(path)}));await settle();
   await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await submit(window,container);await change(container.querySelector<HTMLInputElement>('[name="code"]')!,'001234');await submit(window,container);await submit(window,container);
   assert.equal(calls[0].operationId,calls[1].operationId);assert.equal(container.querySelector<HTMLInputElement>('[name="code"]')!.value,'001234');assert.equal(sends,1);assert.deepEqual(destinations,[]);
   const restart=container.querySelector<HTMLButtonElement>('[data-change-phone]')!;assert.equal(restart.textContent,'Girişi yeniden başlat');assert.ok(container.querySelector('[role="alert"]'));
   await click(restart);assert.equal(container.querySelector<HTMLInputElement>('[name="phone"]')!.value,'0555 111 22 33');assert.equal(container.querySelector('[role="alert"]'),null);assert.equal(sends,1);assert.deepEqual(destinations,[]);
  });
 }
});
