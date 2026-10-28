import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as React from 'react';
import {act,createElement} from 'react';
import * as jsx from 'react/jsx-runtime';
import {Window} from 'happy-dom';
import ts from 'typescript';
const overview={wallet:{balance:500,reserved:7,available:493},offers:[{id:'toshi-500',credits:500,netCents:24900},{id:'toshi-2500',credits:2500,netCents:99900},{id:'toshi-10000',credits:10000,netCents:299900},{id:'toshi-50000',credits:50000,netCents:1249900}],prices:{description:7,seoTitle:1,seoDescription:2,imageAlt:1}};
async function mount(canManage:boolean,verify:(container:HTMLElement,calls:unknown[],switchStore:(storeId:string)=>Promise<void>)=>Promise<void>,failure:boolean|number=false,value=overview){
 const browser=new Window({url:'https://panel.test/settings/artificial-intelligence'});const globals=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value});}
 const output=ts.transpileModule(await readFile(new URL('./ArtificialIntelligenceSettings.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const compiled={exports:{} as Record<string,unknown>};const calls:unknown[]=[];let creditReads=0;
 Function('require','module','exports',output)((name:string)=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});if(name==='@/lib/content-authoring-ui/credits-client')return {readToshiCredits:async()=>{const read=creditReads++;if(failure===true||typeof failure==='number'&&read>=failure)throw Error();return value;}};if(name==='@/components/commercial-packages/PlatformCheckoutButton')return {PlatformCheckoutButton:(props:any)=>{calls.push(props);return createElement('button',{type:'button',disabled:props.disabled},props.label);}};if(name.endsWith('.css'))return {default:{}};throw Error(name);},compiled,compiled.exports);
 const {createRoot}=await import('react-dom/client');const container=browser.document.createElement('div');browser.document.body.append(container);const root=createRoot(container as unknown as HTMLElement);
 try{await act(async()=>root.render(createElement(compiled.exports.ArtificialIntelligenceSettings as React.ComponentType<any>,{canManage,storeId:'10000000-0000-4000-8000-000000000001'})));await verify(container as unknown as HTMLElement,calls,async(storeId)=>{await act(async()=>root.render(createElement(compiled.exports.ArtificialIntelligenceSettings as React.ComponentType<any>,{canManage,storeId})));});}finally{await act(async()=>root.unmount());for(const [key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}
test('wallet screen shows real available/reserved balance and canonical credit offers through existing checkout',async()=>mount(true,async(container,calls)=>{
 assert.match(container.textContent??'',/493/);assert.match(container.textContent??'',/7 kredi devam eden/);assert.equal(container.querySelectorAll('article').length,4);
 const intents=calls.slice(-4) as any[];assert.deepEqual(intents.map(({kind,offerId,term})=>({kind,offerId,term})),overview.offers.map(offer=>({kind:'toshi_credit',offerId:offer.id,term:'once'})));
 assert.equal(container.querySelector('input'),null);assert.doesNotMatch(container.textContent??'',/API anahtarı|OpenAI|Gemini|Claude|DeepSeek|Son kullanım/);assert.equal(container.querySelector('h1'),null);
}));
test('read-only membership sees wallet and offers with purchase disabled',async()=>mount(false,async(container,calls)=>{const buttons=[...container.querySelectorAll('article button')];assert.equal(buttons.length,4);assert.equal(buttons.every(button=>(button as HTMLButtonElement).disabled),true);assert.ok(calls.length>=4);assert.ok(calls.every(value=>(value as {disabled:boolean}).disabled));}));
test('wallet load failure offers a refresh without invented balance or offers',async()=>mount(true,async(container)=>{assert.match(container.querySelector('[role="alert"]')?.textContent??'',/yüklenemedi/);assert.equal(container.querySelectorAll('article').length,0);assert.equal((container.querySelector('button') as HTMLButtonElement).disabled,false);},true));

test('changing stores clears the previous wallet and offers even when the new store read fails',async()=>mount(true,async(container,_calls,switchStore)=>{
 assert.match(container.textContent??'',/493/);assert.equal(container.querySelectorAll('article').length,4);
 await switchStore('20000000-0000-4000-8000-000000000002');
 assert.doesNotMatch(container.textContent??'',/493|7 kredi devam eden/);assert.equal(container.querySelectorAll('article').length,0);assert.match(container.querySelector('[role="alert"]')?.textContent??'',/yüklenemedi/);
},1));

test('credit product cards map exact offer artwork and show the canonical net, VAT and total',async()=>mount(true,async(container,calls)=>{
 const amounts=[['249,00','49,80','298,80'],['999,00','199,80','1.198,80'],['2.999,00','599,80','3.598,80'],['12.499,00','2.499,80','14.998,80']];
 for(const[index,offer]of overview.offers.entries()){
  const card=container.querySelector(`[data-credit-offer="${offer.id}"]`);assert.ok(card);
  assert.match(card.querySelector('h3')?.textContent??'',new RegExp(offer.credits.toLocaleString('tr-TR').replaceAll('.','\\.')));
  const image=card.querySelector('img');assert.equal(image?.getAttribute('src'),`/payments/toshi/${offer.id}-v1.webp`);assert.equal(image?.getAttribute('width'),'960');assert.equal(image?.getAttribute('height'),'640');
  for(const[field,amount]of ['net','vat','total'].map((field,n)=>[field,amounts[index][n]]))assert.ok(card.querySelector(`[data-credit-price="${field}"]`)?.textContent?.includes(amount));
  assert.match(card.textContent??'',/KDV \(%20\)/);
 }
 const intents=calls.slice(-4)as any[];assert.deepEqual(intents.map(({kind,offerId,term,storeId})=>({kind,offerId,term,storeId})),overview.offers.map(offer=>({kind:'toshi_credit',offerId:offer.id,term:'once',storeId:'10000000-0000-4000-8000-000000000001'})));
 assert.match(container.textContent??'',/Toplam bakiye.*500/s);assert.match(container.textContent??'',/10 kredi/);assert.match(container.textContent??'',/Görsel alt metinleri ayrıca.*1 kredi/s);
}));

test('credit counts, monetary rounding and usage explanations follow the API response',async()=>{
 const changed={...overview,wallet:{balance:1000,reserved:100,available:900},offers:overview.offers.map((offer,index)=>index?offer:{...offer,credits:750,netCents:24903}),prices:{description:9,seoTitle:3,seoDescription:4,imageAlt:2}};
 await mount(true,async(container)=>{
  const card=container.querySelector('[data-credit-offer="toshi-500"]');assert.ok(card);assert.match(card.querySelector('h3')?.textContent??'',/750 kredi/);
  assert.ok(card.querySelector('[data-credit-price="net"]')?.textContent?.includes('249,03'));assert.ok(card.querySelector('[data-credit-price="vat"]')?.textContent?.includes('49,81'));assert.ok(card.querySelector('[data-credit-price="total"]')?.textContent?.includes('298,84'));
  assert.match(container.textContent??'',/900/);assert.match(container.textContent??'',/100 kredi devam eden/);assert.match(container.textContent??'',/16 kredi/);assert.match(container.textContent??'',/Görsel alt metinleri ayrıca.*2 kredi/s);
  const costs=[...container.querySelectorAll('[data-usage-cost]')].map(node=>node.textContent);assert.deepEqual(costs,['9 kredi','3 kredi','4 kredi','2 kredi / görsel']);
 },false,changed);
});

test('a failed refresh retains the known wallet and offers with an actionable error',async()=>mount(true,async(container)=>{
 const refresh=container.querySelector('button');assert.ok(refresh);await act(async()=>refresh.click());
 assert.match(container.querySelector('[role="alert"]')?.textContent??'',/yüklenemedi/);assert.match(container.textContent??'',/493/);assert.equal(container.querySelectorAll('article').length,4);assert.equal(refresh.disabled,false);
},1));
