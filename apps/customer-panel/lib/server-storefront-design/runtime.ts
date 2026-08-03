import "server-only";

import type { StorefrontDesignRepository } from "@celebix/saas-data";

import type { TenantMediaStorage } from "../server-media/r2-storage.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerStorefrontDesignRuntime = Readonly<{
  access: ApprovedAccess;
  repository: StorefrontDesignRepository;
  storage: TenantMediaStorage;
}>;

const REPOSITORY_METHODS = Object.freeze(["getWorkspace", "saveDraft", "publish", "reserveMedia"] as const);
const STORAGE_METHODS = Object.freeze(["publicUrl", "put", "publish", "unpublish", "head", "delete"] as const);

function invalid(): never { throw new Error("server_storefront_design_runtime_invalid"); }

function facade<T extends object>(value: T, methods: readonly (keyof T)[]): T {
  if (!value || methods.some((method) => typeof value[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, (value[method] as Function).bind(value)])) as T);
}

export function createServerStorefrontDesignRuntime(input: Readonly<{
  access: ServerPanelAccessRuntime;
  repository: StorefrontDesignRepository;
  storage: TenantMediaStorage;
}>): ServerStorefrontDesignRuntime {
  if (!input || input.access?.readiness.mode !== "approved_staging" || typeof input.access.panelOrigin !== "string") invalid();
  return Object.freeze({
    access: input.access as ApprovedAccess,
    repository: facade(input.repository, REPOSITORY_METHODS),
    storage: facade(input.storage, STORAGE_METHODS),
  });
}
