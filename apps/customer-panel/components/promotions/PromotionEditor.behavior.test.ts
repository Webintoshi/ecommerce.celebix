import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { PromotionDetail, PromotionStatus } from "@celebix/saas-contracts";
import * as model from "../../lib/promotion-ui/model.ts";
import { promotionErrorMessage } from "../../lib/promotion-ui/client.ts";
import { createDirtyNavigationGuard } from "../../lib/catalog-ui/dirty-navigation.ts";
import { compile, withEditor } from "../settings/design/design-editor-test-utils.ts";

const ID="00000000-0000-4000-8000-000000000001";
async function editorScreen(run:(context:{container:HTMLElement})=>Promise<void>,options:{status:PromotionStatus;readOnly?:boolean;canArchive:boolean}) {
  const detail:PromotionDetail={id:ID,version:7,name:"Kontrol indirimi",status:options.status,ruleDocument:model.promotionRuleDocument(model.createPromotionDraft("free_shipping")),createdAt:"2026-10-01T00:00:00.000000Z",updatedAt:"2026-10-02T00:00:00.000000Z"};
  const api={detail:async()=>detail,pendingDeletion:()=>null,deletionImpact:async()=>({id:ID,version:7,name:detail.name,codeCount:0,preservedRedemptionCount:0,pendingReservationCount:0,linkedTools:[],canDelete:true}),delete:async()=>{throw new Error("No mutation expected in visibility test");}};
  const {PromotionEditor}=compile<any>(new URL("./PromotionEditor.tsx",import.meta.url),{
    "@/lib/promotion-ui/client":{promotionApi:api,promotionErrorMessage},
    "@/lib/promotion-ui/model":model,
    "@/lib/catalog-ui/dirty-navigation":{createDirtyNavigationGuard},
    "@/components/panel/PanelPageShell":{PanelPageHeader:()=>null},
    "@/components/settings/design/DesignSettingsDrawer":compile(new URL("../settings/design/DesignSettingsDrawer.tsx",import.meta.url)),
    "./PromotionIllustration":{PromotionIllustration:()=>null,promotionIllustrationKind:()=>"percentage"},
    "./PromotionSimulator":{PromotionSimulator:()=>null},
    "./PromotionTargetPicker":{PromotionPicker:()=>null,PromotionTargetPicker:()=>null},
  });
  await withEditor(async context=>{
    Object.defineProperty(context.window.HTMLElement.prototype,"scrollIntoView",{configurable:true,value(){}});
    await context.render(React.createElement(PromotionEditor,{promotionId:ID,timezone:"Europe/Istanbul",canManage:false,canPublish:false,canArchive:options.canArchive,readOnly:options.readOnly??false}));
    await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
    assert.match(context.container.textContent??"",/Kontrol indirimi/);
    await run(context);
  });
}
function deleteButton(container:HTMLElement){return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent?.trim()==="Sil");}
test("readonly discount detail offers direct deletion to a permitted manager",async()=>editorScreen(async({container})=>{assert.ok(deleteButton(container),"readonly detail must expose direct Sil");assert.equal(deleteButton(container)!.disabled,false);},{status:"active",readOnly:true,canArchive:true}));
test("archived discount detail offers direct deletion without enabling editing",async()=>editorScreen(async({container})=>{assert.ok(deleteButton(container),"archived detail must expose direct Sil");assert.equal(deleteButton(container)!.disabled,false);assert.equal(container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled,true);},{status:"archived",canArchive:true}));
test("discount detail hides deletion when archive permission is absent",async()=>editorScreen(async({container})=>{assert.equal(deleteButton(container),undefined);},{status:"active",readOnly:true,canArchive:false}));
