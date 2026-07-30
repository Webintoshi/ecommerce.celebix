import "server-only";

import type { PostgresAdminDomainRepository } from "@celebix/saas-data";

import type { PostgresCrossHostSessionHandoffRepository } from "../cross-host-session-handoff/postgres-repository.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

type AdminDomainAuthority = Pick<PostgresAdminDomainRepository, "resolvePublicBrand">;
type HandoffAuthority = PostgresCrossHostSessionHandoffRepository;

export type ServerAdminHostAuthRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  adminDomains: AdminDomainAuthority;
  handoffs: HandoffAuthority;
}>;

const runtimes = new WeakMap<ServerPanelAccessRuntime, Readonly<{
  adminDomains: AdminDomainAuthority;
  handoffs: HandoffAuthority;
}>>();

function invalid(): never {
  throw new Error("server_admin_host_auth_runtime_invalid");
}

function adminDomainFacade(repository: AdminDomainAuthority): AdminDomainAuthority {
  if (!repository || typeof repository.resolvePublicBrand !== "function") invalid();
  return Object.freeze({
    resolvePublicBrand: (input) => repository.resolvePublicBrand(input),
  });
}

function handoffFacade(repository: HandoffAuthority): HandoffAuthority {
  if (
    !repository
    || typeof repository.issueHandoff !== "function"
    || typeof repository.recoverIssuedHandoff !== "function"
    || typeof repository.redeemHandoff !== "function"
    || typeof repository.recoverRedemption !== "function"
  ) invalid();
  return Object.freeze({
    issueHandoff: (input: Parameters<HandoffAuthority["issueHandoff"]>[0]) => repository.issueHandoff(input),
    recoverIssuedHandoff: (input: Parameters<HandoffAuthority["recoverIssuedHandoff"]>[0]) => repository.recoverIssuedHandoff(input),
    redeemHandoff: (input: Parameters<HandoffAuthority["redeemHandoff"]>[0]) => repository.redeemHandoff(input),
    recoverRedemption: (input: Parameters<HandoffAuthority["recoverRedemption"]>[0]) => repository.recoverRedemption(input),
  });
}

export function registerServerAdminHostAuthRuntime(
  access: ServerPanelAccessRuntime,
  repositories: Readonly<{ adminDomains: AdminDomainAuthority; handoffs: HandoffAuthority }>,
): void {
  if (
    !access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null
    || !repositories || runtimes.has(access)
  ) invalid();
  runtimes.set(access, Object.freeze({
    adminDomains: adminDomainFacade(repositories.adminDomains),
    handoffs: handoffFacade(repositories.handoffs),
  }));
}

export function resolveServerAdminHostAuthRuntime(
  access: ServerPanelAccessRuntime,
): ServerAdminHostAuthRuntime | null {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
  const repositories = runtimes.get(access);
  return repositories === undefined
    ? null
    : Object.freeze({
        access: access as ApprovedAccessRuntime,
        adminDomains: repositories.adminDomains,
        handoffs: repositories.handoffs,
      });
}
