import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }

test("discount routes mount the dedicated studio while lucky wheel remains isolated", async () => {
  const discounts = await source("app/discounts/page.tsx");
  const create = await source("app/discounts/new/page.tsx");
  const wheel = await source("app/discounts/lucky-wheel/page.tsx");

  assert.match(discounts, /<PromotionStudio mode="list"/);
  assert.match(create, /<PromotionStudio mode="create"/);
  assert.doesNotMatch(discounts, /MerchantModuleConsole/);
  assert.match(wheel, /<MerchantModuleConsole kind="lucky_wheel"/);
});
