import assert from "node:assert/strict";
import test from "node:test";
import {normalizeStorefrontDesignDocumentV5,type StarterThemeSectionConfigV4} from "@celebix/saas-contracts";
import {DESIGN} from "./design-editor-test-utils.ts";
import {fromStoreLocalTime,toStoreLocalTime,synchronizeCompositionAnnouncement,updateDesignAnnouncement,getDesignEditorPublishIssue} from "./design-editor-model.ts";

test("v5 category publication validates explicit mappings while preserving absent legacy selections",()=>{
 const baseline=normalizeStorefrontDesignDocumentV5(DESIGN),categoryIds=["40000000-0000-4000-8000-000000000011","40000000-0000-4000-8000-000000000012"],assetId="40000000-0000-4000-8000-000000000001";
 const section:Extract<StarterThemeSectionConfigV4,{kind:"category_grid"}>={kind:"category_grid",sectionId:"home_categories",enabled:true,heading:"Koleksiyonlar",layout:"grid",categoryIds};
 const issue=(section:StarterThemeSectionConfigV4)=>getDesignEditorPublishIssue({...baseline,composition:{...baseline.composition,sections:[section]}});
 assert.equal(issue(section),null,"absent mappings retain the legacy library fallback");
 assert.deepEqual(issue({...section,categoryImages:[]}),{code:"category_grid_image_missing",sectionId:section.sectionId,categoryId:categoryIds[0]});
 assert.deepEqual(issue({...section,categoryImages:[{categoryId:categoryIds[0]!,assetId}]}),{code:"category_grid_image_missing",sectionId:section.sectionId,categoryId:categoryIds[1]});
 assert.equal(issue({...section,categoryImages:categoryIds.map(categoryId=>({categoryId,assetId}))}),null);
 assert.equal(issue({...section,enabled:false,categoryImages:[]}),null);
 assert.equal(issue({...section,categoryIds:[],categoryImages:[]}),null);
 assert.deepEqual(section.categoryIds,categoryIds,"validation must not change the selected categories");
});

test("store-zone time conversion roundtrips outside browser zone and across DST",()=>{
 for(const [zone,local,instant] of [["Europe/Istanbul","2026-09-26T12:00","2026-09-26T09:00:00.000Z"],["America/New_York","2026-01-10T12:00","2026-01-10T17:00:00.000Z"],["America/New_York","2026-07-10T12:00","2026-07-10T16:00:00.000Z"],["Asia/Kathmandu","2026-09-26T12:00","2026-09-26T06:15:00.000Z"]]){assert.equal(fromStoreLocalTime(local!,zone!),instant);assert.equal(toStoreLocalTime(instant!,zone!),local);}
 assert.equal(fromStoreLocalTime("2026-03-08T02:30","America/New_York"),null);
 assert.equal(fromStoreLocalTime("bad","Europe/Istanbul"),null);
});

test("simple and advanced announcement writes preserve advanced properties and optional destination",()=>{
 const composition={...DESIGN.composition,announcement:{enabled:true,items:["Yeni mesaj"],destination:"/favorites"}};
 const design={...DESIGN,announcement:{...DESIGN.announcement,animation:"step" as const,speed:"fast" as const}};
 const simple=synchronizeCompositionAnnouncement(design,composition);
 assert.deepEqual(simple.announcement.items,["Yeni mesaj"]);assert.equal(simple.announcement.enabled,true);assert.equal(simple.announcement.animation,"step");assert.equal(simple.composition.announcement.destination,"/favorites");
 const advanced=updateDesignAnnouncement(simple,{items:["Gelişmiş mesaj"],direction:"right"});assert.deepEqual(advanced.composition.announcement.items,["Gelişmiş mesaj"]);assert.equal(advanced.composition.announcement.destination,"/favorites");assert.equal(advanced.announcement.speed,"fast");
});

test("long legacy composition messages survive visibility and animation edits without invalid legacy writes",()=>{
 const message="a".repeat(160);const design={...DESIGN,announcement:{...DESIGN.announcement,items:["Kısa eski mesaj"]},composition:{...DESIGN.composition,announcement:{enabled:true,items:[message],destination:"/favorites"}}};
 const visibility=updateDesignAnnouncement(design,{enabled:false});assert.equal(visibility.announcement.enabled,false);assert.deepEqual(visibility.announcement.items,["Kısa eski mesaj"]);assert.deepEqual(visibility.composition.announcement.items,[message]);assert.equal(visibility.composition.announcement.enabled,false);
 const animation=updateDesignAnnouncement(design,{animation:"step"});assert.deepEqual(animation.announcement.items,["Kısa eski mesaj"]);assert.equal(animation.announcement.animation,"step");assert.deepEqual(animation.composition.announcement.items,[message]);
 const simple=synchronizeCompositionAnnouncement(design,{...design.composition,announcement:{...design.composition.announcement,enabled:false}});assert.deepEqual(simple.announcement.items,["Kısa eski mesaj"]);assert.equal(simple.announcement.enabled,false);
});
