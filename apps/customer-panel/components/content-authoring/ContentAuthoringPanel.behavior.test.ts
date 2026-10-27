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
import * as preferences from '../../lib/content-authoring-ui/store-writing-preferences.ts';
import * as render from '../../lib/server-content-authoring/render.ts';
import * as credits from '../../lib/content-authoring-ui/credits-client.ts';
import * as imageAlts from '../../lib/content-authoring-ui/image-alts.ts';
const id='00000000-0000-4000-8000-000000000001';
const generation={id:'00000000-0000-4000-8000-000000000002',draftId:id,productId:null,status:'completed',draft:{description:[{type:'paragraph',children:[{type:'text',text:'Generated'}]}],seoTitle:'Generated SEO',seoDescription:'Generated SEO description',suggestions:[],claims:[],sourceFingerprint:'a'.repeat(64)},sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z',finishedAt:'2026-09-29T00:00:00.000Z'} as const;
async function mount(verify:(container:HTMLElement,mutate:()=>void,resolve:()=>void,controls:{switchStore():Promise<void>;switchProduct():Promise<void>;refresh():Promise<void>})=>Promise<void>,failureCode?:string,defaults:{tone?:string;locale?:string;sourcePreservation?:boolean;unavailableField?:string;images?:number;credits?:number;autoText?:boolean;textFailures?:string[];imageFailures?:string[];imageBalances?:number[];textStatuses?:('failed'|'unknown')[];textStatusCodes?:string[];textHttpStatuses?:number[]}={}){const browser=new Window({url:'https://panel.example.test/products/new'});const globals=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value});}let storeKey='shop',productId:string|null=null;const source=await readFile(new URL('./ContentAuthoringPanel.tsx',import.meta.url),'utf8');const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const compiled={exports:{} as Record<string,unknown>};Function('require','module','exports',output)((name:string)=>{if(name==='react')return React;if(name==='react/jsx-runtime')return runtime;if(name==='@/components/panel/PanelLayoutClient')return {usePanelChromeModel:()=>({activeStoreSelectionKey:storeKey})};if(name==='@/lib/content-authoring-ui/store-writing-preferences')return preferences;if(name==='@/lib/content-authoring-ui/client')return client;if(name==='@/lib/content-authoring-ui/state')return state;if(name==='@/lib/content-authoring-ui/credits-client')return credits;if(name==='@/lib/content-authoring-ui/image-alts')return {...imageAlts,createAuthoringThumbnail:async(source:unknown)=>{const sources=JSON.parse(container.dataset.thumbnailSources??'[]');sources.push(source);container.dataset.thumbnailSources=JSON.stringify(sources);return 'data:image/jpeg;base64,eA==';}};if(name==='@/lib/server-content-authoring/render')return render;if(name.endsWith('.css'))return {default:{}};throw new Error(name);},compiled,compiled.exports);const Panel=compiled.exports.ContentAuthoringPanel as React.ComponentType<Record<string,unknown>>;let description='Manual';let done!:(value:typeof generation)=>void;const preferencesApi={records:async()=>[]};const textCharges=new Set<string>(),imageCharges=new Set<string>();const api={generate:(request:unknown,key:string)=>{const keys=JSON.parse(container.dataset.textKeys??'[]');keys.push(key);container.dataset.textKeys=JSON.stringify(keys);textCharges.add(key);container.dataset.textCharges=String(textCharges.size);container.dataset.request=JSON.stringify(request);container.dataset.generateCalls=String(Number(container.dataset.generateCalls??0)+1);const httpStatus=defaults.textHttpStatuses?.shift();if(httpStatus&&httpStatus>=400)return client.createContentAuthoringClient(async()=>Response.json({code:'provider_timeout'},{status:httpStatus})).generate(request as any,key);const failure=defaults.textFailures?.shift()??failureCode;return failure?Promise.reject(new client.ContentAuthoringApiError(failure)):defaults.autoText?Promise.resolve(defaults.textStatuses?.length?{...generation,status:defaults.textStatuses.shift()!,draft:null,safeCode:defaults.textStatusCodes?.shift()??'provider_timeout'} as unknown as typeof generation:generation):new Promise<typeof generation>(resolve=>{done=resolve;});},get:async()=>generation};const container=browser.document.createElement('div') as unknown as HTMLElement;let media=Array.from({length:defaults.images??0},(_,index)=>({id:`image-${index}`,url:`https://media.test/${index}.jpg`,thumbnailUrl:`/api/content-ai/image-source/product/image-${index}`,altText:index===0?'Keep manual alt':''}));const mediaBridge={captureImages:()=>media,canApplyImageAlts:()=>true,applyImageAlts:(values:any[])=>{const map=new Map(values.map(value=>[value.id,value.altText]));media=media.map(value=>map.has(value.id)?{...value,altText:map.get(value.id)!}:value);container.dataset.imageApplied=JSON.stringify(media);return true;}};Object.assign(api,{...(defaults.credits!==undefined?{credits:async()=>({wallet:{balance:defaults.credits,reserved:0,available:defaults.credits},offers:[],prices:credits.TOSHI_CREDIT_PRICES})}:{}),imageAlts:async(request:any,key:string)=>{const calls=JSON.parse(container.dataset.imageRequests??'[]');calls.push({request,key});container.dataset.imageRequests=JSON.stringify(calls);imageCharges.add(key);container.dataset.imageCharges=String(imageCharges.size);const failure=defaults.imageFailures?.shift();if(failure)throw new client.ContentAuthoringApiError(failure);return {results:request.images.map((value:any)=>({id:value.id,altText:`Generated ${value.id}`})),failedIds:[],chargedCredits:request.images.length,wallet:(()=>{const balance=defaults.imageBalances?.shift()??100;return {balance,reserved:0,available:balance};})()};}});const bridge={media:defaults.images?mediaBridge:undefined,capture:()=>({request:{draftId:id,productId,productVersion:null,profileVersion:null,currentDraft:{title:'Burgu',description,seoTitle:'Manual SEO'},action:'improve',fields:['description'],locale:defaults.locale??'tr-TR',tone:defaults.tone??'neutral',length:'medium',note:'',selection:null},lifecycle:{sessionId:'session',draftRevision:description,selection:null}}),canApply:(field:string)=>{container.dataset.preflight=JSON.stringify([...JSON.parse(container.dataset.preflight??'[]'),field]);return field!==defaults.unavailableField;},apply:(field:string)=>{if(field===defaults.unavailableField)return false;container.dataset.applied=JSON.stringify([...JSON.parse(container.dataset.applied??'[]'),field]);if(field==='description'){description='Generated';container.dataset.description=description;}return true;}};browser.document.body.append(container as unknown as Parameters<typeof browser.document.body.append>[0]);container.dataset.description=description;const root=createRoot(container);try{await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api,preferencesApi}))));await verify(container,()=>{description='Changed';container.dataset.description=description;},()=>done(defaults.sourcePreservation?{...generation,draft:{...generation.draft,claims:[{field:'description',factRef:'source:0',value:'Generated'}]}} as unknown as typeof generation:generation),{refresh:async()=>{await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api,preferencesApi}))));},switchStore:async()=>{storeKey="other";await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api,preferencesApi}))));},switchProduct:async()=>{productId="00000000-0000-4000-8000-000000000004";await act(async()=>root.render(createElement('form',{onChange:()=>{container.dataset.dirty='true';}},createElement(Panel,{bridge,onClose:()=>{},api,preferencesApi}))));}});}finally{await act(async()=>root.unmount());for(const [key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}}
function button(container:HTMLElement,text:string){const element=[...container.querySelectorAll('button')].find(value=>value.textContent===text);assert.ok(element);return element;}
test('late result remains a preview and refuses apply after a manual edit',async()=>{await mount(async(container,mutate,resolve)=>{await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());mutate();await act(async()=>resolve());assert.match(container.textContent??'',/Generated/);await act(async()=>button(container,'Açıklama alanına uygula').click());assert.equal(container.dataset.description,'Changed');assert.match(container.querySelector('[role="alert"]')?.textContent??'',/Alanlar değişti/);});});
test('preview only changes the selected field when applied and never submits a save',async()=>{await mount(async(container,_mutate,resolve)=>{let submitted=0;container.addEventListener('submit',()=>submitted++);await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());await act(async()=>resolve());assert.equal(container.dataset.description,'Manual');assert.doesNotMatch(container.textContent??'',/Generated SEO/);await act(async()=>button(container,'Açıklama alanına uygula').click());assert.equal(container.dataset.description,'Generated');assert.equal(submitted,0);});});

for(const code of ["connection_missing","provider_failed"] as const) test(`${code} leaves manual fields unchanged and exposes a useful safe error`,async()=>{
 await mount(async(container)=>{
  await act(async()=>button(container,"Seçilenleri hazırla · 7 kredi").click());
  assert.equal(container.dataset.description,"Manual");
  assert.ok(container.querySelector('[role="alert"]'));
  assert.equal(button(container,"Seçilenleri hazırla · 7 kredi").disabled,false);

 },code);
});
for(const lifecycle of ["switchStore","switchProduct"] as const) test(`late generation is hidden after ${lifecycle}`,async()=>{
 await mount(async(container,_mutate,resolve,controls)=>{
  await act(async()=>button(container,"Seçilenleri hazırla · 7 kredi").click());
  await controls[lifecycle]();
  await act(async()=>resolve());
  assert.equal(container.dataset.description,"Manual");
  assert.equal(container.querySelector('[aria-label="AI içerik önizlemesi"]'),null);
 });
});


test('two rapid generate clicks reserve only one operation while the preview is pending',async()=>mount(async(container,_mutate,resolve)=>{
 await act(async()=>{button(container,'Seçilenleri hazırla · 7 kredi').click();button(container,'Seçilenleri hazırla · 7 kredi').click();});
 assert.equal(container.dataset.generateCalls,'1');await act(async()=>resolve());
}));


test('generation settings stay outside parent dirty state and one bundle applies only chosen preview fields',async()=>{
 await mount(async(container,_mutate,resolve)=>{
  const fields=[...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async()=>{fields[1].click();fields[2].click();});
  assert.equal(container.querySelector('select'),null);
  assert.equal(container.dataset.dirty,undefined);
  await act(async()=>button(container,'Seçilenleri hazırla · 10 kredi').click());await act(async()=>resolve());
  assert.deepEqual(JSON.parse(container.dataset.request!).fields,['description','seoTitle','seoDescription']);
  assert.equal(JSON.parse(container.dataset.request!).action,'auto');
  const preview=container.querySelector('[aria-label="AI içerik önizlemesi"]')!;
  const choices=[...preview.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async()=>{choices[0].click();choices[2].click();});
  await act(async()=>button(container,'Seçili alanlara uygula').click());
  assert.deepEqual(JSON.parse(container.dataset.applied!),['seoTitle']);
  assert.equal(container.dataset.description,'Manual');assert.equal(container.dataset.dirty,undefined);
 });
});


test('source preservation refusal leaves manual content untouched and explains that no AI call occurred',async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());
 assert.equal(container.dataset.description,'Manual');assert.equal(container.dataset.applied,undefined);
 assert.equal(container.querySelector('[aria-label="AI içerik önizlemesi"]'),null);
 const alert=container.querySelector('[role="alert"]')?.textContent??'';
 assert.match(alert,/mevcut metni elle düzenleyin/i);assert.match(alert,/Kredi harcanmadı/i);
 assert.doesNotMatch(alert,/yeniden deneyin/i);
},'source_preservation_required'));


test('preserved-source preview explains that existing statements are retained and still requires normal save',async()=>mount(async(container,_mutate,resolve)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());await act(async()=>resolve());
 assert.match(container.textContent??'',/Mevcut açıklamadaki ifadeler korunur/);
 assert.match(container.textContent??'',/kaydedin/);assert.equal(container.dataset.description,'Manual');
},undefined,{sourcePreservation:true}));

for(const unavailableField of ['seoTitle','seoDescription'])test(`bundle refuses unavailable ${unavailableField} before mutating description or other fields`,async()=>mount(async(container,_mutate,resolve)=>{
 const fields=[...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];await act(async()=>{fields[1].click();fields[2].click();});
 await act(async()=>button(container,'Seçilenleri hazırla · 10 kredi').click());await act(async()=>resolve());
 await act(async()=>button(container,'Seçili alanlara uygula').click());
 assert.equal(container.dataset.description,'Manual');assert.equal(container.dataset.applied,undefined);assert.match(container.textContent??'',/Alanlar değişti/);
},undefined,{unavailableField}));
test('ready bundle preflights every field before synchronously applying all selected fields',async()=>mount(async(container,_mutate,resolve)=>{
 const fields=[...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];await act(async()=>{fields[1].click();fields[2].click();});
 await act(async()=>button(container,'Seçilenleri hazırla · 10 kredi').click());await act(async()=>resolve());
 await act(async()=>button(container,'Seçili alanlara uygula').click());
 assert.deepEqual(JSON.parse(container.dataset.preflight!),['description','seoTitle','seoDescription']);assert.deepEqual(JSON.parse(container.dataset.applied!),['description','seoTitle','seoDescription']);
}));

test('all selected image alts run in four-image groups, preserve existing text and apply by stable ID',async()=>mount(async(container)=>{
 const choices=[...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
 assert.equal(choices[3].checked,false,'existing nonempty alt is unselected');
 assert.equal(choices.slice(4).every(value=>value.checked),true);
 await act(async()=>choices[0].click());
 assert.equal(container.dataset.imageRequests,undefined,'opening is free');
 await act(async()=>button(container,'Seçilenleri hazırla · 10 kredi').click());
 const calls=JSON.parse(container.dataset.imageRequests!);assert.deepEqual(calls.map((call:any)=>call.request.images.length),[4,4,2]);assert.equal(new Set(calls.map((call:any)=>call.key)).size,3);
 assert.equal(calls.flatMap((call:any)=>call.request.images).some((image:any)=>image.id==='image-0'),false);
 await act(async()=>button(container,'Seçili alanlara uygula').click());
 const applied=JSON.parse(container.dataset.imageApplied!);assert.equal(applied[0].altText,'Keep manual alt');assert.equal(applied.slice(1).every((image:any)=>image.altText===`Generated ${image.id}`),true);assert.equal(container.dataset.description,'Manual');assert.equal(container.dataset.generateCalls,undefined);
},undefined,{images:11}));

test('insufficient wallet balance blocks generation and offers a direct credit purchase link',async()=>mount(async(container)=>{
 assert.equal(button(container,'Seçilenleri hazırla · 7 kredi').disabled,true);assert.equal(container.dataset.generateCalls,undefined);assert.equal(container.querySelector('a')?.getAttribute('href'),'/settings/artificial-intelligence');assert.match(container.textContent??'',/Yeterli Toshi krediniz yok/);
},undefined,{credits:0}));

for(const code of ['provider_timeout','provider_unavailable','cancelled','unavailable','commit_unknown'])test(`${code} text retry reuses the operation and applies its cached completion once`,async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());
 assert.equal(container.dataset.description,'Manual');assert.equal(container.dataset.applied,undefined);
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());
 const keys=JSON.parse(container.dataset.textKeys!);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(container.dataset.textCharges,'1','the cached server operation must not create a second debit');
 await act(async()=>button(container,'Seçili alanlara uygula').click());assert.equal(container.dataset.description,'Generated');assert.deepEqual(JSON.parse(container.dataset.applied!),['description']);
},undefined,{autoText:true,textFailures:[code]}));

for(const code of ['provider_timeout','provider_unavailable','cancelled','unavailable','commit_unknown'])test(`${code} image retry retains both the completed text key and image batch key`,async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());assert.equal(container.dataset.applied,undefined);
 await act(async()=>button(container,'Seçilenleri hazırla · 1 kredi').click());
 const textKeys=JSON.parse(container.dataset.textKeys!),images=JSON.parse(container.dataset.imageRequests!);assert.equal(textKeys.length,2);assert.equal(textKeys[0],textKeys[1]);assert.equal(images.length,2);assert.equal(images[0].key,images[1].key);assert.deepEqual(images[0].request,images[1].request);assert.equal(container.dataset.textCharges,'1');assert.equal(container.dataset.imageCharges,'1');
 await act(async()=>button(container,'Seçili alanlara uygula').click());assert.deepEqual(JSON.parse(container.dataset.applied!),['description']);assert.equal(JSON.parse(container.dataset.imageApplied!)[1].altText,'Generated image-1');
},undefined,{autoText:true,images:2,imageFailures:[code]}));

test('changed authoring input after an ambiguous image response creates new text and image operations',async()=>mount(async(container,mutate,_resolve,controls)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());mutate();await controls.refresh();
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());
 const textKeys=JSON.parse(container.dataset.textKeys!),images=JSON.parse(container.dataset.imageRequests!);assert.notEqual(textKeys[0],textKeys[1]);assert.notEqual(images[0].key,images[1].key);assert.equal(images[1].request.context.description,'Changed');assert.equal(container.dataset.description,'Changed');
},undefined,{autoText:true,images:2,imageFailures:['provider_timeout']}));

for(const code of ['operation_failed','invalid_output'])test(`confirmed terminal ${code} permits a new operation for a deliberate retry`,async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());
 const keys=JSON.parse(container.dataset.textKeys!);assert.notEqual(keys[0],keys[1]);
},undefined,{autoText:true,textFailures:[code]}));

for(const code of ['operation_failed','invalid_output'])test(`confirmed image ${code} rotates only its failed batch key`,async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());await act(async()=>button(container,'Seçilenleri hazırla · 1 kredi').click());
 const textKeys=JSON.parse(container.dataset.textKeys!),images=JSON.parse(container.dataset.imageRequests!);assert.equal(textKeys[0],textKeys[1]);assert.notEqual(images[0].key,images[1].key);
},undefined,{autoText:true,images:2,imageFailures:[code]}));

test('changing selected fields after an ambiguous response starts a new bound request',async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());
 await act(async()=>container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click());
 await act(async()=>button(container,'Seçilenleri hazırla · 9 kredi').click());
 const textKeys=JSON.parse(container.dataset.textKeys!),images=JSON.parse(container.dataset.imageRequests!);assert.notEqual(textKeys[0],textKeys[1]);assert.notEqual(images[0].key,images[1].key);assert.deepEqual(JSON.parse(container.dataset.request!).fields,['description','seoTitle']);
},undefined,{autoText:true,images:2,imageFailures:['provider_timeout']}));

test('a 17-credit bundle retries only the six unpaid image credits after text and first-batch completion',async()=>mount(async(container)=>{
 assert.equal(button(container,'Seçilenleri hazırla · 17 kredi').disabled,false);
 await act(async()=>button(container,'Seçilenleri hazırla · 17 kredi').click());
 const retry=button(container,'Seçilenleri hazırla · 6 kredi');assert.equal(retry.disabled,false);assert.match(container.textContent??'',/Tamamlanan alanlar yeniden ücretlendirilmez/);assert.doesNotMatch(container.textContent??'',/Yeterli Toshi krediniz yok/);
 await act(async()=>retry.click());
 const textKeys=JSON.parse(container.dataset.textKeys!),calls=JSON.parse(container.dataset.imageRequests!);assert.equal(textKeys.length,2);assert.equal(textKeys[0],textKeys[1]);assert.equal(container.dataset.textCharges,'1');
 assert.deepEqual(calls.map((call:any)=>call.request.images.length),[4,4,4,4,2]);assert.equal(calls[0].key,calls[2].key,'completed first batch is retrieved using the cached key');assert.equal(calls[1].key,calls[3].key,'ambiguous second batch resolves with its original key');assert.equal(new Set(calls.map((call:any)=>call.key)).size,3);assert.equal(container.dataset.imageCharges,'3','each image batch may debit at most once');
 await act(async()=>button(container,'Seçili alanlara uygula').click());assert.equal(container.dataset.description,'Generated');assert.equal(JSON.parse(container.dataset.imageApplied!).filter((image:any)=>image.altText.startsWith('Generated')).length,10);
},undefined,{autoText:true,images:11,credits:17,imageFailures:['','provider_timeout'],imageBalances:[6,6,2,0]}));

for(const status of ['failed','unknown'] as const)test(`returned durable ${status} text status permits a new explicit text attempt`,async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());assert.match(container.textContent??'',/İçerik zamanında hazırlanamadı/);assert.equal(container.dataset.imageRequests,undefined);
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());const keys=JSON.parse(container.dataset.textKeys!);assert.notEqual(keys[0],keys[1]);assert.equal(JSON.parse(container.dataset.imageRequests!).length,1);
 await act(async()=>button(container,'Seçili alanlara uygula').click());assert.equal(container.dataset.description,'Generated');assert.equal(JSON.parse(container.dataset.imageApplied!)[1].altText,'Generated image-1');
},undefined,{autoText:true,images:2,textStatuses:[status]}));

test('saved-image authoring chooses the authenticated thumbnail route while retaining public display URLs',async()=>mount(async(container)=>{
 await act(async()=>container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click());
 await act(async()=>button(container,'Seçilenleri hazırla · 1 kredi').click());
 assert.deepEqual(JSON.parse(container.dataset.thumbnailSources!),['/api/content-ai/image-source/product/image-1']);
 assert.equal(container.querySelector('img')?.getAttribute('src'),'https://media.test/0.jpg');
 assert.equal(JSON.parse(container.dataset.thumbnailSources!).some((source:string)=>source.startsWith('https://media.test/')),false);
},undefined,{images:2}));

test('returned failed invalid output retains its useful explanation and starts a fresh explicit text attempt',async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());
 assert.match(container.querySelector('[role="alert"]')?.textContent??'',/İçerik uygun biçimde hazırlanamadı[.] Yeniden deneyin[.]/);assert.doesNotMatch(container.textContent??'',/Önceki deneme tamamlanamadı|Kredi harcanmadı/);
 await act(async()=>button(container,'Seçilenleri hazırla · 8 kredi').click());const keys=JSON.parse(container.dataset.textKeys!);assert.notEqual(keys[0],keys[1]);assert.equal(JSON.parse(container.dataset.imageRequests!).length,1);
},undefined,{autoText:true,images:2,textStatuses:['failed'],textStatusCodes:['invalid_output']}));

test('a bare HTTP504 retains the text operation until a cached completion is retrieved',async()=>mount(async(container)=>{
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());assert.match(container.querySelector('[role="alert"]')?.textContent??'',/İçerik zamanında hazırlanamadı/);
 await act(async()=>button(container,'Seçilenleri hazırla · 7 kredi').click());const keys=JSON.parse(container.dataset.textKeys!);assert.equal(keys[0],keys[1]);assert.equal(container.dataset.textCharges,'1');
 await act(async()=>button(container,'Seçili alanlara uygula').click());assert.deepEqual(JSON.parse(container.dataset.applied!),['description']);
},undefined,{autoText:true,textHttpStatuses:[504]}));
