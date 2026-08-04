import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AccountDashboard } from "@/components/account/AccountDashboard";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";

export const metadata: Metadata = { title: "Hesabım", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { storefront, design, identity, session } = await resolveAccountPage("/account");
  if (session.outcome !== "found") return null;
  const recentOrders = await identity.orders({
    hostname: storefront.hostname,
    cookieHeader: (await cookies()).toString() || null,
    limit: 3,
  });
  return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountDashboard snapshot={session.snapshot} recentOrders={recentOrders} /></section></StorefrontFrame>;
}
