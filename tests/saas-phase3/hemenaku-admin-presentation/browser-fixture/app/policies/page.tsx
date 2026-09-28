import { FIXED_STOREFRONT_POLICIES, type StorefrontPolicyKey } from "@celebix/saas-contracts";

import { PolicyFixtureScreen } from "./PolicyFixtureScreen";

export default async function PolicyFixturePage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = await searchParams;
  const policyKey = typeof query.key === "string" && FIXED_STOREFRONT_POLICIES.some(({ key }) => key === query.key)
    ? query.key as StorefrontPolicyKey
    : undefined;
  const canManage = query.scenario !== "readonly";
  const session = typeof query.session === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(query.session) ? query.session : "default";
  return <PolicyFixtureScreen initialPolicyKey={policyKey} canManage={canManage} recoveryScope={canManage ? `fixture-policy-${session}` : undefined} />;
}
