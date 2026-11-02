import "server-only";
import type { TenantContext } from "@celebix/saas-contracts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerMerchantAdminRuntime } from "../server-merchant-admin/runtime.ts";
import { resolveServerMerchantContentRuntime } from "../server-merchant-content/runtime.ts";
import { resolveServerStorePolicyRuntime } from "../server-store-policy/runtime.ts";
import { resolveContentPagePolicyAssociations } from "./policy-associations.ts";

export async function resolveDefaultContentPagePolicyAssociations(tenantContext: TenantContext) {
  try {
    const access = await resolveDefaultServerPanelAccessRuntime();
    const admin = resolveServerMerchantAdminRuntime(access), content = resolveServerMerchantContentRuntime(access), policy = resolveServerStorePolicyRuntime(access);
    return admin && content && policy ? await resolveContentPagePolicyAssociations({ tenantContext, now: new Date() }, {
      merchantAdmin: admin.merchantAdmin, merchantContent: content.merchantContent, policies: policy.policies,
    }) : [];
  } catch { return []; }
}
