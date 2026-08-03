import assert from "node:assert/strict";
import test from "node:test";
import { PostgresPublicStorefrontRepository, PublicStorefrontRepositoryError } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const HOSTNAME = "pilot.saas-staging.celebix.site";
const storefront = { schemaVersion: 1, id: STORE_ID, name: "Pilot Store", slug: "pilot-store", hostname: HOSTNAME, primaryHostname: HOSTNAME, canonicalUrl: `https://${HOSTNAME}/`, currency: "TRY", locale: "tr", themeKey: "hemenaku" };
const publicDesign = {
  schemaVersion: 1,
  publicationVersion: 2,
  publishedAt: "2026-08-03T12:00:00.000Z",
  brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "inter" },
  hero: { headline: "Pilot Store", body: "", image: null, destination: null, enabled: true },
  promotion: { headline: "Ücretsiz kargo", body: "", destination: null, startsAt: null, endsAt: null, enabled: false },
  announcement: { items: ["Pilot Store"], icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false },
};

function repository(outcome = "found", resultPayload: unknown = storefront) {
  const queries: string[] = [];
  const client = { async query(text: string) { queries.push(text); return text.startsWith("SELECT outcome") ? { rows: [{ outcome, result_payload: resultPayload }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  return { queries, value: new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 } }) };
}

test("public storefront repository selects exact host through the narrow resolver role", async () => {
  const fixture = repository();
  const selected = await fixture.value.getPublicStorefront({ hostname: HOSTNAME, now: new Date("2026-07-18T10:00:00.000Z") });
  assert.equal(selected.id, STORE_ID);
  assert.equal(fixture.queries.includes("SET LOCAL ROLE celebix_saas_host_resolver"), true);
  assert.equal(fixture.queries.some((query) => query.includes("resolve_public_storefront")), true);
});

test("public storefront repository maps unknown host to a finite not-found result", async () => {
  const fixture = repository("not_found", null);
  await assert.rejects(fixture.value.getPublicStorefront({ hostname: "unknown.saas-staging.celebix.site", now: new Date() }), (error) => error instanceof PublicStorefrontRepositoryError && error.code === "not_found");
});

test("public storefront design is read only through the trusted host context", async () => {
  const fixture = repository("found", publicDesign);
  const selected = await fixture.value.getPublicStorefrontDesign({ storefront, now: new Date("2026-08-03T12:00:00.000Z") });
  assert.deepEqual(selected, publicDesign);
  assert.equal(fixture.queries.some((query) => query.includes("storefront_design_get_public")), true);
});

test("public storefront design rejects private media identity in a projection", async () => {
  const fixture = repository("found", { ...publicDesign, hero: { ...publicDesign.hero, mediaId: "40000000-0000-4000-8000-000000000001" } });
  await assert.rejects(
    fixture.value.getPublicStorefrontDesign({ storefront, now: new Date("2026-08-03T12:00:00.000Z") }),
    (error) => error instanceof PublicStorefrontRepositoryError && error.code === "unavailable",
  );
});
