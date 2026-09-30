import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import React,{createElement} from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import {SeoApiError} from '../../lib/seo-ui/client.ts';
import * as model from '../../lib/seo-ui/model.ts';
const resource={id:'11111111-1111-4111-8111-111111111111',kind:'product',name:'Altın yüzük',path:'/products/altin-yuzuk',locale:'tr',status:'active',version:4,seoVersion:2,title:null,description:null,canonicalPath:null,indexing:'inherit',effectiveTitle:'Altın yüzük',effectiveDescription:'Eski açıklama',effectiveCanonicalPath:'/products/altin-yuzuk',allowIndex:true,imageUrl:null,updatedAt:'2026-09-30T00:00:00Z'};
async function setup(canManage:boolean){
 const browser=new Window({url:'https://panel.test/seo/content'});const prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const calls:{payload:any,key:string}[]=[];let failure:string|null=null;
 const client={resources:async()=>({items:[resource],nextCursor:null,total:1}),saveResource:async(_kind:string,_id:string,payload:any,key:string)=>{calls.push({payload,key});if(failure)throw new SeoApiError(failure,409);return{resource:{...resource,...payload,seoVersion:3},replayed:false};}};
 const source=await readFile(new URL('./SeoContent.tsx',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const compiled={exports:{} as Record<string,unknown>};
 Function('require','module','exports',code)((name:string)=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='next/link')return({children,href}:any)=>createElement('a',{href},children);if(name.includes('seo-ui/client'))return{seoClient:client,SeoApiError};if(name.includes('seo-ui/model'))return model;if(name.includes('SeoShared'))return{SeoFrame:({children}:any)=>createElement('section',null,children),SeoFeedback:({error,message}:any)=>createElement('div',null,error,message),ResourcePicker:()=>null};if(name.includes('OrderActionDialog'))return{OrderActionDialog:({open,children,footer,title}:any)=>open?createElement('div',{role:'dialog','aria-label':title},children,footer):null};if(name.endsWith('.css'))return{default:new Proxy({},{get:(_t,key)=>String(key)})};throw Error(name);},compiled,compiled.exports);
 const {createRoot}=await import('react-dom/client');const container=browser.document.createElement('div')as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container);
 await React.act(async()=>root.render(createElement(compiled.exports.SeoContent as React.ComponentType<any>,{canManage,initialKind:'product',resourceId:canManage?undefined:resource.id,client})));
 const click=async(label:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent===label);assert.ok(button,label);await React.act(async()=>button.click());};
 return{container,calls,click,fail:(value:string|null)=>failure=value,async close(){await React.act(async()=>root.unmount());for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}};
}
test('cancel never writes; a failed apply retains identity and conflicts require explicit reload',async()=>{
 const h=await setup(true);try{
 await h.click('Düzenle');await h.click('Vazgeç');assert.equal(h.calls.length,0);
 await h.click('Düzenle');h.fail('unavailable');await h.click('Uygula');await h.click('Uygula');assert.equal(h.calls[0]?.key,h.calls[1]?.key);assert.equal(h.calls[0]?.payload.expectedVersion,4);assert.equal(h.calls[0]?.payload.expectedSeoVersion,2);
 h.fail('version_conflict');await h.click('Uygula');assert.equal([...h.container.querySelectorAll('button')].find(b=>b.textContent==='Uygula')?.disabled,true);assert.match(h.container.textContent??'',/başka bir işlemde değişti/);
 h.fail(null);await h.click('Güncel kaydı yükle');assert.equal([...h.container.querySelectorAll('button')].find(b=>b.textContent==='Uygula')?.disabled,false);
 }finally{await h.close();}
});
test('read-only roles see actual resources with no enabled editor action',async()=>{const h=await setup(false);try{assert.match(h.container.textContent??'',/Altın yüzük/);assert.equal([...h.container.querySelectorAll('button')].find(b=>b.textContent==='Düzenle')?.disabled,true);assert.equal(h.calls.length,0);assert.equal(h.container.querySelector<HTMLTextAreaElement>('textarea')?.disabled,true);}finally{await h.close();}});
