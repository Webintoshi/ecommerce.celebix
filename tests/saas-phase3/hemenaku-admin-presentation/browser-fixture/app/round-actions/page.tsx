"use client";

import { useState } from "react";

function Plus() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

export default function RoundActionsFixture() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  return <main style={{ padding: 24, maxWidth: 960, margin: "auto" }}>
    <h1 style={{ fontSize: 24 }}>Düğme boyutları</h1>
    <p>Yerel tasarım testi · örnek veriler · canlıya bağlı değil</p>
    <div style={{ display: "grid", gap: 24, marginBlock: 32 }}>
      {(["large", "medium", "small"] as const).map(size => <section key={size} aria-label={`${size} boyut`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button type="button" data-size={size} className={`button button-primary ${size === "medium" ? "" : `button-${size}`}`} onClick={() => setCount(value => value + 1)}><Plus />Ürün ekle</button>
        <button type="button" className={`button button-secondary ${size === "medium" ? "" : `button-${size}`}`} onClick={() => setCount(0)}>Vazgeç</button>
      </section>)}
      <section aria-label="Durumlar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button type="button" className="button button-primary icon-only-button" aria-label="Bir ürün ekle" onClick={() => setCount(value => value + 1)}><Plus /></button>
        <button type="button" className="button button-primary" disabled>Kaydet</button>
        <button type="button" className="button button-primary" aria-busy={busy} onClick={() => setBusy(value => !value)}>{busy ? "Kaydediliyor" : "Yükleme durumunu göster"}</button>
        <button type="button" className="button button-danger" onClick={() => setCount(0)}>Kaldır</button>
      </section>
    </div>
    <p role="status">Eklenen ürün: {count}</p>
    <label style={{ display: "grid", gap: 8 }}>Ürün adı<input placeholder="Örnek ürün" /></label>
  </main>;
}
