import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
import { HostedCheckoutResult } from "@/components/HostedCheckoutResult";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { checkoutContextPaymentPath, checkoutContextResultPath, parseCheckoutContextId } from "@/lib/checkout/checkout-context.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = Object.freeze({
  title: "Ödeme durumu",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function CheckoutContextResultPage(props: Readonly<{ params: Promise<Readonly<{ contextId: string }>> }>) {
  const contextId = parseCheckoutContextId((await props.params).contextId);
  if (contextId === null) notFound();
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  const cookieHeader = (await headers()).get("cookie");
  const hostedStatus = runtime.hostedCheckout
    ? await runtime.hostedCheckout.status({ hostname: storefront.hostname, cookieHeader, contextId }).catch(() => null)
    : null;
  return <StorefrontFrame storefront={storefront} design={design}>
    <HostedCheckoutResult hostedStatus={hostedStatus} paymentPath={checkoutContextPaymentPath(contextId)} resultPath={checkoutContextResultPath(contextId)} />
  </StorefrontFrame>;
}

export default withCommercePolicyPage(CheckoutContextResultPage);
