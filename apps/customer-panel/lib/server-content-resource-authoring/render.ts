import 'server-only';
import {normalizeMerchantContentBody} from '../../../../packages/platform-config/src/merchant-content-body.ts';

export type ContentTextNode=Readonly<{type:'text';text:string}>|Readonly<{type:'citation';sourceId:string;quote:string}>;
export type ContentBlock=Readonly<{type:'paragraph';children:readonly ContentTextNode[]}>|Readonly<{type:'heading';level:2|3|4;children:readonly ContentTextNode[]}>|Readonly<{type:'list';ordered:boolean;items:readonly (readonly ContentTextNode[])[]}>|Readonly<{type:'table';rows:readonly (readonly (readonly ContentTextNode[])[])[]}>;
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function nodes(values:readonly ContentTextNode[]):string{return values.map(node=>node.type==='text'?escape(node.text):' [Kaynak]').join('');}
/** Render validated blocks only. No model-supplied HTML, href or source URL is inserted. */
export function renderContentResourceBody(blocks:readonly ContentBlock[]):string{
 const html=blocks.map(block=>{
  if(block.type==='paragraph')return `<p>${nodes(block.children)}</p>`;
  if(block.type==='heading')return `<h${block.level}>${nodes(block.children)}</h${block.level}>`;
  if(block.type==='list'){const tag=block.ordered?'ol':'ul';return `<${tag}>${block.items.map(item=>`<li>${nodes(item)}</li>`).join('')}</${tag}>`;}
  return `<table><tbody>${block.rows.map(row=>`<tr>${row.map(cell=>`<td>${nodes(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 }).join('');
 return normalizeMerchantContentBody(html);
}
