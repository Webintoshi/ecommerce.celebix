import type { Metadata } from "next";

import { AccountNav } from "@/components/account/AccountNav";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";

export const metadata: Metadata = { title: "Profil", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { storefront, design, session } = await resolveAccountPage("/account/profile", true);
  return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountNav /><header className="account-page-title"><h1>{session.outcome === "profile_required" ? "Hesabınızı tamamlayın" : "Profil"}</h1></header>{session.outcome === "profile_required" ? <AccountProfileForm mode="complete" /> : session.outcome === "found" ? <AccountProfileForm mode="update" initial={session.snapshot.profile} version={session.snapshot.version} /> : null}</section></StorefrontFrame>;
}
