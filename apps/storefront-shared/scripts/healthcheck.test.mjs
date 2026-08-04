import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyStorefrontHealth } from "./healthcheck.mjs";

test("accepts only the exact healthy storefront payload", async () => {
  const calls = [];
  const healthy = await verifyStorefrontHealth({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        status: "ok",
        service: "storefront-shared",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(healthy, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3450/health");
  assert.deepEqual(calls[0].init.headers, { accept: "application/json" });
  assert.equal(calls[0].init.redirect, "error");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("fails closed on status, payload, transport, and configuration errors", async () => {
  const cases = [
    { fetchImpl: async () => new Response("{}", { status: 503 }) },
    { fetchImpl: async () => Response.json({ status: "ok", service: "other" }) },
    { fetchImpl: async () => new Response("not-json", { status: 200 }) },
    { fetchImpl: async () => { throw new Error("offline"); } },
    { fetchImpl: null },
    { fetchImpl: async () => Response.json({ status: "ok", service: "storefront-shared" }), timeoutMs: 0 },
  ];

  for (const options of cases) {
    assert.equal(await verifyStorefrontHealth(options), false);
  }
});

test("aborts a health request at the configured deadline", async () => {
  let observedSignal;
  const healthy = await verifyStorefrontHealth({
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => {
      observedSignal = signal;
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  });

  assert.equal(healthy, false);
  assert.equal(observedSignal.aborted, true);
});

test("dedicated storefront image builds and healthchecks without apt mirror authority", async () => {
  const dockerfile = await readFile(new URL("../../../Dockerfile.storefront", import.meta.url), "utf8");
  assert.match(dockerfile, /FROM node:22-bookworm AS build/u);
  assert.match(dockerfile, /RUN npm ci/u);
  assert.match(dockerfile, /RUN npm run build:coolify:storefront-shared/u);
  assert.match(dockerfile, /HEALTHCHECK[^\n]+node[^\n]+health/u);
  assert.match(dockerfile, /USER node/u);
  assert.doesNotMatch(dockerfile, /apt-get|curl|wget|CELEBIX_[A-Z_]+=/u);
});
