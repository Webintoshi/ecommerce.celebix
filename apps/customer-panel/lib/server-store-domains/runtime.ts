import type { StoreDomainService } from "@celebix/saas-domain-core";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
export type ServerStoreDomainRuntime = Readonly<{ access: ApprovedAccess; domains: StoreDomainService }>;

const services = new WeakMap<ServerPanelAccessRuntime, StoreDomainService>();
const METHODS = Object.freeze(["list", "create", "requestRecheck", "makePrimary", "disable"] as const);
function invalid(): never { throw new Error("server_store_domain_runtime_invalid"); }
function facade(service: StoreDomainService): StoreDomainService {
  if (!service || typeof service !== "object" || METHODS.some((method) => typeof service[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(METHODS.map((method) => [method, service[method].bind(service)])) as unknown as StoreDomainService);
}
export function registerServerStoreDomainService(access: ServerPanelAccessRuntime, service: StoreDomainService): void {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || services.has(access)) invalid();
    services.set(access, facade(service));
  } catch { invalid(); }
}
export function resolveServerStoreDomainRuntime(access: ServerPanelAccessRuntime): ServerStoreDomainRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const domains = services.get(access);
    return domains ? Object.freeze({ access: access as ApprovedAccess, domains }) : null;
  } catch { return null; }
}
