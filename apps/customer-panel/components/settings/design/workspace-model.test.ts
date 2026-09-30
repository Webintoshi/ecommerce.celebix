import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStorefrontDesignDocumentV5 } from "@celebix/saas-contracts";
import { DESIGN } from "./design-editor-test-utils.ts";
import { applyDesignEdit, beginDesignApply, cancelDesignEdit, completeDesignApply, createDesignEditorState, editorAssetOptions, failDesignApply } from "./workspace-model.ts";
const design=()=>normalizeStorefrontDesignDocumentV5(DESIGN);
test("editor assets retain their actual purpose and never convert product media into theme assets",()=>{
 const option={id:"40000000-0000-4000-8000-000000000001",url:"https://fixture.invalid/image.webp",altText:"One",mediaType:"image/webp" as const,width:1200,height:800};
 const assets=editorAssetOptions([{...option,reference:{kind:"asset",assetId:option.id},assetKind:"category"},{...option,id:"40000000-0000-4000-8000-000000000002",reference:{kind:"asset",assetId:"40000000-0000-4000-8000-000000000002"},assetKind:"hero"},{...option,reference:{kind:"media",mediaId:option.id}}]);
 assert.deepEqual(assets.map(({id,kind})=>({id,kind})),[{id:option.id,kind:"category"},{id:"40000000-0000-4000-8000-000000000002",kind:"hero"}]);
});
test("published baseline changes only after direct Apply; Cancel discards local input",()=>{
 const baseline=design();const state=createDesignEditorState({design:baseline,publishedVersion:4});
 const local=applyDesignEdit(state,{...baseline,brand:{...baseline.brand,primaryColor:"#123456"}});
 assert.equal(state.design.brand.primaryColor,baseline.brand.primaryColor);assert.equal(local.publishedVersion,4);
 assert.deepEqual(cancelDesignEdit(local).design,baseline);
 const request=beginDesignApply(local,"operation-a");assert.equal(request.token.expectedPublishedVersion,4);
 const complete=completeDesignApply(request.state,request.token,{design:normalizeStorefrontDesignDocumentV5(local.design),publishedVersion:5,publishedAt:"2026-09-30T10:00:00Z",published:{} as never});
 assert.equal(complete.publishedVersion,5);assert.equal(complete.status,"applied");assert.deepEqual(complete.baseline,local.design);
});
test("uncertain retry retains identical operation and payload; a later edit starts a new operation",()=>{
 const original=createDesignEditorState({design:design(),publishedVersion:4});const edit=applyDesignEdit(original,{...original.design,promotion:{...original.design.promotion,headline:"Local"}});
 const first=beginDesignApply(edit,"operation-a");const failed=failDesignApply(first.state,"error");
 assert.equal(failed.design.promotion.headline,"Local");const retry=beginDesignApply(failed,"operation-b");
 assert.equal(retry.token.operationId,"operation-a");assert.equal(retry.token.design,first.token.design);
 const changed=applyDesignEdit(failed,{...failed.design,promotion:{...failed.design.promotion,headline:"Corrected"}});assert.equal(beginDesignApply(changed,"operation-b").token.operationId,"operation-b");
 const conflict=failDesignApply(first.state,"conflict");assert.equal(conflict.publishedVersion,4);assert.equal(conflict.design.promotion.headline,"Local");
});
