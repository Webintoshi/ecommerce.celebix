import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const source=readFileSync(new URL('./HostedCheckoutResult.tsx',import.meta.url),'utf8'),compiled={exports:{} as Record<string,unknown>};
Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)((name:string)=>{
 if(name==='react/jsx-runtime')return jsx;if(name==='next/link')return{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)};if(name==='./GoogleMarketingCapturedResultSignal')return{GoogleMarketingCapturedResultSignal:()=>null};throw new Error(name);
},compiled,compiled.exports);
const Component=compiled.exports.HostedCheckoutResult as React.ComponentType<any>;
test('a captured payment with an order conflict clearly reports paid and never offers a second payment',()=>{
 for(const safeCode of['captured_stock_conflict','customer_authority_conflict']){const html=renderToStaticMarkup(React.createElement(Component,{hostedStatus:{status:'stock_conflict',safeCode},paymentPath:'/pay',resultPath:'/result'}));assert.match(html,/Ödemeniz alındı/u);assert.match(html,/mağazayla iletişime geçin/u);assert.doesNotMatch(html,/Yeniden ödeme dene|href="\/checkout"/u);}
});
test('a definitive payment failure retains the ordinary retry path',()=>{
 const html=renderToStaticMarkup(React.createElement(Component,{hostedStatus:{status:'failed',safeCode:'declined'},paymentPath:'/pay',resultPath:'/result'}));assert.match(html,/Ödeme tamamlanamadı/u);assert.match(html,/Yeniden ödeme dene/u);
});
