import assert from "node:assert/strict";
import test from "node:test";

import type { StarterThemeComposition } from "@celebix/saas-contracts";
import type { StorefrontDesignPreviewResources } from "../storefront-design-preview-model.ts";
import { createStorefrontDesignPreviewRequestCoordinator } from "./use-preview-resources.ts";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const composition = {} as StarterThemeComposition;
const first = { dependencyKey: "first" } as StorefrontDesignPreviewResources;
const second = { dependencyKey: "second" } as StorefrontDesignPreviewResources;

test("coordinator aborts the prior request and ignores stale completion", async () => {
  const pending = [deferred<StorefrontDesignPreviewResources>(), deferred<StorefrontDesignPreviewResources>()]; const signals: AbortSignal[] = []; const applied: string[] = [];
  const coordinator = createStorefrontDesignPreviewRequestCoordinator({ request: async (_composition, signal) => { signals.push(signal); return pending[signals.length - 1]!.promise; }, apply: (value) => applied.push(value.dependencyKey), fail: () => applied.push("failed") });
  const old = coordinator.refresh(composition); const current = coordinator.refresh(composition);
  assert.equal(signals[0]?.aborted, true); pending[1]!.resolve(second); await current; pending[0]!.resolve(first); await old;
  assert.deepEqual(applied, ["second"]);
  coordinator.dispose(); assert.equal(signals[1]?.aborted, true);
});
