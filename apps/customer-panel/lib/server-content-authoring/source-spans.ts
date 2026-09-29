import 'server-only';
import {createHash} from 'node:crypto';
import {normalizeProductDescriptionRichText,extractPlainTextFromProductDescription,type ProductDescriptionRichTextNode} from '../../../../packages/platform-config/src/product-description-rich-text.ts';
import {assertProductDraftGrounding} from '../../../../packages/saas-contracts/src/content-authoring/grounding.ts';
import {canonicalContentAuthoringValue} from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import type {ContentAuthoringRequest,ProductFactPacket} from '../../../../packages/saas-contracts/src/content-authoring/types.ts';

const sha=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
function refuse():never {throw Object.assign(new Error('content_source_not_preservable'),{code:'source_preservation_required'});}
function sensitive(text:string):boolean {
 try {assertProductDraftGrounding({description:[{type:'paragraph',children:[{type:'text',text}]}],claims:[],suggestions:[],sourceFingerprint:''},{title:'',facts:[],sourceFingerprint:''});return false;}catch{return true;}
}
/** Reject before normalization can silently repair nesting, erase links/active
 * content, or discard semantic formatting (notably deleted/struck-out text). */
function strictSourceHtml(source:string):void {
 const stack:string[]=[];const tokens=source.match(/<[^>]*>|[^<]+/g)??[];
 if(tokens.join('')!==source||tokens.length>2048)refuse();
 for(const token of tokens){
  if(!token.startsWith('<')){
   if(!stack.length&&token.trim())refuse();
   if(token.replace(/&(amp|lt|gt|quot|#39|nbsp);/g,'').includes('&'))refuse();
   continue;
  }
  const closing=/^<\/(p|ul|ol|li|strong|em|u)>$/.exec(token);
  if(closing){if(stack.pop()!==closing[1])refuse();continue;}
  const opening=/^<(p|ul|ol|li|strong|em|u)>$/.exec(token);
  const br=/^<br(?:\s+class="ProseMirror-trailingBreak")?\s*\/?>$/.test(token);
  if(!opening&&!br)refuse();
  const tag=br?'br':opening![1];const parent=stack.at(-1);
  const allowed=parent===undefined?['p','ul','ol']:['ul','ol'].includes(parent)?['li']:parent==='li'?['p','strong','em','u','br']:['strong','em','u','br'];
  if(!allowed.includes(tag))refuse();
  if(!br){stack.push(tag);if(stack.length>24)refuse();}
 }
 if(stack.length)refuse();
}
function emptyEditorSource(source:string):boolean {
 return source===''||/^<p>(?:\s*|<br(?:\s+class="ProseMirror-trailingBreak")?\s*\/?>)<\/p>$/.test(source);
}
function plainTitleEcho(source:string,title:string):boolean {
 const escaped=title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 return source===`<p>${escaped}</p>`;
}
function clauses(source:string):readonly string[] {
 strictSourceHtml(source);
 const inline=(node:ProductDescriptionRichTextNode):string=>{
  if(node.type==='text')return node.value;
  if(node.tag==='br')return ' ';
  if(!['strong','em','u','p'].includes(node.tag))refuse();
  return node.children.map(inline).join('')+(node.tag==='p'?' ':'');
 };
 const values:string[]=[];
 for(const node of normalizeProductDescriptionRichText(source)){
  if(node.type!=='element')refuse();
  if(node.tag==='p')values.push(node.children.map(inline).join(''));
  else if(node.tag==='ul'||node.tag==='ol')for(const child of node.children){
   if(child.type!=='element'||child.tag!=='li')refuse();values.push(child.children.map(inline).join(''));
  }else refuse();
 }
 const result=values.map(value=>value.replace(/\s+/gu,' ').trim()).filter(Boolean);
 if(!result.length||result.length>32||result.some(value=>Buffer.byteLength(value,'utf8')>1000))refuse();
 return result;
}
/** Server-only preservation evidence, never independently reusable product facts.
 * The first increment keeps the whole description in one dependency group. */
export function attachProductSourcePreservation(packet:ProductFactPacket,request:ContentAuthoringRequest):ProductFactPacket {
 const source=request.currentDraft.description??'';
 if(/[\p{Cs}\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(source))refuse();
 // Inspect the original HTML before using a text extractor: it can erase
 // tables, links and active markup even when no visible text remains.
 if(source)strictSourceHtml(source);
 const visible=extractPlainTextFromProductDescription(source);
 if(request.action==='create'){if(!emptyEditorSource(source))refuse();return packet;}
 const otherSources=[...request.fields.filter(field=>field!=='description').map(field=>request.currentDraft[field]),request.selection?.text].filter((value):value is string=>Boolean(value));
 // A title echo is exempt only when the *original* HTML is a plain paragraph.
 // A linked/deleted/structured title or blank nonempty element has meaning
 // that the model cannot safely reconstruct from its extracted text.
 if(!visible&&!emptyEditorSource(source))refuse();
 if(visible===packet.title&&!plainTitleEcho(source,packet.title))refuse();
 if(plainTitleEcho(source,packet.title)||!visible){
  if(otherSources.some(value=>{const text=extractPlainTextFromProductDescription(value);return text!==packet.title&&sensitive(text);} ))refuse();
  return packet;
 }
 // A matching scalar does not resolve negation/tolerance/scope conflicts. Keep
 // mixed structured/prose and variant cases closed until separately supported.
 if(request.currentDraft.attributes?.length||Object.keys(request.currentDraft.measurements??{}).length||packet.facts.some(fact=>fact.scope==='variant'))refuse();
 if(/\b(?:ignore|disregard|override|system|assistant|instructions?|prompt|secret|api[_ -]?key)\b|talimat|yok\s*say|anahtar|komut|varyant|variant|seçenek|option/iu.test(visible))refuse();
 const values=clauses(source);const text=values.join(' ');
 if(text.length>10000||(request.fields.includes('seoDescription')&&text.length>500))refuse();
 if(request.fields.includes('seoTitle')&&(packet.title.length>200||/[<>\r\n]/.test(packet.title)))refuse();
 if(request.action==='rewrite_selection'&&(request.fields.length!==1||request.fields[0]!=='description'||request.selection?.field!=='description'||request.selection.text.replace(/\s+/gu,' ').trim()!==text))refuse();
 for(const field of request.fields){
  if(field==='description')continue;
  const previous=request.currentDraft[field];const next=field==='seoTitle'?packet.title:text;
  if(previous&&previous!==next&&sensitive(extractPlainTextFromProductDescription(previous)))refuse();
 }
 const sourceHash=sha(source),textHash=sha(text);let offset=0;
 const spans=Object.freeze(values.map((value,ordinal)=>{const start=offset;offset+=value.length+1;return Object.freeze({ref:`source:${ordinal}`,value,ordinal,start,end:start+value.length});}));
 const sourcePreservation=Object.freeze({sourceHash,textHash,text,clauses:spans});
 const result=Object.freeze({...packet,sourcePreservation,sourceFingerprint:sha(canonicalContentAuthoringValue({base:packet.sourceFingerprint,sourcePreservation}))});
 // This envelope includes more fields than the actual model input. Fail before
 // credentials/admission rather than truncate either copy of the source.
 if(Buffer.byteLength(JSON.stringify({facts:result,...request}),'utf8')>32768)refuse();
 return result;
}
