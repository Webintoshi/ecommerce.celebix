import "server-only";
import { isMerchantActionAllowed, type MerchantAdminRecord, type StorefrontPolicyKey, type TenantContext } from "@celebix/saas-contracts";
import type { MerchantAdminRepository, MerchantContentRepository, StorePolicyAdminRepository } from "@celebix/saas-data";
import type { ContentPagePolicyAssociation } from "../content-pages-ui/policy-associations.ts";

const ALIASES: Readonly<Record<string, StorefrontPolicyKey>> = Object.freeze({
  gizlilik: "privacy_security", "gizlilik-politikasi": "privacy_security", "gizlilik-ve-guvenlik": "privacy_security",
  "mesafeli-satis-sozlesmesi": "distance_sales", kvkk: "kvkk",
  "odeme-teslimat": "payment_delivery", "odeme-ve-teslimat": "payment_delivery",
  "cerez-politikasi": "cookie_usage", "cerez-kullanimi": "cookie_usage",
  iade: "returns_exchanges", "teslimat-ve-iade-politikasi": "returns_exchanges", "iade-degisim": "returns_exchanges",
  uyelik: "membership", "uyelik-sozlesmesi": "membership",
});
const EMPTY: readonly ContentPagePolicyAssociation[] = Object.freeze([]);
type Dependencies = Readonly<{
  merchantAdmin: Pick<MerchantAdminRepository, "list">;
  merchantContent: Pick<MerchantContentRepository, "get">;
  policies: Pick<StorePolicyAdminRepository, "list">;
}>;

function candidate(record: MerchantAdminRecord): StorefrontPolicyKey | null {
  const slug = record.config.slug;
  return record.kind === "page" && !record.requiredPageKey && record.status !== "archived" && typeof slug === "string" && Object.hasOwn(ALIASES, slug) ? ALIASES[slug]! : null;
}

export async function resolveContentPagePolicyAssociations(input: Readonly<{ tenantContext: TenantContext; now: Date }>, deps: Dependencies): Promise<readonly ContentPagePolicyAssociation[]> {
  if (!isMerchantActionAllowed(input.tenantContext.membership.role, "content.read")) return EMPTY;
  try {
    const records = await deps.merchantAdmin.list({ ...input, kind: "page" });
    const candidates = records.flatMap(record => { const policyKey = candidate(record); return policyKey ? [{ record, policyKey }] : []; });
    if (!candidates.length || candidates.length > 7) return EMPTY;
    const policies = await deps.policies.list(input);
    const associations = await Promise.all(candidates.map(async ({ record, policyKey }) => {
      const policy = policies.find(item => item.key === policyKey);
      if (!policy?.body.trim()) return null;
      try {
        const document = await deps.merchantContent.get({ ...input, kind: "page", recordId: record.id });
        if (document.id !== record.id || document.kind !== "page" || document.requiredPageKey || document.version !== record.version
          || document.slug !== record.config.slug || document.locale !== record.config.locale || document.status !== record.status
          || document.bodyFormat !== "legacy" || document.body !== policy.body || !document.body.trim()
          || document.published !== (record.config.published === true) || document.published !== (policy.status === "published")) return null;
        return Object.freeze({ recordId: record.id, recordVersion: record.version, policyKey });
      } catch { return null; }
    }));
    return Object.freeze(associations.filter((item): item is ContentPagePolicyAssociation => item !== null));
  } catch { return EMPTY; }
}
