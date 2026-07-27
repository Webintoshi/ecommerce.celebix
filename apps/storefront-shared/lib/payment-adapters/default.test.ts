import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createDefaultHostedPaymentRuntime,
  resolveStorefrontHostedPaymentActivationMode,
} from "./default.ts";

test("storefront PayTR activation mode is exact and disabled by default", () => {
  assert.equal(resolveStorefrontHostedPaymentActivationMode({}), "disabled");
  assert.equal(
    resolveStorefrontHostedPaymentActivationMode({
      CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
    }),
    "approved_test_sandbox",
  );
  for (const value of ["enabled", "approved_test_validation", " approved_test_sandbox", "approved_test_sandbox "]) {
    assert.equal(
      resolveStorefrontHostedPaymentActivationMode({
        CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: value,
      }),
      "disabled",
    );
  }
});

test("storefront composition stays inert with verification readiness or null compiled authority", () => {
  let dependencyReads = 0;
  const dependencies = Object.defineProperties({}, {
    attempts: { enumerable: true, get() { dependencyReads += 1; throw new Error("attempts_must_not_be_read"); } },
    keyring: { enumerable: true, get() { dependencyReads += 1; throw new Error("keyring_must_not_be_read"); } },
    transport: { enumerable: true, get() { dependencyReads += 1; throw new Error("transport_must_not_be_read"); } },
    selectAuthority: { enumerable: true, get() { dependencyReads += 1; throw new Error("authority_must_not_be_read"); } },
    now: { enumerable: true, get() { dependencyReads += 1; throw new Error("clock_must_not_be_read"); } },
    randomBytes: { enumerable: true, get() { dependencyReads += 1; throw new Error("random_must_not_be_read"); } },
  });

  assert.equal(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthority: null,
    dependencies,
  } as never), null);
  assert.equal(dependencyReads, 0);
});

test("default storefront call site stages the real repository keyring and transport behind the dormant gate", async () => {
  const source = await readFile(new URL("../default-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /PostgresPaymentAttemptRepository/);
  assert.match(source, /parseMerchantProviderCredentialKeyring/);
  assert.match(source, /createBoundedProviderTransport/);
  assert.match(source, /createDefaultHostedPaymentRuntime/);
  assert.match(source, /resolveStorefrontHostedPaymentActivationMode/);
  assert.match(source, /compiledPaytrIframeTestAuthority/);
  assert.match(
    source,
    /finally\s*\{[\s\S]*!runtimeOwnsKeyring[\s\S]*key[.]fill\(0\)/,
  );
  assert.doesNotMatch(source, /CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST/);
});
