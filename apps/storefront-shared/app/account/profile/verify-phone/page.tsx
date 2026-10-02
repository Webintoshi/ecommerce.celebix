import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { AccountAuthShell } from "@/components/account/AccountAuthShell";
import { resolveAccountPage } from "@/lib/account/page.ts";

export const metadata: Metadata = { title: "Telefon doğrulama", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPhonePage() {
  const { storefront, design, session, identity } = await resolveAccountPage("/account/profile");
  if (session.outcome !== "found" || !identity.whatsappEnabled || !session.snapshot.profile.phone || session.snapshot.profile.phoneVerified) redirect("/account/profile");
  return <AccountAuthShell storefront={storefront} design={design} title="Telefon doğrulama">
    <AccountAuthForm mode="phone-binding" initialPhone={session.snapshot.profile.phone} returnTo="/account/profile" />
  </AccountAuthShell>;
}
