import assert from "node:assert/strict";
import test from "node:test";
import { createMerchantAdminApi, MerchantAdminApiError } from "../../../../../../apps/customer-panel/lib/merchant-admin-ui/client.ts";
import { createMerchantContentApi, MerchantContentApiError } from "../../../../../../apps/customer-panel/lib/merchant-content-ui/client.ts";
import type { MerchantContentDocument, SaveMerchantContentRequest } from "../../../../../../packages/saas-contracts/src/merchant-content/types.ts";
import { createRequiredPagesFixtureTransport, REQUIRED_PAGE_IDS } from "./fixture-transport.ts";

const origin = "http://127.0.0.1:3554";
const operation = "a8500000-0000-4000-8000-000000000001";
function command(document: MerchantContentDocument): SaveMerchantContentRequest {
  return { draftId: operation, recordId: document.id, expectedVersion: document.version, expectedBodyDigest: document.bodyDigest, kind: "page", bodyAction: "replace", origins: {}, values: {
    name: "Bizim hikâyemiz", slug: document.slug, locale: document.locale, body: "<p>Özenle seçilmiş ürünler.</p>",
    excerpt: null, seoTitle: "Bizim hikâyemiz", seoDescription: null, published: false, status: "draft",
  } };
}

test("required page fixture uses valid blank drafts and preserves a legacy unmarked custom page", async () => {
  const transport = createRequiredPagesFixtureTransport({ state: "loaded", origin });
  const records = await createMerchantAdminApi(transport.fetch).records("page");
  assert.deepEqual(records.map(record => record.requiredPageKey ?? "custom"), ["custom", "blog", "contact", "about"]);
  const api = createMerchantContentApi(transport.fetch);
  for (const key of ["about", "contact", "blog"] as const) {
    const document = await api.get("page", REQUIRED_PAGE_IDS[key]);
    assert.equal(document.requiredPageKey, key);
    assert.equal(document.status, "draft");
    assert.equal(document.published, false);
    assert.equal(document.body, "");
  }
  assert.equal(Object.hasOwn(records[0]!, "requiredPageKey"), false);
  assert.equal(transport.snapshot().liveWrites, false);
});

test("editable content retains its required identity, has exact replay and records safe history", async () => {
  const transport = createRequiredPagesFixtureTransport({ state: "loaded", origin });
  const api = createMerchantContentApi(transport.fetch);
  const document = await api.get("page", REQUIRED_PAGE_IDS.about);
  const input = command(document);
  const saved = await api.save(input, operation);
  assert.equal(saved.document.name, "Bizim hikâyemiz");
  assert.equal(saved.document.body, input.values.body);
  assert.equal(saved.document.requiredPageKey, "about");
  assert.equal(saved.document.version, 2);
  const replayed = await api.save(input, operation);
  assert.equal(replayed.document.version, 2);
  assert.equal(replayed.replayed, true);
  const history = await api.versions("page", document.id, { limit: 20 });
  assert.deepEqual(history.map(version => version.version), [2, 1]);
  assert.equal(history[1]!.values.body, "");
  assert.deepEqual((await api.versions("page", document.id, { limit: 1, beforeVersion: 2 })).map(version => version.version), [1]);
});

test("ordinary new pages stay unmarked and cannot duplicate a required route", async () => {
  const transport = createRequiredPagesFixtureTransport({ state: "loaded", origin });
  const api = createMerchantContentApi(transport.fetch);
  const about = await api.get("page", REQUIRED_PAGE_IDS.about);
  const base = command(about);
  const input = { ...base, recordId: null, expectedVersion: null, expectedBodyDigest: null };
  await assert.rejects(api.save(input, operation), error => error instanceof MerchantContentApiError && error.code === "invalid_input");
  const saved = await api.save({ ...input, values: { ...input.values, name: "Bakım rehberi", slug: "bakim-rehberi" } }, operation);
  assert.equal(Object.hasOwn(saved.document, "requiredPageKey"), false);
  assert.equal(saved.document.version, 1);
  assert.equal((await createMerchantAdminApi(transport.fetch).records("page")).length, 5);
});

test("required pages reject archive and changed route while legacy custom page can archive", async () => {
  const transport = createRequiredPagesFixtureTransport({ state: "loaded", origin });
  const admin = createMerchantAdminApi(transport.fetch);
  for (const id of [REQUIRED_PAGE_IDS.about, REQUIRED_PAGE_IDS.contact, REQUIRED_PAGE_IDS.blog]) {
    await assert.rejects(admin.archive("page", id, 1), error => error instanceof MerchantAdminApiError && error.code === "invalid_transition");
  }
  const content = createMerchantContentApi(transport.fetch);
  const document = await content.get("page", REQUIRED_PAGE_IDS.about);
  const input = command(document);
  await assert.rejects(content.save({ ...input, values: { ...input.values, slug: "baska-adres" } }, operation), error => error instanceof MerchantContentApiError && error.code === "invalid_input");
  const archived = await admin.archive("page", REQUIRED_PAGE_IDS.custom, 1);
  assert.equal(archived.status, "archived");
  assert.equal(archived.version, 2);
  assert.equal((await content.get("page", REQUIRED_PAGE_IDS.about)).version, 1);
});

test("save errors and concurrent edits keep submitted content out of saved state", async () => {
  for (const state of ["save-error", "conflict"] as const) {
    const transport = createRequiredPagesFixtureTransport({ state, origin });
    const api = createMerchantContentApi(transport.fetch);
    const original = await api.get("page", REQUIRED_PAGE_IDS.contact);
    await assert.rejects(api.save(command(original), operation), error => error instanceof MerchantContentApiError && error.code === (state === "conflict" ? "version_conflict" : "invalid_input"));
    const current = await api.get("page", original.id);
    assert.equal(current.body, "");
    assert.equal(current.version, state === "conflict" ? 2 : 1);
  }
});

test("read-only and unavailable scenarios fail without modifying local records", async () => {
  const readonly = createRequiredPagesFixtureTransport({ state: "readonly", origin });
  const api = createMerchantContentApi(readonly.fetch);
  const original = await api.get("page", REQUIRED_PAGE_IDS.blog);
  await assert.rejects(api.save(command(original), operation), error => error instanceof MerchantContentApiError && error.code === "membership_denied");
  assert.equal((await api.get("page", original.id)).version, 1);
  const unavailable = createRequiredPagesFixtureTransport({ state: "load-error", origin });
  await assert.rejects(createMerchantAdminApi(unavailable.fetch).records("page"), error => error instanceof MerchantAdminApiError && error.code === "unavailable");
  await assert.rejects(createMerchantContentApi(unavailable.fetch).get("page", original.id), error => error instanceof MerchantContentApiError && error.code === "unavailable");
});

test("foreign origins, unexpected paths, queries and session writes fail closed", async () => {
  const transport = createRequiredPagesFixtureTransport({ state: "loaded", origin });
  for (const path of ["https://admin.guzidekuyumcu.com/api/merchant-admin/records/page", "/api/unknown", "/api/merchant-admin/records/page?store=other"]) {
    assert.equal((await transport.fetch(path)).status, 403);
  }
  assert.equal((await transport.fetch("/api/session/logout", { method: "POST" })).status, 403);
  assert.equal((await transport.fetch(`/api/merchant-content/page/${REQUIRED_PAGE_IDS.about}/versions?unexpected=true`)).status, 403);
  assert.equal(transport.snapshot().calls.every(call => call.blocked), true);
  assert.equal(transport.snapshot().documents.length, 4);
});
