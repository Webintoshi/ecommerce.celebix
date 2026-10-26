import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { HostedCheckoutResult } from "@/components/HostedCheckoutResult";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = Object.freeze({
  title: "Ödeme durumu",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function HostedCheckoutResultPage() {
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  const cookieHeader = (await cookies()).toString() || null;
  const hostedCheckout = runtime.hostedCheckout;
  const hostedStatus = hostedCheckout
    ? await hostedCheckout.status({ hostname: storefront.hostname, cookieHeader }).catch(() => null)
    : null;

  return <StorefrontFrame storefront={storefront} design={design}>
    <HostedCheckoutResult hostedStatus={hostedStatus} paymentPath="/checkout/payment" resultPath="/checkout/payment/result" />
  </StorefrontFrame>;
}

export default withCommercePolicyPage(HostedCheckoutResultPage);
