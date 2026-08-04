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
  return <StorefrontFrame storefront={storefront} design={design}><main className="account-auth-layout store-container">
    <header className="account-auth-intro"><span>HESABINIZ</span><h1>Hesabınıza giriş yapın</h1><p>E-posta adresinize güvenli, tek kullanımlık bir bağlantı göndereceğiz.</p></header>
    <AccountAuthForm mode="email" returnTo={returnTo} />
    <ul className="account-auth-benefits"><li>Siparişlerinizi takip edin</li><li>Adreslerinizi saklayın</li><li>Favorilerinize her cihazdan ulaşın</li></ul>
  </main></StorefrontFrame>;
}
