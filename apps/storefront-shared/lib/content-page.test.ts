import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicContentPage, buildPublicContentPageV2, legacyPolicyPageRoute } from "./content-page.ts";

test("public content page uses the exact canonical slug and sanitizes published merchant body", () => {
  const page = buildPublicContentPage({ id:"11000000-0000-4000-8000-000000000001",slug:"hakkimizda",title:"Hakkımızda",body:'<h2>Mağazamız</h2><p>İçerik</p><script>alert(1)</script><img src=x onerror=alert(1)>',updatedAt:"2026-09-26T12:00:00.000Z" }, "hakkimizda");
  assert.equal(page.route,"/pages/hakkimizda");
  assert.match(page.html,/Mağazamız/);
  assert.doesNotMatch(page.html,/script|onerror|alert\(/);
  assert.throws(() => buildPublicContentPage({...page,slug:"baska",body:"Metin"},"hakkimizda"), /storefront_content_page_invalid/);
});


test("legacy fixed-policy announcement pages retain a canonical reachable destination", () => {
  assert.equal(legacyPolicyPageRoute("odeme-teslimat"),"/policies/payment-delivery");
  assert.equal(legacyPolicyPageRoute("iade-degisim"),"/policies/returns-exchanges");
  assert.equal(legacyPolicyPageRoute("custom-page"),null);
});

test("published pages with no body remain reachable as an empty article with their real title", () => {
  const base = {id:"11000000-0000-4000-8000-000000000001",slug:"hakkimizda",title:"Hakkımızda",updatedAt:"2026-09-26T12:00:00.000Z"};
  assert.equal(buildPublicContentPage({...base,body:""},"hakkimizda").html,"");
  assert.equal(buildPublicContentPage(base as never,"hakkimizda").html,"");
});

test("V2 normalized page HTML retains intentional empty paragraphs", () => {
  const page = { id:"11000000-0000-4000-8000-000000000001",kind:"page" as const,slug:"hakkimizda",locale:"tr",title:"Hakkımızda",body:"<p><br /></p>",bodyFormat:"normalized_html" as const,excerpt:null,seoTitle:null,seoDescription:null,publishedAt:"2026-09-29T00:00:00.000Z",updatedAt:"2026-09-29T00:00:00.000Z" };
  assert.equal(buildPublicContentPageV2(page,"hakkimizda","tr").html,"<p><br /></p>");
  assert.doesNotMatch(buildPublicContentPageV2({ ...page,bodyFormat:"legacy",body:"<p>Old</p><script>secret()</script>" },"hakkimizda","tr").html,/script|secret/);
});
