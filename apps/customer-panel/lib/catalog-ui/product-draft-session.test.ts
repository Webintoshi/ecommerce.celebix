import assert from "node:assert/strict";
import test from "node:test";

import {
  commitProductDraft,
  createEmptyProductDraftSession,
  mergeQuickProductDraft,
  productDraftIsDirty,
  replaceProductDraft,
  updateProductDraft,
} from "./product-draft-session.ts";

test("quick fields and the exact selected File survive the advanced-mode handoff", () => {
  const image = new File([new Uint8Array([1, 2, 3])], "atlas.webp", { type: "image/webp" });
  const session = mergeQuickProductDraft(createEmptyProductDraftSession(), {
    title: "Atlas Kolye",
    price: "12.500,00",
    stockQuantity: "7",
    categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    media: [{ file: image, altText: "Altın kolye", preview: "blob:atlas" }],
  });

  assert.equal(session.current.title, "Atlas Kolye");
  assert.equal(session.current.variants[0]?.price, "12.500,00");
  assert.equal(session.current.variants[0]?.stockQuantity, "7");
  assert.deepEqual(session.current.categoryIds, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  assert.equal(session.current.media[0]?.file, image);
  assert.equal(session.current.media[0]?.altText, "Altın kolye");
  assert.equal(Object.isFrozen(session.current), true);
  assert.equal(Object.isFrozen(session.current.variants), true);
  assert.equal(Object.isFrozen(session.current.media), true);
});

test("nested variant and media edits independently make a draft dirty", () => {
  const image = new File(["atlas"], "atlas.png", { type: "image/png" });
  const selected = mergeQuickProductDraft(createEmptyProductDraftSession(), {
    title: "Atlas",
    price: "100,00",
    stockQuantity: "1",
    categoryId: "",
    media: [{ file: image, altText: "", preview: "blob:atlas" }],
  });
  const committed = commitProductDraft(selected);

  assert.equal(productDraftIsDirty(committed), false);
  assert.equal(productDraftIsDirty(updateProductDraft(committed, {
    variants: [{ ...committed.current.variants[0]!, stockQuantity: "2" }],
  })), true);
  assert.equal(productDraftIsDirty(updateProductDraft(committed, {
    media: [{ ...committed.current.media[0]!, altText: "Yeni alt metin" }],
  })), true);
});

test("explicit server replacement resets the baseline without mutating the local conflict draft", () => {
  const local = updateProductDraft(createEmptyProductDraftSession(), { title: "Yerel taslak" });
  const localSnapshot = local.current;
  const replaced = replaceProductDraft(local, { ...local.current, title: "Sunucu sürümü" });

  assert.equal(local.current, localSnapshot);
  assert.equal(local.current.title, "Yerel taslak");
  assert.equal(replaced.current.title, "Sunucu sürümü");
  assert.equal(replaced.initial.title, "Sunucu sürümü");
  assert.equal(productDraftIsDirty(replaced), false);
});
