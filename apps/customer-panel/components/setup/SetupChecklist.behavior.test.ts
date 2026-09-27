import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { inputs, tenant } from "../../lib/setup-ui/fixtures.ts";
import { setupStatus } from "../../lib/setup-ui/model.ts";
import * as presentation from "../../lib/setup-ui/presentation.ts";
function compile(source:string,modules:Record<string,unknown>){const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}as Record<string,unknown>};Function("require","module","exports",output)((name:string)=>name==="react"?React:name==="react/jsx-runtime"?jsxRuntime:name in modules?modules[name]:(()=>{throw new Error(`unexpected_import:${name}`);})(),module,module.exports);return module.exports;}
test("setup page loads its established tenant and renders zero-product sales actions without repeated visible title",async()=>{
 const context=tenant(),status=setupStatus(context,inputs());let established=false,loaded=false;
 const pageSource=await readFile(new URL("../../app/(panel)/setup/page.tsx",import.meta.url),"utf8");
 let component:Record<string,unknown>={};try{component=compile(await readFile(new URL("./SetupChecklist.tsx",import.meta.url),"utf8"),{"@/lib/setup-ui/presentation":presentation,"./setup-checklist.module.css":{default:new Proxy({},{get:(_t,key)=>String(key)})}});}catch(error){if(!String(error).includes("ENOENT"))throw error;}
 const page=compile(pageSource,{"@/lib/server-access":{requireServerPanelAccess:async()=>{established=true;return{tenantContext:context};}},"@/lib/server-setup/default":{loadSetupStatus:async(value:unknown)=>{assert.equal(value,context);loaded=true;return status;}},"@/components/setup/SetupChecklist":component}).default as ()=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await page());assert.equal(established,true);assert.equal(loaded,true);assert.match(html,/class="sr-only"/);assert.doesNotMatch(html,/page-heading/);assert.match(html,/href="\/products\/new"/);assert.match(html,/İşlem gerekiyor/);assert.match(html,/Logo|logo/);assert.doesNotMatch(html,/Kimlik doğrulama|Ürün kataloğu.*Kullanılabilir/);
});
