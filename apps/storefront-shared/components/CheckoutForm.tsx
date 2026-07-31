"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PublicCheckoutQuote } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import type { CheckoutIntentKind } from "@/lib/cart/types.ts";
import { type CheckoutFormDraft, type ValidCheckoutForm, validateCheckoutFormDraft } from "@/lib/checkout-form.ts";
import { CheckoutSummary } from "./CheckoutSummary";

const EMPTY: CheckoutFormDraft = Object.freeze({ name: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", district: "", postalCode: "", note: "" });

export function CheckoutForm({ intentKind }: Readonly<{ intentKind: CheckoutIntentKind }>) {
  const [quote, setQuote] = useState<PublicCheckoutQuote | null>(null);
  const [draft, setDraft] = useState<CheckoutFormDraft>(EMPTY);
  const [delivery, setDelivery] = useState<ValidCheckoutForm | null>(null);
  const [step, setStep] = useState<"delivery" | "payment">("delivery");
  const [paymentKind, setPaymentKind] = useState<"bank_transfer" | "cash_on_delivery" | "">("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("Sipariş özeti yükleniyor.");
  const operation = useRef<string | null>(null);
  const validation = useMemo(() => validateCheckoutFormDraft(draft), [draft]);

  useEffect(() => {
    let active = true;
    setStatus("Sipariş özeti yükleniyor.");
    void storefrontCartClient.quote(intentKind).then((selected) => {
      if (!active) return;
      setQuote(selected);
      setPaymentKind(selected.paymentMethods[0]?.kind ?? "");
      setStatus(selected.cart.checkoutReady ? "Sipariş özeti güncel." : "Sepet ödeme için hazır değil.");
    }).catch(() => { if (active) setStatus("Sipariş özeti alınamadı. Lütfen sepetinizi kontrol edin."); });
    return () => { active = false; };
  }, [intentKind]);

  const field = (name: keyof CheckoutFormDraft) => ({
    value: draft[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      setDraft((current) => Object.freeze({ ...current, [name]: value }));
    },
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (step === "delivery") {
      if (!validation.ok) { setStatus("Lütfen teslimat bilgilerini kontrol edin."); return; }
      setDelivery(validation.value); setStep("payment"); setStatus("Ödeme yöntemini seçin."); return;
    }
    const selectedMethod = quote?.paymentMethods.find(({ kind }) => kind === paymentKind);
    if (!delivery || !quote?.cart.checkoutReady || !selectedMethod) { setStatus("Sipariş şu anda tamamlanamıyor."); return; }
    setPending(true); setStatus("Siparişiniz güvenle oluşturuluyor.");
    try {
      operation.current ??= crypto.randomUUID();
      const response = await fetch("/api/checkout/complete", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId: operation.current, cartVersion: quote.cart.version, intentKind, contact: delivery.contact, shippingAddress: delivery.shippingAddress, shippingMethod: "standard", paymentKind: selectedMethod.kind, ...(delivery.note ? { note: delivery.note } : {}) }) });
      const destination = new URL(response.url, window.location.href);
      if (!response.ok || !response.redirected || destination.origin !== window.location.origin || destination.pathname !== "/checkout/success" || destination.search || destination.hash) throw new Error("checkout_failed");
      window.location.assign("/checkout/success");
    } catch { setStatus("Sipariş tamamlanamadı. Lütfen bilgilerinizi kontrol edip yeniden deneyin."); setPending(false); }
  };

  return <div className="checkout-layout"><form className="checkout-form" onSubmit={(event) => void submit(event)} noValidate><ol className="checkout-steps" aria-label="Ödeme adımları"><li aria-current={step === "delivery" ? "step" : undefined}>1 <span>Teslimat</span></li><li aria-current={step === "payment" ? "step" : undefined}>2 <span>Ödeme</span></li></ol>{step === "delivery" ? <fieldset disabled={pending}><legend>Teslimat bilgileri</legend><div className="checkout-fields"><label className="checkout-wide">Ad soyad<input {...field("name")} name="name" autoComplete="name" maxLength={200} required /></label><label>E-posta<input {...field("email")} name="email" autoComplete="email" inputMode="email" maxLength={320} required type="email" /></label><label>Telefon<input {...field("phone")} name="phone" autoComplete="tel" inputMode="tel" maxLength={32} required type="tel" /></label><label className="checkout-wide">Adres<input {...field("addressLine1")} name="addressLine1" autoComplete="address-line1" maxLength={300} required /></label><label className="checkout-wide">Adres devamı <small>İsteğe bağlı</small><input {...field("addressLine2")} name="addressLine2" autoComplete="address-line2" maxLength={300} /></label><label>Şehir<input {...field("city")} name="city" autoComplete="address-level1" maxLength={100} required /></label><label>İlçe<input {...field("district")} name="district" autoComplete="address-level2" maxLength={100} required /></label><label>Posta kodu<input {...field("postalCode")} name="postalCode" autoComplete="postal-code" maxLength={16} required /></label><label className="checkout-wide">Sipariş notu <small>İsteğe bağlı</small><textarea {...field("note")} name="note" maxLength={1000} rows={3} /></label></div><button className="store-button checkout-submit" type="submit" disabled={pending || !quote?.cart.checkoutReady}>Ödemeye devam et</button></fieldset> : <fieldset disabled={pending}><legend>Ödeme yöntemi</legend><div className="payment-methods">{quote?.paymentMethods.map((method) => <label key={method.kind}><input checked={paymentKind === method.kind} name="paymentMethod" onChange={() => setPaymentKind(method.kind)} type="radio" value={method.kind} /><span><b>{method.label}</b><small>{method.instructions}</small>{method.kind === "bank_transfer" ? <em>{method.bankName} · {method.accountHolder}<br />{method.iban}</em> : null}</span></label>)}</div>{quote?.paymentMethods.length ? null : <p className="checkout-unavailable">Etkin bir ödeme yöntemi bulunamadı.</p>}<div className="checkout-form-actions"><button type="button" disabled={pending} onClick={() => setStep("delivery")}>Teslimata dön</button><button className="store-button" type="submit" disabled={pending || !paymentKind}>{pending ? "Oluşturuluyor…" : "Siparişi oluştur"}</button></div></fieldset>}<p className="checkout-status" aria-live="polite">{status}</p></form>{quote ? <CheckoutSummary summary={quote.cart} /> : <aside className="checkout-summary" aria-busy="true"><span>SİPARİŞ ÖZETİ</span><h2>Yükleniyor</h2></aside>}</div>;
}
