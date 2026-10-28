import 'server-only';
import {createHash} from 'node:crypto';
import {normalizeProductDescriptionRichText,type ProductDescriptionRichTextNode} from '../../../../packages/platform-config/src/product-description-rich-text.ts';
import {assertProductDraftGrounding} from '../../../../packages/saas-contracts/src/content-authoring/grounding.ts';
import {canonicalContentAuthoringValue} from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import type {ContentAuthoringDraft,ContentAuthoringRequest,ProductFactPacket} from '../../../../packages/saas-contracts/src/content-authoring/types.ts';

/** Existing prose is merchant-supplied evidence, never independently verified attributes. */
export function attachAutomaticProductSource(packet:ProductFactPacket,request:ContentAuthoringRequest):ProductFactPacket{
 const source=request.currentDraft.description??'';
 if(!source.trim())return packet;
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source)||/<\s*(?:script|style|iframe|object|embed|form|input|svg)\b/iu.test(source))throw Object.assign(Error('source_preservation_required'),{code:'source_preservation_required'});
 const read=(node:ProductDescriptionRichTextNode):string=>node.type==='text'?node.value:node.tag==='br'?' ':node.children.map(read).join('')+(['p','li','h2','h3','h4','tr'].includes(node.tag)?' ': '');
 const paragraphs=normalizeProductDescriptionRichText(source).map(read).map(v=>v.replace(/\s+/gu,' ').trim()).filter(Boolean);
 const clauses:string[]=[];for(const paragraph of paragraphs){if(paragraph.length<=1000){clauses.push(paragraph);continue;}let chunk='';for(const raw of paragraph.split(/(?<=[.!?])\s+/u)){const sentence=raw.trim();if(!sentence)continue;if(sentence.length>1000)throw Object.assign(Error('source_preservation_required'),{code:'source_preservation_required'});if(chunk.length+sentence.length+1>1000){clauses.push(chunk);chunk='';}chunk+=(chunk?' ':'')+sentence;}if(chunk)clauses.push(chunk);}
 if(!clauses.length)return packet;
 if(clauses.length>32||clauses.some(value=>value.length>1000))throw Object.assign(Error('source_preservation_required'),{code:'source_preservation_required'});
 const additions=clauses.map((value,i)=>({ref:`product:existing:${i}`,field:'merchantDescription',value,source:'current_draft' as const,scope:'product' as const}));
 const facts=[...packet.facts,...additions];
 const sourceFingerprint=createHash('sha256').update(canonicalContentAuthoringValue({base:packet.sourceFingerprint,existingSource:source,facts})).digest('hex');
 return {...packet,facts,sourceFingerprint};
}
/** Keep complete existing assertions, including later tolerances/negation, in optimized descriptions. */
export function assertAutomaticSourcePreserved(draft:ContentAuthoringDraft,packet:ProductFactPacket):void{
 for(const field of ['seoTitle','seoDescription'] as const)if(draft[field]!==undefined)assertProductDraftGrounding({[field]:draft[field],suggestions:[],claims:draft.claims.filter(c=>c.field===field),sourceFingerprint:packet.sourceFingerprint},{...packet,facts:packet.facts.filter(f=>!f.ref.startsWith('product:existing:'))});
 if(!draft.description)return;
 const refs:string[]=[];
 const nodes=(list:readonly import('../../../../packages/saas-contracts/src/content-authoring/types.ts').ContentAuthoringTextNode[])=>list.forEach(n=>{if(n.type==='fact'&&n.factRef.startsWith('product:existing:'))refs.push(n.factRef);});
 for(const block of draft.description){if(block.type==='paragraph'||block.type==='heading')nodes(block.children);else if(block.type==='list')block.items.forEach(nodes);else block.rows.forEach(row=>row.forEach(nodes));}
 const source=packet.facts.filter(f=>f.ref.startsWith('product:existing:'));
 if(JSON.stringify(refs)!==JSON.stringify(source.map(f=>f.ref)))throw TypeError('invalid_output');
}
