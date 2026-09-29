import type { ContentAuthoringBlock, ContentAuthoringTextNode } from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
const escape = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function renderContentAuthoringDescription(blocks:readonly ContentAuthoringBlock[]):string {
 const nodes=(items:readonly ContentAuthoringTextNode[])=>items.map(n=>escape(n.type==='text'?n.text:n.value+(n.unit?' '+n.unit:''))).join('');
 const html=blocks.map(b=>b.type==='paragraph'?`<p>${nodes(b.children)}</p>`:b.type==='heading'?`<h${b.level}>${nodes(b.children)}</h${b.level}>`:b.type==='list'?`<${b.ordered?'ol':'ul'}>${b.items.map(i=>`<li>${nodes(i)}</li>`).join('')}</${b.ordered?'ol':'ul'}>`:`<table><tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${nodes(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
 if(html.length>10000)throw new TypeError('content_authoring_description_too_large');return html;
}
