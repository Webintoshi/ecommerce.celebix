import type { Metadata } from "next";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { AccountAuthShell } from "@/components/account/AccountAuthShell";
import { safeAccountReturnTo } from "@/lib/account/request.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Giriş yap", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ returnTo?: string }> }>) {
  const { storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const returnTo = safeAccountReturnTo((await searchParams).returnTo);
  return (
    <AccountAuthShell
      storefront={storefront}
      design={design}
      title="Giriş yap veya hesap oluştur"
    >
      <AccountAuthForm mode="email" returnTo={returnTo} />
    </AccountAuthShell>
  );
}
