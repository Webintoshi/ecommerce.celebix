import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicMediaKey } from "./key-authority.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const CONTENT = "30000000-0000-4000-8000-000000000001";
const MEDIA = "40000000-0000-4000-8000-000000000001";

test("public media key parser accepts only exact product and content grammars", () => {
  assert.deepEqual(parsePublicMediaKey(`/stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`), {
    kind: "product",
    key: `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`,
  });
  assert.deepEqual(parsePublicMediaKey(`/stores/${STORE}/content/${CONTENT}/${MEDIA}.png`), {
    kind: "content",
    key: `stores/${STORE}/content/${CONTENT}/${MEDIA}.png`,
  });
});

test("public media key parser rejects private classes and path ambiguity", () => {
  for (const pathname of [
    `/stores/${STORE}/imports/${MEDIA}.webp`,
    `/stores/${STORE}/exports/${MEDIA}.webp`,
    `/stores/${STORE}/products/${PRODUCT}/${MEDIA}.svg`,
    `/stores/${STORE}/products/${PRODUCT}/${MEDIA}.WEBP`,
    `/stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp/child`,
    `/stores/${STORE}//products/${PRODUCT}/${MEDIA}.webp`,
    `/stores/${STORE}/products/${PRODUCT}/../${MEDIA}.webp`,
    `/stores/${STORE}/products/${PRODUCT}/%2e%2e%2f${MEDIA}.webp`,
    `\\stores\\${STORE}\\products\\${PRODUCT}\\${MEDIA}.webp`,
  ]) assert.equal(parsePublicMediaKey(pathname), null, pathname);
});
