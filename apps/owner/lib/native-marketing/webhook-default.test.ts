import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { mock } from "node:test";
import pg from "pg";
import { getDefaultNativeMarketingUnsubscribeHandler } from "./webhook-default.ts";

test("default public unsubscribe uses the existing owner workflow role without host resolver membership", async () => {
  const values = {
    CELEBIX_MARKETING_EMAIL_PUBLIC_ENABLED: "true",
    CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN: "https://owner.saas-staging.celebix.net",
    CELEBIX_SAAS_DATABASE_URL: "postgres://owner_runtime:secret@postgres:5432/celebix_saas_staging_auth01?sslmode=verify-full",
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const root = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const cache = Symbol.for("celebix.owner.native-marketing-unsubscribe");
  const calls: string[] = [], token = "u".repeat(43);
  let tokenDigest: unknown;
  const client = {
    async query(sql: string, parameters?: readonly unknown[]) {
      calls.push(sql);
      if (sql.startsWith("SET LOCAL ROLE ") && sql !== "SET LOCAL ROLE celebix_saas_workflow") throw Error("role membership unavailable");
      if (sql.includes("FROM saas.native_marketing_unsubscribe(")) {
        tokenDigest = parameters?.[0];
        return { rowCount: 1, rows: [{ outcome: "unsubscribed", result_payload: null }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const pool = { on() { return pool; }, async connect() { return client; } };
  const poolMock = mock.method(pg, "Pool", function () { return pool; } as unknown as typeof pg.Pool);
  try {
    Object.assign(process.env, values); delete root[cache];
    const handler = await getDefaultNativeMarketingUnsubscribeHandler();
    const url = `${values.CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN}/api/marketing/unsubscribe?token=${token}`;
    assert.equal((await handler(new Request(url))).status, 200);
    assert.equal(calls.length, 0);
    const response = await handler(new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }));
    assert.equal(response.status, 200);
    assert.ok(calls.includes("SET LOCAL ROLE celebix_saas_workflow"));
    assert.equal(tokenDigest, createHash("sha256").update(token).digest("hex"));
    assert.ok(calls.includes("COMMIT"));
  } finally {
    poolMock.mock.restore(); delete root[cache];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
