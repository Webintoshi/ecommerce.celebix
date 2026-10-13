import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvedRegistrationEnvironment, registrationUiFixture } from "./registration-ui-test-fixture.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const rootLayoutSource = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
const middlewareSource = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
const formSource = readFileSync(
  new URL("../../components/self-serve/SelfServeDirectRegistrationForm.tsx", import.meta.url),
  "utf8",
);

test("enabled /kayit explains verified store creation and exposes an active submit", () => {
  const ui = registrationUiFixture(approvedRegistrationEnvironment());
  const page = ui.page();
  const nodes = ui.elements(page);
  const state = nodes.find((node) => node.props.id === "self-serve-registration-state");
  const button = nodes.find((node) => node.type === "button");
  assert.ok(state);
  assert.match(ui.text(state), /Kimliğinizi doğrulayın/);
  assert.match(ui.text(page), /doğrulama.*mağazanız.*oluşturul/i);
  assert.doesNotMatch(ui.text(page), /altyapısı hazırlanıyor|canlı mağaza oluşturmaz|entegrasyon onayı/i);
  assert.equal(nodes.find((node) => node.props["data-state"])?.props["data-state"], "enabled");
  assert.equal(button?.props.disabled, false);
  assert.equal(button?.props["aria-disabled"], false);
  assert.equal(nodes.find((node) => node.type === "form")?.props["aria-describedby"], state.props.id);
});

test("disabled /kayit shows the preparation notice and prevents submission", () => {
  const ui = registrationUiFixture({});
  const page = ui.page();
  const nodes = ui.elements(page);
  assert.match(ui.text(page), /Kayıt altyapısı hazırlanıyor/);
  assert.doesNotMatch(ui.text(page), /Kimliğinizi doğrulayın/);
  assert.equal(nodes.find((node) => node.props["data-state"])?.props["data-state"], "disabled");
  assert.equal(nodes.find((node) => node.type === "button")?.props.disabled, true);
  assert.equal(nodes.find((node) => node.type === "button")?.props["aria-disabled"], true);
});

test("/kayit describes payment and shipping as settings the merchant completes", () => {
  for (const environment of [{}, approvedRegistrationEnvironment()]) {
    const ui = registrationUiFixture(environment);
    const text = ui.text(ui.page());
    assert.doesNotMatch(text, /Sanal POS, kargo ve yönetim paneliniz hazır/);
    assert.match(text, /[Öö]deme ve kargo ayarlarınızı.*tamamlay/i);
  }
});

test("enabled /kayit previews the configured NET and SITE domain suffixes", () => {
  for (const suffix of ["saas-staging.celebix.net", "saas-staging.celebix.site"]) {
    const ui = registrationUiFixture(approvedRegistrationEnvironment(suffix));
    const page = ui.page();
    const nodes = ui.elements(page);
    assert.equal(ui.text(nodes.find((node) => node.type === "b")), `.${suffix}`);
    assert.equal(nodes.find((node) => node.type === "button")?.props.disabled, false);
  }
});

test("disabled /kayit does not advertise an unconfigured default store address", () => {
  const ui = registrationUiFixture({ CELEBIX_PLATFORM_DOMAIN_SUFFIX: "untrusted.example.test" });
  const page = ui.page();
  assert.doesNotMatch(ui.text(page), /\.celebix\.site|untrusted\.example\.test/);
  assert.equal(ui.elements(page).find((node) => node.type === "button")?.props.disabled, true);
});

test("direct registration preserves required store fields and explicit consent choices", () => {
  const ui = registrationUiFixture(approvedRegistrationEnvironment());
  const nodes = ui.elements(ui.page());
  const inputs = nodes.filter((node) => node.type === "input");
  assert.deepEqual(inputs.map((node) => node.props.name), ["storeName", "storeSlug", "marketingConsent", "privacyConsent"]);
  assert.equal(inputs.find((node) => node.props.name === "storeName")?.props.required, true);
  assert.equal(inputs.find((node) => node.props.name === "storeSlug")?.props.required, true);
  const privacy = inputs.find((node) => node.props.name === "privacyConsent");
  const marketing = inputs.find((node) => node.props.name === "marketingConsent");
  assert.equal(privacy?.props.required, true);
  assert.equal(marketing?.props.required, undefined);
  for (const input of [privacy, marketing]) {
    assert.equal(input?.props.checked ?? input?.props.defaultChecked ?? false, false);
  }
  assert.equal(nodes.find((node) => node.type === "form")?.props.action, "/api/self-serve/register");
  assert.equal(nodes.find((node) => node.type === "form")?.props.method, "post");
});

test("/kayit does not consume browser authority or render staging secrets", () => {
  for (const prohibited of [
    /headers\(/,
    /cookies\(/,
    /searchParams/,
    /Host/,
    /Origin/,
    /Forwarded/,
    /CELEBIX_LOGTO_CLIENT_SECRET/,
    /CELEBIX_SAAS_DATABASE_URL/,
    /CELEBIX_SESSION_KEY_B64URL/,
  ]) assert.doesNotMatch(pageSource, prohibited);
});

test("server business fields accept no password or authority IDs", () => {
  assert.match(formSource, /\.\{domainSuffix\}/);
  for (const prohibited of [
    /name="email"/,
    /name="password"/,
    /name="phone"/,
    /name="firstName"/,
    /name="lastName"/,
    /storeId/,
    /membershipId/,
    /localStorage/,
    /fetch\(/,
  ]) assert.doesNotMatch(formSource, prohibited);
});

test("/kayit customer-facing copy is store creation language, not an application queue", () => {
  const customerFacingSource = `${pageSource}\n${formSource}`;

  assert.doesNotMatch(customerFacingSource, /basvuru/i);
  assert.doesNotMatch(customerFacingSource, /başvuru/i);
  assert.doesNotMatch(customerFacingSource, /admin incelemesi/i);
  assert.doesNotMatch(customerFacingSource, /owner ekibi/i);
  assert.doesNotMatch(customerFacingSource, /manual review/i);
});

test("/kayit and legacy public aliases bypass Owner admin shell chrome", () => {
  assert.match(rootLayoutSource, /const publicPaths = new Set/);
  assert.match(rootLayoutSource, /"\/kayit"/);
  assert.match(rootLayoutSource, /"\/magaza-ac"/);
  assert.match(rootLayoutSource, /"\/onboarding"/);
  assert.match(rootLayoutSource, /"\/onboarding\/status"/);
  assert.match(rootLayoutSource, /publicPaths\.has\(pathname\)\s*\?\s*null/);

  assert.match(middlewareSource, /SELF_SERVE_PUBLIC_PREFIXES/);
  assert.match(middlewareSource, /return withSecurity\(request, nextResponse\(request\)\)/);
});
test('existing merchant signup header goes to exact configured panel phone login and never central Owner TOTP',()=>{const ui=registrationUiFixture(approvedRegistrationEnvironment());const link=ui.elements(ui.page()).find(node=>node.props.className==='self-serve-register-login');assert.equal(link?.props.href,'https://panel.staging.example.test/login');for(const panel of [undefined,'https://evil.example.test/path','http://panel.example.test','https://user:pass@panel.example.test']){const environment={...approvedRegistrationEnvironment(),CELEBIX_PANEL_ORIGIN:panel};const invalid=registrationUiFixture(environment).elements(registrationUiFixture(environment).page()).find(node=>node.props.className==='self-serve-register-login');assert.equal(invalid,undefined);}});
