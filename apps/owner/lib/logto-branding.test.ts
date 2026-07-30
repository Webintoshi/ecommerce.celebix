import assert from "node:assert/strict";
import test from "node:test";

import {
  CELEBIX_LOGTO_BRANDING,
  CELEBIX_LOGTO_CUSTOM_CSS,
  restoreLogtoBranding,
  synchronizeCelebixLogtoBranding,
} from "./logto-branding.ts";
import {
  normalizeLogtoManagementApiPath,
  type LogtoManagementTransport,
} from "./logto-management-transport.ts";

type SignInExperience = {
  customCss: string | null;
  color: Record<string, unknown>;
  branding: Record<string, unknown>;
  signIn?: Record<string, unknown>;
};

class StatefulLogtoTransport implements LogtoManagementTransport {
  state: SignInExperience;
  patchCount = 0;
  lastPatch: Record<string, unknown> | null = null;

  constructor(state: SignInExperience) {
    this.state = structuredClone(state);
  }

  async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    assert.equal(pathname, "/api/sign-in-exp");
    const method = init.method ?? "GET";

    if (method === "GET") {
      return structuredClone(this.state) as T;
    }

    assert.equal(method, "PATCH");
    const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
    this.patchCount += 1;
    this.lastPatch = patch;
    this.state = { ...this.state, ...structuredClone(patch) } as SignInExperience;
    return structuredClone(this.state) as T;
  }
}

function createCurrentExperience(overrides: Partial<SignInExperience> = {}): SignInExperience {
  return {
    customCss: "old-css",
    color: {
      primaryColor: "#5E5CE6",
      darkPrimaryColor: "#7D7AFF",
      isDarkModeEnabled: false,
    },
    branding: {
      logoUrl: "https://old.example/logo.svg",
      darkLogoUrl: "https://old.example/logo-dark.svg",
      favicon: "https://old.example/favicon.ico",
      darkFavicon: "https://old.example/favicon-dark.ico",
    },
    signIn: { methods: [{ identifier: "email", password: true }] },
    ...overrides,
  };
}

test("management API paths cannot accidentally duplicate the /api prefix", () => {
  assert.equal(normalizeLogtoManagementApiPath("/api/sign-in-exp"), "/sign-in-exp");
  assert.equal(normalizeLogtoManagementApiPath("/applications"), "/applications");
  assert.equal(normalizeLogtoManagementApiPath("users"), "/users");
});

test("Celebix CSS is scoped, responsive, dark-mode aware, and keeps security UI visible", () => {
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /#app/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /#FE6100/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /#D95200/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /#2B2B2B/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /#F6F7F9/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /:focus-visible/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /max-width:\s*600px/);
  assert.match(CELEBIX_LOGTO_CUSTOM_CSS, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(CELEBIX_LOGTO_CUSTOM_CSS, /display\s*:\s*none/i);
  assert.doesNotMatch(CELEBIX_LOGTO_CUSTOM_CSS, /visibility\s*:\s*hidden/i);
  assert.doesNotMatch(CELEBIX_LOGTO_CUSTOM_CSS, /pointer-events\s*:\s*none/i);
  assert.doesNotMatch(CELEBIX_LOGTO_CUSTOM_CSS, /<script|javascript:/i);
});

test("synchronization patches only supported presentation fields and preserves favicon values", async () => {
  const transport = new StatefulLogtoTransport(createCurrentExperience());

  const result = await synchronizeCelebixLogtoBranding(transport);

  assert.equal(result.changed, true);
  assert.equal(result.previous.customCss, "old-css");
  assert.equal(
    result.previous.cssSha256,
    "ab49c9a535610637dd98573a8177cae369380ce901be992fa647e16d587aec48",
  );
  assert.equal(transport.patchCount, 1);
  assert.deepEqual(Object.keys(transport.lastPatch ?? {}).sort(), [
    "branding",
    "color",
    "customCss",
  ]);
  assert.equal(transport.state.customCss, CELEBIX_LOGTO_CUSTOM_CSS);
  assert.deepEqual(transport.state.color, CELEBIX_LOGTO_BRANDING.color);
  assert.deepEqual(transport.state.branding, {
    ...createCurrentExperience().branding,
    ...CELEBIX_LOGTO_BRANDING.branding,
  });
  assert.deepEqual(transport.state.signIn, createCurrentExperience().signIn);
});

test("an already synchronized tenant is idempotent", async () => {
  const transport = new StatefulLogtoTransport(
    createCurrentExperience({
      customCss: CELEBIX_LOGTO_CUSTOM_CSS,
      color: CELEBIX_LOGTO_BRANDING.color,
      branding: {
        ...createCurrentExperience().branding,
        ...CELEBIX_LOGTO_BRANDING.branding,
      },
    }),
  );

  const result = await synchronizeCelebixLogtoBranding(transport);

  assert.equal(result.changed, false);
  assert.equal(transport.patchCount, 0);
});

test("captured branding can be restored exactly", async () => {
  const original = createCurrentExperience();
  const transport = new StatefulLogtoTransport(original);
  const synchronized = await synchronizeCelebixLogtoBranding(transport);

  await restoreLogtoBranding(synchronized.previous, transport);

  assert.equal(transport.patchCount, 2);
  assert.equal(transport.state.customCss, original.customCss);
  assert.deepEqual(transport.state.color, original.color);
  assert.deepEqual(transport.state.branding, original.branding);
});

test("branding failures never expose transport response bodies or credentials", async () => {
  const transport: LogtoManagementTransport = {
    async request() {
      throw new Error("Bearer secret-token response-body-with-user-data");
    },
  };

  await assert.rejects(
    synchronizeCelebixLogtoBranding(transport),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Logto branding synchronization failed");
      assert.doesNotMatch(error.message, /secret-token|user-data/);
      return true;
    },
  );
});
