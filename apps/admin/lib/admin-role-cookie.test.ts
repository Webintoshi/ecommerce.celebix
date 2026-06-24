import assert from "node:assert/strict";
import test from "node:test";

import {
  readAdminRoleCookie,
  writeAdminRoleCookie,
  type AdminRoleCookiePayload,
} from "./admin-role-cookie";

type MutableEnv = Record<string, string | undefined>;

function withEnv(overrides: MutableEnv, callback: () => void) {
  const previous: MutableEnv = {};

  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const nextValue = overrides[key];
    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  }

  try {
    callback();
  } finally {
    for (const key of Object.keys(overrides)) {
      const previousValue = previous[key];
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

function createCookieCaptureResponse() {
  const cookies = new Map<string, string>();

  return {
    cookies,
    response: {
      cookies: {
        set(name: string, value: string) {
          cookies.set(name, value);
        },
      },
    },
  };
}

test("admin role cookie can be signed with Logto secret when Supabase env is absent", () => {
  withEnv(
    {
      LOGTO_COOKIE_SECRET: "test-logto-cookie-secret",
      NEXT_PUBLIC_ADMIN_URL: "https://admin.example.test",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    () => {
      const payload: AdminRoleCookiePayload = {
        userId: "user_real_admin",
        role: "super_admin",
      };
      const { response, cookies } = createCookieCaptureResponse();

      writeAdminRoleCookie(response as never, payload);

      const rawCookie = cookies.get("celebix-admin-role");
      assert.ok(rawCookie);
      assert.deepEqual(
        readAdminRoleCookie([{ name: "celebix-admin-role", value: rawCookie }]),
        payload,
      );
    },
  );
});
