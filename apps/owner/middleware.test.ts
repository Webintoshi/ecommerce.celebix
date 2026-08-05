import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { NextRequest } from "next/server.js";

register(new URL("./scripts/node-test-resolver.mjs", import.meta.url));
const { middleware } = await import("./middleware.ts");

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
