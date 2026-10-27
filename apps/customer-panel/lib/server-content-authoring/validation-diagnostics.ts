import 'server-only';
import {types as nodeTypes}from'node:util';

const STAGES=['output','json_syntax','writer_decode','contract_or_grounding','policy_limits','completeness','source_order','render']as const;
export type ProductValidationDiagnosticStage=typeof STAGES[number];
export type ProductValidationDiagnostic=Readonly<{event:'toshi_product_validation_failed';attempt:1|2;stage:ProductValidationDiagnosticStage;counts:Readonly<{outputBytes:number|null;markdownBytes:number|null;bodyWords:number|null;h2Count:number|null;seoTitleChars:number|null;seoDescriptionChars:number|null;sourceSlotsExpected:number|null;sourceMarkersFound:number|null}>}>;
export type ProductValidationDiagnosticSink=(event:ProductValidationDiagnostic)=>void|Promise<void>;
type DiagnosticInput=Readonly<{attempt:1|2;stage:ProductValidationDiagnosticStage;output:unknown;parsed?:unknown;draft?:unknown;sourceSlotsExpected:number}>;
const bounded=(value:number)=>Number.isSafeInteger(value)&&value>=0?Math.min(value,1_000_000):null;
function own(value:unknown,key:string):unknown{
 if(typeof value!=='object'||value===null||nodeTypes.isProxy(value))return undefined;
 const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&descriptor.enumerable&&'value'in descriptor?descriptor.value:undefined;
}
const bytes=(value:unknown)=>typeof value==='string'?bounded(Buffer.byteLength(value,'utf8')):null;
const characters=(value:unknown)=>{if(typeof value!=='string')return null;let count=0;for(const _ of value.normalize('NFC'))if(++count>=1_000_000)break;return count;};
const wordCount=(value:string)=>(value.replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu,'').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[]).length;
function bodyCounts(draft:unknown):Readonly<{bodyWords:number|null;h2Count:number|null}>{
 const missing={bodyWords:null,h2Count:null},blocks=own(draft,'description');if(!Array.isArray(blocks)||nodeTypes.isProxy(blocks)||blocks.length>100)return missing;
 let bodyWords=0,h2Count=0,visited=0;
 const inline=(nodes:unknown):string|null=>{
  if(!Array.isArray(nodes)||nodeTypes.isProxy(nodes)||nodes.length>100)return null;let text='';
  for(let i=0;i<nodes.length;i++){if(++visited>1000)return null;const node=own(nodes,String(i)),kind=own(node,'type'),value=own(node,kind==='text'?'text':'value'),unit=own(node,'unit');if(kind!=='text'&&kind!=='fact'||typeof value!=='string'||value.length>10000||unit!==undefined&&typeof unit!=='string')return null;text+=value+(kind==='fact'&&unit?' '+unit:'');}
  return text;
 };
 for(let i=0;i<blocks.length;i++){
  const block=own(blocks,String(i)),kind=own(block,'type');
  if(kind==='heading'||kind==='paragraph'){const text=inline(own(block,'children'));if(text===null)return missing;if(kind==='paragraph')bodyWords+=wordCount(text);else if(own(block,'level')===2&&wordCount(text))h2Count++;}
  else if(kind==='list'){const items=own(block,'items');if(!Array.isArray(items)||nodeTypes.isProxy(items)||items.length>100)return missing;for(let n=0;n<items.length;n++){const text=inline(own(items,String(n)));if(text===null)return missing;bodyWords+=wordCount(text);}}
  else return missing;
 }
 return {bodyWords:bounded(bodyWords),h2Count:bounded(h2Count)};
}

/** Construct a fresh allowlisted payload; neither supplied data nor errors are logged. */
export function createProductValidationDiagnostic(input:DiagnosticInput):ProductValidationDiagnostic|null{
 if(![1,2].includes(input.attempt)||!STAGES.includes(input.stage))return null;
 try{
  const markdown=own(input.parsed,'descriptionMarkdown'),body=bodyCounts(input.draft);
  const counts=Object.freeze({outputBytes:bytes(own(input.output,'text')),markdownBytes:bytes(markdown),...body,seoTitleChars:characters(own(input.parsed,'seoTitle')),seoDescriptionChars:characters(own(input.parsed,'seoDescription')),sourceSlotsExpected:bounded(input.sourceSlotsExpected),sourceMarkersFound:typeof markdown==='string'?bounded((markdown.match(/\[\[TOSHI_SOURCE_[^\]\r\n]*\]\]/gu)??[]).length):null});
  return Object.freeze({event:'toshi_product_validation_failed',attempt:input.attempt,stage:input.stage,counts});
 }catch{return null;}
}
export function reportProductValidationFailure(input:DiagnosticInput,sink:ProductValidationDiagnosticSink=(event)=>console.warn('[toshi-product-validation]',event)):void{
 try{const event=createProductValidationDiagnostic(input);if(!event)return;const pending=sink(event);if(pending)void pending.catch(()=>undefined);}catch{/* Diagnostics never change generation or billing behavior. */}
}
