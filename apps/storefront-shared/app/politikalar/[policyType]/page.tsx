import type { CheckoutPolicyLink } from "@celebix/saas-contracts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { resolveDefaultPublicCheckoutRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";
import styles from "@/app/odeme/checkout.module.css";

export const metadata: Metadata = Object.freeze({
  title: "Mağaza politikası",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

const POLICY_TYPES = Object.freeze([
  "distance_sales",
  "pre_information",
  "privacy",
  "returns",
  "shipping",
] as const);

function validPolicyType(value: string): value is CheckoutPolicyLink["policyType"] {
  return POLICY_TYPES.some((policyType) => policyType === value);
}

export default async function CheckoutPolicyPage({
  params,
}: Readonly<{ params: Promise<{ policyType: string }> }>) {
  const { policyType } = await params;
  if (!validPolicyType(policyType)) notFound();
  const [requestHeaders, runtime] = await Promise.all([
    headers(),
    resolveDefaultPublicCheckoutRuntime(),
  ]);
  const authority = selectTrustedStorefrontHostAuthority(requestHeaders);
  if (authority.kind !== "trusted" || runtime === null) notFound();
  let policy;
  try {
    policy = await runtime.checkout.getPolicy({
      hostname: authority.hostname,
      policyType,
      now: new Date(),
    });
  } catch {
    notFound();
  }
  return <main className={styles.policyPage}>
    <a className={styles.policyBack} href="/odeme">Ödemeye dön</a>
    <article>
      <h1>{policy.label}</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{policy.body}</p>
    </article>
  </main>;
}
