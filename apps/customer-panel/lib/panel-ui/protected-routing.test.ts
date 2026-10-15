import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {compile} from '../../components/settings/design/design-editor-test-utils.ts';

const app=new URL('../../app/',import.meta.url),protectedRoot=new URL('(panel)/',app);
const sections=['accounting','analytics','content','customers','discounts','marketing','marketplaces','orders','products','seo','settings','toshi'];
async function files(root:URL):Promise<URL[]>{const entries=await readdir(root,{withFileTypes:true});return(await Promise.all(entries.map(entry=>entry.isDirectory()?files(new URL(entry.name+'/',root)):Promise.resolve([new URL(entry.name,root)])))).flat();}
const source=(url:URL)=>readFile(url,'utf8');
test('all page and handler URLs survive route grouping exactly once',async()=>{
 const expected=JSON.parse(await source(new URL('./protected-route-manifest.json',import.meta.url))),all=await files(app);
 for(const [key,name]of [['pages','page.tsx'],['handlers','route.ts']]){
  const actual=all.filter(url=>path.basename(url.pathname)===name).map(url=>'/'+path.relative(fileURLToPath(app),path.dirname(fileURLToPath(url))).split(path.sep).filter(part=>!/^\(.*\)$/.test(part)).join('/')).sort();
  assert.deepEqual(actual,expected[key]);assert.equal(new Set(actual).size,actual.length);
 }
});
test('one durable authorized shell owns every protected section and settings keeps its workspace',async()=>{
 const Shell=()=>null,context={store:{id:'tenant-a'}},support={reason:'support'};
 const Layout=compile<any>(new URL('layout.tsx',protectedRoot),{'@/components/panel/PanelShell':{PanelShell:Shell},'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:context,support})}}).default;
 const child=React.createElement('output'),rendered=await Layout({children:child});
 assert.equal(rendered.type,Shell);assert.equal(rendered.key,null);assert.equal(rendered.props.children,child);assert.equal(rendered.props.tenantContext,context);assert.equal(rendered.props.support,support);
 for(const section of sections){const list=await files(new URL(section+'/',protectedRoot));assert.ok(list.some(url=>url.pathname.endsWith('/page.tsx')),section);for(const file of list.filter(url=>/\/(page|layout)\.tsx$/.test(url.pathname)))assert.doesNotMatch(await source(file),/\bPanelShell\b|\bcreatePanelChromeModel\b/,file.pathname);}
 const Workspace=()=>null,Settings=compile<any>(new URL('settings/layout.tsx',protectedRoot),{'@/components/settings/SettingsWorkspace':{SettingsWorkspace:Workspace}}).default;
 const settings=await Settings({children:child});assert.equal(settings.type,Workspace);assert.equal(settings.props.children,child);
});
test('persistent shell never replaces per-page server authority including helpers and redirects',async()=>{
 const helpers=new Map([['renderMerchantRecordPage','../../components/merchant-admin/render-merchant-record-page.tsx'],['renderLuckyWheelPage','../../lib/server-lucky-wheel/page.tsx'],['redirectLegacySeo','../../lib/seo-ui/legacy-route.ts']]);
 for(const file of (await files(protectedRoot)).filter(url=>url.pathname.endsWith('/page.tsx'))){
  const value=await source(file);
  if(/\b(?:requireServerPanelAccess|resolveServerPanelAccess|requirePromotionPageContext)\s*\(/.test(value))continue;
  const helper=[...helpers].find(([name])=>value.includes(name+'('));assert.ok(helper,`unguarded:${file.pathname}`);
  assert.match(await source(new URL(helper[1],import.meta.url)),/await (?:requireServerPanelAccess|requirePromotionPageContext)\(|requireServerPanelAccess\(\),requirePromotionPageContext\(\)/);
 }
});
test('preview and old redirect pages reject missing authority before rendering or redirecting',async()=>{
 for(const route of ['products/[productId]/preview/page.tsx','products/purchasing/page.tsx','content/policies/new/page.tsx','orders/drafts/page.tsx']){
  let guarded=0;const denied=Error('authentication_required');
  const Page=compile<any>(new URL(route,protectedRoot),{'@/lib/server-access':{requireServerPanelAccess:async()=>{guarded++;throw denied;}},'@/components/catalog/ProductStorefrontPreview':{ProductStorefrontPreview:()=>null},'next/navigation':{redirect:()=>{throw Error('unguarded_redirect');},permanentRedirect:()=>{throw Error('unguarded_redirect');}}}).default;
  await assert.rejects(async()=>Page({params:Promise.resolve({productId:'fixture'}),searchParams:Promise.resolve({token:'fixture'})}),error=>error===denied);assert.equal(guarded,1,route);
 }
});
test('print and public authentication/support entry points retain independent boundaries',async()=>{
 const print=new URL('orders/[orderId]/print/page.tsx',app);assert.match(await source(print),/requireServerPanelAccess/);assert.doesNotMatch(await source(print),/PanelShell/);
 await assert.rejects(source(new URL('orders/[orderId]/print/page.tsx',protectedRoot)),{code:'ENOENT'});
 for(const segment of ['login','auth','invitations','support','unauthorized']){assert.ok((await files(new URL(segment+'/',app))).length);await assert.rejects(readdir(new URL(segment+'/',protectedRoot)),{code:'ENOENT'});}
});
