"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PublicCheckoutQuote } from "@celebix/saas-contracts";
import { StorefrontCartClientError, storefrontCartClient } from "@/lib/cart/client.ts";
import type { CheckoutIntentKind } from "@/lib/cart/types.ts";
import { type CheckoutFormDraft, validateCheckoutFormDraft } from "@/lib/checkout-form.ts";
import { formatTry } from "@/lib/format.ts";
import { useCartStatus } from "./CartStatusProvider";
import { CheckoutSummary } from "./CheckoutSummary";
import { checkoutBlockerMessage, checkoutFailureMessage, resolveCheckoutSummaryState } from "./checkout-readiness";
import { useHydrated } from "./use-hydrated";

const EMPTY: CheckoutFormDraft = Object.freeze({ name: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", district: "", postalCode: "", note: "" });

export function CheckoutForm({ intentKind, initialDraft }: Readonly<{ intentKind: CheckoutIntentKind; initialDraft?: Partial<CheckoutFormDraft> }>) {
  const hydrated = useHydrated();
  const { cart, loading: cartLoading } = useCartStatus();
  const [quote, setQuote] = useState<PublicCheckoutQuote | null>(null);
  const [quoteSettled, setQuoteSettled] = useState(false);
  const [draft, setDraft] = useState<CheckoutFormDraft>(() => Object.freeze({ ...EMPTY, ...initialDraft }));
  const [paymentKind, setPaymentKind] = useState<"bank_transfer" | "cash_on_delivery" | "hosted_card" | "">("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [attemptedDelivery, setAttemptedDelivery] = useState(false);
  const [status, setStatus] = useState("Sipariş özeti yükleniyor.");
  const formRef = useRef<HTMLFormElement>(null);
  const operation = useRef<string | null>(null);
  const validation = useMemo(() => validateCheckoutFormDraft(draft), [draft]);
  const visibleCart = hydrated ? cart : null;
  const visibleCartLoading = !hydrated || cartLoading;
  const summaryState = resolveCheckoutSummaryState(intentKind, quote, visibleCart, quoteSettled && (intentKind === "buy_now" || !visibleCartLoading));

  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteSettled(false);
    setStatus("Sipariş özeti yükleniyor.");
    void storefrontCartClient.quote(intentKind).then((selected) => {
      if (!active) return;
      setQuote(selected);
      setQuoteSettled(true);
      setPaymentKind(selected.paymentMethods[0]?.kind ?? "");
      setStatus(selected.cart.checkoutReady ? "Sipariş özeti güncel." : checkoutBlockerMessage(selected.cart.checkoutBlocker) ?? "Sepet ödeme için hazır değil.");
    }).catch((error: unknown) => { if (active) { setQuoteSettled(true); setStatus(checkoutFailureMessage(error instanceof StorefrontCartClientError ? error.code : null)); } });
    return () => { active = false; };
  }, [intentKind]);

  const field = (name: keyof CheckoutFormDraft) => ({
    value: draft[name],
    "aria-invalid": attemptedDelivery && !validation.ok && Boolean(validation.errors[name]),
    "aria-describedby": attemptedDelivery && !validation.ok && validation.errors[name] ? `checkout-${name}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      setDraft((current) => Object.freeze({ ...current, [name]: value }));
    },
  });
  const error = (name: keyof CheckoutFormDraft) => attemptedDelivery && !validation.ok && validation.errors[name]
    ? <small className="checkout-field-error" id={`checkout-${name}-error`} role="alert">{validation.errors[name]}</small>
    : null;

  const focusFirstInvalidField = (errors: Readonly<Partial<Record<string, string>>>) => {
    const name = Object.keys(errors)[0];
    if (!name) return;
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus());
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setAttemptedDelivery(true);
    if (!validation.ok) {
      setStatus("Lütfen teslimat bilgilerini kontrol edin.");
      focusFirstInvalidField(validation.errors);
      return;
    }
    const selectedMethod = quote?.paymentMethods.find(({ kind }) => kind === paymentKind);
    if (!quote?.cart.checkoutReady || !selectedMethod) {
      setStatus(checkoutBlockerMessage(quote?.cart.checkoutBlocker ?? null) ?? "Sipariş şu anda tamamlanamıyor.");
      return;
    }
    const identityRequired = selectedMethod.kind === "hosted_card" && selectedMethod.requiredCustomerFields.includes("identity_number");
    if (identityRequired && !/^[0-9]{11}$/u.test(identityNumber)) {
      setStatus("T.C. kimlik numaranızı kontrol edin.");
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[name="identityNumber"]')?.focus());
      return;
    }
    const delivery = validation.value;
    setPending(true); setStatus(selectedMethod.kind === "hosted_card" ? "Güvenli ödeme ekranı hazırlanıyor." : "Siparişiniz güvenle oluşturuluyor.");
    try {
      if (selectedMethod.kind === "hosted_card") {
        const result = await storefrontCartClient.startHosted({ cartVersion: quote.cart.version, intentKind, contact: delivery.contact, shippingAddress: delivery.shippingAddress, shippingMethod: "standard", paymentMethodId: selectedMethod.id, ...(identityRequired ? { identityNumber } : {}), ...(delivery.note ? { note: delivery.note } : {}) });
        window.location.assign(result.destination);
        return;
      }
      operation.current ??= crypto.randomUUID();
      const response = await fetch("/api/checkout/complete", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId: operation.current, cartVersion: quote.cart.version, intentKind, contact: delivery.contact, shippingAddress: delivery.shippingAddress, shippingMethod: "standard", paymentKind: selectedMethod.kind, ...(delivery.note ? { note: delivery.note } : {}) }) });
      const destination = new URL(response.url, window.location.href);
      if (!response.ok || !response.redirected || destination.origin !== window.location.origin || destination.pathname !== "/checkout/success" || destination.search || destination.hash) throw new Error("checkout_failed");
      window.location.assign("/checkout/success");
    } catch (error: unknown) {
      setStatus(error instanceof StorefrontCartClientError ? checkoutFailureMessage(error.code) : "Sipariş tamamlanamadı. Lütfen bilgilerinizi kontrol edip yeniden deneyin.");
      setPending(false);
    }
  };

  return <form ref={formRef} className="checkout-form checkout-layout checkout-single-screen" onSubmit={(event) => void submit(event)} noValidate>
    <div className="checkout-form-main">
      <section className="checkout-section checkout-contact" aria-labelledby="checkout-contact-title">
        <header><span>1</span><h2 id="checkout-contact-title">İletişim</h2></header>
        <fieldset disabled={pending}><div className="checkout-fields"><label>E-posta<input {...field("email")} name="email" autoComplete="email" inputMode="email" maxLength={320} required type="email" />{error("email")}</label><label>Telefon<input {...field("phone")} name="phone" autoComplete="tel" inputMode="tel" maxLength={24} placeholder="0555 111 22 33" required type="tel" />{error("phone")}</label></div></fieldset>
      </section>
      <section className="checkout-section checkout-delivery" aria-labelledby="checkout-delivery-title">
        <header><span>2</span><h2 id="checkout-delivery-title">Teslimat adresi</h2></header>
        <fieldset disabled={pending}><div className="checkout-fields"><label className="checkout-wide">Ad soyad<input {...field("name")} name="name" autoComplete="name" maxLength={200} required />{error("name")}</label><label className="checkout-wide">Adres<input {...field("addressLine1")} name="addressLine1" autoComplete="address-line1" maxLength={300} required />{error("addressLine1")}</label><label className="checkout-wide">Adres devamı <small>İsteğe bağlı</small><input {...field("addressLine2")} name="addressLine2" autoComplete="address-line2" maxLength={300} />{error("addressLine2")}</label><label>Şehir<input {...field("city")} name="city" autoComplete="address-level1" maxLength={100} required />{error("city")}</label><label>İlçe<input {...field("district")} name="district" autoComplete="address-level2" maxLength={100} required />{error("district")}</label><label>Posta kodu <small>İsteğe bağlı</small><input {...field("postalCode")} name="postalCode" autoComplete="postal-code" maxLength={16} />{error("postalCode")}</label><label className="checkout-wide">Sipariş notu <small>İsteğe bağlı</small><textarea {...field("note")} name="note" maxLength={500} rows={3} />{error("note")}</label></div></fieldset>
      </section>
      <section className="checkout-section checkout-shipping" aria-labelledby="checkout-shipping-title">
        <header><span>3</span><h2 id="checkout-shipping-title">Teslimat yöntemi</h2></header>
        <div className="checkout-shipping-method"><span aria-hidden="true" /><strong>Standart teslimat</strong><small>{quote ? quote.cart.shippingCents === 0 ? "Ücretsiz" : formatTry(quote.cart.shippingCents) : "Hesaplanıyor"}</small></div>
      </section>
      <section className="checkout-section checkout-payment" aria-labelledby="checkout-payment-title">
        <header><span>4</span><h2 id="checkout-payment-title">Ödeme yöntemi</h2></header>
        <fieldset disabled={pending}><div className="payment-methods">{quote?.paymentMethods.map((method) => <label key={method.kind}><input checked={paymentKind === method.kind} name="paymentMethod" onChange={() => setPaymentKind(method.kind)} type="radio" value={method.kind} /><span><b>{method.label}</b><small>{method.instructions}</small>{method.kind === "bank_transfer" ? <em>{method.bankName} · {method.accountHolder}<br />{method.iban}</em> : null}</span></label>)}</div>{quote?.paymentMethods.some((method) => method.kind === "hosted_card" && paymentKind === "hosted_card" && method.requiredCustomerFields.includes("identity_number")) ? <label className="checkout-identity">T.C. kimlik numarası<input name="identityNumber" inputMode="numeric" autoComplete="off" maxLength={11} pattern="[0-9]{11}" required value={identityNumber} onChange={(event) => setIdentityNumber(event.currentTarget.value.replace(/[^0-9]/gu, "").slice(0, 11))} /></label> : null}{quote?.paymentMethods.length ? null : <p className="checkout-unavailable">Ödeme yöntemi henüz yapılandırılmadı.</p>}</fieldset>
      </section>
    </div>
    {summaryState.kind === "summary" ? <CheckoutSummary summary={summaryState.cart} /> : summaryState.kind === "loading" ? <aside className="checkout-summary" aria-busy="true"><span>SİPARİŞ ÖZETİ</span><h2>Yükleniyor</h2></aside> : <aside className="checkout-summary checkout-summary-unavailable"><span>SİPARİŞ ÖZETİ</span><h2>Özet kullanılamıyor</h2><p>{status}</p></aside>}
    <footer className="checkout-terminal"><p className="checkout-status" aria-live="polite">{status}</p><button className="store-button checkout-submit" type="submit" disabled={pending || !quote?.cart.checkoutReady || !paymentKind}>{pending ? "Hazırlanıyor…" : paymentKind === "hosted_card" ? "Güvenli ödemeye geç" : "Siparişi tamamla"}</button></footer>
  </form>;
}
