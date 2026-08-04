import type { Metadata } from "next";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { safeAccountReturnTo } from "@/lib/account/request.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Giriş yap", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<{ returnTo?: string }> }>) {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage()); const returnTo = safeAccountReturnTo((await searchParams).returnTo);
  return <StorefrontFrame storefront={storefront} design={design}><section className="account-auth-layout store-container"><div><span>HESABINIZ</span><h1>Giriş yapın veya hesap oluşturun</h1><p>E-posta adresinize tek kullanımlık kod göndereceğiz.</p></div><AccountAuthForm mode="email" returnTo={returnTo} /></section></StorefrontFrame>;
}
