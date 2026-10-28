import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import MarkdownIt,{type Options} from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type {ContentAuthoringBlock,ContentAuthoringClaim,ContentAuthoringField,ContentAuthoringTextNode,ProductFact,ProductFactPacket} from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
import {canonicalContentAuthoringValue} from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import {assertProductDraftGrounding}from'../../../../packages/saas-contracts/src/content-authoring/grounding.ts';

export const PRODUCT_BOLD_FACT_PREFIX='format:bold:';
function fail():never{throw new TypeError('content_authoring_contract_invalid');}
const fold=(value:string)=>value.normalize('NFC').toLocaleLowerCase('tr-TR');
const existing=(fact:ProductFact)=>fact.field==='merchantDescription'||fact.ref.startsWith('product:existing:')||fact.ref.startsWith('source:');
const display=(fact:ProductFact)=>fact.value+(fact.unit?' '+fact.unit:'');
const markdownOptions:Options&{maxNesting:number}={html:false,linkify:false,typographer:false,breaks:false,maxNesting:12};
const parser=new MarkdownIt(markdownOptions);

/** Presentation aliases repeat complete trusted facts, never create lexical evidence. */
export function withProductFormattingFacts(packet:ProductFactPacket):ProductFactPacket{
 const originals=packet.facts.filter(fact=>!fact.ref.startsWith(PRODUCT_BOLD_FACT_PREFIX));
 const aliases=originals.filter(fact=>!existing(fact)&&PRODUCT_BOLD_FACT_PREFIX.length+fact.ref.length<=200).map(fact=>({...fact,ref:PRODUCT_BOLD_FACT_PREFIX+fact.ref}));
 const supplied=packet.facts.filter(fact=>fact.ref.startsWith(PRODUCT_BOLD_FACT_PREFIX));
 if(supplied.length){
  for(const fact of supplied)if(!aliases.some(alias=>canonicalContentAuthoringValue(alias)===canonicalContentAuthoringValue(fact)))fail();
  if(canonicalContentAuthoringValue(supplied)===canonicalContentAuthoringValue(aliases))return packet;
 }
 if(!aliases.length)return packet;
 const facts=[...originals,...aliases];
 const sourceFingerprint=createHash('sha256').update(canonicalContentAuthoringValue({base:packet.sourceFingerprint,formattingFacts:aliases})).digest('hex');
 return {...packet,facts,sourceFingerprint};
}
function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)fail();
 const out:Record<string,unknown>=Object.create(null);for(const[name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){if(!descriptor.enumerable||!('value'in descriptor))fail();out[name]=descriptor.value;}return out;
}
function safeString(value:unknown,max=20000):string{
 if(typeof value!=='string'||!value.trim()||value.length>max||Buffer.byteLength(value,'utf8')>32768||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail();return value as string;
}
function factNode(fact:ProductFact):ContentAuthoringTextNode{return {type:'fact',factRef:fact.ref,value:fact.value,...(fact.unit?{unit:fact.unit}:{})};}
function scopeNamed(text:string,fact:ProductFact,packet:ProductFactPacket):boolean{
 if(fact.scope==='product')return true;
 const names=packet.facts.filter(value=>value.scope==='variant'&&value.variantId===fact.variantId&&value.field==='title'&&!value.ref.startsWith(PRODUCT_BOLD_FACT_PREFIX));
 return names.some(name=>{const escaped=fold(name.value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped} (?:seçene[ğk]\\p{L}*|varyant\\p{L}*|variant|option)(?=$|[^\\p{L}\\p{N}])`,'u').test(fold(text));});
}

export function createProductWriterProtocol(input:Readonly<{packet:ProductFactPacket;fields:readonly ContentAuthoringField[];nonce?:string}>){
 const {packet,fields}=input;const nonce=input.nonce??randomBytes(16).toString('hex');if(!/^[a-f0-9]{32}$/.test(nonce)||!fields.length||new Set(fields).size!==fields.length)fail();
 const originals=packet.facts.filter(fact=>!fact.ref.startsWith(PRODUCT_BOLD_FACT_PREFIX));
 const sources=fields.includes('description')?originals.filter(fact=>fact.ref.startsWith('product:existing:')):[];
 const slots=sources.map((fact,index)=>({marker:`[[TOSHI_SOURCE_${nonce}_${index}]]`,text:fact.value,fact}));
 const sourceMap=new Map(slots.map(slot=>[slot.marker,slot]));
 const attrs=(facts:readonly ProductFact[])=>facts.filter(fact=>!['title','category','brand'].includes(fact.field)&&!existing(fact)).map(fact=>({name:fact.field,value:fact.value,...(fact.unit?{unit:fact.unit}:{})}));
 const variantIds=[...new Set(originals.filter(fact=>fact.scope==='variant').map(fact=>fact.variantId))];
 const context={productName:packet.title,attributes:attrs(originals.filter(fact=>fact.scope==='product')),variants:variantIds.map(id=>({name:originals.find(fact=>fact.variantId===id&&fact.field==='title')?.value??'',attributes:attrs(originals.filter(fact=>fact.variantId===id))})),sourceSlots:slots.map(({marker,text})=>({marker,text}))};
 function decode(value:unknown):unknown{
  const raw=object(value);
  // Previously persisted/provider structured drafts remain accepted and validated by the caller.
  if(Object.hasOwn(raw,'claims')||Object.hasOwn(raw,'sourceFingerprint'))return value;
  const expected=fields.map(field=>field==='description'?'descriptionMarkdown':field).sort();if(Object.keys(raw).sort().join('\0')!==expected.join('\0'))fail();
  const claims:ContentAuthoringClaim[]=[];const seen:string[]=[];let nodes=0;
  const claim=(field:ContentAuthoringField,fact:ProductFact)=>{if(!claims.some(value=>value.field===field&&value.factRef===fact.ref))claims.push({field,factRef:fact.ref,value:fact.value,...(fact.unit?{unit:fact.unit}:{})});if(claims.length>100)fail();};
  const add=(output:ContentAuthoringTextNode[],node:ContentAuthoringTextNode)=>{if(++nodes>1000)fail();if(node.type==='text'&&!node.text)return;const last=output.at(-1);if(node.type==='text'&&last?.type==='text')output[output.length-1]={type:'text',text:last.text+node.text};else output.push(node);if(output.length>100)fail();};
  function textNodes(text:string,output:ContentAuthoringTextNode[]){
   if(text.includes('**'))fail();
   const matcher=/\[\[TOSHI_SOURCE_[^\]\r\n]*\]\]/g;let offset=0;
   for(const match of text.matchAll(matcher)){const marker=match[0],slot=sourceMap.get(marker);if(!slot)fail();const before=text.slice(offset,match.index);if(before.includes('[[TOSHI_SOURCE_'))fail();add(output,{type:'text',text:before});seen.push(marker);add(output,factNode(slot.fact));claim('description',slot.fact);offset=match.index!+marker.length;}
   const tail=text.slice(offset);if(tail.includes('[[TOSHI_SOURCE_'))fail();add(output,{type:'text',text:tail});
  }
  function inline(tokens:Token[]):ContentAuthoringTextNode[]{
   const output:ContentAuthoringTextNode[]=[];const visible=tokens.map(token=>token.type==='text'?token.content:token.type==='softbreak'?' ':'').join('');
   for(let i=0;i<tokens.length;i++){
    const token=tokens[i]!;
    if(token.type==='text')textNodes(token.content,output);
    else if(token.type==='softbreak')add(output,{type:'text',text:' '});
    else if(token.type==='strong_open'){
     let content='';let closed=false;while(++i<tokens.length){const part=tokens[i]!;if(part.type==='strong_close'){closed=true;break;}if(part.type!=='text'&&part.type!=='softbreak')fail();content+=part.type==='softbreak'?' ':part.content;}if(!closed||!content)fail();
     if(sourceMap.has(content)){textNodes(content,output);continue;}
     const fact=packet.facts.find(fact=>fact.ref.startsWith(PRODUCT_BOLD_FACT_PREFIX)&&scopeNamed(visible,fact,packet)&&(fold(display(fact))===fold(content)||(fact.unit&&fold(fact.value+fact.unit)===fold(content))));
     if(fact){add(output,factNode(fact));claim('description',fact);}else textNodes(content,output);
    }else fail();
   }
   return output;
  }
  const draft:Record<string,unknown>={suggestions:[],claims,sourceFingerprint:packet.sourceFingerprint};
  if(fields.includes('description')){
   const markdown=safeString(raw.descriptionMarkdown);if(/<\/?[a-z][^>]*>/iu.test(markdown)||/```|~~~/u.test(markdown))fail();
   const tokens=parser.parse(markdown,{}),blocks:ContentAuthoringBlock[]=[];let hasH2=false;
   for(let i=0;i<tokens.length;){const open=tokens[i++],content=tokens[i++],close=tokens[i++];if(!open||!content||!close||content.type!=='inline'||!content.children)fail();const children=inline(content.children);if(!children.length)fail();
    if(open.type==='paragraph_open'&&close.type==='paragraph_close')blocks.push({type:'paragraph',children});
    else if(open.type==='heading_open'&&close.type==='heading_close'&&['h2','h3'].includes(open.tag)){if(open.tag==='h3'&&!hasH2)fail();if(open.tag==='h2')hasH2=true;blocks.push({type:'heading',level:open.tag==='h2'?2:3,children});}else fail();if(blocks.length>100)fail();
   }
   if(!blocks.length||seen.join('\0')!==slots.map(slot=>slot.marker).join('\0'))fail();draft.description=blocks;
  }
  for(const field of ['seoTitle','seoDescription']as const)if(fields.includes(field)){const text=safeString(raw[field],field==='seoTitle'?200:500).normalize('NFC');if(/[\r\n<>]/u.test(text)||text.includes('**')||text.includes('[[TOSHI_SOURCE_'))fail();assertProductDraftGrounding({[field]:text,suggestions:[],claims:[],sourceFingerprint:packet.sourceFingerprint},{...packet,facts:originals.filter(fact=>fact.scope==='product'&&!existing(fact))});draft[field]=text;}
  return draft;
 }
 return {context,decode};
}
