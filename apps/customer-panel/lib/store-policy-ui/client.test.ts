import assert from "node:assert/strict";
import test from "node:test";

import { StorePolicyApiError, createStorePolicyApi } from "./client.ts";

const NOW = "2026-07-31T12:00:00.000Z";
const OPERATION = "79000000-0000-4000-8000-000000000071";
const PAGE = { key: "kvkk", label: "KVKK", route: "/policies/kvkk", ordinal: 3, status: "published", body: "## KVKK", version: 2, createdAt: NOW, updatedAt: NOW };

test("policy client reads fixed pages and saves with one exact operation body", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Response.json(init?.method === "PATCH" ? PAGE : { items: [PAGE] });
  };
  const api = createStorePolicyApi(fetcher, () => OPERATION);
  assert.equal((await api.list())[0]?.key, "kvkk");
  assert.equal((await api.save("kvkk", { expectedVersion: 1, body: "## KVKK", status: "published" })).version, 2);
  assert.equal(calls[1]?.input, "/api/storefront-policies/kvkk");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { operationId: OPERATION, expectedVersion: 1, body: "## KVKK", status: "published" });
  assert.equal(JSON.stringify(calls).includes("storeId"), false);
});

test("policy client maps only finite safe error codes and rejects hostile projections", async () => {
  const conflict = createStorePolicyApi(async () => Response.json({ code: "version_conflict" }, { status: 409 }));
  await assert.rejects(conflict.list(), (error) => error instanceof StorePolicyApiError && error.code === "version_conflict" && error.status === 409);
  const hostile = createStorePolicyApi(async () => Response.json({ items: [{ ...PAGE, storeId: "private" }] }));
  await assert.rejects(hostile.list(), (error) => error instanceof StorePolicyApiError && error.code === "unavailable");
});
