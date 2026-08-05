import type {
  PlanEntitlements,
  ResolvedStoreHost,
  SaaSContractError,
  StoreMembership,
} from "@celebix/saas-contracts";
import { selectActiveStore, type PanelSession } from "./session.ts";
import {
  buildTenantContext,
  type PanelStoreRecord,
} from "./tenant-context.ts";

export interface PanelAuthorizationDataPort {
  getMemberships(principalId: string): Promise<readonly StoreMembership[]>;
  getPrincipalAuthority(principalId: string): Promise<{ issuer: string; subject: string } | null>;
  getStore(storeId: string): Promise<PanelStoreRecord | null>;
  getEntitlements(storeId: string): Promise<PlanEntitlements | null>;
  getResolvedHost(storeId: string): Promise<ResolvedStoreHost | null>;
}

export class DisabledPanelAuthorizationDataPort implements PanelAuthorizationDataPort {
  async getMemberships() { return []; }
  async getPrincipalAuthority() { return null; }
  async getStore() { return null; }
  async getEntitlements() { return null; }
  async getResolvedHost() { return null; }
}

function denied(code: SaaSContractError["code"]) {
  return { ok: false as const, error: { schemaVersion: 1, code, retryable: false } as SaaSContractError };
}

export async function resolvePanelTenantContext(input: {
  requestId: string;
  session: PanelSession;
  dataPort: PanelAuthorizationDataPort;
}) {
  const memberships = await input.dataPort.getMemberships(input.session.principal.id);
  const selected = selectActiveStore(input.session, memberships, input.session.activeStoreId);
  if (!selected.ok) return selected;

  const storeId = selected.selection.storeId;
  const [authority, store, entitlements, resolvedHost] = await Promise.all([
    input.dataPort.getPrincipalAuthority(input.session.principal.id),
    input.dataPort.getStore(storeId),
    input.dataPort.getEntitlements(storeId),
    input.dataPort.getResolvedHost(storeId),
  ]);

  if (!authority) return denied("membership_denied");
  if (!store) return denied("store_inactive");
  if (!entitlements) return denied("feature_not_enabled");

  return buildTenantContext({
    requestId: input.requestId,
    principal: input.session.principal,
    membership: selected.selection.membership,
    membershipAuthority: authority,
    store,
    entitlements,
    ...(resolvedHost ? { resolvedHost } : {}),
  });
}
