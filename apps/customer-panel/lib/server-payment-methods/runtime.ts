import type { PaymentProviderCatalogEntry } from "@celebix/saas-contracts";
import type { PaymentMethodRepository } from "@celebix/saas-data";

import { PAYMENT_PROVIDER_CATALOG } from "../payment-providers/catalog.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export interface ServerPaymentMethodsRuntime {
  readonly access: ApprovedAccess;
  readonly methods: PaymentMethodRepository;
  readonly catalog: readonly PaymentProviderCatalogEntry[];
}

const repositories = new WeakMap<ServerPanelAccessRuntime, PaymentMethodRepository>();
const METHODS = Object.freeze(["list", "save", "setState", "reorder", "recoverOperation"] as const);

function invalid(): never {
  throw new Error("server_payment_methods_runtime_invalid");
}

function facade(repository: PaymentMethodRepository): PaymentMethodRepository {
  if (!repository || typeof repository !== "object" || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(
    METHODS.map((method) => [method, repository[method].bind(repository)]),
  ) as unknown as PaymentMethodRepository);
}

export function registerServerPaymentMethodRepository(
  access: ServerPanelAccessRuntime,
  repository: PaymentMethodRepository,
): void {
  try {
    if (
      !access
      || access.readiness.mode !== "approved_staging"
      || access.panelOrigin === null
      || repositories.has(access)
    ) invalid();
    repositories.set(access, facade(repository));
  } catch { invalid(); }
}

export function resolveServerPaymentMethodsRuntime(
  access: ServerPanelAccessRuntime,
): ServerPaymentMethodsRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const methods = repositories.get(access);
    return methods === undefined
      ? null
      : Object.freeze({
        access: access as ApprovedAccess,
        methods,
        catalog: PAYMENT_PROVIDER_CATALOG,
      });
  } catch { return null; }
}
