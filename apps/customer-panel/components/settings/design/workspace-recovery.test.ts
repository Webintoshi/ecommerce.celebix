import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStorefrontDesignDocumentV5, normalizeStarterThemeCompositionV4 } from "@celebix/saas-contracts";
import { DESIGN } from "./design-editor-test-utils.ts";
import { applyDesignEdit, beginDesignApply, createDesignEditorState, failDesignApply } from "./workspace-model.ts";
import { createDesignRecovery, readDesignRecovery, writeDesignRecovery, clearDesignRecovery, restoreDesignRecovery } from "./workspace-recovery.ts";
const now=Date.parse("2026-10-18T10:00:00Z");
const base=()=>createDesignEditorState({design:normalizeStorefrontDesignDocumentV5(DESIGN),publishedVersion:4});
const edited=()=>{const initial=base();return applyDesignEdit(initial,{...initial.design,promotion:{...initial.design.promotion,headline:"Recovered campaign"}});};
function storage(){const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
test("local recovery is isolated to the exact session/store scope and explicit discard removes it",()=>{
 const store=storage(),entry=createDesignRecovery(edited(),{kind:"surface",surface:"brand"},now)!;
 assert.equal(writeDesignRecovery("session-store-a",entry,store),true);
 assert.equal(readDesignRecovery("session-store-b",store,now),null);
 const restored=restoreDesignRecovery(base(),readDesignRecovery("session-store-a",store,now)!);
 assert.equal(restored.design.promotion.headline,"Recovered campaign");assert.equal(restored.baseline.promotion.headline,"Fixture");assert.equal(restored.status,"dirty");
 assert.equal(clearDesignRecovery("session-store-a",store),true);assert.equal(readDesignRecovery("session-store-a",store,now),null);
 assert.equal(createDesignRecovery(base(),{kind:"order"},now),null);
});
test("recovery never trusts malformed, expired, oversized or future data and storage errors do not break editing",()=>{
 const store=storage(),entry=createDesignRecovery(edited(),{kind:"order"},now)!;
 writeDesignRecovery("scope",entry,store);assert.equal(readDesignRecovery("scope",store,now+86_400_001),null);
 writeDesignRecovery("scope",entry,store);assert.equal(readDesignRecovery("scope",store,now-120_000),null);
 const key=[...store.values.keys()][0]!;
 for(const bad of ["{",JSON.stringify({...entry,baseVersion:-1}),JSON.stringify({...entry,location:{kind:"surface",surface:"made-up"}}),JSON.stringify({...entry,design:{schemaVersion:999}}),"x".repeat(600_000)]){store.setItem(key,bad);assert.equal(readDesignRecovery("scope",store,now),null);}
 const blocked={getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("quota");},removeItem:()=>{throw Error("blocked");}};
 assert.equal(writeDesignRecovery("scope",entry,blocked),false);assert.equal(readDesignRecovery("scope",blocked,now),null);assert.equal(clearDesignRecovery("scope",blocked),false);
 assert.equal(writeDesignRecovery(undefined,entry,store),false);
});
test("changed published version requires comparison and cannot silently replace the newer live design",()=>{
 const entry=createDesignRecovery(edited(),{kind:"order"},now)!;
 const current=createDesignEditorState({design:{...base().design,promotion:{...base().design.promotion,headline:"Someone else's change"}},publishedVersion:5});
 const restored=restoreDesignRecovery(current,entry);
 assert.equal(restored.status,"conflict");assert.equal(restored.publishedVersion,5);assert.equal(restored.baseline.promotion.headline,"Someone else's change");assert.equal(restored.design.promotion.headline,"Recovered campaign");
});
test("recovery preserves the frozen operation and payload after a lost Apply response",()=>{
 const request=beginDesignApply(edited(),"10000000-0000-4000-8000-000000000001"),failed=failDesignApply(request.state,"error");
 const store=storage();writeDesignRecovery("scope",createDesignRecovery(failed,{kind:"surface",surface:"brand"},now)!,store);
 const restored=restoreDesignRecovery(base(),readDesignRecovery("scope",store,now)!);
 const retried=beginDesignApply(restored,"20000000-0000-4000-8000-000000000002");
 assert.equal(retried.token.operationId,"10000000-0000-4000-8000-000000000001");assert.deepEqual(retried.token.design,request.token.design);assert.equal(retried.token.expectedPublishedVersion,4);
});

test("an invalid transient document cannot replace the last valid recovery",()=>{
 const state=edited(),store=storage(),entry=createDesignRecovery(state,{kind:"order"},now)!;
 writeDesignRecovery("scope",entry,store);
 const invalid=applyDesignEdit(state,{...state.design,composition:{...normalizeStarterThemeCompositionV4(state.design.composition),sections:[{kind:"brand_story",sectionId:"home_story",enabled:true,heading:"",body:"Story"}]}});
 assert.equal(createDesignRecovery(invalid,{kind:"order"},now+100),null);
 assert.equal(readDesignRecovery("scope",store,now+100)?.design.promotion.headline,"Recovered campaign");
});
test("an unresolved conflict remains blocked through another local edit, checkpoint and reload",()=>{
 const entry=createDesignRecovery(edited(),{kind:"order"},now)!;
 const current=createDesignEditorState({design:{...base().design,promotion:{...base().design.promotion,headline:"Remote"}},publishedVersion:5});
 const conflict=restoreDesignRecovery(current,entry);
 const changed=applyDesignEdit(conflict,{...conflict.design,promotion:{...conflict.design.promotion,headline:"Edited recovered work"}});
 assert.equal(changed.status,"conflict");
 const store=storage();writeDesignRecovery("scope",createDesignRecovery(changed,{kind:"order"},now+100)!,store);
 const reloaded=restoreDesignRecovery(current,readDesignRecovery("scope",store,now+100)!);
 assert.equal(reloaded.status,"conflict");assert.equal(reloaded.baseline.promotion.headline,"Remote");assert.equal(reloaded.design.promotion.headline,"Edited recovered work");
});
