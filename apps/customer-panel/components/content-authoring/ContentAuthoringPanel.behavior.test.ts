import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as React from 'react';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import * as runtime from 'react/jsx-runtime';
import {Window} from 'happy-dom';
import ts from 'typescript';
import * as state from '../../lib/content-authoring-ui/state.ts';
import * as client from '../../lib/content-authoring-ui/client.ts';
import * as render from '../../lib/server-content-authoring/render.ts';
const id='00000000-0000-4000-8000-000000000001';
const generation={id:'00000000-0000-4000-8000-000000000002',draftId:id,productId:null,status:'completed',draft:{description:[{type:'paragraph',children:[{type:'text',text:'Generated'}]}],seoTitle:'Generated SEO',seoDescription:'Generated SEO description',suggestions:[],claims:[],sourceFingerprint:'a'.repeat(64)},sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z',finishedAt:'2026-09-29T00:00:00.000Z'} as const;
async function mount(verify:(container:HTMLElement,mutate:()=>void,resolve:()=>void,controls:{switchStore():Promise<void>;switchProduct():Promise<void>})=>Promise<void>,failureCode?:string){const browser=new Window({url:'https://panel.example.test/products/new'});const globals=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value});}let storeKey='shop',productId:string|null=null;const source=await readFile(new URL('./ContentAuthoringPanel.tsx',import.meta.url),'utf8');const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const compiled={exports:{} as Record<string,unknown>};Function('require','module','exports',output)((name:string)=>{if(name==='react')return React;if(name==='react/jsx-runtime')return runtime;if(name==='@/components/panel/PanelLayoutClient')return {usePanelChromeModel:()=>({activeStoreSelectionKey:storeKey})};if(name==='@/lib/content-authoring-ui/client')return client;if(name==='@/lib/content-authoring-ui/state')return state;if(name==='@/lib/server-content-authoring/render')return render;if(name.endsWith('.css'))return {default:{}};throw new Error(name);},compiled,compiled.exports);const Panel=compiled.exports.ContentAuthoringPanel as React.ComponentType<Record<string,unknown>>;let description='Manual';let done!:(value:typeof generation)=>void;const api={generate:(request:unknown)=>{container.dataset.request=JSON.stringify(request);container.dataset.generateCalls=String(Number(container.dataset.generateCalls??0)+1);return failureCode?Promise.reject(new client.ContentAuthoringApiError(failureCode)):new Promise<typeof generation>(resolve=>{done=resolve;});},get:async()=>generation};const container=browser.document.createElement('div') as unknown as HTMLElement;const bridge={capture:()=>({request:{draftId:id,productId,productVersion:null,profileVersion:null,currentDraft:{title:'Burgu',description,seoTitle:'Manual SEO'},action:'improve',fields:['description'],locale:'tr-TR',tone:'neutral',length:'medium',note:'',selection:null},lifecycle:{sessionId:'session',draftRevision:description,selection:null}}),apply:(field:string)=>{container.dataset.applied=JSON.stringify([...JSON.parse(container.dataset.applied??'[]'),field]);if(field==='description'){description='Generated';container.dataset.description=description;}return true;}};browser.document.body.append(container as unknown as Parameters<typeof browser.document.body.append>[0]);container.dataset.description=description;const root=createRoot(container);try{await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api}))));await verify(container,()=>{description='Changed';container.dataset.description=description;},()=>done(generation),{switchStore:async()=>{storeKey="other";await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api}))));},switchProduct:async()=>{productId="00000000-0000-4000-8000-000000000004";await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api}))));}});}finally{await act(async()=>root.unmount());for(const [key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}}
function button(container:HTMLElement,text:string){const element=[...container.querySelectorAll('button')].find(value=>value.textContent===text);assert.ok(element);return element;}
test('late result remains a preview and refuses apply after a manual edit',async()=>{await mount(async(container,mutate,resolve)=>{await act(async()=>button(container,'İçerik oluştur').click());mutate();await act(async()=>resolve());assert.match(container.textContent??'',/Generated/);await act(async()=>button(container,'Açıklama alanına uygula').click());assert.equal(container.dataset.description,'Changed');assert.match(container.querySelector('[role="alert"]')?.textContent??'',/Alanlar değişti/);});});
test('preview only changes the selected field when applied and never submits a save',async()=>{await mount(async(container,_mutate,resolve)=>{let submitted=0;container.addEventListener('submit',()=>submitted++);await act(async()=>button(container,'İçerik oluştur').click());await act(async()=>resolve());assert.equal(container.dataset.description,'Manual');assert.doesNotMatch(container.textContent??'',/Generated SEO/);await act(async()=>button(container,'Açıklama alanına uygula').click());assert.equal(container.dataset.description,'Generated');assert.equal(submitted,0);});});

for(const code of ["connection_missing","provider_failed"] as const) test(`${code} leaves manual fields unchanged and exposes a useful safe error`,async()=>{
 await mount(async(container)=>{
  await act(async()=>button(container,"İçerik oluştur").click());
  assert.equal(container.dataset.description,"Manual");
  assert.ok(container.querySelector('[role="alert"]'));
  assert.equal(button(container,"İçerik oluştur").disabled,false);
  if(code==="connection_missing") assert.equal(container.querySelector('a')?.getAttribute('href'),"/settings/artificial-intelligence");
 },code);
});
for(const lifecycle of ["switchStore","switchProduct"] as const) test(`late generation is hidden after ${lifecycle}`,async()=>{
 await mount(async(container,_mutate,resolve,controls)=>{
  await act(async()=>button(container,"İçerik oluştur").click());
  await controls[lifecycle]();
  await act(async()=>resolve());
  assert.equal(container.dataset.description,"Manual");
  assert.equal(container.querySelector('[aria-label="AI içerik önizlemesi"]'),null);
 });
});


test('two rapid generate clicks reserve only one operation while the preview is pending',async()=>mount(async(container,_mutate,resolve)=>{
 await act(async()=>{button(container,'İçerik oluştur').click();button(container,'İçerik oluştur').click();});
 assert.equal(container.dataset.generateCalls,'1');await act(async()=>resolve());
}));


test('generation settings stay outside parent dirty state and one bundle applies only chosen preview fields',async()=>{
 await mount(async(container,_mutate,resolve)=>{
  const fields=[...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async()=>{fields[1].click();fields[2].click();});
  const details=container.querySelector('details')!;await act(async()=>details.querySelector('summary')!.click());
  const tone=details.querySelector('select')!;await act(async()=>{tone.value='professional';tone.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(container.dataset.dirty,undefined,'request fields and optional tone must not dirty normal save form');
  await act(async()=>button(container,'İçerik oluştur').click());await act(async()=>resolve());
  assert.deepEqual(JSON.parse(container.dataset.request!).fields,['description','seoTitle','seoDescription']);
  const preview=container.querySelector('[aria-label="AI içerik önizlemesi"]')!;
  const choices=[...preview.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async()=>{choices[0].click();choices[2].click();});
  await act(async()=>button(container,'Seçili alanlara uygula').click());
  assert.deepEqual(JSON.parse(container.dataset.applied!),['seoTitle']);
  assert.equal(container.dataset.description,'Manual');assert.equal(container.dataset.dirty,undefined);
 });
});
