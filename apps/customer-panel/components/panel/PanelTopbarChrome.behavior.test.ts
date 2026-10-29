import assert from 'node:assert/strict';
import test from 'node:test';
import React, {useEffect} from 'react';
import {compile, withEditor} from '../settings/design/design-editor-test-utils.ts';

const model={storeSlug:'fixture',membershipLabel:'Mağaza sahibi',planCode:'base',planVersion:1,entitlementStatus:'active',locale:'tr'};
const Origin=React.createContext('outside');

async function mounted(run:(fixture:any)=>Promise<void>){
 await withEditor(async({window,container,render,click})=>{
  let pathname='/products',frames=0,bodyObservers=0;
  const saved=new Map<string,PropertyDescriptor|undefined>();
  const assign=(name:string,value:unknown)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
  const BrowserObserver=window.MutationObserver;
  class TrackedObserver extends BrowserObserver{observe(target:any,options?:MutationObserverInit){if(target===window.document.body as unknown&&options?.subtree)bodyObservers++;super.observe(target as any,options as Parameters<InstanceType<typeof BrowserObserver>["observe"]>[1]);}}
  window.requestAnimationFrame=(()=>{frames++;return frames;}) as unknown as typeof window.requestAnimationFrame;
  assign('MutationObserver',TrackedObserver);assign('HTMLElement',window.HTMLElement);
  const originalRect=window.HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(window.HTMLElement.prototype,'getBoundingClientRect',{configurable:true,value:function(this:any){return this.tagName==='HEADER'?{height:64}:originalRect.call(this);}});
  const topbar=compile<any>(new URL('./PanelTopbarChrome.tsx',import.meta.url));
  const {PanelLayoutClient}=compile<any>(new URL('./PanelLayoutClient.tsx',import.meta.url),{
   './PanelTopbarChrome':topbar,
   './PanelInitialDataGate':{PanelInitialDataBoundary:({children}:any)=>children},
   'next/navigation':{usePathname:()=>pathname},
   '@/lib/panel-ui/navigation':{getPanelRoutePresentation:()=>({title:'Route'})},
   './PanelSidebar':{PanelSidebar:()=>null},
   './PanelMobileDock':{PanelMobileDock:()=>null},
   './PanelTopbarUtilities':{PanelTopbarUtilities:()=>React.createElement('button',null,'Utility')},
  });
  const view=async(children:React.ReactNode,path=pathname)=>{pathname=path;await render(React.createElement(PanelLayoutClient,{model},children));};
  try{await run({window,container,view,click,...topbar,cost:()=>({frames,bodyObservers})});}
  finally{for(const[name,descriptor]of saved)descriptor?Object.defineProperty(globalThis,name,descriptor):Reflect.deleteProperty(globalThis,name);}
 });
}

test('ready topbar slots show commands without a frame wait or document-wide observation',async()=>{
 await mounted(async({container,view,PanelTopbarBridge,cost})=>{
  await view(React.createElement(PanelTopbarBridge,{title:'Ürünler',hideHeading:true,actions:React.createElement('button',null,'Create'),context:React.createElement('span',null,'Products')}));
  assert.equal(container.querySelector('#panel-topbar-actions button')?.textContent,'Create');
  assert.equal(container.querySelector('#panel-topbar-context')?.textContent,'Products');
  assert.deepEqual(cost(),{frames:0,bodyObservers:0});
 });
});

test('portalled commands retain their originating React context and explicit form association',async()=>{
 await mounted(async({container,view,click,PanelTopbarBridge})=>{
  let submitted=0;
  function Command(){return React.createElement('button',{type:'submit',form:'editor-form'},React.useContext(Origin));}
  await view(React.createElement(Origin.Provider,{value:'Save product'},React.createElement('form',{id:'editor-form',onSubmit:(event:React.FormEvent)=>{event.preventDefault();submitted++;}},React.createElement('input',{name:'title',defaultValue:'Existing draft'}),React.createElement(PanelTopbarBridge,{title:'Product',actions:React.createElement(Command)}))));
  const button=container.querySelector('#panel-topbar-actions button') as HTMLButtonElement;
  assert.equal(button?.textContent,'Save product');assert.equal(button?.form?.id,'editor-form');
  await click(button);assert.equal(submitted,1);
 });
});

test('dynamic actions update in place without resetting input state or duplicating commands',async()=>{
 await mounted(async({container,view,click,PanelTopbarBridge})=>{
  function Editor(){const[count,setCount]=React.useState(0);return React.createElement(React.Fragment,null,React.createElement('input',{defaultValue:'Keep this draft','aria-label':'draft'}),React.createElement(PanelTopbarBridge,{title:'Product',actions:React.createElement('button',{onClick:()=>setCount(x=>x+1)},`Save ${count}`)}));}
  await view(React.createElement(Editor));
  const draft=container.querySelector('input')!;draft.value='Unsaved change';
  const command=container.querySelector('#panel-topbar-actions button');assert.ok(command);await click(command);
  assert.equal(container.querySelector('#panel-topbar-actions')?.textContent,'Save 1');assert.equal(container.querySelectorAll('#panel-topbar-actions button').length,1);
  assert.equal(container.querySelector('input'),draft);assert.equal(draft.value,'Unsaved change');
 });
});

test('inner page owns the title while mounted and release restores the current outer title',async()=>{
 await mounted(async({container,view,PanelTopbarBridge})=>{
  const outer=(title:string)=>React.createElement(PanelTopbarBridge,{key:'outer',title,hideHeading:false});
  const inner=React.createElement('section',{key:'inner'},React.createElement(PanelTopbarBridge,{title:'Inner page',hideHeading:false}));
  await view([outer('Workspace'),inner]);assert.equal(container.querySelector('.desktopTopbarTitle')?.textContent,'Inner page');
  await view([outer('Updated workspace'),inner]);assert.equal(container.querySelector('.desktopTopbarTitle')?.textContent,'Inner page');
  await view(outer('Updated workspace'));assert.equal(container.querySelector('.desktopTopbarTitle')?.textContent,'Updated workspace');
 });
});

test('rapid route replacement removes old portals and keeps the same shared slot nodes',async()=>{
 await mounted(async({container,view,PanelTopbarBridge})=>{
  const page=(key:string)=>React.createElement(PanelTopbarBridge,{key,title:key,actions:React.createElement('button',null,key),context:React.createElement('span',null,key)});
  await view(page('Products'),'/products');const actions=container.querySelector('#panel-topbar-actions'),context=container.querySelector('#panel-topbar-context');
  await view(page('Orders'),'/orders');await view(page('Settings'),'/settings/security');
  assert.equal(container.querySelector('#panel-topbar-actions'),actions);assert.equal(container.querySelector('#panel-topbar-context'),context);
  assert.equal(actions?.textContent,'Settings');assert.equal(context?.textContent,'Settings');assert.equal(actions?.querySelectorAll('button').length,1);
  await view(null);assert.equal(actions?.textContent,'');assert.equal(context?.textContent,'');
 });
});

test('topbar height is synchronized before passive screen effects can observe content offset',async()=>{
 await mounted(async({container,view})=>{
  const offsets:string[]=[];
  function Screen(){useEffect(()=>{offsets.push((container.querySelector('.workspace') as HTMLElement).style.getPropertyValue('--panel-topbar-height'));},[]);return React.createElement('p',null,'Screen');}
  await view(React.createElement(Screen));assert.deepEqual(offsets,['64px']);
 });
});

test('title publication runs before passive page work without waiting for a frame',async()=>{
 await mounted(async({view,PanelTopbarBridge,PanelTopbarChromeProvider})=>{
  const events:string[]=[];
  function Screen(){useEffect(()=>{events.push('passive');},[]);return null;}
  await view(React.createElement(PanelTopbarChromeProvider,{onChange:(state:any)=>{if(state)events.push(`published:${state.title}`);}},React.createElement(Screen),React.createElement(PanelTopbarBridge,{title:'Ready page',hideHeading:false})));
  assert.deepEqual(events,['published:Ready page','passive']);
 });
});

test('a retained bridge republishes the same title into the new route scope',async()=>{
 await mounted(async({container,view,PanelTopbarBridge})=>{
  const screen=React.createElement(PanelTopbarBridge,{title:'Product details',hideHeading:false});
  await view(screen,'/products/first');assert.equal(container.querySelector('.desktopTopbarTitle')?.textContent,'Product details');
  await view(screen,'/products/second');assert.equal(container.querySelector('.desktopTopbarTitle')?.textContent,'Product details');
 });
});

test('sidebar changes the active expanded group before passive route effects',async()=>{
 await withEditor(async({container,render})=>{
  let pathname='/products';const {PanelNavigation}=compile<any>(new URL('./PanelNavigation.tsx',import.meta.url),{
   'next/navigation':{usePathname:()=>pathname},
   'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)},
   '@/lib/panel-ui/navigation':compile(new URL('../../lib/panel-ui/navigation.ts',import.meta.url)),
  });
  const snapshots:string[][]=[];
  function Screen(){useEffect(()=>{snapshots.push(Array.from(container.querySelectorAll('[aria-expanded="true"]'),item=>item.getAttribute('aria-label')!));},[pathname]);return React.createElement(PanelNavigation,{mode:'desktop'});}
  await render(React.createElement(Screen));pathname='/orders';await render(React.createElement(Screen));
  assert.deepEqual(snapshots.at(-1),['Siparişler alt menüsünü kapat']);
 });
});
