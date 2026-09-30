import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
test("section builder uses independent content and appearance fields without fixed-section caps",async()=>{
 const source=await readFile(new URL("./HomepageBuilder.tsx",import.meta.url),"utf8"),fields=await readFile(new URL("./HomepageSectionFields.tsx",import.meta.url),"utf8");assert.match(source,/İçerik/);assert.match(source,/Görünüm/);assert.match(source,/duplicateHomepageSection/);assert.doesNotMatch(source,/singletonExists|productRowCount|\/ 12 bölüm|otomatik kaydedilir|role="dialog"/);assert.match(fields,/Tek banner/);assert.match(fields,/Slayt/);assert.match(fields,/Alt alta/);assert.match(fields,/Görsel yükle/);
});
