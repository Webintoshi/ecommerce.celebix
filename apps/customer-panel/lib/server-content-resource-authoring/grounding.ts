import 'server-only';
import {types as nodeTypes} from 'node:util';
import {parseContentOutline,parseContentResourceDraft,type ContentOutline,type ContentResourceAuthoringRequest,type ContentResourceDraft,type MerchantContentField} from '@celebix/saas-contracts';
import{renderContentResourceBody,type ContentBlock,type ContentTextNode}from'./render.ts';
import type{ContentResourceSnapshot}from'./snapshot.ts';

const encoder=new TextEncoder();
function invalid():never{throw new TypeError('content_resource_output_invalid');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||nodeTypes.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).length!==keys.length||keys.some(key=>!descriptors[key]?.enumerable||!('value'in descriptors[key]!)))invalid();
 return Object.fromEntries(keys.map(key=>[key,descriptors[key]!.value]));
}
function array(value:unknown,min:number,max:number):readonly unknown[]{
 if(!Array.isArray(value)||nodeTypes.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)invalid();
 const d=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(d).length!==value.length+1)invalid();
 return Array.from({length:value.length},(_,index)=>{const item=d[String(index)];if(!item?.enumerable||!('value'in item))invalid();return item.value;});
}
function text(value:unknown,max:number,min=0):string{
 if(typeof value!=='string'||encoder.encode(value).byteLength>max||encoder.encode(value).byteLength<min||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))invalid();
 return value;
}
function node(raw:unknown,used:Set<string>):ContentTextNode{
 const rawType=Object.getOwnPropertyDescriptor(raw as object,'type')?.value;
 if(rawType==='text'){const r=object(raw,['type','text']);return Object.freeze({type:'text',text:text(r.text,4000)}) as ContentTextNode;}
 if(rawType==='citation'){const r=object(raw,['type','sourceId','quote']);const sourceId=text(r.sourceId,36,36),quote=text(r.quote,512,1);used.add(`${sourceId}\u0000${quote}`);return Object.freeze({type:'citation',sourceId,quote}) as ContentTextNode;}
 invalid();
}
function nodes(raw:unknown,used:Set<string>):readonly ContentTextNode[]{return Object.freeze(array(raw,1,100).map(value=>node(value,used)));}
function blocks(raw:unknown,used:Set<string>):readonly ContentBlock[]{return Object.freeze(array(raw,1,100).map(value=>{
 const kind=Object.getOwnPropertyDescriptor(value as object,'type')?.value;
 if(kind==='paragraph'){const r=object(value,['type','children']);return Object.freeze({type:'paragraph',children:nodes(r.children,used)});}
 if(kind==='heading'){const r=object(value,['type','level','children']);if(![2,3,4].includes(r.level as number))invalid();return Object.freeze({type:'heading',level:r.level as 2|3|4,children:nodes(r.children,used)});}
 if(kind==='list'){const r=object(value,['type','ordered','items']);if(typeof r.ordered!=='boolean')invalid();return Object.freeze({type:'list',ordered:r.ordered,items:Object.freeze(array(r.items,1,50).map(item=>nodes(item,used)))});}
 if(kind==='table'){const r=object(value,['type','rows']);return Object.freeze({type:'table',rows:Object.freeze(array(r.rows,1,30).map(row=>Object.freeze(array(row,1,8).map(cell=>nodes(cell,used)))))});}
 invalid();
}));}
const normalized=(value:string)=>value.normalize('NFC').replace(/\s+/gu,' ').trim();
const numbers=(value:string):readonly string[]=>value.match(/\d+(?:[.,]\d+)?/gu)??[];
function blockSegments(values:readonly ContentBlock[]):readonly string[]{
 const nodeText=(children:readonly ContentTextNode[])=>children.map(child=>child.type==='text'?child.text:'').join('');
 return values.flatMap(block=>{
  if(block.type==='paragraph'||block.type==='heading')return[nodeText(block.children)];
  if(block.type==='list')return block.items.map(nodeText);
  return block.rows.flatMap(row=>row.map(nodeText));
 });
}

export function validateContentResourceOutput(raw:unknown,request:ContentResourceAuthoringRequest,snapshot:ContentResourceSnapshot):ContentOutline|ContentResourceDraft{
 const key=Object.getOwnPropertyDescriptor(raw as object,'sourceFingerprint')?.value;
 if(key!==snapshot.sourceFingerprint)invalid();
 if(request.stage==='outline'){
  const r=object(raw,['sourceFingerprint','outline']);
  return parseContentOutline(r.outline);
 }
 const r=object(raw,['sourceFingerprint','values','citations','suggestions']);
 const fields=request.fields as readonly MerchantContentField[],values=object(r.values,fields),used=new Set<string>();
 const rendered:Record<string,string|null>={};
 const semantic:Record<string,string|null>={};
 const segments:Record<string,readonly string[]>={};
 for(const field of fields){
  if(field==='body'){const b=blocks(values.body,used);rendered.body=renderContentResourceBody(b);segments.body=blockSegments(b);semantic.body=segments.body.join(' ');}
  else{semantic[field]=rendered[field]=values[field]===null&&field!=='name'?null:text(values[field],field==='name'||field==='seoTitle'?160:4000,field==='name'?1:0);segments[field]=typeof semantic[field]==='string'?[semantic[field]]:[];}
 }
 const citations=array(r.citations,0,100).map(rawCitation=>{
  const citation=object(rawCitation,['field','sourceId','quote']);
  if(typeof citation.field!=='string'||!fields.includes(citation.field as MerchantContentField))invalid();
  const sourceId=text(citation.sourceId,36,36),quote=text(citation.quote,512,1);
  const source=snapshot.sources.find(item=>item.id===sourceId);
  if(!source||!normalized(source.extractedText).includes(normalized(quote)))invalid();
  return Object.freeze({field:citation.field as MerchantContentField,sourceId,quote});
 });
 for(const ref of used)if(!citations.some(citation=>`${citation.sourceId}\u0000${citation.quote}`===ref&&citation.field==='body'))invalid();
 const context=JSON.stringify(request.currentDraft),contextNumbers=numbers(context);
 const productIdentifiers=new Set((context.match(/[\p{L}]{2,}[-_]?\d{2,}/gu)??[]).map(value=>value.toLocaleLowerCase(request.locale)));
 for(const [field,value]of Object.entries(semantic)){
  if(typeof value!=='string')continue;
  if(/(?:https?:\/\/|www\.)\S+/iu.test(value))invalid();
  if(/(?:bu ürün|ürünümüz|modelimiz)/iu.test(value)&&!/(?:bu ürün|ürünümüz|modelimiz)/iu.test(context))invalid();
  const evidence=citations.filter(citation=>citation.field===field).map(citation=>citation.quote).join(' ');
  for(const number of numbers(value))if(!contextNumbers.includes(number)&&!numbers(evidence).includes(number))invalid();
  for(const segment of segments[field]??[]){
   const identifiers=segment.match(/[\p{L}]{2,}[-_]?\d{2,}/gu)??[];
   const specific=/(?:bu ürün|ürünümüz|modelimiz)/iu.test(segment)||identifiers.some(identifier=>productIdentifiers.has(identifier.toLocaleLowerCase(request.locale)));
   if(specific&&numbers(segment).some(number=>!contextNumbers.includes(number)))invalid();
  }
 }
 const suggestions=array(r.suggestions,0,12).map(value=>text(value,500,1));
 return parseContentResourceDraft({sourceFingerprint:snapshot.sourceFingerprint,values:rendered,citations,suggestions});
}
