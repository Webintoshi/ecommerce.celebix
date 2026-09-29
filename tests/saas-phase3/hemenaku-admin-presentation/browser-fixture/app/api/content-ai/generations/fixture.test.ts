import assert from "node:assert/strict";
import test from "node:test";
import {postContentAuthoringFixture,getContentAuthoringFixture} from "./fixture.ts";
import {parseContentGenerationView} from "../../../../../../../../packages/saas-contracts/src/content-authoring/index.ts";
import {buildProductFactPacket} from "../../../../../../../../apps/customer-panel/lib/server-content-authoring/facts.ts";
import {ATTRIBUTE_RESOURCES,PRODUCT,PROFILE,VARIANT,OPTIONS,RESOURCES} from "../../../mira-catalog/catalog-fixture.ts";

const id=(n:number)=>`93000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const request={draftId:id(1),productId:null,productVersion:null,profileVersion:null,currentDraft:{title:"Burgu bileklik",variants:[{title:"Standart",measurements:{weight:{valueMilli:14890,unit:"g"}}}]},action:"create",fields:["description","seoTitle","seoDescription"],locale:"tr-TR",tone:"neutral",length:"medium",note:"",selection:null} as const;
const resolver={category:(id:string)=>OPTIONS.categories.find(x=>x.id===id)??null,brand:(id:string)=>OPTIONS.resources.find(x=>x.kind==="brand"&&x.id===id)??null,attribute:(id:string)=>ATTRIBUTE_RESOURCES.find(value=>value.id===id)??null,variant:(id:string)=>VARIANT.id===id?VARIANT:null};
const post=(body:unknown=request,key=id(2))=>postContentAuthoringFixture(new Request("http://127.0.0.1:3100/api/content-ai/generations",{method:"POST",headers:{"content-type":"application/json","idempotency-key":key},body:JSON.stringify(body)}));

test("deterministic new-draft response uses strict production view, exact requested fields, source packet and replayed GET",async()=>{
 const response=await post();assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
 const body=await response.json();const view=parseContentGenerationView(body.generation);assert.equal(view.id,id(2));assert.equal(view.draftId,request.draftId);assert.equal(view.productId,null);assert.equal(view.sourceFingerprint,buildProductFactPacket(null,request.currentDraft,resolver).sourceFingerprint);assert.equal(view.draft?.sourceFingerprint,view.sourceFingerprint);assert.equal(view.usage,null);
 assert.deepEqual(await (await post()).json(),body);assert.deepEqual(await getContentAuthoringFixture(view.id).json(),body);assert.equal(getContentAuthoringFixture(view.id).headers.get("cache-control"),"no-store");
 assert.ok(JSON.stringify(body).includes("14.89"));assert.equal(body.generation.provider,undefined);assert.equal(body.generation.secret,undefined);
});

test("existing synthetic product bindings require current product/profile versions and own variant IDs",async()=>{
 const draft={title:"Unsaved fixture product",categoryIds:[OPTIONS.categories[0].id],brandId:RESOURCES.brand.id,variants:[{id:VARIANT.id,title:VARIANT.title,measurements:{weight:{valueMilli:250,unit:"kg"}}}]};
 const body={...request,productId:PRODUCT.id,productVersion:PRODUCT.version,profileVersion:PROFILE.version,currentDraft:draft,fields:["seoTitle"]};
 const response=await post(body,id(3));assert.equal(response.status,200);const view=parseContentGenerationView((await response.json()).generation);assert.equal(view.productId,PRODUCT.id);assert.equal(view.draft?.seoTitle,draft.title);assert.equal(view.draft?.description,undefined);assert.equal(view.draft?.seoDescription,undefined);
 assert.equal((await post({...body,productVersion:1},id(4))).status,409);
 assert.equal((await post({...body,productId:id(50)},id(5))).status,403);
 assert.equal((await post({...body,currentDraft:{...draft,variants:[{id:id(51),title:"Foreign"}]}},id(6))).status,400);
});

test("same operation with changed input is rejected and hostile extra authority never enters a fixture generation",async()=>{
 await post(request,id(7));assert.equal((await post({...request,currentDraft:{title:"Different"}},id(7))).status,409);
 for(const extra of [{storeId:id(10)},{provider:"deepseek"},{secret:"private"}])assert.equal((await post({...request,...extra},id(8))).status,400);
 assert.equal((await post(request,"hostile-key")).status,400);
 assert.equal(getContentAuthoringFixture(id(99)).status,404);
});

test("fixture error controls preserve safe codes and pending transitions use the same operation and bindings",async()=>{
 for(const [note,code,status] of [["[fixture:no-key]","connection_missing",409],["[fixture:provider-failure]","provider_failed",502]] as const){const response=await post({...request,note},id(20));assert.equal(response.status,status);assert.deepEqual(await response.json(),{code});}
 const pending=await post({...request,note:"[fixture:pending]"},id(21));const initial=parseContentGenerationView((await pending.json()).generation);assert.equal(initial.status,"pending");assert.equal(initial.draft,null);
 const completed=parseContentGenerationView((await getContentAuthoringFixture(id(21)).json()).generation);assert.equal(completed.status,"completed");assert.equal(completed.id,initial.id);assert.equal(completed.draftId,initial.draftId);assert.equal(completed.productId,initial.productId);assert.equal(completed.sourceFingerprint,initial.sourceFingerprint);
});


test("coherent selected size/color fixture UUIDs form strict scoped facts and generate without reference exceptions",async()=>{
 const attributes=Object.entries(VARIANT.attributes).map(([key,value])=>{const matches=ATTRIBUTE_RESOURCES.filter(item=>item.name===key&&(item.config.values as readonly string[]).includes(value));assert.equal(matches.length,1);return {attributeId:matches[0].id,value};});
 const snapshot={title:PRODUCT.title,variants:[{id:VARIANT.id,title:VARIANT.title,attributes,measurements:null}]};
 const packet=buildProductFactPacket(PRODUCT,snapshot,resolver);
 assert.equal(packet.facts.find(fact=>fact.variantId===VARIANT.id&&fact.field==="Beden")?.value,"M");assert.equal(packet.facts.find(fact=>fact.variantId===VARIANT.id&&fact.field==="Renk")?.value,"Taş");
 const response=await post({...request,productId:PRODUCT.id,productVersion:PRODUCT.version,profileVersion:PROFILE.version,currentDraft:snapshot},id(70));assert.equal(response.status,200);const result=parseContentGenerationView((await response.json()).generation);assert.equal(result.sourceFingerprint,packet.sourceFingerprint);assert.ok(JSON.stringify(result.draft?.description).includes("Beden"));assert.ok(JSON.stringify(result.draft?.description).includes("Renk"));
});
