import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as React from 'react';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import {Window} from 'happy-dom';
import ts from 'typescript';
import * as presentation from '../../lib/self-serve-status/presentation.ts';
const scope={ownerOrigin:'https://owner.saas-staging.celebix.net',panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const date='2026-09-27T12:00:00.000Z';
const status=stage=>presentation.presentOnboardingStatus({stage,updatedAt:date,...(stage==='ready'?{storeSlug:'qa-browser'}:{})},scope);
async function fixture(responses,verify,{hidden=false}={}){
 const browser=new Window({url:`${scope.ownerOrigin}/onboarding/status`});const globals=new Map();let calls=0;
 Object.defineProperty(browser.document,'hidden',{configurable:true,value:hidden});
 const fetch=async(url,options)=>{assert.equal(url,'/api/self-serve/status');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');calls++;const next=responses[Math.min(calls-1,responses.length-1)];return Response.json(next.body,{status:next.status??200});};
 for(const [key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,Event:browser.Event,MouseEvent:browser.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true,fetch})){globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const output=ts.transpileModule(readFileSync(new URL('./OnboardingStatus.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const compiled={exports:{}};
 Function('require','module','exports',output)(name=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsxRuntime;if(name==='../../lib/self-serve-status/presentation.ts')return presentation;throw new Error('unexpected browser import');},compiled,compiled.exports);
 const element=browser.document.createElement('div');browser.document.body.append(element);const root=createRoot(element);
 try{await act(async()=>root.render(createElement(compiled.exports.OnboardingStatus,{scope})));await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));await verify({element,browser,calls:()=>calls});}
 finally{await act(async()=>root.unmount());for(const[key,descriptor]of globals)descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}
test('browser pending polls durable reader then exposes fresh login only after ready',async()=>fixture([{body:status('creating')},{body:status('ready')}],async({element,calls})=>{
 assert.match(element.textContent,/Mağazanız hazırlanıyor/);assert.equal(element.querySelector('a'),null);
 await act(async()=>new Promise(resolve=>setTimeout(resolve,5100)));
 assert.equal(calls(),2);assert.equal(element.querySelector('a').getAttribute('href'),`${scope.panelOrigin}/auth/login?destination=qa-browser.admin.${scope.platformDomainSuffix}`);assert.equal(element.textContent.includes('attempt_'),false);
 await act(async()=>new Promise(resolve=>setTimeout(resolve,5100)));assert.equal(calls(),2);
}));
test('expired or unavailable proof never offers a new registration or claims ready',async()=>{
 for(const statusCode of [401,503])await fixture([{status:statusCode,body:{code:statusCode===401?'onboarding_status_expired':'onboarding_status_unavailable'}}],async({element})=>{
  assert.equal(element.querySelector('a[href="/kayit"]'),null);assert.equal(element.textContent.includes('Mağazanız hazır'),false);assert.ok(element.querySelector('button'));
 });
});
test('hidden browser pauses reader and resumes safely when visible',async()=>fixture([{body:status('creating')}],async({element,browser,calls})=>{
 assert.equal(calls(),0);Object.defineProperty(browser.document,'hidden',{configurable:true,value:false});await act(async()=>{browser.document.dispatchEvent(new browser.Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,20));});assert.equal(calls(),1);assert.match(element.textContent,/Mağazanız hazırlanıyor/);
},{hidden:true}));
