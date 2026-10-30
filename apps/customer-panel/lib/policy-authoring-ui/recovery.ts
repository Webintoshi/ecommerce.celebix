import type { StorefrontPolicyKey } from '@celebix/saas-contracts';
import type { PolicyAuthoringRequest } from '../policy-authoring/types.ts';
import { parsePolicyAuthoringRequest } from '../policy-authoring/validation.ts';
import { parsePolicyAuthoringContext, policyAuthoringRequestMatchesContext, type PolicyAuthoringContext } from './controller.ts';

export type PolicyAuthoringReceipt = Readonly<{ operationId: string; request: PolicyAuthoringRequest; context: PolicyAuthoringContext }>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key = (scope: string, policyKey: StorefrontPolicyKey) => `celebix:policy-authoring:v1:${scope}:${policyKey}`;

function parseReceipt(value: unknown): PolicyAuthoringReceipt {
  const receipt = value as PolicyAuthoringReceipt;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || Object.keys(receipt).sort().join(',') !== 'context,operationId,request'
    || typeof receipt.operationId !== 'string' || !UUID.test(receipt.operationId)) throw new Error('policy_authoring_recovery_invalid');
  const request = parsePolicyAuthoringRequest(receipt.request), context = parsePolicyAuthoringContext(receipt.context);
  if (!policyAuthoringRequestMatchesContext(request, context)) throw new Error('policy_authoring_recovery_invalid');
  return Object.freeze({ operationId: receipt.operationId, request, context });
}

export function readPolicyAuthoringRecovery(storage: Storage, scope: string, policyKey: StorefrontPolicyKey): PolicyAuthoringReceipt | null {
  const raw = storage.getItem(key(scope, policyKey));
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > 1_250_000) throw new Error('policy_authoring_recovery_invalid');
  const receipt = parseReceipt(JSON.parse(raw));
  if (receipt.context.recoveryScope !== scope || receipt.context.policyKey !== policyKey) throw new Error('policy_authoring_recovery_invalid');
  return receipt;
}

export function writePolicyAuthoringRecovery(storage: Storage, receipt: PolicyAuthoringReceipt): void {
  const parsed = parseReceipt(receipt);
  storage.setItem(key(parsed.context.recoveryScope, parsed.context.policyKey), JSON.stringify(parsed));
}

export function clearPolicyAuthoringRecovery(storage: Storage, receipt: PolicyAuthoringReceipt): void {
  const current = readPolicyAuthoringRecovery(storage, receipt.context.recoveryScope, receipt.context.policyKey);
  if (current && current.operationId !== receipt.operationId) throw new Error('policy_authoring_recovery_mismatch');
  storage.removeItem(key(receipt.context.recoveryScope, receipt.context.policyKey));
}
