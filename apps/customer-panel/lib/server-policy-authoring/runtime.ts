import 'server-only';
import { hasCommercialCapability } from '@celebix/saas-contracts';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { resolveServerToshiProviderRuntime } from '../server-toshi-providers/runtime.ts';
import { resolveServerCentralToshiRepository } from '../server-toshi-providers/central-repository.ts';
import { createCentralToshiAuthority } from '../server-toshi-providers/central.ts';
import { resolveServerToshiCreditsRuntime } from '../server-toshi-credits/runtime.ts';
import { resolveServerStorePolicyRuntime } from '../server-store-policy/runtime.ts';
import { resolveServerMerchantAdminRuntime } from '../server-merchant-admin/runtime.ts';
import { createToshiGenerationRegistry } from '../toshi-generation/registry.ts';
import { createPolicyAuthoringService, type PolicyAuthoringService } from './service.ts';
import { loadPolicyMerchantFacts } from './facts.ts';

export type ServerPolicyAuthoringRuntime = Readonly<{ access: ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>; service: PolicyAuthoringService }>;
const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerPolicyAuthoringRuntime>();
export function registerServerPolicyAuthoringRuntime(access: ServerPanelAccessRuntime): ServerPolicyAuthoringRuntime {
  const provider = resolveServerToshiProviderRuntime(access), central = resolveServerCentralToshiRepository(access), credits = resolveServerToshiCreditsRuntime(access), policies = resolveServerStorePolicyRuntime(access), merchant = resolveServerMerchantAdminRuntime(access);
  if (!provider || !central || !credits || !policies || !merchant || RUNTIMES.has(access)) throw Error('server_policy_authoring_runtime_invalid');
  const service = createPolicyAuthoringService({ credits: credits.repository, policies: policies.policies, providers: createCentralToshiAuthority(central, () => provider.keyring), keyring: () => provider.keyring, generations: createToshiGenerationRegistry(), now: () => new Date(), loadFacts: input => loadPolicyMerchantFacts({ ...input, merchantAdmin: merchant.merchantAdmin, includeAccounting: hasCommercialCapability(input.tenantContext.entitlements, 'accounting') }) });
  const runtime = Object.freeze({ access: provider.access, service }); RUNTIMES.set(access, runtime); return runtime;
}
export function resolveServerPolicyAuthoringRuntime(access: ServerPanelAccessRuntime): ServerPolicyAuthoringRuntime | null {
  try { return access?.readiness.mode === 'approved_staging' && access.panelOrigin ? RUNTIMES.get(access) ?? null : null; } catch { return null; }
}
