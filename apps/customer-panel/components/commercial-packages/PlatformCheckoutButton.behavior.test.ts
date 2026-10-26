import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {compile,withEditor} from '../settings/design/design-editor-test-utils.ts';
const STORE='11111111-1111-4111-8111-111111111111',OP='22222222-2222-4222-8222-222222222222',ORDER='33333333-3333-4333-8333-333333333333';
test('checkout double click sends one canonical intent and posts handoff through hidden form',async()=>{
 const {PlatformCheckoutButton}=compile<any>(new URL('./PlatformCheckoutButton.tsx',import.meta.url));
 await withEditor(async({window,container,render,click})=>{let release!:(value:Response)=>void;const deferred=new Promise<Response>(resolve=>{release=resolve;}),calls:any[]=[],forms:any[]=[];
 window.HTMLFormElement.prototype.submit=function(){forms.push({action:this.action,method:this.method,fields:[...this.querySelectorAll('input')].map((input:any)=>[input.name,input.value])});};
 await render(React.createElement(PlatformCheckoutButton,{storeId:STORE,kind:'tool',offerId:'restock',term:'once',createOperationId:()=>OP,fetcher:async(url:string,init:RequestInit)=>{calls.push({url,body:JSON.parse(String(init.body)),headers:init.headers});return deferred;}}));
 const button=container.querySelector('button')!;await React.act(async()=>{button.click();button.click();});assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{kind:'tool',offerId:'restock',term:'once',operationId:OP});assert.equal(calls[0].headers['Idempotency-Key'],OP);
 const journal=()=>Array.from({length:window.sessionStorage.length},(_,index)=>{const key=window.sessionStorage.key(index)!;return[key,window.sessionStorage.getItem(key)];});
 assert.deepEqual(journal(),[[`celebix-platform-checkout:v1:${window.location.hostname}:${STORE}:tool:restock:once`,OP]]);
 await React.act(async()=>release(Response.json({orderId:ORDER,handoff:'A'.repeat(43),checkoutUrl:'https://celebix.net/api/platform-checkout/handoff'})));
 assert.deepEqual(forms,[{action:'https://celebix.net/api/platform-checkout/handoff',method:'POST',fields:[['orderId',ORDER],['handoff','A'.repeat(43)]]}]);
 assert.ok(window.document.querySelector('form[action="https://celebix.net/api/platform-checkout/handoff"]'));
 assert.ok(!JSON.stringify(journal()).includes('handoff'));
 });
});
test('uncertain retry and remount retain one operation and reject external checkout URLs',async()=>{
 const {PlatformCheckoutButton}=compile<any>(new URL('./PlatformCheckoutButton.tsx',import.meta.url));
 await withEditor(async({window,container,render,click})=>{const operations:string[]=[],forms:unknown[]=[];window.HTMLFormElement.prototype.submit=function(){forms.push(this.action);};let ids=0;
 const props={storeId:STORE,kind:'tool',offerId:'restock',term:'once',createOperationId:()=>{ids++;return OP;},fetcher:async(_url:string,init:RequestInit)=>{operations.push(JSON.parse(String(init.body)).operationId);if(operations.length===1)throw Error('private response');return Response.json({orderId:ORDER,handoff:'A'.repeat(43),checkoutUrl:'https://evil.test'});}};
 await render(React.createElement(PlatformCheckoutButton,props));await click(container.querySelector('button')!);await render(null);await render(React.createElement(PlatformCheckoutButton,props));await click(container.querySelector('button')!);assert.deepEqual(operations,[OP,OP]);assert.equal(ids,1);assert.equal(forms.length,0);assert.match(container.textContent??'',/yeniden/i);
 });
});
