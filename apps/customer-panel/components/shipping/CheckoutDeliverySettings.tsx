"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkoutDeliveryApi, type CheckoutDeliverySave, type CheckoutDeliveryWorkspace } from "@/lib/checkout-delivery-ui/client";
import { parseCheckoutDeliveryForm } from "@/lib/checkout-delivery-ui/model";
import { checkoutDeliveryPresentation, checkoutDeliveryDaysInput, deliveryPriceInput } from "@/lib/checkout-delivery-ui/presentation";
import styles from "./checkout-delivery-settings.module.css";

export function CheckoutDeliverySettings({ canRead, canManage }: Readonly<{ canRead: boolean; canManage: boolean }>) {
  const [workspace, setWorkspace] = useState<CheckoutDeliveryWorkspace>({ record: null, settings: null });
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const mounted = useRef(false);
  const running = useRef(false);
  const pending = useRef<CheckoutDeliverySave | null>(null);

  async function load(): Promise<boolean> {
    if (!canRead || running.current || pending.current) return false;
    setLoadState("loading");
    try {
      const next = await checkoutDeliveryApi.current();
      if (!mounted.current) return false;
      setWorkspace(next);
      setPrice(next.settings === null ? "" : deliveryPriceInput(next.settings.shippingPriceCents));
      setDays(checkoutDeliveryDaysInput(next));
      setConflict(false); setError(""); setLoadState("loaded");
      return true;
    } catch {
      if (mounted.current) { setLoadState("error"); setError("Teslimat ayarı okunamadı. Yeniden deneyebilirsiniz."); }
      return false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (canRead) void load();
    return () => { mounted.current = false; };
    // Access comes from the server page; reload is an explicit merchant action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  async function save(status: "draft" | "active") {
    if (!canRead || !canManage || running.current || loadState !== "loaded" || conflict) return;
    const settings = pending.current?.settings ?? parseCheckoutDeliveryForm({ price, days });
    if (settings === null) { setError("Teslimat ücretini girin. Gün sayısı 1–365 arasında olmalıdır."); return; }
    const intent = pending.current ?? Object.freeze({ record: workspace.record, settings, status, operationId: checkoutDeliveryApi.newOperationId() });
    pending.current = intent; running.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await checkoutDeliveryApi.save(intent);
      pending.current = null; running.current = false;
      if (!mounted.current) return;
      const refreshed = await load();
      if (mounted.current) setNotice(refreshed ? "Teslimat ayarı kaydedildi." : "Ayar kaydedildi; güncel durum okunamadı.");
    } catch (caught) {
      if (!mounted.current) return;
      const code = caught instanceof Error && "code" in caught ? caught.code : null;
      if (code === "version_conflict") {
        pending.current = null; setConflict(true); setError("Ayar başka bir işlemde güncellendi. Girdiğiniz değerler korundu; güncel ayarı yükleyin.");
      } else if (["invalid_input", "membership_denied", "feature_not_enabled", "store_inactive", "record_not_found", "unauthenticated", "operation_mismatch"].includes(String(code))) {
        pending.current = null; setError("Ayar kaydedilemedi. Bilgilerinizi ve düzenleme yetkinizi kontrol edin.");
      } else {
        setError("Kaydetme sonucu doğrulanamadı. Aynı işlemi yeniden deneyin.");
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const view = checkoutDeliveryPresentation(workspace);
  const editable = canManage && loadState === "loaded" && !busy && !pending.current && !conflict;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save("active"); };
  return (
    <section id="checkout-delivery" className={styles.section} aria-labelledby="checkout-delivery-title" aria-busy={canRead && (loadState === "loading" || busy)} data-settings-dirty={editable && (price !== (workspace.settings === null ? "" : deliveryPriceInput(workspace.settings.shippingPriceCents)) || days !== checkoutDeliveryDaysInput(workspace)) ? "true" : undefined}>
      <div className={styles.heading}><h2 id="checkout-delivery-title">Teslimat ücreti</h2><p>Mağazanın ödeme adımında kullanılan teslimat ayarı.</p></div>
      {!canRead ? <p className={styles.state}>Bu ayarı görüntüleme yetkiniz yok.</p> : loadState === "loading" ? <p className={styles.state} role="status">Yükleniyor…</p> : loadState === "loaded" ? <>
        <div className={styles.summary}><strong>{view.label}</strong>{view.fee ? <span>{view.fee}</span> : null}<small>{view.detail}</small>{view.checkoutDetail ? <small>{view.checkoutDetail}</small> : null}</div>
        <form className={styles.form} onSubmit={submit} noValidate>
          <div className={styles.fields}>
            <label htmlFor="checkout-delivery-price">Teslimat ücreti (TL)<input id="checkout-delivery-price" name="price" inputMode="decimal" value={price} onInput={(event) => { if (editable) { setPrice(event.currentTarget.value); setError(""); } }} disabled={!editable} aria-describedby="checkout-delivery-price-help checkout-delivery-feedback" /><small id="checkout-delivery-price-help">Ücretsiz teslimat için 0 girin. Örnek: 14,89</small></label>
            <label htmlFor="checkout-delivery-days">Tahmini teslimat günü<input id="checkout-delivery-days" name="days" inputMode="numeric" value={days} onInput={(event) => { if (editable) { setDays(event.currentTarget.value); setError(""); } }} disabled={!editable} aria-describedby="checkout-delivery-days-help checkout-delivery-feedback" /><small id="checkout-delivery-days-help">İsteğe bağlı · 1–365 gün</small></label>
          </div>
          {canManage ? <div className={styles.actions}>
            {pending.current && !busy ? <button type="button" onClick={() => void save(pending.current!.status)}>Yeniden dene</button> : conflict ? <button type="button" onClick={() => void load()}>Güncel ayarı yükle</button> : <>
              <button type="button" disabled={!editable} onClick={() => void save("draft")}>Taslağı kaydet</button>
              <button className={styles.primary} type="submit" disabled={!editable}>{busy ? "Kaydediliyor…" : workspace.record?.status === "active" ? "Kaydet ve etkinleştir" : "Teslimatı etkinleştir"}</button>
            </>}
          </div> : <p className={styles.state}>Bu ayarı düzenleme yetkiniz yok.</p>}
        </form>
      </> : <button type="button" className={styles.retry} onClick={() => void load()}>Yeniden dene</button>}
      <div id="checkout-delivery-feedback" className={styles.feedback}>{error ? <p role="alert">{error}</p> : null}{notice ? <p role="status" aria-live="polite">{notice}</p> : null}</div>
    </section>
  );
}
