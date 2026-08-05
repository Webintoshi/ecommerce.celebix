import type { Metadata } from "next";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { AccountAuthShell } from "@/components/account/AccountAuthShell";
import { safeAccountReturnTo } from "@/lib/account/request.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Girişi onaylayın", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ returnTo?: string; ticket?: string }>;
}>) {
  const { storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const params = await searchParams;
  const returnTo = safeAccountReturnTo(params.returnTo);
  const ticket = typeof params.ticket === "string" && params.ticket.length <= 1_600 ? params.ticket : "";
  return (
    <AccountAuthShell
      storefront={storefront}
      design={design}
      title="Güvenli giriş"
    >
      <AccountAuthForm mode="verify" returnTo={returnTo} ticket={ticket} />
    </AccountAuthShell>
  );
}
