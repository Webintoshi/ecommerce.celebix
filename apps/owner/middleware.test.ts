import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

import { NextRequest, NextResponse } from "next/server.js";

register(new URL("./scripts/node-test-resolver.mjs", import.meta.url));
const { middleware } = await import("./middleware.ts");
const security = await import("../../packages/platform-config/src/http-security.ts");
const saas = await import("../../packages/platform-config/src/saas.ts");
const ownerCookies = await import("./lib/owner-auth-cookies.ts");
const { createAdminLoginInternalGateway } = await import("../../packages/saas-data/src/admin-login-security/internal.ts");
const { createAdminLoginInvalidationWebhookHandler } = await import("./lib/admin-login-security/webhook.ts");
const { createAdminLoginSupportResetHandler } = await import("./lib/admin-login-security/support-reset.ts");

const OWNER_SUPABASE_ENVIRONMENT = [
  "NEXT_PUBLIC_OWNER_SUPABASE_URL",
  "NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY",
  "OWNER_SUPABASE_SERVICE_ROLE_KEY",
] as const;

test("public runtime remains reachable when legacy Owner Supabase authority is absent", async () => {
  const previous = new Map(OWNER_SUPABASE_ENVIRONMENT.map((name) => [name, process.env[name]]));
  for (const name of OWNER_SUPABASE_ENVIRONMENT) delete process.env[name];

  try {
    const response = await middleware(new NextRequest("https://owner.saas-staging.celebix.site/api/public/runtime"));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.has("location"), false);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("health remains reachable when legacy Owner Supabase authority is absent", async () => {
  const previous = new Map(OWNER_SUPABASE_ENVIRONMENT.map((name) => [name, process.env[name]]));
  for (const name of OWNER_SUPABASE_ENVIRONMENT) delete process.env[name];

  try {
    const response = await middleware(new NextRequest("https://owner.saas-staging.celebix.net/api/health"));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.has("location"), false);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

// Execute the production modules. Only external Owner auth and runtime/database
// construction are replaced; routing, Next responses, signatures and TOTP gates
// remain real. This catches an endpoint blocked before its signature handler.
function sourceModule<T>(url: URL, overrides: Record<string, unknown>): T {
  const localRequire = createRequire(import.meta.url);
  const compiled = transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(
    (specifier: string) => Object.hasOwn(overrides, specifier) ? overrides[specifier] : localRequire(specifier),
    module,
    module.exports,
  );
  return module.exports as T;
}

const ownerOrigin = "https://owner.saas-staging.celebix.net";
const internalPath = "/api/internal/admin-login-security";
const webhookPath = "/api/security/admin-login/logto-events";
const resetPath = "/api/security/admin-login/reset";

function routingFixture(options: { missingAuthority?: boolean; authenticated?: boolean } = {}) {
  const calls = { authorityEnvironment: 0, ownerClient: 0, ownerUser: 0, ownerFetch: 0 };
  const subject = sourceModule<{ middleware(request: NextRequest): Promise<NextResponse> }>(
    new URL("./middleware.ts", import.meta.url),
    {
      "next/server": { NextResponse },
      "@supabase/ssr": { createServerClient() {
        calls.ownerClient++;
        return { auth: { async getUser() {
          calls.ownerUser++;
          return { data: { user: options.authenticated ? { id: "local-owner-fixture" } : null }, error: null };
        } } };
      } },
      "@/lib/platform/auth-fetch": { ownerAuthFetch() { calls.ownerFetch++; throw Error("external_auth_not_allowed"); } },
      "@/lib/platform/origin": {
        ownerPublicOrigin: (request: NextRequest) => request.nextUrl.origin,
        ownerSameOrigin: (request: NextRequest) => request.headers.get("origin") === request.nextUrl.origin,
      },
      "@celebix/platform-config/src/http-security": security,
      "@celebix/platform-config/src/saas": saas,
      "@/lib/api-rate-limit": { checkRateLimit() { throw Error("login_rate_limit_not_expected"); }, getRequestIp() { throw Error("login_ip_not_expected"); } },
      "@/lib/owner-auth-cookies": ownerCookies,
      "@/lib/owner-supabase-shared": {
        getMissingOwnerSupabaseEnvNames() { calls.authorityEnvironment++; return options.missingAuthority ? ["OWNER_FIXTURE_ENV"] : []; },
        formatMissingOwnerSupabaseEnvMessage: () => "Owner fixture authority missing",
        getOwnerSupabaseUrl: () => "https://owner-auth.example.test",
        getOwnerSupabaseAnonKey: () => "local-fixture-anon-key",
      },
    },
  );
  return { ...subject, calls };
}

function post(path: string, sameOrigin = false) {
  return new NextRequest(ownerOrigin + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(sameOrigin ? { origin: ownerOrigin } : {}) },
    body: JSON.stringify({ schemaVersion: 1, action: "state" }),
  });
}

for (const path of [internalPath, webhookPath, '/api/internal/merchant-whatsapp']) {
  test(`signature-owned ${path} reaches its handler without Owner cookies or Origin`, async () => {
    for (const missingAuthority of [false, true]) {
      const fixture = routingFixture({ missingAuthority });
      const response = await fixture.middleware(post(path));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("x-middleware-request-x-owner-pathname"), path);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(fixture.calls, { authorityEnvironment: 0, ownerClient: 0, ownerUser: 0, ownerFetch: 0 });
    }
  });
}

test("signature-owned paths do not make neighboring paths or support reset public", async () => {
  for (const path of [internalPath + "/", internalPath + "/extra", internalPath + "-extra", webhookPath + "/extra", webhookPath + "-extra", resetPath, '/api/internal/merchant-whatsapp/extra','/api/merchant-signup/state/extra','/api/merchant-signup/unknown']) {
    const fixture = routingFixture();
    const response = await fixture.middleware(post(path, true));
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.has("x-middleware-next"), false);
    assert.equal(fixture.calls.ownerUser, 1, path);
  }
});

test('only the four closed phone signup routes are public without an Owner session',async()=>{
 for(const path of ['/api/merchant-signup/state','/api/merchant-signup/start','/api/merchant-signup/resend','/api/merchant-signup/verify']){
  const fixture=routingFixture({missingAuthority:true}),response=await fixture.middleware(post(path));
  assert.equal(response.status,200,path);assert.equal(response.headers.get('x-middleware-next'),'1');assert.deepEqual(fixture.calls,{authorityEnvironment:0,ownerClient:0,ownerUser:0,ownerFetch:0});
 }
});

test("neighboring mutations and support reset still require the Owner Origin", async () => {
  for (const path of [internalPath + "/extra", webhookPath + "/extra", resetPath]) {
    const fixture = routingFixture();
    const response = await fixture.middleware(post(path));
    assert.equal(response.status, 403, path);
    assert.equal(fixture.calls.ownerClient, 0);
  }
});

function route(url: URL, routes: Record<string, unknown>) {
  const source = readFileSync(url, "utf8");
  const dependency = source.match(/from\s+['"]([^'"]*self-serve-auth-route-runtime\/default\.ts)['"]/u)?.[1];
  assert.ok(dependency, "actual route must resolve its runtime");
  return sourceModule<{ POST(request: Request): Promise<Response> }>(url, {
    [dependency]: { resolveDefaultOwnerStagingAuthRouteSet: async () => routes },
  });
}

test("the forwarded actual internal route rejects an unsigned request before authority handling", async () => {
  let authorityCalls = 0;
  const now = new Date("2026-10-12T10:00:00.000Z");
  const gateway = createAdminLoginInternalGateway({ ownerOrigin, clock: () => now, keys: new Map([["fixture", new Uint8Array(32).fill(7)]]), handle: async () => {
    authorityCalls++;
    throw Error("unsigned_request_must_not_reach_authority");
  } });
  const endpoint = route(new URL("./app/api/internal/admin-login-security/route.ts", import.meta.url), { internalAdminLoginSecurity: gateway });
  const request = post(internalPath);
  request.headers.set("x-celebix-admin-key-id", "fixture");
  request.headers.set("x-celebix-admin-time", now.toISOString());
  request.headers.set("x-celebix-admin-nonce", "70000000-0000-4000-8000-000000000001");
  assert.equal((await routingFixture().middleware(request)).headers.get("x-middleware-next"), "1");
  const response = await endpoint.POST(request);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "admin_login_internal_unavailable" });
  assert.equal(authorityCalls, 0);
});

test("the forwarded actual Logto route rejects an unsigned request before invalidation", async () => {
  let invalidations = 0;
  const now = new Date("2026-10-12T10:00:00.000Z");
  const webhook = createAdminLoginInvalidationWebhookHandler({ issuer: "https://identity.example.test/oidc", signingSecret: "local-only-webhook-fixture-key-123456", clock: () => now, invalidate: async () => {
    invalidations++;
    throw Error("unsigned_webhook_must_not_invalidate");
  } });
  const endpoint = route(new URL("./app/api/security/admin-login/logto-events/route.ts", import.meta.url), { adminLoginWebhook: webhook });
  const request = new NextRequest(ownerOrigin + webhookPath, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ hookId: "local-hook-fixture", event: "PostResetPassword", createdAt: now.toISOString(), interactionEvent: "ForgotPassword", userId: "local-merchant-fixture" }) });
  assert.equal((await routingFixture().middleware(request)).headers.get("x-middleware-next"), "1");
  assert.equal((await endpoint.POST(request)).status, 401);
  assert.equal(invalidations, 0);
});

test("the actual support reset route still rejects an Owner session without platform TOTP", async () => {
  let operatorCalls = 0, invalidations = 0;
  const supportReset = createAdminLoginSupportResetHandler({ issuer: "https://identity.example.test/oidc", allowedOrigin: ownerOrigin, requireOperator: async () => {
    operatorCalls++;
    return { operatorId: "70000000-0000-4000-8000-000000000001", totpVerified: false } as unknown as { operatorId: string; totpVerified: true };
  }, invalidate: async () => { invalidations++; throw Error("missing_totp_must_not_invalidate"); } });
  const endpoint = route(new URL("./app/api/security/admin-login/reset/route.ts", import.meta.url), { adminLoginSupportReset: supportReset });
  const request = post(resetPath, true);
  const fixture = routingFixture({ authenticated: true });
  assert.equal((await fixture.middleware(request)).headers.get("x-middleware-next"), "1");
  assert.equal(fixture.calls.ownerUser, 1);
  assert.equal((await endpoint.POST(request)).status, 401);
  assert.equal(operatorCalls, 1);
  assert.equal(invalidations, 0);
});
