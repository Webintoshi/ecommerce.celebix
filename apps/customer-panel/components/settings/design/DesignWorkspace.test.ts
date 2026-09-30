import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {normalizeStorefrontDesignDocumentV5} from "@celebix/saas-contracts";
import {DESIGN} from "./design-editor-test-utils.ts";
import {applyDesignEdit,beginDesignApply,completeDesignApply,createDesignEditorState} from "./workspace-model.ts";
test("a late Apply response advances live version without discarding a newer local edit",()=>{
 const design=normalizeStorefrontDesignDocumentV5(DESIGN),initial=createDesignEditorState({design,publishedVersion:4});
 const first=applyDesignEdit(initial,{...design,promotion:{...design.promotion,headline:"First"}}),request=beginDesignApply(first,"first-operation");
 const newer=applyDesignEdit(request.state,{...design,promotion:{...design.promotion,headline:"Newest"}});
 const state=completeDesignApply(newer,request.token,{design:normalizeStorefrontDesignDocumentV5(first.design),publishedVersion:5,publishedAt:"2026-09-30T10:00:00.000Z",published:{} as never});
 assert.equal(state.status,"dirty");assert.equal(state.publishedVersion,5);assert.equal(state.design.promotion.headline,"Newest");assert.equal(state.baseline.promotion.headline,"First");
});
test("design editing exposes direct Apply and local Cancel without a draft write or publication action",async()=>{
 const workspace=await readFile(new URL("./DesignWorkspace.tsx",import.meta.url),"utf8"),modal=await readFile(new URL("./DesignSettingsDrawer.tsx",import.meta.url),"utf8");
 assert.match(workspace,/storefrontDesignApi.apply/);assert.match(workspace,/operationId:started.token.operationId/);assert.doesNotMatch(workspace,/saveDraft|\.publish\(|queueSave|readNavigationDraft|localStorage|sessionStorage|>Yayınla</);
 assert.match(modal,/>Vazgeç</);assert.match(modal,/Uygula/);assert.match(modal,/aria-modal="true"/);assert.match(modal,/event.key==="Escape"/);
});
