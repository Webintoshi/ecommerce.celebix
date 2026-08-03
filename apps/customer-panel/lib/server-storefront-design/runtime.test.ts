import assert from "node:assert/strict";
import test from "node:test";

import type { StorefrontDesignRepository } from "@celebix/saas-data";

import { createDisabledServerPanelAccessRuntime, createApprovedStagingServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { createServerStorefrontDesignRuntime } from "./runtime.ts";

function authority() {
  return { async resolveSession() { return { kind: "unauthenticated" as const }; }, async rotateSession() { return { kind: "unauthenticated" as const }; }, async recoverOperation() { return { kind: "operation_mismatch" as const }; }, async revokePrincipalSessions() { return { kind: "unauthenticated" as const }; } };
}

function repository(): StorefrontDesignRepository {
  const reject = async () => { throw new Error("unused"); };
  return { getWorkspace: reject, saveDraft: reject, publish: reject, reserveMedia: reject } as StorefrontDesignRepository;
}

function storage() {
  const reject = async () => { throw new Error("unused"); };
  return { publicUrl: (key: string) => `https://media.example/${key}`, put: reject, publish: reject, unpublish: reject, head: reject, delete: reject };
}

test("storefront design runtime freezes narrow repository and storage facades", () => {
  const access = createApprovedStagingServerPanelAccessRuntime(authority(), "https://panel.saas-staging.celebix.site");
  const selected = createServerStorefrontDesignRuntime({ access, repository: Object.assign(repository(), { pool: "private" }), storage: Object.assign(storage(), { credentials: "private" }) as never });
  assert.equal(selected.access, access);
  assert.equal(Object.isFrozen(selected), true);
  assert.deepEqual(Object.keys(selected.repository).sort(), ["getWorkspace", "publish", "reserveMedia", "saveDraft"]);
  assert.deepEqual(Object.keys(selected.storage).sort(), ["delete", "head", "publicUrl", "publish", "put", "unpublish"]);
  assert.equal("pool" in selected.repository, false);
  assert.equal("credentials" in selected.storage, false);
});

test("storefront design runtime rejects disabled access and incomplete dependencies", () => {
  assert.throws(() => createServerStorefrontDesignRuntime({ access: createDisabledServerPanelAccessRuntime(), repository: repository(), storage: storage() as never }), /server_storefront_design_runtime_invalid/);
  const access = createApprovedStagingServerPanelAccessRuntime(authority(), "https://panel.saas-staging.celebix.site");
  assert.throws(() => createServerStorefrontDesignRuntime({ access, repository: {} as never, storage: storage() as never }), /server_storefront_design_runtime_invalid/);
});
