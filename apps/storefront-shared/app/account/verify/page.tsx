import type { Metadata } from "next";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { safeAccountReturnTo } from "@/lib/account/request.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Giriş kodu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: Readonly<{ searchParams: Promise<{ returnTo?: string }> }>) {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage()); const returnTo = safeAccountReturnTo((await searchParams).returnTo);
  return <StorefrontFrame storefront={storefront} design={design}><section className="account-auth-layout store-container"><div><span>DOĞRULAMA</span><h1>E-postanızdaki kodu girin</h1><p>Kod 10 dakika geçerlidir.</p></div><AccountAuthForm mode="code" returnTo={returnTo} /></section></StorefrontFrame>;
}
