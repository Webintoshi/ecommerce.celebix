import type {ContentAuthoringDraft,ContentAuthoringField,ContentAuthoringRequest} from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
import {TOSHI_CREDIT_PRICES} from '../../../../packages/saas-contracts/src/toshi/credits.ts';

const visible=(value:string|null|undefined)=>Boolean((value??'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160|#x0*a0);/gi,' ').replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu,'').trim());
export function automaticFieldActions(request:ContentAuthoringRequest):Partial<Record<ContentAuthoringField,'create'|'improve'>>{
 return Object.fromEntries(request.fields.map(field=>[field,visible(request.currentDraft[field])?'improve':'create']));
}
export function selectedContentCreditCost(fields:readonly ContentAuthoringField[]):number{
 if(!fields.length||new Set(fields).size!==fields.length||fields.some(f=>!['description','seoTitle','seoDescription'].includes(f)))throw TypeError('invalid_input');
 return fields.reduce((total,field)=>total+TOSHI_CREDIT_PRICES[field],0);
}
export function assertToshiGeneratedLimits(draft:ContentAuthoringDraft):void{
 for(const[field,limit]of [['seoTitle',60],['seoDescription',160]]as const){const value=draft[field];if(value!==undefined&&([...value.normalize('NFC')].length>limit||/[\r\n<>]/.test(value)))throw TypeError('invalid_output');}
 if(draft.description){
  const strings:string[]=[];
  const nodes=(values:readonly import('../../../../packages/saas-contracts/src/content-authoring/types.ts').ContentAuthoringTextNode[])=>strings.push(values.map(n=>n.type==='text'?n.text:`${n.value}${n.unit?` ${n.unit}`:''}`).join(''));
  for(const block of draft.description){if(block.type==='paragraph'||block.type==='heading')nodes(block.children);else if(block.type==='list')block.items.forEach(nodes);else block.rows.forEach(row=>row.forEach(nodes));}
  if(strings.join(' ').split(/\s+/u).filter(word=>/[\p{L}\p{N}]/u.test(word)).length>1000)throw TypeError('invalid_output');
 }
}

/** Fresh AUTO copy must be a developed article, not the old two-sentence result. */
export function assertProductWriterCompleteness(draft:ContentAuthoringDraft):void{
 if(!draft.description)return;
 const words=(text:string)=>(text.replace(/\p{Cf}/gu,'').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[]).length;
 const inline=(nodes:readonly import('../../../../packages/saas-contracts/src/content-authoring/types.ts').ContentAuthoringTextNode[])=>nodes.map(n=>n.type==='text'?n.text:n.value+(n.unit?' '+n.unit:'')).join('');
 let bodyWords=0,sections=0;
 for(const block of draft.description){
  if(block.type==='heading'){if(block.level===2&&words(inline(block.children)))sections++;}
  else if(block.type==='paragraph')bodyWords+=words(inline(block.children));
  else if(block.type==='list')for(const item of block.items)bodyWords+=words(inline(item));
  else for(const row of block.rows)for(const cell of row)bodyWords+=words(inline(cell));
 }
 if(bodyWords<180||sections<2)throw TypeError('invalid_output');
}
