import assert from "node:assert/strict";
import test from "node:test";
import { createMerchantAdminHttpHandlers } from "./handler.ts";

const ID = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-17T12:00:00.000Z");
function fixture(role = "store_owner") {
  let writes = 0;
  const handlers = createMerchantAdminHttpHandlers({
    async resolveRuntime() { return { access: { panelOrigin: "https://panel.saas-staging.celebix.site", async resolveCredential() { return { kind: "authenticated", tenantContext: { membership: { role }, store: { slug: "store" } } }; } }, merchantAdmin: { async save() { writes++; return { id: ID, kind: "administrator_invite", status: "active", version: 1, updatedAt: NOW.toISOString(), replayed: false }; } } } as never; },
    now: () => NOW, requestId: () => ID,
  });
  return { handlers, writes: () => writes };
}
function request(config: unknown) { return new Request("https://store.admin.saas-staging.celebix.site/api/merchant-admin/records/administrator_invite", { method: "POST", headers: { host: "store.admin.saas-staging.celebix.site", origin: "https://store.admin.saas-staging.celebix.site", "content-type": "application/json", "idempotency-key": ID, cookie: `__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}` }, body: JSON.stringify({ name: "Test Recipient", config, status: "active" }) }); }
const valid = { email: "recipient@example.test", role: "admin", expiresAt: "2026-09-24T12:00:00.000Z" };
test("administrator snapshot save denies forged admin requests before persistence", async () => {
  const f = fixture("admin");
  assert.equal((await f.handlers.save(request(valid), "administrator_invite")).status, 403);
  assert.equal(f.writes(), 0);
  const get = new Request(request(valid).url, { headers: request(valid).headers });
  assert.equal((await f.handlers.records(get, "administrator_invite")).status, 403);
});
test("administrator snapshot requires canonical email, non-owner role and absolute UTC expiry", async () => {
  const f = fixture();
  for (const patch of [{ expiresAt: "tomorrow" }, { expiresAt: "09/24/2026" }, { expiresAt: "2026-09-24T12:00:00+00:00" }, { expiresAt: "2026-02-30T12:00:00.000Z" }, { email: "Recipient@example.test" }, { role: "store_owner" }]) {
    assert.equal((await f.handlers.save(request({ ...valid, ...patch }), "administrator_invite")).status, 400);
  }
  assert.equal(f.writes(), 0);
  for (const expiresAt of ["2026-09-24T12:00:00.000Z", "2026-09-24T12:00:00Z"]) assert.equal((await f.handlers.save(request({ ...valid, expiresAt }), "administrator_invite")).status, 200);
  assert.equal(f.writes(), 2);
});
