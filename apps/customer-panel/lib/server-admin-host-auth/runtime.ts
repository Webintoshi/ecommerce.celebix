import "server-only";

import type { PostgresAdminDomainRepository } from "@celebix/saas-data";

import type { PostgresCrossHostSessionHandoffRepository } from "../cross-host-session-handoff/postgres-repository.ts";
import type { PostgresPanelStoreOptionRepository } from "../panel-store-options/postgres-repository.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

type AdminDomainAuthority = Pick<PostgresAdminDomainRepository, "resolvePublicBrand">;
type HandoffAuthority = PostgresCrossHostSessionHandoffRepository;
type StoreOptionAuthority = PostgresPanelStoreOptionRepository;
type LogoutAuthority = Readonly<{ endSessionEndpoint: string; clientId: string; stateKey: Uint8Array }>;

export type ServerAdminHostAuthRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  adminDomains: AdminDomainAuthority;
  handoffs: HandoffAuthority;
  storeOptions: StoreOptionAuthority;
  logout: LogoutAuthority;
}>;

const runtimes = new WeakMap<ServerPanelAccessRuntime, Readonly<{
  adminDomains: AdminDomainAuthority;
  handoffs: HandoffAuthority;
  storeOptions: StoreOptionAuthority;
  logout: LogoutAuthority;
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

function storeOptionFacade(repository: StoreOptionAuthority): StoreOptionAuthority {
  if (!repository || typeof repository.listForCredential !== "function") invalid();
  return Object.freeze({
    listForCredential: (input: Parameters<StoreOptionAuthority["listForCredential"]>[0]) => repository.listForCredential(input),
  });
}

function logoutFacade(authority: LogoutAuthority): LogoutAuthority {
  if (
    !authority || typeof authority.endSessionEndpoint !== "string" || typeof authority.clientId !== "string" ||
    !(authority.stateKey instanceof Uint8Array) || authority.stateKey.byteLength !== 32
  ) invalid();
  return Object.freeze({
    endSessionEndpoint: authority.endSessionEndpoint,
    clientId: authority.clientId,
    stateKey: new Uint8Array(authority.stateKey),
  });
}

export function registerServerAdminHostAuthRuntime(
  access: ServerPanelAccessRuntime,
  repositories: Readonly<{
    adminDomains: AdminDomainAuthority;
    handoffs: HandoffAuthority;
    storeOptions: StoreOptionAuthority;
    logout: LogoutAuthority;
  }>,
): void {
  if (
    !access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null
    || !repositories || runtimes.has(access)
  ) invalid();
  runtimes.set(access, Object.freeze({
    adminDomains: adminDomainFacade(repositories.adminDomains),
    handoffs: handoffFacade(repositories.handoffs),
    storeOptions: storeOptionFacade(repositories.storeOptions),
    logout: logoutFacade(repositories.logout),
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
        storeOptions: repositories.storeOptions,
        logout: logoutFacade(repositories.logout),
      });
}
