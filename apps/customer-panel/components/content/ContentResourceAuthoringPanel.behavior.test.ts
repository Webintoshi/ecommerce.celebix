import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import React,{createElement} from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import {captureContentResourceApplyContext} from '../../lib/content-resource-authoring-ui/controller.ts';
import * as recovery from '../../lib/content-resource-authoring-ui/recovery.ts';

const ID='11111111-1111-4111-8111-111111111111',OUTLINE_ID='22222222-2222-4222-8222-222222222222',DRAFT_ID='33333333-3333-4333-8333-333333333333';
const STORE_ID='44444444-4444-4444-8444-444444444444';
const target={kind:'blog_post' as const,draftId:ID,recordId:null,recordVersion:null};
const values={name:'Bakım',slug:'bakim',locale:'tr',body:'<p>Eski metin</p>',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft' as const};
const outline={title:'Bakım rehberi',sections:[{heading:'Günlük bakım',points:['Temizlik']}]};

test('outline is reviewed before one explicit draft request; preview applies only selected fields and never saves',async()=>{
 const browser=new Window({url:'https://panel.example.test/content/blog/new'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,HTMLSelectElement:browser.HTMLSelectElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client');
 const source=await readFile(new URL('./ContentResourceAuthoringPanel.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const compiled={exports:{} as Record<string,unknown>},requests:unknown[]=[],operationIds:string[]=[],applied:unknown[]=[];
 const base=(id:string,stage:'outline'|'draft',status:'pending'|'completed')=>({id,target,stage,status,sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:01.000Z',finishedAt:status==='pending'?null:'2026-09-29T00:00:01.000Z'});
 const completedDraft=(id:string)=>({...base(id,'draft','completed'),outline:null,draft:{sourceFingerprint:'a'.repeat(64),values:{body:'<p>Yeni metin</p>',seoTitle:'Bakım rehberi'},citations:[],suggestions:[]},usage:{inputTokens:15,outputTokens:20,totalTokens:35}});
 const generate=async(request:any,key:string)=>{requests.push(request);operationIds.push(key);return request.stage==='outline'?{...base(key,'outline','completed'),outline,draft:null}:requests.length===2?{...base(key,'draft','pending'),outline:null,draft:null}:completedDraft(key);};
 Function('require','module','exports',code)((name:string)=>{
  if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;
  if(name.includes('content-resource-authoring-ui/client'))return{contentResourceAuthoringClient:{generate,get:async()=>completedDraft(operationIds[1]!)},ContentResourceAuthoringApiError:class extends Error{}};
  if(name.includes('content-resource-authoring-ui/controller'))return{captureContentResourceApplyContext};
  if(name.includes('content-resource-authoring-ui/recovery'))return recovery;
  if(name.includes('ContentResearchPanel'))return{ContentResearchPanel:()=>null};
  throw Error(name);
 },compiled,compiled.exports);
 const Panel=compiled.exports.ContentResourceAuthoringPanel as React.ComponentType<any>;
 const container=browser.document.createElement('div') as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container);
 const props={storeId:STORE_ID,target,values,selectionText:null,researchEnabled:false,onApply:(value:unknown)=>applied.push(value)};
 const render=async(next:Record<string,unknown>={})=>{await React.act(async()=>root.render(createElement(Panel,{...props,...next})));};
 const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));assert.ok(button,label);await React.act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,0));});};
 const change=async(label:string,value:string)=>{const input=container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;assert.ok(input,`${label}: ${container.textContent}`);await React.act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new browser.Event('input',{bubbles:true}) as unknown as Event);});};
 try{
  await render();await click('Yapay zekâ ile yaz');await change('Yazı konusu','Altın bakımı');await change('Yazı amacı','Bilgilendirme');
  await click('1. Yazı planı oluştur');assert.equal(requests.length,1);assert.equal((requests[0] as any).stage,'outline');assert.equal(container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"]'),null);
  await change('Plan başlığı','Düzenlenmiş bakım rehberi');
  const seo=container.querySelectorAll('fieldset input[type="checkbox"]')[3] as HTMLInputElement;assert.ok(seo);await React.act(async()=>seo.click());
  await click('2. Önizleme oluştur');assert.equal(requests.length,2);assert.equal((requests[1] as any).reviewedOutline.title,'Düzenlenmiş bakım rehberi');assert.deepEqual((requests[1] as any).fields,['body','seoTitle']);assert.equal(applied.length,0);assert.equal(container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"]'),null);
  await click('Üretim durumunu yenile');assert.ok(container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"]'));assert.equal(requests.length,2,'refresh never sends a second model request');
  const bodyChoice=container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"] input[type="checkbox"]') as HTMLInputElement;assert.ok(bodyChoice);await React.act(async()=>bodyChoice.click());
  await click('Seçilenleri taslağa uygula');assert.equal(applied.length,1);assert.equal((applied[0] as any).generation.id,operationIds[1]);assert.deepEqual((applied[0] as any).selectedFields,['seoTitle']);
  await click('2. Önizleme oluştur');await render({values:{...values,body:'<p>Değişen metin</p>'}});await click('Seçilenleri taslağa uygula');assert.equal(applied.length,1);assert.match(container.textContent??'',/Yeni bir önizleme oluşturun/);
 }finally{await React.act(async()=>root.unmount());for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});

test('a POST whose reply is lost keeps its operation ID and permits only GET recovery',async()=>{
 const browser=new Window({url:'https://panel.example.test/content/blog/new'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,HTMLSelectElement:browser.HTMLSelectElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client');
 const source=await readFile(new URL('./ContentResourceAuthoringPanel.tsx',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,compiled={exports:{} as Record<string,unknown>};
 const posts:string[]=[],gets:string[]=[];
 Function('require','module','exports',code)((name:string)=>{
  if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;
  if(name.includes('content-resource-authoring-ui/client'))return{contentResourceAuthoringClient:{generate:async(_request:unknown,key:string)=>{posts.push(key);throw Error('reply lost');},get:async(key:string)=>{gets.push(key);if(gets.length===1)throw Object.assign(Error('not found'),{code:'operation_not_found'});if(gets.length===2)throw Error('network lost');return{id:key,target,stage:'outline',status:'completed',outline,draft:null,sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:01.000Z',finishedAt:'2026-09-29T00:00:01.000Z'};}},ContentResourceAuthoringApiError:class extends Error{}};
  if(name.includes('content-resource-authoring-ui/controller'))return{captureContentResourceApplyContext};
  if(name.includes('content-resource-authoring-ui/recovery'))return recovery;
  if(name.includes('ContentResearchPanel'))return{ContentResearchPanel:()=>null};
  throw Error(name);
 },compiled,compiled.exports);
 const Panel=compiled.exports.ContentResourceAuthoringPanel as React.ComponentType<any>,container=browser.document.createElement('div')as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container);
 const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));assert.ok(button,label);await React.act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,0));});};
 const change=async(label:string,value:string)=>{const input=container.querySelector(`[aria-label="${label}"]`)as HTMLInputElement;assert.ok(input,label);await React.act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new browser.Event('input',{bubbles:true})as unknown as Event);});};
 try{
  const blank={...values,name:'',slug:''};
  await React.act(async()=>root.render(createElement(Panel,{storeId:STORE_ID,target,values:blank,selectionText:null,researchEnabled:false,onApply:()=>assert.fail('unexpected apply')})));
  await click('Yapay zekâ ile yaz');await change('Yazı konusu','Altın bakımı');await change('Yazı amacı','Bilgilendirme');
  const outlineButton=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('1. Yazı planı oluştur'))!;
  assert.equal(outlineButton.disabled,true);assert.match(container.textContent??'',/içerik adı.*URL anahtarı.*dil/i);assert.equal(browser.sessionStorage.length,0);assert.equal(posts.length,0);
  await React.act(async()=>root.render(createElement(Panel,{storeId:STORE_ID,target,values,selectionText:null,researchEnabled:false,onApply:()=>assert.fail('unexpected apply')})));
  assert.equal(outlineButton.disabled,false);await click('1. Yazı planı oluştur');
  assert.equal(posts.length,1);assert.match(container.textContent??'',new RegExp(posts[0]));
  assert.ok(container.textContent?.includes('Üretim durumunu yenile'));
  const stored=Array.from({length:browser.sessionStorage.length},(_,index)=>browser.sessionStorage.getItem(browser.sessionStorage.key(index)!)??'').join(' ');
  assert.ok(stored.includes(posts[0]));assert.ok(!stored.includes('Altın bakımı'),'only operation identity, never draft text, is persisted');
  await click('1. Yazı planı oluştur');assert.equal(posts.length,1,'lost reply cannot start a second paid operation');
  await click('Üretim durumunu yenile');assert.deepEqual(gets,[posts[0]]);assert.match(container.textContent??'',new RegExp(posts[0]));
  await click('Üretim durumunu yenile');assert.deepEqual(gets,[posts[0],posts[0]]);assert.equal(posts.length,1);
  await React.act(async()=>root.render(createElement(Panel,{key:'reloaded',storeId:STORE_ID,target,values,selectionText:null,researchEnabled:false,onApply:()=>assert.fail('unexpected apply')})));
  assert.match(container.textContent??'',new RegExp(posts[0]));
  await click('1. Yazı planı oluştur');assert.equal(posts.length,1,'reload cannot bypass the stored operation');
  await click('Üretim durumunu yenile');assert.deepEqual(gets,[posts[0],posts[0],posts[0]]);assert.ok(container.textContent?.includes('Yazı planı'));
 }finally{await React.act(async()=>root.unmount());for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});

test('unknown stays locked; invalid output permits a fresh ID only after explicit preparation',async()=>{
 const browser=new Window({url:'https://panel.example.test/content/blog/new'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,HTMLSelectElement:browser.HTMLSelectElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client');
 const source=await readFile(new URL('./ContentResourceAuthoringPanel.tsx',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,compiled={exports:{} as Record<string,unknown>};
 const posts:string[]=[],gets:string[]=[],locks:boolean[]=[];
 Function('require','module','exports',code)((name:string)=>{
  if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;
  if(name.includes('content-resource-authoring-ui/client'))return{contentResourceAuthoringClient:{generate:async(_request:unknown,key:string)=>{posts.push(key);throw Error('reply lost');},get:async(key:string)=>{gets.push(key);return{id:key,target,stage:'outline',status:gets.length===1?'unknown':'failed',outline:null,draft:null,sourceFingerprint:'a'.repeat(64),usage:null,safeCode:gets.length===1?'commit_unknown':'invalid_output',createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:01.000Z',finishedAt:'2026-09-29T00:00:01.000Z'};}},ContentResourceAuthoringApiError:class extends Error{}};
  if(name.includes('content-resource-authoring-ui/controller'))return{captureContentResourceApplyContext};
  if(name.includes('content-resource-authoring-ui/recovery'))return recovery;
  if(name.includes('ContentResearchPanel'))return{ContentResearchPanel:()=>null};
  throw Error(name);
 },compiled,compiled.exports);
 const Panel=compiled.exports.ContentResourceAuthoringPanel as React.ComponentType<any>,container=browser.document.createElement('div')as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container);
 const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));assert.ok(button,label);await React.act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,0));});};
 const change=async(label:string,value:string)=>{const input=container.querySelector(`[aria-label="${label}"]`)as HTMLInputElement;assert.ok(input,label);await React.act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new browser.Event('input',{bubbles:true})as unknown as Event);});};
 try{
  await React.act(async()=>root.render(createElement(Panel,{storeId:STORE_ID,target,values,selectionText:null,researchEnabled:false,onOperationLockChange:(value:boolean)=>locks.push(value),onApply:()=>assert.fail('unexpected apply')})));
  await click('Yapay zekâ ile yaz');await change('Yazı konusu','Altın bakımı');await change('Yazı amacı','Bilgilendirme');await click('1. Yazı planı oluştur');
  await click('Üretim durumunu yenile');assert.match(container.textContent??'',/Sonuç belirsiz/);assert.equal((container.querySelector('button')?.textContent??'').includes('Yeni denemeye hazırlan'),false);
  await click('1. Yazı planı oluştur');assert.equal(posts.length,1,'unknown cannot send another POST');assert.deepEqual(gets,[posts[0]]);
  await click('Üretim durumunu yenile');assert.match(container.textContent??'',/Başarısız \(invalid_output\)/);assert.equal(posts.length,1);assert.equal(locks.at(-1),false);
  await click('1. Yazı planı oluştur');assert.equal(posts.length,1,'terminal failure still requires explicit preparation');
  await click('Yeni denemeye hazırlan');assert.match(container.textContent??'',/Yeni bir işlem başlatabilirsiniz/);
  await click('1. Yazı planı oluştur');assert.equal(posts.length,2);assert.notEqual(posts[0],posts[1]);
 }finally{await React.act(async()=>root.unmount());for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});
