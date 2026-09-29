// Local browser QA only: all evidence comes from the named synthetic fixture
// and the submitted draft. No provider, credentials, database or remote IO.
import {
  parseContentAuthoringRequest, parseContentGenerationView, validateProductDraftOutput,
  type ContentAuthoringBlock, type ContentAuthoringRequest, type ContentAuthoringTextNode,
  type ContentGenerationView, type ProductFact, type ProductFactPacket,
} from "../../../../../../../../packages/saas-contracts/src/content-authoring/index.ts";
import {buildProductFactPacket,fingerprintContentAuthoringRequest} from "../../../../../../../../apps/customer-panel/lib/server-content-authoring/facts.ts";
import {ATTRIBUTE_RESOURCES,PRODUCT,PROFILE,VARIANT,OPTIONS,RESOURCES} from "../../../mira-catalog/catalog-fixture.ts";

const NOW="2026-09-29T12:00:00.000Z";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Entry={fingerprint:string;generation:ContentGenerationView;pending:boolean};
const fixtureGlobal=globalThis as typeof globalThis & {__celebixContentAuthoringBrowserFixture?:Map<string,Entry>};
const operations=fixtureGlobal.__celebixContentAuthoringBrowserFixture??=new Map<string,Entry>();
const resolver={
  category:(id:string)=>OPTIONS.categories.find(value=>value.id===id)??null,
  brand:(id:string)=>OPTIONS.resources.find(value=>value.kind==="brand"&&value.id===id)??null,
  attribute:(id:string)=>ATTRIBUTE_RESOURCES.find(value=>value.id===id)??null,
  variant:(id:string)=>VARIANT.id===id?VARIANT:null,
};
function json(value:unknown,status=200) {return Response.json(value,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}
function error(code:string,status:number) {return json({code},status);}
function factNode(fact:ProductFact):ContentAuthoringTextNode {return {type:"fact",factRef:fact.ref,value:fact.value,...(fact.unit?{unit:fact.unit}:{})};}
function description(request:ContentAuthoringRequest,packet:ProductFactPacket):ContentAuthoringBlock[] {
 const title=packet.facts.find(fact=>fact.scope==="product"&&fact.field==="title")!;
 const blocks:ContentAuthoringBlock[]=[{type:"paragraph",children:[factNode(title)]}];
 if(request.action==="rewrite_selection") return blocks;
 blocks.push({type:"heading",level:4,children:[{type:"text",text:"Ürün bilgileri"}]});
 const productFacts=packet.facts.filter(fact=>fact.scope==="product"&&fact.field!=="title");
 if(productFacts.length) blocks.push({type:"list",ordered:false,items:productFacts.map(fact=>[{type:"text",text:`${fact.field=== "category"?"Kategori":fact.field==="brand"?"Marka":fact.field}: `},factNode(fact)])});
 const variantFacts=packet.facts.filter(fact=>fact.scope==="variant"&&fact.field!=="title");
 if(variantFacts.length) blocks.push({type:"table",rows:variantFacts.map(fact=>{
  const variantTitle=packet.facts.find(value=>value.variantId===fact.variantId&&value.field==="title")!.value;
  return [[{type:"text",text:`Varyant: ${variantTitle}`}],[{type:"text",text:fact.field}],[factNode(fact)]];
 })});
 if(!productFacts.length&&!variantFacts.length) blocks.push({type:"paragraph",children:[{type:"text",text:"Ürün bilgilerini açıklama alanında düzenleyebilirsiniz."}]});
 return blocks;
}
function generation(request:ContentAuthoringRequest,id:string,packet:ProductFactPacket):ContentGenerationView {
 const draft=validateProductDraftOutput({
  sourceFingerprint:packet.sourceFingerprint,suggestions:[],claims:[],
  ...(request.fields.includes("description")?{description:description(request,packet)}:{}),
  ...(request.fields.includes("seoTitle")?{seoTitle:packet.title}:{}),
  ...(request.fields.includes("seoDescription")?{seoDescription:`${packet.title} için ürün bilgileri.`}:{}),
 },packet,request.fields);
 return parseContentGenerationView({id,draftId:request.draftId,productId:request.productId,status:"completed",draft,sourceFingerprint:packet.sourceFingerprint,usage:null,safeCode:null,createdAt:NOW,updatedAt:NOW,finishedAt:NOW});
}
function view(entry:Entry):ContentGenerationView {return entry.pending?parseContentGenerationView({...entry.generation,status:"pending",draft:null,finishedAt:null}):entry.generation;}

export async function postContentAuthoringFixture(request:Request):Promise<Response> {
 if(request.method!=="POST")return error("method_not_allowed",405);
 const operationId=request.headers.get("idempotency-key")??"";
 if(!UUID.test(operationId))return error("invalid_input",400);
 let input:ContentAuthoringRequest,packet:ProductFactPacket;
 try {input=parseContentAuthoringRequest(await request.json());}
 catch{return error("invalid_input",400);}
 if(input.productId!==null&&input.productId!==PRODUCT.id)return error("membership_denied",403);
 if(input.productId!==null&&(input.productVersion!==PRODUCT.version||input.profileVersion!==PROFILE.version))return error("version_conflict",409);
 try{packet=buildProductFactPacket(input.productId?PRODUCT:null,input.currentDraft,resolver);}
 catch{return error("invalid_input",400);}
 const fingerprint=fingerprintContentAuthoringRequest(input),existing=operations.get(operationId);
 if(existing)return existing.fingerprint===fingerprint?json({generation:view(existing)}):error("operation_mismatch",409);
 if(input.note.includes("[fixture:no-key]"))return error("connection_missing",409);
 if(input.note.includes("[fixture:provider-failure]"))return error("provider_failed",502);
 let entry:Entry;
 try{entry={fingerprint,generation:generation(input,operationId,packet),pending:input.note.includes("[fixture:pending]")};}
 catch{return error("invalid_output",502);}
 if(operations.size>=128)operations.delete(operations.keys().next().value!);
 operations.set(operationId,entry);
 if(input.note.includes("[fixture:delay]"))await new Promise(resolve=>setTimeout(resolve,2500));
 return json({generation:view(entry)});
}

export function getContentAuthoringFixture(id:string):Response {
 if(!UUID.test(id))return error("invalid_input",400);
 const entry=operations.get(id);if(!entry)return error("operation_not_found",404);
 entry.pending=false;return json({generation:entry.generation});
}
