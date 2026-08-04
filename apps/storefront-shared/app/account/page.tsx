import type { Metadata } from "next";

import { AccountDashboard } from "@/components/account/AccountDashboard";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";

export const metadata: Metadata = { title: "Hesabım", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { storefront, design, session } = await resolveAccountPage("/account");
  if (session.outcome !== "found") return null;
  return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountDashboard snapshot={session.snapshot} /></section></StorefrontFrame>;
}
