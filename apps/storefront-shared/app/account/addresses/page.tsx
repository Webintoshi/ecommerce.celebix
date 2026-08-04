import type { Metadata } from "next";
import { AccountAddresses } from "@/components/account/AccountAddresses";
import { AccountNav } from "@/components/account/AccountNav";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";

export const metadata: Metadata = { title: "Adresler", robots: { index: false, follow: false } }; export const dynamic = "force-dynamic";
export default async function AddressesPage() { const { storefront, design, session } = await resolveAccountPage("/account/addresses"); if (session.outcome !== "found") return null; return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountNav /><header className="account-page-title"><h1>Adresler</h1></header><AccountAddresses addresses={session.snapshot.addresses} /></section></StorefrontFrame>; }
