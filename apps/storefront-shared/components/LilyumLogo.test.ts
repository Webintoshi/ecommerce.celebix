import assert from "node:assert/strict";
import test from "node:test";
import { lilyumLogoFor } from "../themes/lilyum/logo.ts";

const store = { id: "89e1e15f-8282-4e9b-ae3e-f417501bd54a" };
const original = { url: "https://media.saas-staging.celebix.site/stores/89e1e15f-8282-4e9b-ae3e-f417501bd54a/design/c9c0df33-d646-59a4-ba36-a538b32d2a31.jpg", altText: "Lilyum Flora logosu" };

test("Lilyum original logo gains the refined transparent asset without replacing future admin branding", () => {
  assert.equal(lilyumLogoFor(store, original)?.url, "/themes/lilyum/logo-refined-v1.webp");
  assert.equal(lilyumLogoFor(store, original)?.altText, "Lilyum Flora logosu");
  const edited = { ...original, url: "https://media.example/new-admin-logo.png" };
  assert.equal(lilyumLogoFor(store, edited), edited);
  assert.equal(lilyumLogoFor({ id: "other-store" }, original), original);
  assert.equal(lilyumLogoFor(store, undefined), undefined);
  assert.equal(lilyumLogoFor(store, null), null);
});
