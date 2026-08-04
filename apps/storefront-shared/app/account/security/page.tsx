import type { Metadata } from "next";
import { AccountNav } from "@/components/account/AccountNav";
import { AccountSecurity } from "@/components/account/AccountSecurity";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";

export const metadata: Metadata = { title: "Güvenlik", robots: { index: false, follow: false } }; export const dynamic = "force-dynamic";
export default async function SecurityPage() { const { storefront, design, session } = await resolveAccountPage("/account/security"); if (session.outcome !== "found") return null; return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountNav /><header className="account-page-title"><h1>Güvenlik</h1></header><AccountSecurity devices={session.snapshot.devices} /></section></StorefrontFrame>; }
