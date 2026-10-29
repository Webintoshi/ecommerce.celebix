"use client";

import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { Check, Info } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { MarketplaceArtwork } from "@/components/marketplaces/MarketplaceArtwork";
import styles from "./marketplace-form.module.css";

type Props = Readonly<{
  record?: MerchantAdminRecord;
  returnTo: string;
  busy: boolean;
  dirty: boolean;
  onDirtyChange: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>;

function text(record: MerchantAdminRecord | undefined, key: string) {
  const value = record?.config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function MarketplaceConnectionForm({ record, returnTo, busy, dirty, onDirtyChange, onSubmit }: Props) {
  const [values, setValues] = useState(() => ({
    name: record?.name ?? "",
    provider: text(record, "provider"),
    merchantReference: text(record, "merchantReference"),
    status: record?.status === "draft" ? "draft" : "active",
    syncEnabled: record?.config.syncEnabled === true,
  }));
  function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues(current => ({ ...current, [key]: value }));
    onDirtyChange();
  }

  return <div className={styles.layout}>
    <form className={styles.form} aria-label="Pazaryeri bağlantısı" aria-busy={busy || undefined} onSubmit={onSubmit}>
      <section className={styles.section} aria-labelledby="marketplace-connection-fields">
        <h2 id="marketplace-connection-fields">Bağlantı kaydı</h2>
        <div className={styles.fields}>
          <label className={styles.wide}>Bağlantı adı<input name="name" autoComplete="off" required placeholder="Örn. Hepsiburada mağazam" maxLength={160} disabled={busy} value={values.name} onChange={event => change("name", event.target.value)} /></label>
          <label>Pazaryeri<input name="provider" placeholder="Örn. Hepsiburada" autoComplete="off" maxLength={1000} disabled={busy} value={values.provider} onChange={event => change("provider", event.target.value)} /></label>
          <label>Mağaza referansı<input name="merchantReference" placeholder="Satıcı veya mağaza numarası" autoComplete="off" maxLength={1000} disabled={busy} value={values.merchantReference} onChange={event => change("merchantReference", event.target.value)} /></label>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="marketplace-connection-options">
        <h2 id="marketplace-connection-options">Tercihler</h2>
        <label className={styles.statusField}>Hazırlık durumu<select name="status" disabled={busy} value={values.status} onChange={event => change("status", event.target.value)}>
          <option value="draft">Kapalı</option>
          <option value="active">Hazırlığa açık</option>
        </select></label>
        <label className={styles.toggle}>
          <span><strong>Senkronizasyon isteği</strong><small>Doğrulanmış bağlantıyla hazırlık oluşturulabilir.</small></span>
          <input type="checkbox" name="syncEnabled" checked={values.syncEnabled} disabled={busy} onChange={event => change("syncEnabled", event.target.checked)} />
          <span className={styles.toggleTrack} aria-hidden="true"><Check size={12} /></span>
        </label>
      </section>
      <footer className={styles.saveBar}>
        <span role="status">{busy ? "Kaydediliyor…" : dirty ? "Kaydedilmedi" : record ? "Kayıtlı" : ""}</span>
        <div><Link href={returnTo} className="button button-secondary" onClick={event => { if (busy || dirty && !window.confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi?")) event.preventDefault(); }}>Vazgeç</Link><button className="button button-primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </footer>
    </form>
    <aside className={styles.preview} aria-label="Bağlantı özeti">
      <MarketplaceArtwork variant="connect" className={styles.artwork} />
      <div className={styles.identity}><h2>Aktarım hakkında</h2></div>
      <p className={styles.safety}><Info size={18} aria-hidden="true" /><span>Bu kayıt bağlantı bilgilerini saklar. Kaydetmek aktarımı başlatmaz. Aktarım için etkin ve doğrulanmış bir sağlayıcı bağlantısı gerekir.</span></p>
    </aside>
  </div>;
}
