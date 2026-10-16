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

test("enabled registration presents the approved concise form and enabled phone gate",()=>{
 const ui=registrationUiFixture(approvedRegistrationEnvironment()),nodes=ui.elements(ui.page());
 assert.match(ui.text(ui.page()),/Mağazanızı açın/);
 assert.equal(nodes.find(node=>node.props['data-state'])?.props['data-state'],'enabled');
 assert.equal(nodes.find(node=>node.props.enabled!==undefined)?.props.enabled,true);
});
test("disabled registration gives a clear notice and disabled phone gate",()=>{
 const ui=registrationUiFixture({}),nodes=ui.elements(ui.page());assert.match(ui.text(ui.page()),/Mağaza kaydı şu anda kullanılamıyor/);
 assert.equal(nodes.find(node=>node.props.enabled!==undefined)?.props.enabled,false);
});

test("enabled /kayit previews the configured NET and SITE domain suffixes", () => {
  for (const suffix of ["saas-staging.celebix.net", "saas-staging.celebix.site"]) {
    const ui = registrationUiFixture(approvedRegistrationEnvironment(suffix));
    const page = ui.page();
    const nodes = ui.elements(page);
    assert.equal(ui.text(nodes.find((node) => node.type === "div" && node.props.className === "signup-slug")?.props.children && (nodes.find((node) => node.type === "div" && node.props.className === "signup-slug")?.props.children as unknown[])[1]), `.${suffix}`);
    assert.equal(nodes.find((node) => node.props.enabled!==undefined)?.props.enabled, true);
  }
});

test("disabled /kayit does not advertise an unconfigured default store address", () => {
  const ui = registrationUiFixture({ CELEBIX_PLATFORM_DOMAIN_SUFFIX: "untrusted.example.test" });
  const page = ui.page();
  assert.doesNotMatch(ui.text(page), /\.celebix\.site|untrusted\.example\.test/);
  assert.equal(ui.elements(page).find((node) => node.props.enabled!==undefined)?.props.enabled, false);
});

test("direct registration preserves required store fields and explicit consent choices", () => {
  const ui = registrationUiFixture(approvedRegistrationEnvironment());
  const nodes = ui.elements(ui.page());
  const inputs = nodes.filter((node) => node.type === "input");
  assert.deepEqual(inputs.map((node) => node.props.name), ["firstName", "lastName", "storeName", "storeSlug", "marketingConsent", "privacyConsent"]);
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
test('existing merchant signup header goes to exact configured panel phone login and never central Owner TOTP',()=>{const ui=registrationUiFixture(approvedRegistrationEnvironment());const link=ui.elements(ui.page()).find(node=>ui.text(node).includes('Hesabınız var mı?')&&node.type==='a');assert.equal(link?.props.href,'https://panel.staging.example.test/login');for(const panel of [undefined,'https://evil.example.test/path','http://panel.example.test','https://user:pass@panel.example.test']){const environment={...approvedRegistrationEnvironment(),CELEBIX_PANEL_ORIGIN:panel};const invalid=registrationUiFixture(environment).elements(registrationUiFixture(environment).page()).find(node=>ui.text(node).includes('Hesabınız var mı?')&&node.type==='a');assert.equal(invalid,undefined);}});
