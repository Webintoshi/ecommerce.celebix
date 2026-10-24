"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ProductPageReviewSettings } from "@celebix/saas-contracts";
import { ProductPageReviewSettingsApiError, productPageReviewSettingsApi, type ProductPageReviewSettingsCommand } from "@/lib/product-page-reviews-ui/client";
import styles from "./product-page-review-settings.module.css";

type Api = Pick<typeof productPageReviewSettingsApi, "get" | "save">;
type Intent = Readonly<{ command: ProductPageReviewSettingsCommand; operationId: string }>;
function message(error: unknown) { return error instanceof ProductPageReviewSettingsApiError ? error.message : "Yorum yazma ayarı doğrulanamadı. Yeniden deneyin."; }

export function ProductPageReviewSettingsConsole({ canManage, api = productPageReviewSettingsApi }: Readonly<{ canManage: boolean; api?: Api }>) {
  const [saved, setSaved] = useState<ProductPageReviewSettings>();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const sequence = useRef(0);
  const active = useRef(false);
  const busy = useRef(false);
  const readController = useRef<AbortController | undefined>(undefined);
  const pending = useRef<Intent | undefined>(undefined);

  const load = useCallback(async (preserveDraft = false) => {
    if (busy.current) return;
    const request = ++sequence.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await api.get(controller.signal);
      if (!active.current || request !== sequence.current) return;
      setSaved(result);
      if (!preserveDraft) setEnabled(result.enabled);
      pending.current = undefined; setUncertain(false); setConflict(false);
    } catch (caught) {
      if (active.current && request === sequence.current && !controller.signal.aborted) setError(message(caught));
    } finally {
      if (active.current && request === sequence.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    active.current = true; void load();
    return () => { active.current = false; sequence.current += 1; readController.current?.abort(); };
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !saved || loading || busy.current || conflict || (!pending.current && enabled === saved.enabled)) return;
    const intent = pending.current ?? Object.freeze({ command: Object.freeze({ expectedVersion: saved.version, enabled }), operationId: crypto.randomUUID() });
    pending.current = intent;
    busy.current = true;
    const request = ++sequence.current;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await api.save(intent.command, intent.operationId);
      if (!active.current || request !== sequence.current) return;
      if (result.enabled !== intent.command.enabled || result.version <= intent.command.expectedVersion) throw new ProductPageReviewSettingsApiError("unavailable", 503);
      setSaved(result); setEnabled(result.enabled); pending.current = undefined; setUncertain(false); setNotice("Yorum yazma ayarı uygulandı.");
    } catch (caught) {
      if (!active.current || request !== sequence.current) return;
      const code = caught instanceof ProductPageReviewSettingsApiError ? caught.code : "unavailable";
      setError(message(caught));
      if (code === "version_conflict") { pending.current = undefined; setConflict(true); setUncertain(false); }
      else if (["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled"].includes(code)) { pending.current = undefined; setUncertain(false); }
      else setUncertain(true);
    } finally {
      busy.current = false;
      if (active.current && request === sequence.current) setSaving(false);
    }
  }

  const dirty = saved !== undefined && enabled !== saved.enabled;
  return <section className={styles.root} aria-labelledby="product-page-review-settings-title" aria-busy={loading || saving}>
    <div className={styles.heading}><h2 id="product-page-review-settings-title">Ürün sayfasında yorum yazma</h2><p id="product-page-review-settings-note">Müşteriler WhatsApp ile giriş yaparak yorum yazar. Yeni yorumlar onayınızdan sonra yayınlanır.</p></div>
    <form onSubmit={save}>
      <label className={styles.toggle}><input type="checkbox" role="switch" checked={enabled} disabled={!canManage || !saved || loading || saving || conflict || uncertain} aria-describedby="product-page-review-settings-note" onChange={event => { setEnabled(event.currentTarget.checked); setError(""); setNotice(""); }} /><span>Müşteriler ürün sayfasından yorum yazabilsin</span></label>
      {loading ? <p className={styles.feedback} role="status">Yorum yazma ayarı yükleniyor…</p> : null}
      {error ? <div className={styles.feedback} role="alert"><p>{error}{uncertain ? " Seçiminiz korundu; Uygula ile aynı işlemi yeniden deneyin." : ""}</p>{!uncertain ? <button type="button" disabled={loading || saving} onClick={() => void load(saved !== undefined)}>{conflict ? "Güncel ayarı yükle" : "Ayarı yeniden yükle"}</button> : null}</div> : null}
      {notice ? <p className={styles.feedback} role="status">{notice}</p> : null}
      {canManage && saved ? <div className={styles.actions}><button type="button" disabled={!dirty || loading || saving || uncertain} onClick={() => { setEnabled(saved.enabled); pending.current = undefined; if (!conflict) setError(""); setNotice(""); }}>Vazgeç</button><button type="submit" className={styles.primary} disabled={(!dirty && !uncertain) || loading || saving || conflict}>{saving ? "Uygulanıyor…" : "Uygula"}</button></div> : null}
    </form>
  </section>;
}
