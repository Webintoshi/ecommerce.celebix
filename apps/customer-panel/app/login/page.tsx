import { headers } from "next/headers";

import { TenantLogin } from "../../components/auth/TenantLogin";
import { resolveDefaultServerAdminHostAuthRuntime } from "../../lib/server-admin-host-auth/default.ts";
import { resolveTenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";
import { merchantPurchaseHintFromPage } from "../../lib/merchant-phone/purchase-hint.ts";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const requestHeaders = await headers();
  const model = await resolveTenantAdminLoginModel({
    hostHeader: requestHeaders.get("host"),
    resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
    clock: () => new Date(),
  });

  return <TenantLogin model={model} purchaseHint={merchantPurchaseHintFromPage(await searchParams)} />;
}
