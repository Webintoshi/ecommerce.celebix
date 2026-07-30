import assert from "node:assert/strict";
import test from "node:test";

import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresPanelStoreOptionRepository } from "./postgres-repository.ts";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const CURRENT = `v1.panel.active.v1.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const ACTIVE = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";

function repository(authority: unknown) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const result = createPostgresPanelStoreOptionRepository(
    createPanelSessionPersistenceApproval("disposable_test"),
    {
      pool: {
        async connect() {
          return {
            async query(text: string, values: readonly unknown[] = []) {
              calls.push({ text, values });
              if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
              return { rows: [{ outcome: "resolved", authority }], rowCount: 1 };
            },
            release() {},
          };
        },
      },
      keys: new Map([["panel.active.v1", new Uint8Array(32).fill(0x41)]]),
      activeKeyId: "panel.active.v1",
      clock: () => new Date(NOW),
      timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
    },
  );
  return { result, calls };
}

test("lists only strict safe store projections without sending the credential to SQL", async () => {
  const h = repository({
    activeStoreId: ACTIVE,
    stores: [
      { storeId: ACTIVE, storeSlug: "guzide-kuyumcu-4", displayName: "Güzide Kuyumcu", canonicalAdminOrigin: "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site" },
      { storeId: OTHER, storeSlug: "hemenaku", displayName: "Hemenaku", canonicalAdminOrigin: "https://hemenaku.admin.saas-staging.celebix.site" },
    ],
  });
  const result = await h.result.listForCredential({ credential: CURRENT, now: NOW });
  assert.equal(result.kind, "resolved");
  if (result.kind !== "resolved") return;
  assert.equal(Object.isFrozen(result.stores), true);
  assert.equal(result.stores.length, 2);
  const query = h.calls.find(({ text }) => text.includes("list_panel_session_store_options"));
  assert.equal(query?.values.length, 3);
  assert.equal(JSON.stringify(query?.values).includes(CURRENT), false);
});

test("rejects expanded or cross-bound store projections", async () => {
  for (const authority of [
    { activeStoreId: ACTIVE, stores: [{ storeId: ACTIVE, storeSlug: "guzide", displayName: "Güzide", canonicalAdminOrigin: "https://evil.example" }] },
    { activeStoreId: ACTIVE, stores: [{ storeId: OTHER, storeSlug: "hemenaku", displayName: "Hemenaku", canonicalAdminOrigin: "https://hemenaku.admin.saas-staging.celebix.site" }] },
    { activeStoreId: ACTIVE, stores: [] },
  ]) {
    assert.deepEqual(await repository(authority).result.listForCredential({ credential: CURRENT, now: NOW }), { kind: "durable_authority_invalid" });
  }
});
