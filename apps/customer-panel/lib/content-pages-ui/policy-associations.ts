import { FIXED_STOREFRONT_POLICIES, type MerchantAdminRecord, type StorefrontPolicyKey } from "@celebix/saas-contracts";

export type ContentPagePolicyAssociation = Readonly<{ recordId: string; recordVersion: number; policyKey: StorefrontPolicyKey }>;
export type AssociatedPolicyPage = Readonly<{ record: MerchantAdminRecord; policyKey: StorefrontPolicyKey }>;

export function partitionContentPages(records: readonly MerchantAdminRecord[], associations: readonly ContentPagePolicyAssociation[] = []) {
  const pages: MerchantAdminRecord[] = [], policyPages: AssociatedPolicyPage[] = [];
  for (const record of records) {
    const association = record.kind === "page" && !record.requiredPageKey && record.status !== "archived"
      ? associations.find(item => item.recordId === record.id && item.recordVersion === record.version && FIXED_STOREFRONT_POLICIES.some(policy => policy.key === item.policyKey)) : undefined;
    if (association) policyPages.push(Object.freeze({ record, policyKey: association.policyKey }));
    else pages.push(record);
  }
  return Object.freeze({ pages: Object.freeze(pages), policyPages: Object.freeze(policyPages) });
}
