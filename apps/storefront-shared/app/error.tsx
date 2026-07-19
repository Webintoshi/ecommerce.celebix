"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset(): void }) { return <main className="error-page"><span>503</span><h1>Mağaza geçici olarak kullanılamıyor</h1><p>Güvenli mağaza verileri şu anda yüklenemedi.</p><button className="store-button" type="button" onClick={reset}>Tekrar dene</button></main>; }
