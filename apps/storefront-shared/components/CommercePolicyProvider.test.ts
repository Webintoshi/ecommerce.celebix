import assert from 'node:assert/strict';
import test from 'node:test';
import React, { useEffect, useLayoutEffect } from 'react';
import { readFile, readdir } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveStorefrontCommercePolicy, type StorefrontCommercePolicy } from '@celebix/saas-contracts';
import { componentLoader, withProductBrowser } from './product-variant-media-test-utils.ts';

type Component=React.ComponentType<Record<string,unknown>>;
const normal=resolveStorefrontCommercePolicy(undefined);
const active=resolveStorefrontCommercePolicy({schemaVersion:1,enabled:true,phone:'+905551112233',hidePrices:false,hideAddToCart:false,messageIntro:'Merhaba'},1);
const hidden=resolveStorefrontCommercePolicy({schemaVersion:1,enabled:true,phone:'+905551112233',hidePrices:true,hideAddToCart:true,messageIntro:'Merhaba'},2);
const unavailable:StorefrontCommercePolicy={...normal,hidePrices:true,hideAddToCart:true,checkoutAllowed:false};
function components(overrides:Record<string,unknown>={}) {
 const load=componentLoader(overrides);
 const {CommercePolicyProvider:Provider,useCommercePolicy:usePolicy}=load<{CommercePolicyProvider:Component;useCommercePolicy:()=>StorefrontCommercePolicy}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));
 const {CommercePolicyPageBoundary:Boundary}=load<{CommercePolicyPageBoundary:Component}>(new URL('./CommercePolicyPageBoundary.tsx',import.meta.url));
 return {load,Provider,Boundary,usePolicy};
}
function value(policy:StorefrontCommercePolicy){return `${policy.version}:${Number(policy.enabled)}:${Number(policy.hidePrices)}:${Number(policy.hideAddToCart)}:${Number(policy.checkoutAllowed)}`;}

test('a page boundary supplies the fresh server policy to SSR children without an outer provider',async()=>{
 const {Boundary,usePolicy}=components();function Child(){return React.createElement('output',null,value(usePolicy()));}
 const html=renderToStaticMarkup(React.createElement(Boundary,{policy:hidden},React.createElement(Child)));
 assert.match(html,new RegExp(value(hidden)));
 await withProductBrowser(async({container,render})=>{await render(React.createElement(Boundary,{policy:hidden},React.createElement(Child)));assert.equal(container.textContent,value(hidden));});
});

test('navigation synchronizes the persistent header and fresh page before paint without remounting the shell',async()=>{
 const {Provider,Boundary,usePolicy}=components();let mounts=0;const childLayouts:string[]=[];
 function Header(){const policy=usePolicy();useEffect(()=>{mounts+=1;},[]);return React.createElement('output',{'data-header':true},value(policy));}
 function Child(){const policy=usePolicy();useLayoutEffect(()=>{childLayouts.push(value(policy));},[policy]);return React.createElement('output',{'data-page':true},value(policy));}
 const tree=(policy:StorefrontCommercePolicy)=>React.createElement(Provider,{policy:normal},React.createElement(Header),React.createElement(Boundary,{policy},React.createElement(Child)));
 await withProductBrowser(async({container,render})=>{
  await render(tree(normal));assert.equal(container.querySelector('[data-header]')?.textContent,value(normal));
  await render(tree(hidden));assert.equal(container.querySelector('[data-page]')?.textContent,value(hidden));assert.equal(container.querySelector('[data-header]')?.textContent,value(hidden));assert.equal(mounts,1);assert.equal(childLayouts.at(-1),value(hidden));
  await new Promise<void>(resolve=>window.requestAnimationFrame(()=>{assert.equal(container.querySelector('[data-header]')?.textContent,value(hidden));resolve();}));
  await render(tree(active));assert.equal(container.querySelector('[data-header]')?.textContent,value(active));assert.equal(mounts,1);
 });
});

test('unavailable page policy closes the persistent header rather than retaining old price and checkout actions',async()=>{
 const {Provider,Boundary,usePolicy}=components();function Read(){const policy=usePolicy();return React.createElement('output',null,value(policy));}
 const tree=(policy:StorefrontCommercePolicy)=>React.createElement(Provider,{policy:active},React.createElement('header',null,React.createElement(Read)),React.createElement(Boundary,{policy},React.createElement('main',null,React.createElement(Read))));
 await withProductBrowser(async({container,render})=>{await render(tree(active));await render(tree(unavailable));assert.equal(container.querySelector('header output')?.textContent,value(unavailable));assert.equal(container.querySelector('main output')?.textContent,value(unavailable));});
});

test('a provider without a page boundary preserves normal behavior and accepts a new server prop',async()=>{
 const {Provider,usePolicy}=components();let mounts=0;function Read(){useEffect(()=>{mounts++;},[]);return React.createElement('output',null,value(usePolicy()));}
 await withProductBrowser(async({container,render})=>{await render(React.createElement(Provider,{policy:normal},React.createElement(Read)));assert.equal(container.textContent,value(normal));await render(React.createElement(Provider,{policy:active},React.createElement(Read)));assert.equal(container.textContent,value(active));assert.equal(mounts,1);});
});

test('each server page invocation supplies its fresh cached resolution, including both unavailable states',async()=>{
 for(const kind of ['active','unavailable','not_found']){
  let calls=0;const {load}=components({'server-only':{},'../lib/page-context.ts':{async resolveStorefrontPage(){calls++;return kind==='active'?{kind,context:{commercePolicy:hidden}}:{kind};}}});
  const {withCommercePolicyPage:wrap}=load<{withCommercePolicyPage:(Page:Component)=>(props:Record<string,unknown>)=>Promise<React.ReactElement<{policy:StorefrontCommercePolicy;children:React.ReactElement}>>}>(new URL('./CommercePolicyServerPage.tsx',import.meta.url));
  const body:Component=()=>null;const Wrapped=wrap(body);const props={params:Promise.resolve({slug:'new-product'})};
  const result=await Wrapped(props);assert.equal(calls,1);assert.deepEqual(result.props.policy,kind==='active'?hidden:unavailable);assert.equal(result.props.children.type,body);assert.deepEqual(result.props.children.props,props);
 }
});

test('all actual page entries and not-found use the guaranteed page wrapper, with no root template assumption',async()=>{
 const root=new URL('../app/',import.meta.url);const files=await readdir(root,{recursive:true});const pages=files.filter(file=>file==='page.tsx'||file.endsWith('/page.tsx'));
 assert.ok(pages.length>=30);
 for(const file of [...pages,'not-found.tsx']){const source=await readFile(new URL(file,root),'utf8');assert.match(source,/export default withCommercePolicyPage\(\w+\);/u,`${file} must resolve policy within its page render`);}
 await assert.rejects(readFile(new URL('template.tsx',root)),{code:'ENOENT'});
});

test('the real client error fallback closes an existing shell policy and retains retry',async()=>{
 const {load,Provider,usePolicy}=components();const {default:ErrorPage}=load<{default:Component}>(new URL('../app/error.tsx',import.meta.url));let retried=0;
 function Header(){return React.createElement('output',null,value(usePolicy()));}
 await withProductBrowser(async({container,render,click})=>{await render(React.createElement(Provider,{policy:active},React.createElement('header',null,React.createElement(Header)),React.createElement(ErrorPage,{error:new Error('unavailable'),reset:()=>{retried++;}})));assert.equal(container.querySelector('header output')?.textContent,value(unavailable));await click('button');assert.equal(retried,1);});
});
