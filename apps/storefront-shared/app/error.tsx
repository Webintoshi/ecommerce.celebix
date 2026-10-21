"use client";
import { CommercePolicyPageBoundary } from "../components/CommercePolicyPageBoundary";
import { UNAVAILABLE_COMMERCE_POLICY } from "../lib/commerce-policy-snapshot.ts";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset(): void }) { return <CommercePolicyPageBoundary policy={UNAVAILABLE_COMMERCE_POLICY}><main className="error-page"><span>503</span><h1>Mağaza geçici olarak kullanılamıyor</h1><p>Güvenli mağaza verileri şu anda yüklenemedi.</p><button className="store-button" type="button" onClick={reset}>Tekrar dene</button></main></CommercePolicyPageBoundary>; }
