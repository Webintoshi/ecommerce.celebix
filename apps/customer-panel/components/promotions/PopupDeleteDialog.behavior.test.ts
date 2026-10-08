import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {compile,withEditor} from '../settings/design/design-editor-test-utils.ts';
const campaignId='00000000-0000-4000-8000-000000000001',intent={campaignId,expectedVersion:4};
class ApiError extends Error {constructor(readonly code:string){super(code);}}
async function screen(run:(context:any)=>Promise<void>,deletePopup:(input:any)=>Promise<any>,recovery=false){
 const {PopupDeleteDialog}=compile<any>(new URL('./PopupDeleteDialog.tsx',import.meta.url),{'../../lib/store-engagement-ui/client':{StoreEngagementApiError:ApiError}});
 await withEditor(async ctx=>{
  const trigger=ctx.window.document.createElement('button');trigger.textContent='Popup sil';ctx.window.document.body.prepend(trigger);trigger.focus();
  let closed=0;const deleted:any[]=[];
  await ctx.render(React.createElement(PopupDeleteDialog,{intent,name:'Karşılama',api:{deletePopup,hasUnresolved:()=>false},recovery,returnFocusRef:{current:trigger},onCancel:()=>{closed++;},onDeleted:(receipt:any)=>deleted.push(receipt),onMutationChanged:()=>{}}));
  const settle=async()=>React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  const click=async(label:string)=>{const button=Array.from(ctx.container.querySelectorAll('button')).find(b=>b.textContent?.trim()===label);assert.ok(button,label);await ctx.click(button);await settle();};
  await run({...ctx,settle,click,deleted,closed:()=>closed});trigger.remove();
 });
}
test('delete confirmation cancellation never writes and explicit confirmation deletes original version',async()=>{
 const writes:any[]=[];
 await screen(async({click,deleted,closed,container})=>{
  assert.equal(container.querySelector('[role="dialog"]')?.getAttribute('aria-modal'),'true');
  await click('Vazgeç');assert.equal(writes.length,0);assert.equal(closed(),1);
  await click('Sil');assert.deepEqual(writes,[intent]);assert.deepEqual(deleted,[{campaignId,deleted:true}]);
 },async input=>{writes.push(input);return{campaignId,deleted:true};});
});
test('lost delete result keeps dialog open and retry uses exact identity and CAS',async()=>{
 const writes:any[]=[];let attempt=0;
 await screen(async({click,deleted,closed,container,window,settle})=>{
  await click('Sil');assert.equal(deleted.length,0);assert.ok(container.querySelector('[role="alert"]'));
  assert.equal(container.querySelector('[aria-label="Vazgeç ve kapat"]').disabled,true);
  assert.equal((Array.from(container.querySelectorAll('button')).find((b:any)=>b.textContent.trim()==='Vazgeç') as HTMLButtonElement).disabled,true);
  await click('Vazgeç');assert.equal(closed(),0);
  await React.act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await settle();assert.equal(closed(),0);
  await click('Silmeyi doğrula');assert.deepEqual(writes,[intent,intent]);assert.equal(deleted.length,1);
 },async input=>{writes.push(input);if(++attempt===1)throw Error('lost');return{campaignId,deleted:true};});
});
test('reload recovery cannot discard unresolved deletion and does not automatically dispatch',async()=>{
 let writes=0;
 await screen(async({click,closed,deleted})=>{
  assert.equal(writes,0);await click('Vazgeç');assert.equal(closed(),0);
  await click('Silmeyi doğrula');assert.equal(writes,1);assert.equal(deleted.length,1);
 },async()=>{writes++;return{campaignId,deleted:true};},true);
});

test('storage failure before dispatch preserves an available cancel action',async()=>{
 await screen(async({click,closed,container})=>{await click('Sil');assert.equal(container.querySelector('[aria-label="Vazgeç ve kapat"]').disabled,false);await click('Vazgeç');assert.equal(closed(),1);},async()=>{throw new ApiError('storage_unavailable');});
});
