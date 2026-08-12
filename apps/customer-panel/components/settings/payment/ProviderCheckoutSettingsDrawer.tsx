"use client";

import type {
  MerchantPaymentMethod,
  ProviderInstallmentMode,
  ProviderMaxInstallment,
  ProviderPaymentMethodLocale,
} from "@celebix/saas-contracts";
import { CheckCircle2, CreditCard, LockKeyhole, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  buildProviderCheckoutPreferenceView,
  type ProviderCheckoutPreferenceSelection,
} from "@/lib/payment-settings-ui/provider-preferences";

import styles from "./payment-settings.module.css";

const INSTALLMENT_LIMITS = Object.freeze([2, 3, 6, 9, 12] as const);

export function ProviderCheckoutSettingsDrawer(props: Readonly<{
  method: MerchantPaymentMethod;
  canManage: boolean;
  mutationAvailable: boolean;
  busy: boolean;
  submitError: string | null;
  openerRef: RefObject<HTMLButtonElement | null>;
  onSubmit(value: ProviderCheckoutPreferenceSelection): Promise<void>;
  onClose(): void;
}>) {
  const view = buildProviderCheckoutPreferenceView(props.method);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [locale, setLocale] = useState<ProviderPaymentMethodLocale>(view.locale);
  const [installmentMode, setInstallmentMode] = useState<ProviderInstallmentMode>(view.installmentMode);
  const [maxInstallment, setMaxInstallment] = useState<ProviderMaxInstallment>(
    view.installmentMode === "limited" ? view.maxInstallment : 6,
  );
  const editingDisabled = props.busy || !props.canManage || !props.mutationAvailable;

  useEffect(() => {
    setLocale(view.locale);
    setInstallmentMode(view.installmentMode);
    setMaxInstallment(view.installmentMode === "limited" ? view.maxInstallment : 6);
  }, [props.method.version, view.installmentMode, view.locale, view.maxInstallment]);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => props.openerRef.current?.focus());
    };
  }, [props.openerRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !props.busy) {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) { event.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (props.busy || !props.canManage || !props.mutationAvailable) return;
    void props.onSubmit(Object.freeze({
      locale,
      installmentMode,
      maxInstallment: installmentMode === "limited" ? maxInstallment : 0,
    }));
  }

  return <div className={styles.drawerLayer} onMouseDown={(event) => {
    if (event.target === event.currentTarget && !props.busy) props.onClose();
  }}>
    <aside
      ref={drawerRef}
      className={styles.checkoutSettingsDrawer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-checkout-settings-title"
      aria-describedby="provider-checkout-settings-description"
      onKeyDown={onKeyDown}
    >
      <header className={styles.dialogHeader}>
        <div className={styles.dialogTitleIcon}><CreditCard aria-hidden="true" /></div>
        <div>
          <h2 id="provider-checkout-settings-title">Checkout ayarları</h2>
          <p id="provider-checkout-settings-description">{view.providerLabel} ödeme ekranında uygulanacak güvenli tercihleri yönetin.</p>
        </div>
        <button ref={closeRef} className={styles.iconButton} type="button" onClick={props.onClose} disabled={props.busy} aria-label="Checkout ayarlarını kapat"><X /></button>
      </header>

      {!props.canManage ? <p className={styles.readOnlyNotice}>Salt okunur erişim: checkout tercihleri değiştirilemez.</p> : null}
      {props.submitError ? <p className={styles.errorNotice} role="alert">{props.submitError}</p> : null}

      <form className={styles.checkoutSettingsForm} onSubmit={submit}>
        <section className={styles.checkoutAuthorityCard} aria-label="Sağlayıcı yetkisi">
          <span><LockKeyhole aria-hidden="true" /></span>
          <div><strong>{view.providerLabel} · {view.environmentLabel}</strong><p>Ortam, etkin sağlayıcı bağlantısından gelir ve burada değiştirilemez.</p></div>
          <span className={styles[view.environment === "live" ? "tone-success" : "tone-warning"]}>{view.environment === "live" ? "CANLI" : "TEST"}</span>
        </section>

        <fieldset className={styles.preferenceGroup}>
          <legend>3D güvenlik</legend>
          <label className={styles.readOnlyPreference}>
            <CheckCircle2 aria-hidden="true" />
            <span><strong>{view.threeDSecureLabel}</strong><small>3D doğrulama ve kart alanları {view.providerLabel} tarafından güvenli biçimde yönetilir.</small></span>
          </label>
        </fieldset>

        <fieldset className={styles.preferenceGroup}>
          <legend>Ödeme ekranı dili</legend>
          {view.providerCode === "iyzico_iframe" ? <div className={styles.segmentedControl}>
            <label data-selected={locale === "tr"}><input type="radio" name="locale" value="tr" checked={locale === "tr"} disabled={editingDisabled} onChange={() => setLocale("tr")} /><span>Türkçe</span></label>
            <label data-selected={locale === "en"}><input type="radio" name="locale" value="en" checked={locale === "en"} disabled={editingDisabled} onChange={() => setLocale("en")} /><span>English</span></label>
          </div> : <div className={styles.readOnlyPreference}><CheckCircle2 aria-hidden="true" /><span><strong>Sağlayıcı yönetir</strong><small>PayTR ödeme formu dilini kendi güvenli ekranında belirler.</small></span></div>}
        </fieldset>

        <fieldset className={styles.preferenceGroup}>
          <legend>Taksit seçenekleri</legend>
          <div className={styles.optionCards}>
            <label data-selected={installmentMode === "all"}><input type="radio" name="installmentMode" value="all" checked={installmentMode === "all"} disabled={editingDisabled} onChange={() => setInstallmentMode("all")} /><span><strong>Tüm uygun taksitler</strong><small>Banka ve sağlayıcının izin verdiği seçenekler.</small></span></label>
            <label data-selected={installmentMode === "single_payment"}><input type="radio" name="installmentMode" value="single_payment" checked={installmentMode === "single_payment"} disabled={editingDisabled} onChange={() => setInstallmentMode("single_payment")} /><span><strong>Yalnız tek çekim</strong><small>Taksit seçeneklerini tamamen kapatır.</small></span></label>
            <label data-selected={installmentMode === "limited"}><input type="radio" name="installmentMode" value="limited" checked={installmentMode === "limited"} disabled={editingDisabled} onChange={() => setInstallmentMode("limited")} /><span><strong>Üst sınır belirle</strong><small>Seçilen vadeye kadar uygun taksitleri gösterir.</small></span></label>
          </div>
          {installmentMode === "limited" ? <label className={styles.selectField}>En fazla taksit
            <select aria-label="En fazla taksit" value={maxInstallment} disabled={editingDisabled} onChange={(event) => setMaxInstallment(Number(event.currentTarget.value) as ProviderMaxInstallment)}>
              {INSTALLMENT_LIMITS.map((value) => <option key={value} value={value}>{value} taksit</option>)}
            </select>
          </label> : null}
        </fieldset>

        <div className={styles.securityBoundary}>
          <LockKeyhole aria-hidden="true" /><p>Celebix kart numarası, CVV veya ham sağlayıcı anahtarı saklamaz. Bu ayarlar yalnız yeni başlayan ödeme işlemlerine sürümlü snapshot olarak uygulanır.</p>
        </div>

        <footer className={styles.drawerActions}>
          <button type="button" className={styles.secondaryButton} onClick={props.onClose} disabled={props.busy}>Vazgeç</button>
          <button type="submit" className={styles.primaryButton} disabled={props.busy || !props.canManage || !props.mutationAvailable}>{props.busy ? "Kaydediliyor…" : "Checkout ayarlarını kaydet"}</button>
        </footer>
      </form>
    </aside>
  </div>;
}
