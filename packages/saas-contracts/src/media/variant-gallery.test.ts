import assert from "node:assert/strict";
import test from "node:test";
import { parseProductVariantGallery, parseProductVariantGalleryAssignments } from "./variant-gallery.ts";
const productId="10000000-0000-4000-8000-000000000001", variantId="20000000-0000-4000-8000-000000000001", mediaId="30000000-0000-4000-8000-000000000001";
test("gallery retains independent order and explicit empty fallback without duplicating IDs",()=>{
 const gallery=parseProductVariantGallery({productId,version:2,assignments:[{variantId,mediaIds:[mediaId]}]});
 assert.deepEqual(gallery.assignments[0].mediaIds,[mediaId]); assert.ok(Object.isFrozen(gallery.assignments[0].mediaIds));
 assert.deepEqual(parseProductVariantGalleryAssignments([{variantId,mediaIds:[]}]),[{variantId,mediaIds:[]}]);
});
test("gallery rejects duplicate, malformed, oversized and ambiguous target mappings",()=>{
 for(const value of [[{variantId,mediaIds:[mediaId,mediaId]}],[{variantId,mediaIds:[]},{variantId,mediaIds:[]}],[{variantId,mediaIds:["bad"]}],[{variantId,mediaIds:[],storeId:productId}]]) assert.throws(()=>parseProductVariantGalleryAssignments(value));
 assert.throws(()=>parseProductVariantGallery({productId,version:0,assignments:[]}));
 assert.throws(()=>parseProductVariantGalleryAssignments([{variantId,mediaIds:Array.from({length:17},(_,i)=>`30000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`)}]));
 assert.throws(()=>parseProductVariantGalleryAssignments(Array.from({length:101},(_,i)=>({variantId:`20000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,mediaIds:[]}))));
});

test("gallery rejects sparse arrays at both levels without changing the proposed mapping", () => {
  const sparseAssignments = new Array(2);
  sparseAssignments[0] = { variantId, mediaIds: [mediaId] };
  const secondVariantId = "20000000-0000-4000-8000-000000000002";
  const sparseMediaIds = new Array(2);
  sparseMediaIds[0] = mediaId;
  const mappings = [sparseAssignments, [
    { variantId, mediaIds: [mediaId] },
    { variantId: secondVariantId, mediaIds: sparseMediaIds },
  ]];
  for (const mapping of mappings) {
    const before = structuredClone(mapping);
    assert.throws(() => parseProductVariantGalleryAssignments(mapping), /variant_gallery_invalid/);
    assert.deepEqual(mapping, before);
  }
});

test("gallery never invokes array index getters or accepts hidden, symbolic or extra array keys", () => {
  for (const level of ["assignments", "mediaIds"] as const) {
    for (const shape of ["getter", "hiddenIndex", "extra", "hiddenExtra", "symbol"] as const) {
      let reads = 0;
      const mediaIds = [mediaId];
      const assignments = [{ variantId, mediaIds }];
      const array = level === "assignments" ? assignments : mediaIds;
      if (shape === "getter") Object.defineProperty(array, "0", { enumerable: true, configurable: true, get() { reads += 1; return level === "assignments" ? { variantId, mediaIds } : mediaId; } });
      if (shape === "hiddenIndex") Object.defineProperty(array, "0", { enumerable: false });
      if (shape === "extra") Object.defineProperty(array, "extra", { value: true, enumerable: true });
      if (shape === "hiddenExtra") Object.defineProperty(array, "extra", { value: true, enumerable: false });
      if (shape === "symbol") Object.defineProperty(array, Symbol("extra"), { value: true });
      const before = Object.getOwnPropertyDescriptors(array);
      assert.throws(() => parseProductVariantGalleryAssignments(assignments), /variant_gallery_invalid/, `${level}:${shape}`);
      assert.equal(reads, 0, `${level}:${shape} invokes no getter`);
      assert.deepEqual(Object.getOwnPropertyDescriptors(array), before, `${level}:${shape} changes no input descriptor`);
    }
  }
});

test("gallery accepts a frozen 100-variant batch with 16 ordered image IDs without changing inputs", () => {
  const mediaIds = Object.freeze(Array.from({ length: 16 }, (_, index) => `30000000-0000-4000-8000-${String(16 - index).padStart(12, "0")}`));
  const assignments = Object.freeze(Array.from({ length: 100 }, (_, index) => Object.freeze({
    variantId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, mediaIds,
  })));
  const before = JSON.stringify(assignments);
  const parsed = parseProductVariantGalleryAssignments(assignments);
  assert.deepEqual(parsed, assignments);
  assert.equal(JSON.stringify(assignments), before);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(parsed.every(assignment => Object.isFrozen(assignment) && Object.isFrozen(assignment.mediaIds)));
});

test("full gallery reads retain more variants than a bounded update batch", () => {
  const assignments = Array.from({ length: 101 }, (_, index) => ({
    variantId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, mediaIds: [mediaId],
  }));
  assert.deepEqual(parseProductVariantGallery({ productId, version: 1, assignments }).assignments, assignments);
  assert.throws(() => parseProductVariantGalleryAssignments(assignments), /variant_gallery_invalid/);
});
