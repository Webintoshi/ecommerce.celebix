import assert from "node:assert/strict";
import test from "node:test";
import { createMerchantAdminApi } from "../merchant-admin-ui/client.ts";
import { acquireStoreWritingDefaults, parseStoreWritingDefaults } from "./store-writing-preferences.ts";
const row = (config: unknown, status = "active") => ({ id: "10000000-0000-4000-8000-000000000001", kind: "ai_setting", name: "Yazım", status, config, version: 1, createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" }) as any;
const features = { enabledFeatures: ["description_suggestions", "seo_suggestions"] };
test("writing defaults preserve exact custom voice and map documented TR/EN aliases without casting unknown text", () => {
  for (const [saved, expected] of [["Doğal", "neutral"], ["neutral", "neutral"], ["Samimi", "friendly"], ["friendly", "friendly"], ["Profesyonel", "professional"], ["professional", "professional"]]) assert.deepEqual(parseStoreWritingDefaults([row({ ...features, tone: saved, locale: "en" })]), { tone: expected, locale: "en", brandVoice: null });
  const custom = "Kısa, sakin ve ayrıntılara sadık";
  assert.deepEqual(parseStoreWritingDefaults([row({ ...features, tone: custom, locale: "de-DE" })]), { tone: "neutral", locale: "de-DE", brandVoice: custom });
  assert.deepEqual(parseStoreWritingDefaults([]), { locale: null, tone: null, brandVoice: null });
});
test("object prototype names remain exact custom store voices rather than inherited tone aliases", () => {
  for (const voice of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.deepEqual(parseStoreWritingDefaults([row({ ...features, tone: voice, locale: "en" })]), { tone: "neutral", locale: "en", brandVoice: voice });
  }
});
test("inactive, duplicate, malformed, secret-bearing and disabled-shape preferences fail rather than becoming defaults", () => {
  for (const settings of [[row(features, "draft")], [row(features), row(features)], [row({})], [row({ ...features, tone: "x".repeat(161) })], [row({ ...features, tone: "<b>calm</b>" })], [row({ ...features, tone: "calm\u0001" })], [row({ ...features, locale: "invalid locale" })], [row({ ...features, apiKey: "must never be read" })], [row({ enabledFeatures: [] })]]) assert.throws(() => parseStoreWritingDefaults(settings), /store_writing_preferences_invalid/);
});
test("both panels share one actual safe merchant record GET and release forces the next opening to reread", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const api = createMerchantAdminApi(async (url, init) => { requests.push({ url: String(url), init }); return Response.json({ items: [row({ ...features, locale: "en", tone: "Samimi" })] }); });
  const first = acquireStoreWritingDefaults("current-store", api), second = acquireStoreWritingDefaults("current-store", api);
  assert.deepEqual(await first.promise, await second.promise); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/merchant-admin/records/ai_setting"); assert.equal(requests[0].init?.cache, "no-store"); assert.equal(requests[0].init?.credentials, "same-origin"); assert.equal(requests[0].init?.method, undefined);
  first.release(); second.release(); const third = acquireStoreWritingDefaults("current-store", api); await third.promise; third.release(); assert.equal(requests.length, 2);
});


test("an explicit retry obtains a fresh safe read while another panel retains its original lease",async()=>{
 let calls=0;const api={records:async()=>{calls++;return [row({...features,locale:calls===1?"en":"de-DE"})];}};
 const first=acquireStoreWritingDefaults("retry-store",api),second=acquireStoreWritingDefaults("retry-store",api);assert.equal((await second.promise).locale,"en");
 const retry=acquireStoreWritingDefaults("retry-store",api,true);assert.equal((await retry.promise).locale,"de-DE");assert.equal((await first.promise).locale,"en");assert.equal(calls,2);first.release();second.release();retry.release();
});
