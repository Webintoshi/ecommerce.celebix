import assert from "node:assert/strict";
import test from "node:test";
import { buildSelfServeLogtoStartUrl } from "./self-serve-logto";

function withEnv<T>(env: Record<string, string | undefined>, callback: () => T): T {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);

    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    return callback();
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

function decodeState(url: URL) {
  const encoded = url.searchParams.get("state");
  assert.ok(encoded);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { returnTo?: string };
}

test("self-serve auth start defaults to the kayit flow", () => {
  withEnv(
    {
      OWNER_PUBLIC_URL: "https://ecommerce.celebix.co",
      SELF_SERVE_LOGTO_CLIENT_ID: "test-client",
      SELF_SERVE_LOGTO_REDIRECT_URI: undefined,
      SELF_SERVE_LOGTO_START_URL: undefined,
    },
    () => {
      const request = new Request("https://ecommerce.celebix.co/api/self-serve/auth/start");
      const result = buildSelfServeLogtoStartUrl(request, "/kayit");

      assert.equal(result.configured, true);
      assert.equal(result.url.searchParams.get("redirect_uri"), "https://ecommerce.celebix.co/kayit");
      assert.equal(decodeState(result.url).returnTo, "/kayit");
    },
  );
});

test("self-serve auth start maps legacy onboarding returnTo to kayit", () => {
  withEnv(
    {
      OWNER_PUBLIC_URL: "https://ecommerce.celebix.co",
      SELF_SERVE_LOGTO_CLIENT_ID: "test-client",
      SELF_SERVE_LOGTO_REDIRECT_URI: undefined,
      SELF_SERVE_LOGTO_START_URL: undefined,
    },
    () => {
      const request = new Request("https://ecommerce.celebix.co/api/self-serve/auth/start");
      const result = buildSelfServeLogtoStartUrl(request, "/onboarding");

      assert.equal(result.configured, true);
      assert.equal(decodeState(result.url).returnTo, "/kayit");
    },
  );
});
