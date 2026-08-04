import type { Metadata } from "next";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { safeAccountReturnTo } from "@/lib/account/request.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Girişi onaylayın", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: Readonly<{ searchParams: Promise<{ returnTo?: string; ticket?: string }> }>) {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage()); const params = await searchParams; const returnTo = safeAccountReturnTo(params.returnTo);
  const ticket = typeof params.ticket === "string" && params.ticket.length <= 1_600 ? params.ticket : "";
  return <StorefrontFrame storefront={storefront} design={design}><main className="account-auth-layout store-container">
    <header className="account-auth-intro"><span>GÜVENLİ GİRİŞ</span><h1>Girişi onaylayın</h1><p>{ticket ? "Devam ederek bu cihazda hesabınıza giriş yapın." : "E-postanızdaki 6 haneli kodu girin."}</p></header>
    <AccountAuthForm mode="verify" returnTo={returnTo} ticket={ticket} />
    <p className="account-auth-footnote">Bu isteği siz yapmadıysanız bu sayfayı kapatabilirsiniz.</p>
  </main></StorefrontFrame>;
}
