"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import type { PermanentDeletionEffect, PermanentDeletionImpact } from "@celebix/saas-contracts";

import styles from "./PermanentDeleteDialog.module.css";

const EFFECT_LABELS: Readonly<Record<PermanentDeletionEffect["kind"], string>> = Object.freeze({
  order_items: "Sipariş kalemleri", notes: "Dahili notlar", notifications: "Bildirim kayıtları",
  shipping_records: "Kargo kayıtları", draft_links: "Taslak bağlantıları", cart_links: "Sepet bağlantıları",
  analytics_events: "Analitik bağlantıları", external_payment: "Harici ödeme kaydı", external_fulfillment: "Harici teslimat kaydı",
  variants: "Varyantlar", media: "Ürün görselleri", catalog_relations: "Katalog bağlantıları",
  pricing_records: "Fiyat kayıtları", barcode_records: "Barkod kayıtları", order_line_snapshots: "Geçmiş sipariş ürün görüntüleri",
  product_links: "Kategoriye bağlı ürün bağlantıları", child_categories: "Alt kategoriler", design_references: "Tasarım bağlantıları",
});

function effectText(effect: PermanentDeletionEffect): string {
  const action = effect.disposition === "delete" ? "kalıcı silinecek"
    : effect.disposition === "detach" ? "bağlantısı kaldırılacak"
      : effect.disposition === "retain_snapshot" ? "geçmiş kaydı korunacak"
        : "harici kaydı değişmeyecek";
  return `${EFFECT_LABELS[effect.kind]}: ${effect.count} kayıt ${action}.`;
}

export function PermanentDeleteDialog({
  impact,
  resourceLabel,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  impact?: PermanentDeletionImpact;
  resourceLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (confirmation: string) => void;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!impact || busy || !acknowledged || confirmation !== impact.confirmationLabel) return;
    onConfirm(confirmation);
  }

  const valid = impact !== undefined && acknowledged && confirmation === impact.confirmationLabel;
  return <div className={styles.layer}>
    <div ref={dialogRef} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="permanent-delete-title" aria-describedby="permanent-delete-description" tabIndex={-1} onKeyDown={keyDown}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true"><Trash2 /></span>
        <div><h2 id="permanent-delete-title">{resourceLabel} kalıcı olarak silinsin mi?</h2><p id="permanent-delete-description">Bu işlem geri alınamaz. Arşivleme seçeneği ayrı olarak kullanılmaya devam eder.</p></div>
      </header>
      {impact ? <form className={styles.form} onSubmit={submit}>
        <div className={styles.effects}><strong>Silme etkileri</strong>{impact.effects.length ? <ul>{impact.effects.map((effect) => <li key={`${effect.kind}:${effect.disposition}`}>{effectText(effect)}</li>)}</ul> : <p>Bu kayda bağlı ek kayıt bulunmuyor.</p>}</div>
        <label className={styles.field}><span>Onaylamak için aşağıdaki adı aynen yazın</span><small>{impact.confirmationLabel}</small><input value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} autoComplete="off" spellCheck={false} disabled={busy} /></label>
        <label className={styles.acknowledge}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.currentTarget.checked)} disabled={busy} /><span>Bu işlemin geri alınamayacağını ve yalnız bu kaydın kalıcı olarak silineceğini anlıyorum.</span></label>
        <div className={styles.actions}><button ref={cancelRef} className={styles.cancel} type="button" onClick={onCancel} disabled={busy}>Vazgeç</button><button className={styles.delete} type="submit" disabled={!valid || busy}>{busy ? "Kalıcı olarak siliniyor…" : "Kalıcı olarak sil"}</button></div>
      </form> : <div className={styles.effects}><p className={styles.loading} role="status">Silme etkileri yükleniyor…</p><div className={styles.actions}><button ref={cancelRef} className={styles.cancel} type="button" onClick={onCancel} disabled={busy}>Vazgeç</button></div></div>}
    </div>
  </div>;
}
