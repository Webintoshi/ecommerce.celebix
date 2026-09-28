"use client";

import type { StorefrontPolicyKey } from "@celebix/saas-contracts";
import type { StorePolicyStatus } from "@celebix/saas-data";

export type RetainedPolicyDraft = Readonly<{
  key: StorefrontPolicyKey;
  body: string;
  status: StorePolicyStatus;
  recovery: "conflict" | "unknown" | null;
  version: number;
}>;

// Browser-lifetime recovery only. The page supplies an opaque session/store
// scope; drafts never enter persistent storage, history payloads or requests.
const draftsByScope = new Map<string, readonly RetainedPolicyDraft[]>();
const MAX_RETAINED_SCOPES = 8;
const EMPTY_DRAFTS: readonly RetainedPolicyDraft[] = Object.freeze([]);

function copyDrafts(drafts: readonly RetainedPolicyDraft[]): readonly RetainedPolicyDraft[] {
  return Object.freeze(drafts.map(({ key, body, status, recovery, version }) => Object.freeze({
    key, body, status, recovery, version,
  })));
}

export function readPolicyNavigationDrafts(scope: string | undefined): readonly RetainedPolicyDraft[] {
  const retained = scope ? draftsByScope.get(scope) : undefined;
  return retained ? copyDrafts(retained) : EMPTY_DRAFTS;
}

export function retainPolicyNavigationDrafts(scope: string | undefined, drafts: readonly RetainedPolicyDraft[]): void {
  if (!scope) return;
  draftsByScope.delete(scope);
  if (!drafts.length) return;
  draftsByScope.set(scope, copyDrafts(drafts));
  if (draftsByScope.size > MAX_RETAINED_SCOPES) {
    const oldest = draftsByScope.keys().next().value;
    if (oldest !== undefined) draftsByScope.delete(oldest);
  }
}

export function forgetPolicyNavigationDrafts(scope: string | undefined): void {
  if (scope) draftsByScope.delete(scope);
}
