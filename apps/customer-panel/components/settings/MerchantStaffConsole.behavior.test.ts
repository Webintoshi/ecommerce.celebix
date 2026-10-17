import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';
import {compile,withEditor} from './design/design-editor-test-utils.ts';
import type {MerchantStaffClient} from '../../lib/merchant-staff-ui/client.ts';
const staffModule=compile<any>(new URL('../../lib/merchant-staff-ui/model.ts',import.meta.url));
const {MerchantStaffConsole:Console}=compile<any>(new URL('./MerchantStaffConsole.tsx',import.meta.url),{'../../lib/merchant-staff-ui/model.ts':staffModule,'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)}});
const ID='11111111-1111-4111-8111-111111111111';const state={version:4,enabled:true,staff:[{staffId:ID,displayName:'Ada',phoneMasked:'+90 ••• 2233',role:'editor' as const,enabled:true,version:2,phoneVerified:false}]};
function client(overrides:Partial<MerchantStaffClient>={}):MerchantStaffClient{return{state:async()=>state,create:async()=>state,update:async()=>state,revoke:async()=>state,delete:async()=>state,...overrides};}
async function settle(){await React.act(async()=>{await new Promise(r=>setTimeout(r,0));});}
async function submit(window:any,container:HTMLElement){await React.act(async()=>container.querySelector('form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
test('owner staff list creates phone name role only and uses original optimistic store version',async()=>{const calls:any[]=[];await withEditor(async({window,container,render,click,change})=>{await render(React.createElement(Console,{client:client({create:async input=>{calls.push(input);return state;}})}));await settle();assert.match(container.textContent!,/Ada/);assert.match(container.textContent!,/Telefon doğrulaması bekleniyor/);await click(container.querySelector('[data-add-staff]')!);assert.equal(container.querySelector('input[type="email"]'),null);await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await change(container.querySelector<HTMLInputElement>('[name="displayName"]')!,'Grace');await change(container.querySelector<HTMLSelectElement>('[name="role"]')!,'cashier');await submit(window,container);assert.equal(calls.length,1);assert.equal(calls[0].phone,'+905551112233');assert.equal(calls[0].displayName,'Grace');assert.equal(calls[0].role,'cashier');assert.equal(calls[0].expectedVersion,4);assert.equal(calls[0].storeId,undefined);});});
test('failed create retains fields and original operation, no automatic requests',async()=>{const calls:any[]=[];await withEditor(async({window,container,render,click,change})=>{await render(React.createElement(Console,{client:client({create:async input=>{calls.push(input);throw Error('SQL SECRET');}})}));await settle();await click(container.querySelector('[data-add-staff]')!);await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await change(container.querySelector<HTMLInputElement>('[name="displayName"]')!,'Grace');await submit(window,container);await submit(window,container);assert.equal(calls[0].operationId,calls[1].operationId);assert.equal(container.querySelector<HTMLInputElement>('[name="phone"]')!.value,'0555 111 22 33');assert.equal(container.querySelector<HTMLInputElement>('[name="displayName"]')!.value,'Grace');assert.equal(container.textContent!.includes('SECRET'),false);assert.ok(container.querySelector('[role="alert"]'));await new Promise(r=>setTimeout(r,20));assert.equal(calls.length,2);});});
test('edit contains no mutable phone and revoke requires explicit confirmation with row version',async()=>{const calls:any[]=[];await withEditor(async({window,container,render,click,change})=>{await render(React.createElement(Console,{client:client({update:async(id,input)=>{calls.push({id,input});return state;},revoke:async(id,input)=>{calls.push({id,input});return state;}})}));await settle();await click(container.querySelector('[data-edit-staff]')!);assert.equal(container.querySelector('input[name="phone"]'),null);await change(container.querySelector<HTMLInputElement>('[name="displayName"]')!,'Ada New');await submit(window,container);assert.equal(calls[0].id,ID);assert.equal(calls[0].input.expectedVersion,2);assert.equal(calls[0].input.phone,undefined);await click(container.querySelector('[data-revoke-staff]')!);assert.equal(calls.length,1);await submit(window,container);assert.equal(calls[1].input.expectedVersion,2);});});
test('disabled staged state has no staff mutation actions',async()=>{let writes=0;await withEditor(async({container,render})=>{await render(React.createElement(Console,{client:client({state:async()=>({...state,enabled:false}),create:async()=>{writes++;return state;}})}));await settle();assert.equal(container.querySelector('[data-add-staff]'),null);assert.equal(container.querySelector('[data-edit-staff]'),null);assert.match(container.textContent!,/henüz etkin değil/);assert.equal(writes,0);});});
test('version conflict requires explicit fresh list then explicit version adoption and a new operation',async()=>{
 const {MerchantStaffError}=staffModule;
 let reads=0;const calls:any[]=[];
 await withEditor(async({window,container,render,click,change})=>{
  await render(React.createElement(Console,{client:client({state:async()=>++reads===1?state:{...state,version:5},create:async input=>{calls.push(input);if(calls.length===1)throw new MerchantStaffError('version_conflict');return state;}})}));await settle();
  await click(container.querySelector('[data-add-staff]')!);await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');await change(container.querySelector<HTMLInputElement>('[name="displayName"]')!,'Grace');await submit(window,container);
  const button=(label:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===label)!;
  assert.equal(button('Güncel sürümü kullan').disabled,true);await click(button('Güncel listeyi yükle'));assert.equal(button('Güncel sürümü kullan').disabled,false);assert.equal(calls.length,1);await click(button('Güncel sürümü kullan'));await submit(window,container);
  assert.equal(calls[1].expectedVersion,5);assert.notEqual(calls[0].operationId,calls[1].operationId);assert.equal(calls[1].displayName,'Grace');
 });
});

test('legacy staff without personal phone keeps update and revoke but no owner phone assignment',async()=>{await withEditor(async({container,render,click})=>{await render(React.createElement(Console,{client:client({state:async()=>({...state,staff:[{...state.staff[0],phoneMasked:null,membershipId:ID}]})})}));await settle();assert.match(container.textContent!,/Telefon bağlanmadı/);assert.equal(container.textContent!.includes('Telefon tanımla'),false);assert.ok(container.querySelector('[data-revoke-staff]'));await click(container.querySelector('[data-edit-staff]')!);assert.equal(container.querySelector('[name="phone"]'),null);});});

const disabledState={...state,staff:[{...state.staff[0],enabled:false},{...state.staff[0],staffId:'33333333-3333-4333-8333-333333333333',displayName:'Grace'}]};
test('only disabled staff can be deleted after explicit confirmation and cancel performs no mutation',async()=>{
 const calls:any[]=[];
 await withEditor(async({window,container,render,click})=>{
  await render(React.createElement(Console,{client:client({state:async()=>disabledState,delete:async(id,input)=>{calls.push({id,input});return {...state,version:5,staff:[disabledState.staff[1]]};}})}));await settle();
  const button=()=>container.querySelector('[data-delete-staff]')!;
  assert.equal(container.querySelectorAll('[data-delete-staff]').length,1);assert.match(button().closest('tr')!.textContent!,/Ada/);
  await click(button());assert.equal(calls.length,0);assert.match(container.querySelector('dialog')!.textContent!,/Geçmiş işlemler korunur/);assert.equal(container.querySelector('input'),null);
  await click(Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Vazgeç')!);assert.equal(container.querySelector('form'),null);assert.equal(calls.length,0);
  await click(button());await React.act(async()=>container.querySelector('dialog')!.dispatchEvent(new window.Event('cancel',{cancelable:true}) as unknown as Event));assert.equal(container.querySelector('form'),null);assert.equal(calls.length,0);
  await click(button());await submit(window,container);assert.equal(calls.length,1);assert.equal(calls[0].id,ID);assert.equal(calls[0].input.expectedVersion,2);assert.equal(container.querySelector('tbody')!.textContent!.includes('Ada'),false);assert.match(container.querySelector('tbody')!.textContent!,/Grace/);assert.match(container.textContent!,/Personel kaydı silindi/);
 });
});
test('uncertain staff deletion preserves the row and retries the original operation without automatic requests',async()=>{
 const calls:any[]=[];const {MerchantStaffError}=staffModule;
 await withEditor(async({window,container,render,click})=>{
  await render(React.createElement(Console,{client:client({state:async()=>disabledState,delete:async(id,input)=>{calls.push({id,input});throw new MerchantStaffError('operation_uncertain');}})}));await settle();await click(container.querySelector('[data-delete-staff]')!);await submit(window,container);assert.match(container.querySelector('tbody')!.textContent!,/Ada/);assert.ok(container.querySelector('[role="alert"]'));await submit(window,container);assert.equal(calls.length,2);assert.equal(calls[0].input.operationId,calls[1].input.operationId);await new Promise(r=>setTimeout(r,10));assert.equal(calls.length,2);
 });
});
test('staff deletion version conflict requires an explicit fresh version and changes the operation key',async()=>{
 let reads=0;const calls:any[]=[];const {MerchantStaffError}=staffModule;
 await withEditor(async({window,container,render,click})=>{
  await render(React.createElement(Console,{client:client({state:async()=>++reads===1?disabledState:{...disabledState,staff:[{...disabledState.staff[0],version:3},disabledState.staff[1]]},delete:async(id,input)=>{calls.push({id,input});if(calls.length===1)throw new MerchantStaffError('version_conflict');return {...state,staff:[disabledState.staff[1]]};}})}));await settle();await click(container.querySelector('[data-delete-staff]')!);await submit(window,container);
  const button=(label:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===label)!;
  assert.equal(container.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled,true);await click(button('Güncel listeyi yükle'));assert.equal(calls.length,1);await click(button('Güncel sürümü kullan'));await submit(window,container);assert.equal(calls[1].input.expectedVersion,3);assert.notEqual(calls[1].input.operationId,calls[0].input.operationId);
 });
});

test('lower package offers cashier upgrade and blocks a stale role choice without changing ordinary staff',async()=>{
 let writes=0;
 await withEditor(async({window,container,render,click,change})=>{
  await render(React.createElement(Console,{cashierAvailable:false,client:client({create:async()=>{writes++;return state;}})}));await settle();
  await click(container.querySelector('[data-add-staff]')!);
  assert.equal(container.querySelector<HTMLOptionElement>('option[value="cashier"]')!.disabled,true);
  assert.ok(container.querySelector('a[href="/upgrade?feature=cashier"]'));
  await change(container.querySelector<HTMLInputElement>('[name="phone"]')!,'0555 111 22 33');
  await change(container.querySelector<HTMLInputElement>('[name="displayName"]')!,'Grace');
  await change(container.querySelector<HTMLSelectElement>('[name="role"]')!,'cashier');await submit(window,container);
  assert.equal(writes,0);
  await change(container.querySelector<HTMLSelectElement>('[name="role"]')!,'editor');await submit(window,container);assert.equal(writes,1);
 });
});
