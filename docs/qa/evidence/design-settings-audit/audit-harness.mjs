// Analysis evidence only: run against an extracted immutable Git tree, never a live API.
// node --experimental-transform-types audit-harness.mjs /absolute/exact-source-snapshot
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Exact source snapshot path required');
const req = createRequire(join(root, 'package.json'));
const ts = req('typescript'), React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const contracts = req('@celebix/saas-contracts');
const model = req(join(root,'apps/customer-panel/lib/starter-theme-composer-model.ts'));
const { Window } = await import(req.resolve('happy-dom'));
const window = new Window({ url: 'https://fixture.invalid/settings/design' });
globalThis.window = window; globalThis.document = window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async () => { throw new Error('Live network forbidden in audit fixture'); };
const { createRoot } = req('react-dom/client');
const css = new Proxy({}, {get: (_, k) => String(k)});
function compile(relative, overrides={}) {
  const file = join(root,relative), local = createRequire(file);
  const source = readFileSync(file,'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  new Function('require','module','exports','setTimeout','clearTimeout',code)((id)=> {
    if (id in overrides) return overrides[id];
    if (id.endsWith('.css')) return {__esModule:true,default:css};
    try { return local(id); } catch (error) { if (error.code === 'MODULE_NOT_FOUND' && id.startsWith('.')) return local(id+'.ts'); throw error; }
  },mod,mod.exports,(fn,ms)=> {const id=++timerId; timers.set(id,{fn,ms}); return id;},id=>timers.delete(id));
  return mod.exports;
}
let timers = new Map(), timerId=0;
const composition = contracts.createDefaultStarterThemeComposition();
assert.equal(composition.schemaVersion,3);
assert.throws(()=>model.upgradeStarterThemeComposition(composition),/storefront_contract_invalid/);
const {schemaVersion, ...v3Body}=composition;
const stripped = {...v3Body,sections:v3Body.sections.map(({sectionId,...s})=>s)};
assert.equal(model.buildStarterThemeComposition(stripped).schemaVersion,2);
console.log('REPRO A01: valid default V3 composition throws during upgrade; dropping schemaVersion before builder is a passing diagnostic control (no source fix).');

const typography={headingFont:{family:'Manrope',category:'sans-serif',availableWeights:['400','700'],source:'google'},bodyFont:{family:'Manrope',category:'sans-serif',availableWeights:['400','700'],source:'google'},headingWeight:'700',bodyWeight:'400',headingSizePx:40,bodySizePx:16};
const design={schemaVersion:3,brand:{logo:null,favicon:null,primaryColor:'#FF5A00',accentColor:'#171717',backgroundColor:'#FFFFFF',textColor:'#171717',fontFamily:'manrope'},typography,hero:{enabled:false,slides:[{headline:'Fixture banner',body:'',desktopImage:null,mobileImage:null,destination:{kind:'none'},enabled:true}]},promotion:{headline:'Fixture',body:'',destination:{kind:'none'},startsAt:null,endsAt:null,enabled:false},announcement:{items:['Fixture'],icon:'none',speed:'normal',direction:'left',animation:'continuous',enabled:false},composition};
const publicModel=req(join(root,'packages/storefront-design-ui/src/model.ts'));
const Renderer=compile('packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx').StorefrontDesignRenderer;
const Canvas=compile('apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx',{'@celebix/storefront-design-ui':{...publicModel,StorefrontDesignRenderer:Renderer}}).VisualStorefrontCanvas;
design.hero.slides[0].desktopImage={kind:'media',mediaId:'70000000-0000-4000-8000-000000000001'};
const props={storeName:'Audit fixture',publishedVersion:1,publishedAt:'2026-09-14T00:00:00.000Z',media:[{id:'70000000-0000-4000-8000-000000000001',url:'https://fixture.invalid/banner.png',altText:'Fixture',mediaType:'image/png',width:1200,height:800}],destinations:[],mode:'desktop',now:new Date('2026-09-14T00:00:00.000Z'),onSelectSurface:()=>{}};
function canvas(c) {contracts.parseStorefrontDesignDocument({...design,composition:c});return renderToStaticMarkup(React.createElement(Canvas,{...props,design:{...design,composition:c}}));}
const empty=canvas({...composition,sections:[]});
assert.match(empty,/Kategorileri keşfedin/); assert.match(empty,/Öne çıkan ürünler/); assert.match(empty,/Ürün 4/);
const sections=[{sectionId:'home_product_first',kind:'product_row',enabled:true,heading:'FIRST_PRODUCTS',source:'latest',limit:8},{sectionId:'home_category_second',kind:'category_grid',enabled:true,heading:'SECOND_CATEGORIES',layout:'grid',categoryIds:[]},{sectionId:'home_product_third',kind:'product_row',enabled:true,heading:'THIRD_PRODUCTS',source:'latest',limit:8}];
const ordered=canvas({...composition,sections});
assert.ok(ordered.indexOf('SECOND_CATEGORIES')<ordered.indexOf('FIRST_PRODUCTS')); assert.doesNotMatch(ordered,/THIRD_PRODUCTS/);
const customFooter=canvas({...composition,footer:{...composition.footer,groups:[{heading:'FIXTURE_FOOTER',links:[{kind:'system',destination:'/products'}]},composition.footer.groups[1]]}});
assert.doesNotMatch(customFooter,/FIXTURE_FOOTER/);
console.log('REPRO A03: empty composition still shows category/product cards; product→category order reversed; second product row omitted; V3 footer headings ignored. Actual React SSR canvas and renderer used.');

let editorProps,topbar,calls,saveImpl,publishImpl;
class ApiError extends Error {constructor(code){super(code);this.code=code;}}
const api={saveDraft:async x=>{calls.push(x);return saveImpl(x);},publish:async x=>publishImpl(x),uploadMedia:async()=>{throw new Error('unused');}};
const Workspace=compile('apps/customer-panel/components/settings/design/DesignWorkspace.tsx',{
  '@/components/panel/PanelTopbarChrome':{PanelTopbarBridge:p=>{topbar=p;return React.createElement('header',null,p.actions);}},
  '@/lib/storefront-design-ui/client':{StorefrontDesignApiError:ApiError,storefrontDesignApi:api},
  './DesignPreview':{DesignPreview:()=>null},
  './DesignSettingsDrawer':{DesignSettingsModal:p=>p.children},
  './DesignStepEditor':{DesignStepEditor:p=>{editorProps=p;return null;}},
}).DesignWorkspace;
const workspace={schemaVersion:3,draftVersion:1,publishedVersion:1,draftUpdatedAt:'2026-09-14T00:00:00Z',publishedAt:'2026-09-14T00:00:00Z',draft:design,published:{},store:{name:'Audit fixture',timezone:'UTC'},media:[],destinations:[]};
let mounted;
async function mount(){timers.clear();calls=[];saveImpl=async x=>({draftVersion:2,draft:x.design,draftUpdatedAt:workspace.draftUpdatedAt});publishImpl=async()=>({publishedVersion:2});const el=document.createElement('div');document.body.append(el);mounted=createRoot(el);await React.act(async()=>{mounted.render(React.createElement(Workspace,{workspace,canManage:true}));});}
async function edit(label='changed'){await React.act(async()=>{editorProps.onChange({...editorProps.design,promotion:{...editorProps.design.promotion,headline:label}});});}
async function tick(){const pending=[...timers.values()];timers.clear();await React.act(async()=>{for(const t of pending)t.fn();await Promise.resolve();});}
async function unmount(){await React.act(async()=>mounted.unmount());document.body.innerHTML='';}
await mount();await edit();assert.equal([...timers.values()][0].ms,700);await unmount();await tick();assert.equal(calls.length,0);
console.log('REPRO A04: mounted workspace edit then unmount before 700ms clears autosave; zero save calls, no durable draft.');
await mount();saveImpl=async()=>{throw new ApiError('version_conflict');};await edit('preserved conflict input');await tick();
assert.equal(topbar.subtitle,'Başka bir oturumda değişti');assert.equal(editorProps.design.promotion.headline,'preserved conflict input');assert.equal(timers.size,0);
assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Yayınla').disabled,true);
await edit('second conflict input');await tick();assert.equal(calls[0].expectedDraftVersion,1);assert.equal(calls[1].expectedDraftVersion,1);await unmount();
console.log('REPRO A05: 409 keeps input but publish disabled, no retry/reload control; another edit repeats same stale version 1.');
await mount();saveImpl=async()=>{throw new ApiError('unavailable');};await edit();
const publishElement=topbar.actions.props.children[2];assert.equal(publishElement.props.disabled,false);
const rejected=[];const listener=e=>rejected.push(e);process.on('unhandledRejection',listener);
await React.act(async()=>{publishElement.props.onClick();await new Promise(r=>setTimeout(r,20));});
assert.equal(topbar.subtitle,'Kaydedilemedi');assert.equal(rejected[0]?.code,'unavailable');process.off('unhandledRejection',listener);await unmount();
console.log('REPRO A06: publish during dirty debounce → save rejection reaches unhandledRejection; UI says save failed (not a false save success).');
await mount();let finish;saveImpl=x=>new Promise(r=>{finish=()=>r({draftVersion:2,draft:x.design,draftUpdatedAt:workspace.draftUpdatedAt});});await edit('old');await tick();await edit('new');await React.act(async()=>finish());assert.equal(editorProps.design.promotion.headline,'new');assert.equal(topbar.subtitle,'Yayınlanmamış değişiklik');await unmount();
console.log('PASS CONTROL: late older save response preserves newer input and dirty state. All calls mocked; no live mutation/network.');
await window.happyDOM.close();
