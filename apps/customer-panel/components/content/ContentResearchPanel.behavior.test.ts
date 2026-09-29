import assert from'node:assert/strict';
import test from'node:test';
import{readFile}from'node:fs/promises';
import{Window}from'happy-dom';
import React from'react';
import*as jsx from'react/jsx-runtime';
import ts from'typescript';
import{parseContentResearchResult}from'@celebix/saas-contracts';

const ID='11111111-1111-4111-8111-111111111111',TARGET={kind:'blog_post' as const,draftId:ID,recordId:null,recordVersion:null};
test('research panel displays only retained source metadata, measured usage and explicit completion',async()=>{
 const browser=new Window({url:'https://panel.example.test/content/blog/new'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client'),source=await readFile(new URL('./ContentResearchPanel.tsx',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,compiled={exports:{} as Record<string,unknown>};
 Function('require','module','exports',code)((name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='@celebix/saas-contracts'?{parseContentResearchResult}:(()=>{throw Error(name);})(),compiled,compiled.exports);
 const Panel=compiled.exports.ContentResearchPanel as React.ComponentType<any>,container=browser.document.createElement('div') as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container),completed:(string|null)[]=[],calls:unknown[]=[];
 const result={operationId:ID,status:'completed',sources:[{id:ID,originalUrl:'https://example.org/start',finalUrl:'https://example.org/final',title:'Kaynak',fetchedAt:'2026-09-29T00:00:00.000Z',contentSha256:'a'.repeat(64),byteCount:100}],usage:{sourcesAttempted:1,fetchedBytes:100,extractedBytes:24,elapsedMs:250},safeCode:null};
 let payload:unknown=result;const oldFetch=globalThis.fetch;globalThis.fetch=(async(_url,init)=>{calls.push(init);return Response.json(payload);}) as typeof fetch;
 try{
  await React.act(async()=>root.render(React.createElement(Panel,{target:TARGET,onCompleted:(id:string|null)=>completed.push(id)})));
  const area=container.querySelector('textarea[aria-label="Kaynak adresleri"]') as HTMLTextAreaElement;assert.ok(area);
  await React.act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype,'value')!.set!.call(area,'https://example.org/start');area.dispatchEvent(new browser.Event('input',{bubbles:true}) as unknown as Event);});
  const button=[...container.querySelectorAll('button')].find(item=>item.textContent==='Kaynakları getir');assert.ok(button);
  await React.act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(calls.length,1);assert.deepEqual(completed,[null,null,ID]);assert.match(container.textContent??'',/https:\/\/example.org\/start → https:\/\/example.org\/final/);assert.match(container.textContent??'',/2026-09-29T00:00:00.000Z/);assert.match(container.textContent??'',/24 çıkarılan metin baytı/);assert.equal(container.textContent?.includes('extractedText'),false);
  payload={operationId:ID,status:'unknown',sources:[],usage:null,safeCode:'provider_timeout'};
  await React.act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(calls.length,2);assert.equal(completed.at(-1),null);assert.match(container.textContent??'',/Ölçüm bilinmiyor/);
 }finally{globalThis.fetch=oldFetch;await React.act(async()=>root.unmount());for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});
