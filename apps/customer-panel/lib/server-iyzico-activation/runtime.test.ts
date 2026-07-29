import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  IyzicoSandboxEvidenceActivationAppRepository,
  MerchantProviderProfileRepository,
} from "@celebix/saas-data";
import type { IyzicoCandidateBuildMetadata } from "@celebix/payment-adapters";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import {
  registerServerIyzicoActivationRuntime,
  resolveServerIyzicoActivationRuntime,
} from "./runtime.ts";

const reject = async () => { throw new Error("unused"); };

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return {
    readiness: { mode },
    panelOrigin: mode === "approved_staging" ? "https://panel.example.test" : null,
  } as ServerPanelAccessRuntime;
}

function evidence(): IyzicoSandboxEvidenceActivationAppRepository {
  return Object.freeze({
    begin: reject,
    activate: reject,
    preflight: async () => true as const,
    beginCurrent: reject,
    current: reject,
    activateCurrent: reject,
    activationRuntimePreflight: async () => true as const,
  }) as unknown as IyzicoSandboxEvidenceActivationAppRepository;
}

function profiles(): MerchantProviderProfileRepository {
  return Object.freeze({
    list: reject,
    save: reject,
    disable: reject,
    revoke: reject,
  });
}

function build(): IyzicoCandidateBuildMetadata {
  const candidate = Object.freeze({
    evidenceSchemaVersion: 1 as const,
    providerCode: "iyzico_iframe" as const,
    capability: "payment_processing" as const,
    environment: "test" as const,
    adapterVersion: 1 as const,
    gitSha: "a".repeat(40),
    sourceDigest: `sha256:${"b".repeat(64)}`,
  });
  return Object.freeze({
    buildMetadataSchemaVersion: 1,
    ...candidate,
    candidateExecutionDigest: `sha256:${createHash("sha256").update(JSON.stringify(candidate)).digest("hex")}`,
  });
}

test("approved runtime exposes only current app evidence and profile read facades", () => {
  const approved = access();
  registerServerIyzicoActivationRuntime(approved, evidence(), profiles(), build());

  const runtime = resolveServerIyzicoActivationRuntime(approved);
  assert.ok(runtime);
  assert.equal(runtime.access, approved);
  assert.deepEqual(Object.keys(runtime.evidence), [
    "beginCurrent", "current", "activateCurrent", "activationRuntimePreflight",
  ]);
  assert.deepEqual(Object.keys(runtime.profiles), ["list"]);
  assert.deepEqual(runtime.build, build());
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.evidence), true);
  assert.equal(Object.isFrozen(runtime.profiles), true);
  assert.equal(Object.isFrozen(runtime.build), true);
  assert.equal("begin" in runtime.evidence, false);
  assert.equal("activate" in runtime.evidence, false);
  assert.equal("save" in runtime.profiles, false);
  assert.equal(resolveServerIyzicoActivationRuntime(access("disabled")), null);
});

test("runtime permits a null generated build but rejects malformed and duplicate authority", () => {
  const withoutBuild = access();
  registerServerIyzicoActivationRuntime(withoutBuild, evidence(), profiles(), null);
  assert.equal(resolveServerIyzicoActivationRuntime(withoutBuild)?.build, null);

  assert.throws(
    () => registerServerIyzicoActivationRuntime(access("disabled"), evidence(), profiles(), build()),
    /server_iyzico_activation_runtime_invalid/,
  );
  assert.throws(
    () => registerServerIyzicoActivationRuntime(access(), { current: reject } as never, profiles(), build()),
    /server_iyzico_activation_runtime_invalid/,
  );
  assert.throws(
    () => registerServerIyzicoActivationRuntime(access(), evidence(), { list: null } as never, build()),
    /server_iyzico_activation_runtime_invalid/,
  );
  assert.throws(
    () => registerServerIyzicoActivationRuntime(access(), evidence(), profiles(), { ...build(), gitSha: "A".repeat(40) }),
    /server_iyzico_activation_runtime_invalid/,
  );

  const duplicate = access();
  registerServerIyzicoActivationRuntime(duplicate, evidence(), profiles(), build());
  assert.throws(
    () => registerServerIyzicoActivationRuntime(duplicate, evidence(), profiles(), build()),
    /server_iyzico_activation_runtime_invalid/,
  );
});

test("approved PostgreSQL startup gates registration on the exact 061 preflight", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /PostgresIyzicoSandboxEvidenceAppRepository/);
  assert.match(source, /to_regprocedure\('saas\.iyzico_iframe_tenant_activation_runtime_preflight\(\)'\)/);
  assert.match(source, /saas\.iyzico_iframe_tenant_activation_runtime_preflight\(\) AS iyzico_activation_runtime/);
  assert.match(source, /new PostgresIyzicoSandboxEvidenceAppRepository\(\{[\s\S]*?role: "celebix_saas_app"/);
  assert.match(source, /await iyzicoActivationRepository\.activationRuntimePreflight\(\)/);
  assert.match(source, /registerServerIyzicoActivationRuntime\([\s\S]*?IYZICO_GENERATED_BUILD_METADATA/);
  assert.ok(source.indexOf("await preflight") < source.indexOf("new PostgresIyzicoSandboxEvidenceAppRepository"));
  assert.ok(source.indexOf("activationRuntimePreflight()") < source.indexOf("registerServerIyzicoActivationRuntime("));
});
