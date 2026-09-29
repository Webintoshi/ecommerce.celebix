import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { parseContentAuthoringRequest } from "@celebix/saas-contracts";
import { createMerchantAdminApi } from "../../../../../../../apps/customer-panel/lib/merchant-admin-ui/client.ts";
import { createCatalogAdminApi } from "../../../../../../../apps/customer-panel/lib/catalog-admin-ui/client.ts";
import { attributeChoices } from "../../../../../../../apps/customer-panel/lib/catalog-onboarding-ui/attribute-variants.ts";
import { createCatalogApiClient } from "../../../../../../../apps/customer-panel/lib/catalog-ui/client.ts";
import { createCatalogOnboardingClient } from "../../../../../../../apps/customer-panel/lib/catalog-onboarding-ui/client.ts";

async function compile(url: URL, imports: Record<string, unknown>) {
  const source = await readFile(url, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  Function("require", "module", "exports", output)((name: string) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected fixture import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

test("Mira detail fixture serves v2 product and editor through the strict production clients", async () => {
  const fixture = await compile(new URL("../../mira-catalog/catalog-fixture.ts", import.meta.url), {});
  let fallbacks = 0;
  const route = await compile(new URL("./[[...path]]/route.ts", import.meta.url), {
    "../../../mira-catalog/catalog-fixture": fixture,
    "../../../mira-stock/stock-fixture": {},
    "../../[...slug]/route": { GET: async () => { fallbacks++; return Response.json({ code: "invalid_input" }, { status: 400 }); } },
    "../../../measurements-fixture/state": {},
    "../../../design-settings-fix/catalog-fixture": {},
  });
  const fetchFixture = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(new URL(String(input), "http://fixture.test"), init);
    const path = new URL(request.url).pathname.replace(/^\/api\/catalog\//, "").split("/");
    return route.GET(request, { params: Promise.resolve({ path }) });
  };
  const detail = await createCatalogApiClient({ fetch: fetchFixture }).getProduct(fixture.PRODUCT_ID);
  const editor = await createCatalogOnboardingClient({ fetch: fetchFixture }).getProductEditor(fixture.PRODUCT_ID);
  assert.equal(fallbacks, 0, "known Mira v2 routes must never fall through to another fixture dataset");
  assert.deepEqual(detail, { product: fixture.PRODUCT, variants: [fixture.VARIANT] });
  assert.equal(editor.product.id, detail.product.id);
  assert.equal(editor.profile.version, fixture.PROFILE.version);
  assert.equal(editor.variants[0].variant.version, fixture.VARIANT.version);
  const choices = attributeChoices(await createCatalogAdminApi(fetchFixture).resources("attribute"));
  const attributes = Object.entries(detail.variants[0].attributes).map(([key, value]) => {
    const matches = choices.filter(choice => (choice.key === key || choice.name === key) && editor.resourceIds.attributes.includes(choice.id) && choice.values.includes(value));
    assert.equal(matches.length, 1, `Saved fixture ${key} must resolve to one selected UUID`);
    return {attributeId:matches[0].id,value};
  });
  assert.equal(attributes.length, 2);
  const request = parseContentAuthoringRequest({draftId:fixture.PRODUCT_ID,productId:fixture.PRODUCT_ID,productVersion:detail.product.version,profileVersion:editor.profile.version,currentDraft:{title:detail.product.title,variants:[{id:detail.variants[0].id,title:detail.variants[0].title,attributes,measurements:null}]},action:"improve",fields:["description","seoTitle","seoDescription"],locale:"tr-TR",tone:"neutral",length:"medium",note:"",selection:null});
  assert.deepEqual(request.currentDraft.variants?.[0]?.attributes,attributes);
});


test("local safe writing-settings GET returns a truthful no-record DTO through the existing merchant client",async()=>{
 const route=await compile(new URL("../merchant-admin/[...slug]/route.ts",import.meta.url),{"@celebix/saas-data":{},"../../settings-presentation-fixture":{getSettingsMerchantFixture:()=>null}});
 let response:Response|undefined;
 const api=createMerchantAdminApi(async(input,init)=>{assert.equal(String(input),"/api/merchant-admin/records/ai_setting");assert.equal(init?.cache,"no-store");assert.equal(init?.credentials,"same-origin");response=await route.GET(new Request("http://fixture.test"+input,init),{params:Promise.resolve({slug:["records","ai_setting"]})});return response!;});
 assert.deepEqual(await api.records("ai_setting"),[]);assert.equal(response!.status,200);assert.equal(response!.headers.get("cache-control"),"no-store");assert.equal(response!.headers.get("x-content-type-options"),"nosniff");
});
