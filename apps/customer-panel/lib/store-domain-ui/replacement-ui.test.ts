import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../../components/settings/domains/StoreDomainSettings.tsx", import.meta.url), "utf8");

test("domain settings exposes an explicit safe replacement choice and all controlled transitions", () => {
  assert.match(component, /Güvenli alan adı geçişi olarak hazırla/u);
  assert.match(component, /createReplacement\(primaryCustomDomain\.id/u);
  assert.match(component, /activateReplacement/u);
  assert.match(component, /cancelReplacement/u);
  assert.match(component, /rollbackReplacement/u);
  assert.match(component, /Eski mağaza ve yönetim adresleri kontrollü geri dönüş için korunuyor/u);
});

test("www is documented as a DNS alias rather than another quota bundle", () => {
  assert.match(component, /www adresi doğrulama sonrasında ana mağaza adresine DNS yönlendirmesi/u);
  assert.match(component, /ayrı bir domain bundle veya kota kaydı değildir/u);
  assert.doesNotMatch(component, /guzide|a828862c/iu);
});
