import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../../components/settings/domains/StoreDomainSettings.tsx", import.meta.url), "utf8");

test("domain settings exposes an explicit safe replacement choice and all controlled transitions", () => {
  assert.match(component, /Alan adı geçişi olarak hazırla/u);
  assert.match(component, /createReplacement\(primaryCustomDomain\.id/u);
  assert.match(component, /activateReplacement/u);
  assert.match(component, /cancelReplacement/u);
  assert.match(component, /rollbackReplacement/u);
  assert.match(component, /Eski adresler geri dönüş için korunur/u);
});

test("www is documented as a DNS alias rather than another quota bundle", () => {
  assert.match(component, /www, doğrulama sonrası ana adrese yönlenir/u);
  assert.match(component, /ayrı bağlantı veya kota kullanmaz/u);
  assert.doesNotMatch(component, /guzide|a828862c/iu);
});
