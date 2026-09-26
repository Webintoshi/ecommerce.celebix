import assert from "node:assert/strict";
import test from "node:test";
import {DESIGN} from "./design-editor-test-utils.ts";
import {fromStoreLocalTime,toStoreLocalTime,synchronizeCompositionAnnouncement,updateDesignAnnouncement} from "./design-editor-model.ts";

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
