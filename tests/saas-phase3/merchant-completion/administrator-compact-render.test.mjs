import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const panel=path.resolve(import.meta.dirname,'../../../apps/customer-panel');
const native=createRequire(import.meta.url),cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const resolve=name=>{
    if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(name==='next/link')return ({children,...props})=>React.createElement('a',props,children);
    // Topbar context belongs to the app layout, not this SSR component fixture.
    if(name==='./PanelTopbarChrome')return {PanelTopbarBridge:({title,subtitle,actions})=>React.createElement('header',null,React.createElement('h1',null,title),subtitle?React.createElement('p',null,subtitle):null,actions)};
    if(name.startsWith('@/')||name.startsWith('.')){
      const base=name.startsWith('@/')?path.join(panel,name.slice(2)):path.resolve(path.dirname(file),name);
      const target=existsSync(base)?base:['.ts','.tsx'].map(ext=>base+ext).find(existsSync);
      if(target)return load(target);
    }
    return native(name);
  };
  new Function('require','module','exports',source)(resolve,module,module.exports);return module.exports;
}
const {MerchantModuleConsole}=load(path.join(panel,'components/merchant-admin/MerchantModuleConsole.tsx'));
test('administrator page prioritizes controls without removing role help or non-admin metrics',()=>{
  const admin=renderToStaticMarkup(React.createElement(MerchantModuleConsole,{kind:'administrator_invite',canManage:true}));
  assert.match(admin,/Yönetici ekle/);
  assert.match(admin,/type="search"/);
  assert.doesNotMatch(admin,/aria-label="Yöneticiler özeti"/);
  assert.doesNotMatch(admin,/Bu ekran parola/);
  assert.match(admin,/<details[^>]*>\s*<summary[^>]*>Rol bilgisi/);
  assert.doesNotMatch(admin,/<details[^>]*open/);
  const other=renderToStaticMarkup(React.createElement(MerchantModuleConsole,{kind:'page',canManage:false}));
  assert.match(other,/Toplam kayıt/);
});
test('read-only administrator list never exposes add controls',()=>{
  const html=renderToStaticMarkup(React.createElement(MerchantModuleConsole,{kind:'administrator_invite',canManage:false}));
  assert.doesNotMatch(html,/Yönetici ekle/);
  assert.match(html,/type="search"/);
});
