import assert from "node:assert/strict";
import test from "node:test";

const policy = await import("./akbank-form-post.ts").catch(() => null) as null | {
  validateAkbankFormPost(value: unknown, environment?: "test" | "live", hostname?: string): unknown;
  renderAkbankFormPost(value: unknown, nonce: string, hostname: string): { body: string; csp: string } | null;
};
import { fixtureAkbankForm } from "./akbank-form-post.fixture.ts";
function validate(value: unknown, environment?: "test" | "live") {
  assert.equal(typeof policy?.validateAkbankFormPost, "function");
  return policy!.validateAkbankFormPost(value, environment, "shop.example.test");
}

test("Akbank POST presentation admits exact bank environment and fixed card-free fields", () => {
  for (const environment of ["test", "live"] as const) {
    const presentation = fixtureAkbankForm(environment);
    assert.deepEqual(validate(presentation, environment), presentation);
    assert.equal(validate(presentation, environment === "test" ? "live" : "test"), null);
  }
});

test("Akbank form denies unexpected fields, endpoints, callback origins, malformed values and active objects", () => {
  const base = fixtureAkbankForm();
  for (const value of [
    { ...base, url: `${base.url}?x=1` }, { ...base, url: "https://evil.example/payhosting" },
    { ...base, fields: { ...base.fields, cvv: "123" } }, { ...base, fields: { ...base.fields, secretKey: "secret" } },
    { ...base, fields: { ...base.fields, amount: "0.00" } }, { ...base, fields: { ...base.fields, amount: "1e2" } },
    { ...base, fields: { ...base.fields, installCount: "2" } }, { ...base, fields: { ...base.fields, txnCode: "1000" } },
    { ...base, fields: { ...base.fields, okUrl: base.fields.okUrl!.replace("shop.example.test", "evil.example") } },
    { ...base, fields: { ...base.fields, emailAddress: "x\n@example.test" } },
    { ...base, fields: { ...base.fields, hash: "invalid" } }, { ...base, html: "<script>evil()</script>" },
    { ...base, fields: Object.create(base.fields) }, new Proxy(base, {}),
  ]) assert.equal(validate(value), null);
});

test("bank form HTML escapes values and grants only exact form action plus nonce submit", () => {
  const presentation = fixtureAkbankForm();
  presentation.fields.emailAddress = 'shop+"<&>@example.test';
  assert.equal(typeof policy?.renderAkbankFormPost, "function");
  const rendered = policy!.renderAkbankFormPost(presentation, Buffer.alloc(24, 5).toString("base64"), "shop.example.test");
  assert.ok(rendered);
  assert.match(rendered.body, /shop\+&quot;&lt;&amp;&gt;@example\.test/);
  assert.match(rendered.body, /method="post"/);
  assert.match(rendered.body, /type="hidden"/);
  assert.match(rendered.body, /type="submit"/);
  assert.match(rendered.body, /\.submit\(\)/);
  assert.match(rendered.csp, /form-action https:\/\/virtualpospaymentgatewaypre\.akbank\.com\/payhosting;/);
  assert.match(rendered.csp, /script-src 'nonce-[A-Za-z0-9+/=]+';/);
  assert.doesNotMatch(rendered.csp, /form-action (?:https:|\*)[ ;]/);
  assert.equal(policy!.renderAkbankFormPost(presentation, 'bad"nonce', "shop.example.test"), null);
});


test("bank presentation preserves exact safe minor-unit boundaries and snapshots fields without invoking getters", () => {
  const form = fixtureAkbankForm();
  for (const amount of ["0.01", "90071992547409.91"]) {
    assert.ok(validate({ ...form, fields: { ...form.fields, amount } }));
  }
  for (const amount of ["0.00", "-1.00", "01.00", "90071992547409.92", "0.001", "1,00"]) {
    assert.equal(validate({ ...form, fields: { ...form.fields, amount } }), null);
  }
  let getterCalls = 0;
  const fields = { ...form.fields };
  Object.defineProperty(fields, "amount", { enumerable: true, get() { getterCalls++; return "1.00"; } });
  assert.equal(validate({ ...form, fields }), null);
  assert.equal(getterCalls, 0);
  assert.equal(validate({ ...form, fields: { ...form.fields, emailAddress: "\ud800" } }), null);
  const selected = validate(form) as { fields: Record<string, string> };
  form.fields.amount = "9.99";
  assert.equal(selected.fields.amount, "123.45");
  assert.ok(Object.isFrozen(selected.fields));
});
