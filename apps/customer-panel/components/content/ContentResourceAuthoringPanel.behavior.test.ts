import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import React,{createElement} from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import {captureContentResourceApplyContext} from '../../lib/content-resource-authoring-ui/controller.ts';

const ID='11111111-1111-4111-8111-111111111111',OUTLINE_ID='22222222-2222-4222-8222-222222222222',DRAFT_ID='33333333-3333-4333-8333-333333333333';
const target={kind:'blog_post' as const,draftId:ID,recordId:null,recordVersion:null};
const values={name:'Bakım',slug:'bakim',locale:'tr',body:'<p>Eski metin</p>',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft' as const};
const outline={title:'Bakım rehberi',sections:[{heading:'Günlük bakım',points:['Temizlik']}]};

test('outline is reviewed before one explicit draft request; preview applies only selected fields and never saves',async()=>{
 const browser=new Window({url:'https://panel.example.test/content/blog/new'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,HTMLSelectElement:browser.HTMLSelectElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client');
 const source=await readFile(new URL('./ContentResourceAuthoringPanel.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const compiled={exports:{} as Record<string,unknown>},requests:unknown[]=[],applied:unknown[]=[];
 const completedDraft={id:DRAFT_ID,status:'completed',outline:null,draft:{sourceFingerprint:'a'.repeat(64),values:{body:'<p>Yeni metin</p>',seoTitle:'Bakım rehberi'},citations:[],suggestions:[]},usage:{inputTokens:15,outputTokens:20,totalTokens:35}};
 const generate=async(request:any)=>{requests.push(request);return request.stage==='outline'?{id:OUTLINE_ID,status:'completed',outline,draft:null}:requests.length===2?{id:DRAFT_ID,status:'pending'}:completedDraft;};
 Function('require','module','exports',code)((name:string)=>{
  if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;
  if(name.includes('content-resource-authoring-ui/client'))return{contentResourceAuthoringClient:{generate,get:async()=>completedDraft},ContentResourceAuthoringApiError:class extends Error{}};
  if(name.includes('content-resource-authoring-ui/controller'))return{captureContentResourceApplyContext};
  if(name.includes('ContentResearchPanel'))return{ContentResearchPanel:()=>null};
  throw Error(name);
 },compiled,compiled.exports);
 const Panel=compiled.exports.ContentResourceAuthoringPanel as React.ComponentType<any>;
 const container=browser.document.createElement('div') as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container);
 const props={target,values,selectionText:null,researchEnabled:false,onApply:(value:unknown)=>applied.push(value)};
 const render=async(next:Record<string,unknown>={})=>{await React.act(async()=>root.render(createElement(Panel,{...props,...next})));};
 const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));assert.ok(button,label);await React.act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,0));});};
 const change=async(label:string,value:string)=>{const input=container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;assert.ok(input,label);await React.act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new browser.Event('input',{bubbles:true}) as unknown as Event);});};
 try{
  await render();await click('Yapay zekâ ile yaz');await change('Yazı konusu','Altın bakımı');await change('Yazı amacı','Bilgilendirme');
  await click('1. Yazı planı oluştur');assert.equal(requests.length,1);assert.equal((requests[0] as any).stage,'outline');assert.equal(container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"]'),null);
  await change('Plan başlığı','Düzenlenmiş bakım rehberi');
  const seo=container.querySelectorAll('fieldset input[type="checkbox"]')[3] as HTMLInputElement;assert.ok(seo);await React.act(async()=>seo.click());
  await click('2. Önizleme oluştur');assert.equal(requests.length,2);assert.equal((requests[1] as any).reviewedOutline.title,'Düzenlenmiş bakım rehberi');assert.deepEqual((requests[1] as any).fields,['body','seoTitle']);assert.equal(applied.length,0);assert.equal(container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"]'),null);
  await click('Üretim durumunu yenile');assert.ok(container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"]'));assert.equal(requests.length,2,'refresh never sends a second model request');
  const bodyChoice=container.querySelector('[aria-label="Yapay zekâ içerik önizlemesi"] input[type="checkbox"]') as HTMLInputElement;assert.ok(bodyChoice);await React.act(async()=>bodyChoice.click());
  await click('Seçilenleri taslağa uygula');assert.equal(applied.length,1);assert.equal((applied[0] as any).generation.id,DRAFT_ID);assert.deepEqual((applied[0] as any).selectedFields,['seoTitle']);
  await click('2. Önizleme oluştur');await render({values:{...values,body:'<p>Değişen metin</p>'}});await click('Seçilenleri taslağa uygula');assert.equal(applied.length,1);assert.match(container.textContent??'',/Yeni bir önizleme oluşturun/);
 }finally{await React.act(async()=>root.unmount());for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});
