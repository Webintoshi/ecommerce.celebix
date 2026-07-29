import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { CheckoutClient } from "@/components/checkout/CheckoutClient.tsx";
import { resolveCheckoutPage } from "@/lib/checkout/public-checkout.ts";
import { resolveDefaultPublicCheckoutRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

import styles from "./checkout.module.css";

export const metadata: Metadata = Object.freeze({
  title: "Güvenli ödeme",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

function CheckoutUnavailable({ kind }: Readonly<{ kind: "not_found" | "unavailable" }>) {
  return <main className={styles.unavailable}>
    <h1>{kind === "not_found" ? "Sepetiniz bulunamadı" : "Ödeme şu anda kullanılamıyor"}</h1>
    <p>{kind === "not_found"
      ? "Ürünleri sepetinize yeniden ekleyip ödeme adımına geçin."
      : "Lütfen daha sonra yeniden deneyin."}</p>
    <a href="/">Mağazaya dön</a>
  </main>;
}

export default async function CheckoutPage() {
  const [requestHeaders, cookieStore, runtime] = await Promise.all([
    headers(),
    cookies(),
    resolveDefaultPublicCheckoutRuntime(),
  ]);
  const authority = selectTrustedStorefrontHostAuthority(requestHeaders);
  if (authority.kind !== "trusted" || runtime === null) {
    return <CheckoutUnavailable kind="unavailable" />;
  }
  const selected = await resolveCheckoutPage({
    hostname: authority.hostname,
    cookieHeader: cookieStore.toString() || null,
    now: new Date(),
    repository: runtime.checkout,
  });
  if (selected.kind !== "active") return <CheckoutUnavailable kind={selected.kind} />;
  return <CheckoutClient initialOperationId={randomUUID()} initialQuote={selected.quote} />;
}
