import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type TenantContext,
} from "@celebix/saas-contracts";

import {
  PostgresStorefrontDesignRepository,
  StorefrontDesignRepositoryError,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const MEDIA = "77777777-7777-4777-8777-777777777777";
const OPERATION = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-08-03T12:00:00.000Z");

const DESIGN = {
  schemaVersion: 3 as const,
  brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "inter" as const },
  hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "", desktopImage: null, mobileImage: null, destination: { kind: "none" as const }, enabled: true }] },
  promotion: { headline: "Ücretsiz kargo", body: "", destination: { kind: "none" as const }, startsAt: null, endsAt: null, enabled: false },
  announcement: { items: ["Güzide Kuyumcu"], icon: "none" as const, speed: "normal" as const, direction: "left" as const, animation: "continuous" as const, enabled: false },
  composition: createDefaultStarterThemeComposition(),
};

const PUBLIC = {
  schemaVersion: 2 as const,
  publicationVersion: 1,
  publishedAt: NOW.toISOString(),
  brand: { ...DESIGN.brand, logo: null, favicon: null },
  hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "", desktopImage: null, mobileImage: null, destination: null }] },
  promotion: { ...DESIGN.promotion, destination: null },
  announcement: DESIGN.announcement,
};

const WORKSPACE = {
  schemaVersion: 3 as const,
  draftVersion: 1,
  publishedVersion: 1,
  draftUpdatedAt: NOW.toISOString(),
  publishedAt: NOW.toISOString(),
  draft: DESIGN,
  published: PUBLIC,
  store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" },
  media: [],
  destinations: [],
};

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "request-design",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "merchant" },
    store: { id: STORE, slug: "guzide", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "starter", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private index = 0;
  readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.index++];
    if (!client) throw new Error("checkout");
    return client;
  }
}

function repository(pool: Pool, audit: string[] = []) {
  return new PostgresStorefrontDesignRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit(event) { audit.push(event.type); },
  });
}

function call(client: Client, name: string) {
  const selected = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(selected);
  return selected;
}

test("workspace read carries full server-derived tenant authority", async () => {
  const client = new Client((text) => text.includes("storefront_design_get") ? [{ outcome: "found", result_payload: WORKSPACE }] : []);
  const result = await repository(new Pool([client])).getWorkspace({ tenantContext: tenant(), now: NOW });
  assert.deepEqual(result, WORKSPACE);
  assert.deepEqual(call(client, "storefront_design_get").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "starter", 2, NOW]);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
});

test("save draft recovers one unknown commit without a second write", async () => {
  const mutation = { draftVersion: 2, draftUpdatedAt: NOW.toISOString(), draft: DESIGN };
  const writer = new Client((text) => {
    if (text.includes("storefront_design_save_draft")) return [{ outcome: "saved", result_payload: mutation }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recoveryWorkspace = { ...WORKSPACE, draftVersion: 2, draft: DESIGN };
  const recovery = new Client((text) => text.includes("storefront_design_get") ? [{ outcome: "found", result_payload: recoveryWorkspace }] : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit).saveDraft({ tenantContext: tenant(), now: NOW, operationId: OPERATION, expectedDraftVersion: 1, design: DESIGN });
  assert.deepEqual(result, mutation);
  assert.equal(writer.calls.filter(({ text }) => text.includes("storefront_design_save_draft")).length, 1);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("storefront_design_get")).length, 1);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["storefront_design_commit_unknown"]);
});

test("reserve media sends only canonical tenant storage facts", async () => {
  const reservation = { id: MEDIA, url: `https://media.saas-staging.celebix.site/stores/${STORE}/design/${MEDIA}.webp`, altText: "Altın kolye", mediaType: "image/webp", width: 1200, height: 600, objectKey: `stores/${STORE}/design/${MEDIA}.webp` };
  const client = new Client((text) => text.includes("storefront_design_media_reserve") ? [{ outcome: "reserved", result_payload: reservation }] : []);
  const result = await repository(new Pool([client])).reserveMedia({ tenantContext: tenant(), now: NOW, operationId: OPERATION, mediaId: MEDIA, mediaType: "image/webp", altText: "Altın kolye", width: 1200, height: 600, contentLength: 1024, contentSha256: "a".repeat(64) });
  assert.deepEqual(result, reservation);
  assert.equal(call(client, "storefront_design_media_reserve").values.includes(`stores/${STORE}/design/${MEDIA}.webp`), false);
});

test("known version conflict rolls back with a finite error", async () => {
  const client = new Client((text) => text.includes("storefront_design_publish") ? [{ outcome: "published_version_conflict", result_payload: { publishedVersion: 2 } }] : []);
  await assert.rejects(
    repository(new Pool([client])).publish({ tenantContext: tenant(), now: NOW, operationId: OPERATION, expectedDraftVersion: 2, expectedPublishedVersion: 1 }),
    (error: unknown) => error instanceof StorefrontDesignRepositoryError && error.code === "version_conflict",
  );
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("repository rejects exact-input drift before checkout", async () => {
  await assert.rejects(
    repository(new Pool([])).getWorkspace({ tenantContext: tenant(), now: NOW, storeId: STORE } as never),
    (error: unknown) => error instanceof StorefrontDesignRepositoryError && error.code === "invalid_input",
  );
});
