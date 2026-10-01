import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountNav } from "@/components/account/AccountNav";
import { AccountAuthShell } from "@/components/account/AccountAuthShell";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { accountProfileDestination } from "@/lib/account/account-page-decision.ts";
import { resolveAccountPage } from "@/lib/account/page.ts";
import { safeAccountReturnTo } from "@/lib/account/request.ts";

export const metadata: Metadata = { title: "Profil", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: Readonly<{ searchParams: Promise<{ returnTo?: string | string[] }> }>) {
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = safeAccountReturnTo(rawReturnTo);
  const { storefront, design, session, identity } = await resolveAccountPage(returnTo, true);
  const destination = accountProfileDestination(session.outcome, rawReturnTo);
  if (destination) redirect(destination);
  if (session.outcome === "profile_required") {
    return <AccountAuthShell storefront={storefront} design={design} title="Hesabınızı tamamlayın"><AccountProfileForm mode="complete" returnTo={returnTo} /></AccountAuthShell>;
  }
  return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountNav /><header className="account-page-title"><h1>Profil</h1></header>{session.outcome === "found" ? <>
    <AccountProfileForm mode="update" initial={session.snapshot.profile} version={session.snapshot.version} />
    {identity.whatsappEnabled && session.snapshot.profile.phone && !session.snapshot.profile.phoneVerified ? <p><Link className="store-button store-button-secondary" href="/account/profile/verify-phone">WhatsApp ile doğrula</Link></p> : null}
  </> : null}</section></StorefrontFrame>;
}
