import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { AccountAuthShell } from "@/components/account/AccountAuthShell";
import { accountLoginDestination } from "@/lib/account/account-page-decision.ts";
import { safeAccountReturnTo } from "@/lib/account/request.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Giriş yap", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ returnTo?: string | string[] }> }>) {
  const { storefront, design, runtime: pageRuntime } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const returnTo = safeAccountReturnTo((await searchParams).returnTo);
  if (pageRuntime.identity) {
    const session = await pageRuntime.identity.session(storefront.hostname, (await cookies()).toString() || null).catch(() => ({ outcome: "unauthenticated" as const }));
    const destination = accountLoginDestination(session.outcome, returnTo);
    if (destination) redirect(destination);
  }
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  return (
    <AccountAuthShell
      storefront={storefront}
      design={design}
      title="Giriş"
    >
      <AccountAuthForm mode={runtime?.identity?.whatsappEnabled ? "phone" : "email"} returnTo={returnTo} />
    </AccountAuthShell>
  );
}
