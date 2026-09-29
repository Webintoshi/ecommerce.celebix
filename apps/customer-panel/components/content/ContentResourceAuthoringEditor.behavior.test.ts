import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {Window} from 'happy-dom';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import * as bodyEditor from '../../lib/merchant-content-body-editor.ts';
import * as bodyNormalizer from '../../../../packages/platform-config/src/merchant-content-body.ts';
import {createDirtyNavigationGuard} from '../../lib/catalog-ui/dirty-navigation.ts';
import {applyContentResourceDraft,captureContentResourceApplyContext,manualContentFieldEdit} from '../../lib/content-resource-authoring-ui/controller.ts';
import type{ContentResourceAuthoringRequest}from'@celebix/saas-contracts';

const require=createRequire(import.meta.url),ID='11111111-1111-4111-8111-111111111111',DRAFT_ID='22222222-2222-4222-8222-222222222222',GEN_ID='33333333-3333-4333-8333-333333333333',NOW='2026-09-29T00:00:00.000Z';
const document=(overrides:Record<string,unknown>={})=>({id:ID,kind:'blog_post',name:'Bakım',slug:'bakim',locale:'tr',body:'<p>Eski metin</p>',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft',version:4,publishedAt:null,createdAt:NOW,updatedAt:NOW,bodyFormat:'normalized_html',bodyDigest:`sha256:${'a'.repeat(64)}`,origins:{},...overrides});
const compile=async(file:string,loader:(name:string)=>unknown)=>{const source=await readFile(new URL(file,import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,compiled={exports:{} as Record<string,unknown>};Function('require','module','exports',code)(loader,compiled,compiled.exports);return compiled.exports;};
const css={__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})};

test('real TipTap AI apply and range rewrite are undoable, dirty, and save durable origins',async()=>{
 const browser=new Window({url:'https://panel.example.test/content/blog/edit'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,Node:browser.Node,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,HTMLButtonElement:browser.HTMLButtonElement,DOMParser:browser.DOMParser,MutationObserver:browser.MutationObserver,getComputedStyle:browser.getComputedStyle.bind(browser),requestAnimationFrame:browser.requestAnimationFrame.bind(browser),cancelAnimationFrame:browser.cancelAnimationFrame.bind(browser),Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const tiptap=require('@tiptap/react') as typeof import('@tiptap/react');let editor:import('@tiptap/core').Editor|null=null;const getEditor=()=>{assert.ok(editor);return editor as import('@tiptap/core').Editor;};const captured:unknown[]=[],pushes:string[]=[];
 const Body=(await compile('./MerchantContentBodyField.tsx',name=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='lucide-react')return new Proxy({},{get:()=>()=>React.createElement('svg',{'aria-hidden':true})});if(name.endsWith('.module.css'))return css;if(name.endsWith('merchant-content-body-editor.ts'))return bodyEditor;if(name.endsWith('merchant-content-body.ts'))return bodyNormalizer;if(name==='@tiptap/react')return{...tiptap,useEditor:(...args:Parameters<typeof tiptap.useEditor>)=>{editor=tiptap.useEditor(...args);return editor;}};return require(name);})).MerchantContentBodyField as React.ComponentType<any>;
 const AiPanel=({target,values,onApply}:any)=>{
  const send=(action:'improve'|'rewrite_selection')=>{
   const rewrite=action==='rewrite_selection',selectedFields=rewrite?['body']:['body','seoTitle'];
   const request:ContentResourceAuthoringRequest={target,currentDraft:values,locale:values.locale,tone:'neutral',length:'medium',note:'',researchOperationId:null,stage:'draft',action,fields:selectedFields as ['body','seoTitle'],reviewedOutline:null,outlineGenerationId:null,selection:rewrite?{field:'body',text:'Yapay'}:null};
   const generation={id:rewrite?'44444444-4444-4444-8444-444444444444':GEN_ID,target,stage:'draft',status:'completed',outline:null,draft:{sourceFingerprint:'a'.repeat(64),values:rewrite?{body:'<p>Yeni</p>'}:{body:'<p>Yapay zekâ metni</p>',seoTitle:'Yeni SEO başlığı'},citations:[],suggestions:[]},sourceFingerprint:'a'.repeat(64),usage:{inputTokens:12,outputTokens:8,totalTokens:20},safeCode:null,createdAt:NOW,updatedAt:NOW,finishedAt:NOW};
   onApply({context:captureContentResourceApplyContext(request),currentRequest:request,generation,selectedFields});
  };
  return React.createElement(React.Fragment,null,React.createElement('button',{type:'button',onClick:()=>send('improve')},'AI taslağı uygula'),React.createElement('button',{type:'button',onClick:()=>send('rewrite_selection')},'Seçili metni AI ile değiştir'));
 };
 const Editor=(await compile('./MerchantContentEditor.tsx',name=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='next/link')return{__esModule:true,default:({href,children,...rest}:any)=>React.createElement('a',{href,...rest},children)};if(name==='next/navigation')return{useRouter:()=>({push:(path:string)=>pushes.push(path),refresh:()=>undefined})};if(name.includes('catalog-ui/dirty-navigation'))return{createDirtyNavigationGuard};if(name.includes('PanelPageShell'))return{PanelPageShell:({children}:any)=>children,PanelPageHeader:()=>null};if(name.includes('MerchantContentBodyField'))return{MerchantContentBodyField:Body};if(name.includes('ContentResourceAuthoringPanel'))return{ContentResourceAuthoringPanel:AiPanel};if(name.includes('content-resource-authoring-ui/controller'))return{applyContentResourceDraft,manualContentFieldEdit};if(name.endsWith('.css'))return css;if(name.includes('merchant-content-ui/client'))return{merchantContentApi:{},MerchantContentApiError:class extends Error{}};throw Error(name);})).MerchantContentEditor as React.ComponentType<any>;
 let currentDocument=document();const api={get:async()=>currentDocument,save:async(input:unknown)=>{captured.push(input);currentDocument=document({version:4+captured.length,body:(input as any).values.body,seoTitle:(input as any).values.seoTitle,origins:(input as any).origins});return{document:currentDocument,replayed:false};},versions:async()=>[]};
 const {createRoot}=await import('react-dom/client'),container=browser.document.createElement('div') as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container);
 try{
  await React.act(async()=>{root.render(React.createElement(Editor,{kind:'blog_post',recordId:ID,returnTo:'/content/blog',canManage:true,aiEnabled:true,api}));await new Promise(resolve=>setTimeout(resolve,30));});
  assert.equal(getEditor().getText(),'Eski metin');assert.equal(container.querySelector('button[type="submit"]')?.hasAttribute('disabled'),true);
  const apply=[...container.querySelectorAll('button')].find(button=>button.textContent==='AI taslağı uygula');assert.ok(apply);
  await React.act(async()=>{apply.click();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(getEditor().getText(),'Yapay zekâ metni');assert.equal((container.querySelector('[aria-label="SEO başlığı"]') as HTMLInputElement).value,'Yeni SEO başlığı');assert.match(container.textContent??'',/Kaydedilmedi/);
  await React.act(async()=>{getEditor().commands.undo();});assert.equal(getEditor().getText(),'Eski metin');
  await React.act(async()=>{getEditor().commands.redo();});assert.equal(getEditor().getText(),'Yapay zekâ metni');
  await React.act(async()=>{getEditor().commands.insertContentAt(getEditor().state.doc.content.size-1,' düzenlendi');});
  assert.match(getEditor().getText(),/düzenlendi/);
  const form=container.querySelector('form')!;await React.act(async()=>{form.dispatchEvent(new browser.Event('submit',{bubbles:true,cancelable:true}) as unknown as Event);await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(captured.length,1);assert.equal((captured[0] as any).values.body.includes('düzenlendi'),true);assert.deepEqual((captured[0] as any).origins.body,{generationId:GEN_ID,state:'edited_ai'});assert.deepEqual((captured[0] as any).origins.seoTitle,{generationId:GEN_ID,state:'ai'});assert.deepEqual(pushes,['/content/blog']);
  const beforeRewrite=getEditor().getText(),word=beforeRewrite.indexOf('Yapay');assert.ok(word>=0);
  await React.act(async()=>{getEditor().commands.setTextSelection({from:word+1,to:word+6});});
  const rewrite=[...container.querySelectorAll('button')].find(button=>button.textContent==='Seçili metni AI ile değiştir');assert.ok(rewrite);
  await React.act(async()=>{rewrite.click();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.match(getEditor().getText(),/Yeni/);assert.match(getEditor().getText(),/zekâ metni/);
  await React.act(async()=>{getEditor().commands.undo();});assert.equal(getEditor().getText(),beforeRewrite);
  await React.act(async()=>{getEditor().commands.redo();});assert.match(getEditor().getText(),/Yeni/);
  await React.act(async()=>{form.dispatchEvent(new browser.Event('submit',{bubbles:true,cancelable:true}) as unknown as Event);await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(captured.length,2);assert.deepEqual((captured[1] as any).origins.body,{generationId:'44444444-4444-4444-8444-444444444444',state:'edited_ai'});
  await React.act(async()=>{root.render(React.createElement(Editor,{key:'reload',kind:'blog_post',recordId:ID,returnTo:'/content/blog',canManage:true,aiEnabled:true,api}));await new Promise(resolve=>setTimeout(resolve,30));});
  assert.match(getEditor().getText(),/Yeni/);assert.match(getEditor().getText(),/zekâ metni/);assert.equal((container.querySelector('[aria-label="SEO başlığı"]') as HTMLInputElement).value,'Yeni SEO başlığı');assert.equal(container.querySelector('button[type="submit"]')?.hasAttribute('disabled'),true);
 }finally{await React.act(async()=>{root.unmount();await new Promise(resolve=>setTimeout(resolve,20));});(editor as import('@tiptap/core').Editor|null)?.destroy();for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});
