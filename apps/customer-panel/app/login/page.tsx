import { headers } from "next/headers";

import { TenantLogin } from "../../components/auth/TenantLogin";
import { resolveDefaultServerAdminHostAuthRuntime } from "../../lib/server-admin-host-auth/default.ts";
import { resolveTenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";

export default async function LoginPage() {
  const requestHeaders = await headers();
  const model = await resolveTenantAdminLoginModel({
    hostHeader: requestHeaders.get("host"),
    resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
    clock: () => new Date(),
  });

  return <TenantLogin model={model} />;
}
