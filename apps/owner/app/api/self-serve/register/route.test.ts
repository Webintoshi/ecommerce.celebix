import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { NextRequest } from "next/server";
import type { SelfServeRegistrationInput } from "@/lib/self-serve-registration";

type RouteModule = typeof import("./route");
const { GET, POST } = (await import(new URL("./route.ts", import.meta.url).href)) as RouteModule;
const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

const validRegistration: SelfServeRegistrationInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  storeName: "Cicek Pazari",
  storeSlug: "cicek-pazari",
  phone: "+905551112233",
  email: "ada@example.test",
  password: "C0mpl3xPass!",
  marketingConsent: false,
  privacyConsent: true,
};

const SELF_SERVE_ENV_KEYS = [
  "SELF_SERVE_PERSISTENCE_MODE",
] as const;

async function withSelfServeEnv<T>(env: Record<string, string | undefined>, callback: () => T | Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const key of SELF_SERVE_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function makeRequest(input: SelfServeRegistrationInput, headers: Record<string, string> = {}) {
  const url = "https://ecommerce.celebix.co/api/self-serve/register";
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(input),
  }) as Request & { nextUrl: URL };

  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
  });

  return request as unknown as NextRequest;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("production route composes only the explicit disabled runtime and exposes controlled GET", async () => {
  assert.match(routeSource, /createSelfServeRegistrationStartHandler/);
  assert.match(routeSource, /createDisabledSelfServeRuntime/);
  assert.doesNotMatch(routeSource, /createPersistentSelfServeRuntime|createSelfServeHttpActivationApproval|process\.env|\bpg\b|Pool/);
  const response = await GET(new Request("https://ecommerce.celebix.co/api/self-serve/register"));
  assert.equal(response.status, 405);
  assert.equal((await readJson(response)).code, "self_serve_register_read_disabled");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("self-serve register rejects POST without Origin before reading creation flow", async () => {
  const response = await POST(makeRequest(validRegistration));
  const body = await readJson(response);

  assert.equal(response.status, 403);
  assert.equal(body.code, "self_serve_origin_required");
});

test("self-serve register remains explicitly disabled before reading registration credentials", async () => {
  const request = makeRequest(
      {
        ...validRegistration,
        privacyConsent: false,
      },
      { origin: "https://ecommerce.celebix.co" },
    );
  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "self_serve_saas_registration_disabled");
  assert.equal(body.state, "disabled");
  assert.equal(JSON.stringify(body).includes(validRegistration.password), false);
  assert.equal(request.bodyUsed, false);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("disabled production route enforces the exact raw same-origin authority before body access", async () => {
  for (const origin of [
    "https://ecommerce.celebix.co/path",
    "https://ecommerce.celebix.co?query=1",
    "https://ecommerce.celebix.co#fragment",
    "https://ecommerce.celebix.co.attacker.example",
    "not-a-url",
  ]) {
    const request = makeRequest(validRegistration, { origin });
    const response = await POST(request);
    assert.equal(response.status, 403, origin);
    assert.equal(request.bodyUsed, false, origin);
  }
});

test("self-serve register returns no false processing, ready, store, admin, or handoff result", async () => {
  const response = await POST(makeRequest(validRegistration, { origin: "https://ecommerce.celebix.co" }));
  const body = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "self_serve_saas_registration_disabled");
  assert.equal(body.state, "disabled");
  assert.equal(JSON.stringify(body).includes(validRegistration.password), false);
  for (const prohibited of ["plannedStoreUrl", "plannedAdminUrl", "adminRedirectUrl", "handoff", "ready", "processing"]) {
    assert.equal(prohibited in body, false);
  }
});

test("legacy persistent DB mode cannot bypass the Phase 1 disabled gate", async () => {
  await withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, async () => {
    const response = await POST(makeRequest(validRegistration, { origin: "https://ecommerce.celebix.co" }));
    const body = await readJson(response);

    assert.equal(response.status, 503);
    assert.equal(body.code, "self_serve_saas_registration_disabled");
    assert.equal(body.state, "disabled");
    assert.equal("persistenceMode" in body, false);
    assert.equal(JSON.stringify(body).includes(validRegistration.password), false);
  });
});
