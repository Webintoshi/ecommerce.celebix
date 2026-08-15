import "server-only";

import { randomUUID } from "node:crypto";

import { listDefaultCustomerPanelPaymentProviderCodes } from "../payment-provider-adapters/default.ts";
import { PAYMENT_PROVIDER_CATALOG } from "../payment-providers/catalog.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";
import { createProviderExecutionHttpHandlers } from "./handler.ts";

async function runtime() {
  return resolveServerProviderExecutionRuntime(await resolveDefaultServerPanelAccessRuntime());
}

const handlers = createProviderExecutionHttpHandlers({
  resolveRuntime: runtime,
  now: () => new Date(),
  requestId: randomUUID,
  profileId: randomUUID,
  providerCodes: (capability) => capability === "payment_processing"
    ? listDefaultCustomerPanelPaymentProviderCodes()
    : Object.freeze([]),
  paymentCatalog: () => PAYMENT_PROVIDER_CATALOG,
  diagnostic: (stage) => console.warn(`[provider-execution] ${stage}`),
});

type ProfileContext = Readonly<{ params: Promise<Readonly<{ profileId: string }>> }>;

export async function handleProviderDefinitions(request: Request) { return handlers.definitions(request); }
export async function handleProviderProfiles(request: Request) { return handlers.profiles(request); }
export async function handleProviderProfileDisable(request: Request, context: ProfileContext) { return handlers.disable(request, (await context.params).profileId); }
export async function handleProviderProfileRevoke(request: Request, context: ProfileContext) { return handlers.revoke(request, (await context.params).profileId); }
