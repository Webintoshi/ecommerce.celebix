import { FIXED_STOREFRONT_POLICIES, type StorefrontPolicyKey } from '@celebix/saas-contracts';
import type { PolicyAuthoringRequest } from '../policy-authoring/types.ts';

export type PolicyAuthoringContext = Readonly<{
  recoveryScope: string;
  policyKey: StorefrontPolicyKey;
  policyVersion: number;
  body: string;
  status: 'draft' | 'published';
  revision: string;
}>;

export function parsePolicyAuthoringContext(value: unknown): PolicyAuthoringContext {
  const context = value as PolicyAuthoringContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || Object.keys(context).sort().join(',') !== 'body,policyKey,policyVersion,recoveryScope,revision,status'
    || typeof context.recoveryScope !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(context.recoveryScope)
    || !FIXED_STOREFRONT_POLICIES.some(policy => policy.key === context.policyKey)
    || !Number.isSafeInteger(context.policyVersion) || context.policyVersion < 1
    || typeof context.body !== 'string' || new TextEncoder().encode(context.body).byteLength > 100_000
    || !['draft', 'published'].includes(context.status)
    || typeof context.revision !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(context.revision)) {
    throw new Error('policy_authoring_context_invalid');
  }
  return Object.freeze({ recoveryScope: context.recoveryScope, policyKey: context.policyKey, policyVersion: context.policyVersion, body: context.body, status: context.status, revision: context.revision });
}

export function samePolicyAuthoringContext(left: PolicyAuthoringContext, right: PolicyAuthoringContext): boolean {
  try { return JSON.stringify(parsePolicyAuthoringContext(left)) === JSON.stringify(parsePolicyAuthoringContext(right)); }
  catch { return false; }
}

export function rebindPolicyAuthoringRecoveryContext(captured: PolicyAuthoringContext, current: PolicyAuthoringContext): PolicyAuthoringContext {
  const previous = parsePolicyAuthoringContext(captured), next = parsePolicyAuthoringContext(current);
  const previousMount = /^([^:]+):\d+$/.exec(previous.revision)?.[1];
  const currentMount = /^([^:]+):\d+$/.exec(next.revision)?.[1];
  if (previousMount && currentMount && previousMount !== currentMount
    && previous.recoveryScope === next.recoveryScope && previous.policyKey === next.policyKey
    && previous.policyVersion === next.policyVersion && previous.body === next.body && previous.status === next.status) return next;
  return captured;
}

export function policyAuthoringRequestMatchesContext(request: PolicyAuthoringRequest, context: PolicyAuthoringContext): boolean {
  return request.policyKey === context.policyKey && request.policyVersion === context.policyVersion && request.currentBody === context.body;
}
