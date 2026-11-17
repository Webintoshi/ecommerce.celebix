import { createCanonicalAdminOriginFromPanelOrigin, normalizeExactHttpsOrigin, parseExactAdminHttpsOrigin } from "@celebix/saas-data";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TenantLogin } from "../../components/auth/TenantLogin";
import { resolveDefaultServerAdminHostAuthRuntime } from "../../lib/server-admin-host-auth/default.ts";
import { resolveServerPanelSession } from "../../lib/server-session";
import { resolveTenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";
import { merchantPackageSelection, merchantPurchaseDestination, merchantPurchaseHintFromPage, merchantPurchaseSearch } from "../../lib/merchant-phone/purchase-hint.ts";

function packageSignupHref(search: string) {
  try {
    return `${normalizeExactHttpsOrigin(process.env.CELEBIX_OWNER_ORIGIN)}/kayit${search}`;
  } catch {
    return undefined;
  }
}

function packageStoreOrigin(panelOrigin: string, store: string) {
  const value = store.trim().toLowerCase();
  if (value.length > 253 || !/^[a-z0-9.-]+$/u.test(value)) return undefined;
  try {
    return value.includes('.')
      ? parseExactAdminHttpsOrigin(`https://${value}`).origin
      : createCanonicalAdminOriginFromPanelOrigin(panelOrigin, value);
  } catch {
    return undefined;
  }
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const panelOrigin = process.env.CELEBIX_PANEL_ORIGIN;
  const central = panelOrigin !== undefined && panelOrigin === `https://${host}`;
  const store = central && typeof query?.store === 'string' && Object.keys(query).length === 3 ? query.store : undefined;
  const purchaseHint = merchantPurchaseHintFromPage(store !== undefined ? { purchase: query?.purchase, term: query?.term } : query);
  const selection = merchantPackageSelection(purchaseHint);
  if (selection && (await resolveServerPanelSession()).kind === "authenticated") {
    redirect(merchantPurchaseDestination(purchaseHint));
  }
  const loginModel = (hostHeader: string | null) => resolveTenantAdminLoginModel({
    hostHeader,
    resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
    clock: () => new Date(),
  });
  if (selection && central && store !== undefined) {
    const target = packageStoreOrigin(panelOrigin, store);
    if (target && (await loginModel(new URL(target).hostname)).kind === "tenant") {
      redirect(`${target}/login${merchantPurchaseSearch(purchaseHint)}`);
    }
  }

  const model = await loginModel(host);
  const signupHref = selection ? packageSignupHref(merchantPurchaseSearch(purchaseHint)) : undefined;
  return <TenantLogin model={model} purchaseHint={purchaseHint} signupHref={signupHref}
    packageStore={central && selection ? { ...selection, invalid: store !== undefined } : undefined} />;
}
