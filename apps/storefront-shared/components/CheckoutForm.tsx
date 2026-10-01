"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PublicCheckoutQuote,
  PublicCheckoutQuoteV2,
} from "@celebix/saas-contracts";
import {
  StorefrontCartClientError,
  storefrontCartClient,
} from "@/lib/cart/client.ts";
import type { CheckoutIntentKind } from "@/lib/cart/types.ts";
import {
  type CheckoutFormDraft,
  validateCheckoutFormDraft,
} from "@/lib/checkout-form.ts";
import { formatTry } from "@/lib/format.ts";
import { couponAppliedEvent, emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { normalizeCouponCandidate } from "@/lib/promotions/model.ts";
import { useCartStatus } from "./CartStatusProvider";
import { CheckoutSummary } from "./CheckoutSummary";
import {
  checkoutBlockerMessage,
  checkoutFailureMessage,
  hostedCheckoutFailureMessage,
  resolveCheckoutSummaryState,
} from "./checkout-readiness";
import { useHydrated } from "./use-hydrated";
import Link from "next/link";
import { localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import type { CheckoutVisualTheme } from "../lib/checkout-visual-theme.ts";
import { CheckoutSummary as SummaryRail } from "./checkout/CheckoutSummary";
import { CheckoutPhoneField } from "./CheckoutPhoneField";
import { PromotionCouponField } from "./PromotionCouponField";
import { createCheckoutQuoteQueue } from "../lib/checkout/quote-queue.ts";
import { reconcileCheckoutQuote } from "../lib/checkout/reconcile-quote.ts";

const EMPTY: CheckoutFormDraft = Object.freeze({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  city: "",
  district: "",
  postalCode: "",
  note: "",
});

export function CheckoutForm({
  intentKind,
  initialDraft,
  initialNormalizedCodes = [],
  visualTheme = "shared-checkout",
  locale = "tr",
}: Readonly<{
  intentKind: CheckoutIntentKind;
  initialDraft?: Partial<CheckoutFormDraft>;
  initialNormalizedCodes?: readonly string[];
  visualTheme?: CheckoutVisualTheme;
  locale?: string;
}>) {
  const hydrated = useHydrated();
  const { cart, loading: cartLoading } = useCartStatus();
  const [quote, setQuote] = useState<PublicCheckoutQuote | PublicCheckoutQuoteV2 | null>(null);
  const [quoteDigest, setQuoteDigest] = useState<string | null>(null);
  const [quoteSettled, setQuoteSettled] = useState(false);
  const [draft, setDraft] = useState<CheckoutFormDraft>(() =>
    Object.freeze({ ...EMPTY, ...initialDraft }),
  );
  const [paymentKind, setPaymentKind] = useState<
    "bank_transfer" | "cash_on_delivery" | "hosted_card" | ""
  >("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [quotePending, setQuotePending] = useState(true);
  const [promotionStatus, setPromotionStatus] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [attemptedDelivery, setAttemptedDelivery] = useState(false);
  const [status, setStatus] = useState("Sipariş özeti yükleniyor.");
  const formRef = useRef<HTMLFormElement>(null);
  const operation = useRef<string | null>(null);
  const quoteSequence = useRef(0);
  const quoteBusy = useRef(true);
  const requestQuote = useMemo(() => createCheckoutQuoteQueue((intent, codes) => reconcileCheckoutQuote(storefrontCartClient.quotePromotionsWithDigest, intent, codes)), []);
  const [appliedCodes, setAppliedCodes] = useState<readonly string[]>(
    initialNormalizedCodes,
  );
  const validation = useMemo(() => validateCheckoutFormDraft(draft), [draft]);
  const visibleCart = hydrated ? cart : null;
  const visibleCartLoading = !hydrated || cartLoading;
  const waitForCart = intentKind === "cart" && visibleCartLoading;
  const quoteCartVersion = intentKind === "cart" ? visibleCart?.version ?? null : null;
  const summaryState = resolveCheckoutSummaryState(
    intentKind,
    quote,
    visibleCart,
    quoteSettled && (intentKind === "buy_now" || !visibleCartLoading),
  );

  useEffect(() => {
    let active = true;
    const sequence = ++quoteSequence.current;
    quoteBusy.current = true;
    setQuotePending(true);
    setQuote(null);
    setQuoteDigest(null);
    setQuoteSettled(false);
    setStatus("Sipariş özeti yükleniyor.");
    if (waitForCart) return;
    const quoted = requestQuote(intentKind, appliedCodes);
    void quoted
      .then((selected) => {
        if (!active || sequence !== quoteSequence.current) return;
        setQuote(selected.quote);
        setQuoteDigest(selected.quoteDigest);
        setAppliedCodes(selected.normalizedCodes);
        setPromotionStatus(selected.rejectedCodes.length ? "Bu kod şu anda uygulanamıyor." : "");
        for (const line of selected.quote.cart.items)
          emitStorefrontCommerceEvent({
            name: "begin_checkout",
            data: {
              productId: line.productId,
              variantId: line.variantId,
              ...(line.categoryId ? { categoryId: line.categoryId } : {}),
              quantity: line.quantity,
              currency: selected.quote.cart.currency,
              valueMinor: line.lineTotalCents,
            },
          });
        setQuoteSettled(true);
        setPaymentKind(selected.quote.paymentMethods[0]?.kind ?? "");
        setStatus(
          selected.quote.cart.checkoutReady
            ? "Sipariş özeti güncel."
            : (checkoutBlockerMessage(selected.quote.cart.checkoutBlocker) ??
                "Sepet ödeme için hazır değil."),
        );
      })
      .catch((error: unknown) => {
        if (active && sequence === quoteSequence.current) {
          setQuoteSettled(true);
          setStatus(
            checkoutFailureMessage(
              error instanceof StorefrontCartClientError ? error.code : null,
            ),
          );
        }
      })
      .finally(() => {
        if (!active || sequence !== quoteSequence.current) return;
        quoteBusy.current = false;
        setQuotePending(false);
      });
    return () => {
      active = false;
    };
  // Coupon edits quote explicitly. A cart change refreshes the latest candidates
  // through the same serialized queue and never grants client pricing authority.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentKind, waitForCart, quoteCartVersion, requestQuote]);

  useEffect(() => {
    operation.current = null;
  }, [appliedCodes]);

  const field = (name: keyof CheckoutFormDraft) => ({
    value: draft[name],
    "aria-invalid":
      attemptedDelivery && !validation.ok && Boolean(validation.errors[name]),
    "aria-describedby":
      attemptedDelivery && !validation.ok && validation.errors[name]
        ? `checkout-${name}-error`
        : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const value = event.currentTarget.value;
      setDraft((current) => Object.freeze({ ...current, [name]: value }));
    },
  });
  const error = (name: keyof CheckoutFormDraft) =>
    attemptedDelivery && !validation.ok && validation.errors[name] ? (
      <small
        className="checkout-field-error"
        id={`checkout-${name}-error`}
        role="alert"
      >
        {validation.errors[name]}
      </small>
    ) : null;

  const focusFirstInvalidField = (
    errors: Readonly<Partial<Record<string, string>>>,
  ) => {
    const name = Object.keys(errors)[0];
    if (!name) return;
    if (name === "note") setNoteExpanded(true);
    window.requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus(),
    );
  };

  const quoteCodes = async (requested: readonly string[]) => {
    if (quoteBusy.current) return null;
    const sequence = ++quoteSequence.current;
    quoteBusy.current = true;
    setQuotePending(true);
    setQuote(null);
    setQuoteDigest(null);
    setQuoteSettled(false);
    operation.current = null;
    setPromotionStatus("İndirim kodu kontrol ediliyor.");
    setStatus("Sipariş özeti güncelleniyor.");
    try {
      const current = await requestQuote(intentKind, requested);
      if (sequence !== quoteSequence.current) return null;
      setQuote(current.quote);
      setQuoteDigest(current.quoteDigest);
      setAppliedCodes(current.normalizedCodes);
      setPaymentKind(kind => current.quote.paymentMethods.some(method => method.kind === kind) ? kind : current.quote.paymentMethods[0]?.kind ?? "");
      setStatus(current.quote.cart.checkoutReady ? "Sipariş özeti güncel." : checkoutBlockerMessage(current.quote.cart.checkoutBlocker) ?? "Sepet ödeme için hazır değil.");
      return current;
    } catch (error: unknown) {
      if (sequence === quoteSequence.current) {
        setPromotionStatus("İndirim kodu kontrol edilemedi. Lütfen tekrar deneyin.");
        setStatus(checkoutFailureMessage(error instanceof StorefrontCartClientError ? error.code : null));
      }
      return null;
    } finally {
      if (sequence === quoteSequence.current) {
        quoteBusy.current = false;
        setQuotePending(false);
        setQuoteSettled(true);
      }
    }
  };

  const applyCoupon = async (raw: string) => {
    if (pending || quoteBusy.current) return false;
    let normalized: string;
    try { normalized = normalizeCouponCandidate(raw); }
    catch { setPromotionStatus("Bu kod şu anda uygulanamıyor."); return false; }
    if (appliedCodes.includes(normalized)) { setPromotionStatus("Bu kod zaten eklendi."); return true; }
    if (appliedCodes.length >= 5) { setPromotionStatus("En fazla 5 kod ekleyebilirsiniz."); return false; }
    const selected = await quoteCodes(Object.freeze([...appliedCodes, normalized]));
    if (!selected) return false;
    const event = couponAppliedEvent(selected.quote, normalized);
    if (event) emitStorefrontCommerceEvent(event);
    const rejected = selected.rejectedCodes.includes(normalized);
    setPromotionStatus(rejected ? "Bu kod şu anda uygulanamıyor." : event ? "Kod uygulandı." : selected.quote.progressMessages[0] ?? "Kod ödeme adımında tekrar kontrol edilecek.");
    return !rejected;
  };

  const removeCoupon = async (code: string) => {
    if (pending || quoteBusy.current) return;
    const selected = await quoteCodes(Object.freeze(appliedCodes.filter(candidate => candidate !== code)));
    if (selected) setPromotionStatus("Kod kaldırıldı.");
  };

  const refreshAfterPriceChange = async () => {
    const sequence = ++quoteSequence.current;
    quoteBusy.current = true;
    setQuotePending(true);
    setQuote(null);
    setQuoteDigest(null);
    setQuoteSettled(false);
    operation.current = null;
    try {
      const current = await requestQuote(intentKind, appliedCodes);
      if (sequence !== quoteSequence.current) return;
      setQuote(current.quote);
      setQuoteDigest(current.quoteDigest);
      setAppliedCodes(current.normalizedCodes);
      setPromotionStatus(current.rejectedCodes.length ? "Bu kod şu anda uygulanamıyor." : "");
      setPaymentKind(current.quote.paymentMethods[0]?.kind ?? "");
      setStatus("Fiyat güncellendi. Lütfen yeni toplamı kontrol edip yeniden onaylayın.");
    } catch {
      if (sequence === quoteSequence.current) setStatus("Güncel fiyat alınamadı. Lütfen yeniden deneyin.");
    } finally {
      if (sequence === quoteSequence.current) {
        quoteBusy.current = false;
        setQuotePending(false);
        setQuoteSettled(true);
      }
      setPending(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || quotePending || quoteBusy.current) return;
    setAttemptedDelivery(true);
    if (!validation.ok) {
      emitStorefrontCommerceEvent({
        name: "checkout_validation_error",
        data: { safeErrorCode: "delivery_invalid" },
      });
      setStatus("Lütfen teslimat bilgilerini kontrol edin.");
      focusFirstInvalidField(validation.errors);
      return;
    }
    const selectedMethod = quote?.paymentMethods.find(
      ({ kind }) => kind === paymentKind,
    );
    if (!quote?.cart.checkoutReady || !selectedMethod || !quoteDigest) {
      setStatus(
        checkoutBlockerMessage(quote?.cart.checkoutBlocker ?? null) ??
          "Sipariş şu anda tamamlanamıyor.",
      );
      return;
    }
    const identityRequired =
      selectedMethod.kind === "hosted_card" &&
      selectedMethod.requiredCustomerFields.includes("identity_number");
    if (identityRequired && !/^[0-9]{11}$/u.test(identityNumber)) {
      setStatus("T.C. kimlik numaranızı kontrol edin.");
      window.requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[name="identityNumber"]')
          ?.focus(),
      );
      return;
    }
    const delivery = validation.value;
    for (const line of quote.cart.items) {
      const cohort = {
        productId: line.productId,
        variantId: line.variantId,
        ...(line.categoryId ? { categoryId: line.categoryId } : {}),
        quantity: line.quantity,
        currency: quote.cart.currency,
        valueMinor: line.lineTotalCents,
      };
      emitStorefrontCommerceEvent({
        name: "checkout_address_completed",
        data: cohort,
      });
      emitStorefrontCommerceEvent({
        name: "shipping_method_selected",
        data: { ...cohort, shippingMethod: "standard" },
      });
      emitStorefrontCommerceEvent({
        name: "payment_method_selected",
        data: { ...cohort, paymentMethod: selectedMethod.kind },
      });
    }
    setPending(true);
    setStatus(
      selectedMethod.kind === "hosted_card"
        ? "Güvenli ödeme ekranı hazırlanıyor."
        : "Siparişiniz güvenle oluşturuluyor.",
    );
    try {
      if (selectedMethod.kind === "hosted_card") {
        operation.current ??= crypto.randomUUID();
        const result = await storefrontCartClient.startHosted({
          operationId: operation.current,
          cartVersion: quote.cart.version,
          intentKind,
          contact: delivery.contact,
          shippingAddress: delivery.shippingAddress,
          shippingMethod: "standard",
          paymentMethodId: selectedMethod.id,
          normalizedCodes: appliedCodes,
          expectedQuoteDigest: quoteDigest,
          ...(identityRequired ? { identityNumber } : {}),
          ...(delivery.note ? { note: delivery.note } : {}),
        });
        window.location.assign(result.destination);
        return;
      }
      operation.current ??= crypto.randomUUID();
      const response = await fetch("/api/checkout/complete", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: operation.current,
          cartVersion: quote.cart.version,
          intentKind,
          contact: delivery.contact,
          shippingAddress: delivery.shippingAddress,
          shippingMethod: "standard",
          paymentKind: selectedMethod.kind,
          normalizedCodes: appliedCodes,
          expectedQuoteDigest: quoteDigest,
          ...(delivery.note ? { note: delivery.note } : {}),
        }),
      });
      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        if (typeof body === "object" && body !== null && !Array.isArray(body)
          && Object.keys(body).length === 1 && (body as { code?: unknown }).code === "price_changed") {
          await refreshAfterPriceChange();
          return;
        }
      }
      const destination = new URL(response.url, window.location.href);
      if (
        !response.ok ||
        !response.redirected ||
        destination.origin !== window.location.origin ||
        destination.pathname !== "/checkout/success" ||
        destination.search ||
        destination.hash
      )
        throw new Error("checkout_failed");
      window.location.assign("/checkout/success");
    } catch (error: unknown) {
      if (error instanceof StorefrontCartClientError && error.code === "price_changed") {
        await refreshAfterPriceChange();
        return;
      }
      setStatus(
        selectedMethod.kind === "hosted_card"
          ? hostedCheckoutFailureMessage(error instanceof StorefrontCartClientError ? error.code : null)
          : error instanceof StorefrontCartClientError
            ? checkoutFailureMessage(error.code)
            : "Sipariş tamamlanamadı. Lütfen bilgilerinizi kontrol edip yeniden deneyin.",
      );
      setPending(false);
    }
  };

  const summary = !quotePending && quote !== null && summaryState.kind === "summary" ? (
    <CheckoutSummary summary={summaryState.cart} promotionQuote={quote && "promotionStatus" in quote ? quote : null} />
  ) : quotePending || summaryState.kind === "loading" ? (
    <aside className="checkout-summary" aria-busy="true"><span>SİPARİŞ ÖZETİ</span><h2>Yükleniyor</h2></aside>
  ) : (
    <aside className="checkout-summary checkout-summary-unavailable"><span>SİPARİŞ ÖZETİ</span><h2>Özet kullanılamıyor</h2><p>{status}</p></aside>
  );

  return (
    <form
      ref={formRef}
      className="checkout-form checkout-layout checkout-single-screen"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <div className="checkout-form-main">
        <header className="shared-checkout-intro"><h1>Siparişinizi tamamlayın</h1><p>İletişim ve teslimat bilgilerinizi girin.</p></header>
        <section
          className="checkout-section checkout-contact"
          aria-labelledby="checkout-contact-title"
        >
          <header>
            <span>1</span>
            <h2 id="checkout-contact-title">İletişim</h2>
          </header>
          <fieldset disabled={pending}>
            <div className="checkout-fields">
              <label>
                E-posta
                <input
                  {...field("email")}
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={320}
                  required
                  type="email"
                />
                {error("email")}
              </label>
              <div className="checkout-phone-label">
                <label htmlFor="checkout-phone">Telefon</label>
                <CheckoutPhoneField
                  id="checkout-phone"
                  value={draft.phone}
                  onChange={value => setDraft(current => Object.freeze({ ...current, phone: value }))}
                  invalid={attemptedDelivery && !validation.ok && Boolean(validation.errors.phone)}
                  describedBy={attemptedDelivery && !validation.ok && validation.errors.phone ? "checkout-phone-error" : undefined}
                />
                {error("phone")}
              </div>
            </div>
          </fieldset>
        </section>
        <section
          className="checkout-section checkout-delivery"
          aria-labelledby="checkout-delivery-title"
        >
          <header>
            <span>2</span>
            <h2 id="checkout-delivery-title">Teslimat adresi</h2>
          </header>
          <fieldset disabled={pending}>
            <div className="checkout-fields">
              <div className="checkout-wide checkout-name-fields">
              <label>
                Ad
                <input
                  {...field("firstName")}
                  name="firstName"
                  autoComplete="given-name"
                  maxLength={100}
                  required
                />
                {error("firstName")}
              </label>
              <label>
                Soyad
                <input {...field("lastName")} name="lastName" autoComplete="family-name" maxLength={100} required />
                {error("lastName")}
              </label>
              </div>
              <label className="checkout-wide">
                Adres
                <input
                  {...field("addressLine1")}
                  name="addressLine1"
                  autoComplete="address-line1"
                  maxLength={300}
                  required
                />
                {error("addressLine1")}
              </label>
              <div className="checkout-wide checkout-location-fields">
              <label>
                Şehir
                <input
                  {...field("city")}
                  name="city"
                  autoComplete="address-level1"
                  maxLength={100}
                  required
                />
                {error("city")}
              </label>
              <label>
                İlçe
                <input
                  {...field("district")}
                  name="district"
                  autoComplete="address-level2"
                  maxLength={100}
                  required
                />
                {error("district")}
              </label>
              <label>
                Posta kodu
                <input
                  {...field("postalCode")}
                  name="postalCode"
                  autoComplete="postal-code"
                  maxLength={16}
                  required
                />
                {error("postalCode")}
              </label>
              </div>
              <details className="checkout-wide checkout-optional-fields" open={noteExpanded} onToggle={event => setNoteExpanded(event.currentTarget.open)}>
                <summary><span>Sipariş notu ekle <small>İsteğe bağlı</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
              <label>
                Sipariş notu
                <textarea
                  {...field("note")}
                  name="note"
                  maxLength={500}
                  rows={2}
                />
                {error("note")}
              </label>
              </details>
            </div>
          </fieldset>
        </section>
        <section
          className="checkout-section checkout-shipping"
          aria-labelledby="checkout-shipping-title"
        >
          <header>
            <span>3</span>
            <h2 id="checkout-shipping-title">Teslimat yöntemi</h2>
          </header>
          <div className="checkout-shipping-method">
            <span aria-hidden="true" />
            <strong>Standart teslimat</strong>
            <small>
              {quote
                ? quote.cart.shippingCents === 0
                  ? "Ücretsiz"
                  : formatTry(quote.cart.shippingCents)
                : quotePending ? "Hesaplanıyor" : "Hesaplanamadı"}
            </small>
          </div>
        </section>
        <section
          className="checkout-section checkout-payment"
          aria-labelledby="checkout-payment-title"
        >
          <header>
            <span>4</span>
            <h2 id="checkout-payment-title">Ödeme yöntemi</h2>
          </header>
          <fieldset disabled={pending || quotePending}>
            <div className="payment-methods">
              {quote?.paymentMethods.map((method) => (
                <label key={method.kind}>
                  <input
                    checked={paymentKind === method.kind}
                    name="paymentMethod"
                    onChange={() => setPaymentKind(method.kind)}
                    type="radio"
                    value={method.kind}
                  />
                  <span>
                    <b>{method.label}</b>
                    <small>{method.instructions}</small>
                    {method.kind === "bank_transfer" ? (
                      <em>
                        {method.bankName} · {method.accountHolder}
                        <br />
                        {method.iban}
                      </em>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            {quote?.paymentMethods.some(
              (method) =>
                method.kind === "hosted_card" &&
                paymentKind === "hosted_card" &&
                method.requiredCustomerFields.includes("identity_number"),
            ) ? (
              <label className="checkout-identity">
                T.C. kimlik numarası
                <input
                  name="identityNumber"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={11}
                  pattern="[0-9]{11}"
                  required
                  value={identityNumber}
                  onChange={(event) =>
                    setIdentityNumber(
                      event.currentTarget.value
                        .replace(/[^0-9]/gu, "")
                        .slice(0, 11),
                    )
                  }
                />
              </label>
            ) : null}
            {quote?.paymentMethods.length ? null : (
              <p className="checkout-unavailable">
                {quote ? "Ödeme yöntemi henüz yapılandırılmadı." : quotePending ? "Ödeme seçenekleri yükleniyor." : "Ödeme seçenekleri alınamadı."}
              </p>
            )}
          </fieldset>
        </section>
      </div>
      <SummaryRail
        totalCents={!quotePending && quote !== null && summaryState.kind === "summary" ? summaryState.cart.totalCents : undefined}
        unavailable={!quotePending && (quote === null || summaryState.kind === "unavailable")}
        promotion={<PromotionCouponField embedded codes={appliedCodes} pending={pending || quotePending || (summaryState.kind === "summary" && summaryState.cart.items.length === 0)} status={promotionStatus} onApply={applyCoupon} onRemove={removeCoupon} />}
      >{summary}</SummaryRail>
      <footer className="checkout-terminal">
        <p className="checkout-status" aria-live="polite">
          {status}
        </p>
        <button
          className="store-button checkout-submit"
          type="submit"
          disabled={pending || quotePending || !quote?.cart.checkoutReady || !quoteDigest || !paymentKind}
        >
          {pending
            ? "Hazırlanıyor…"
            : paymentKind === "hosted_card"
              ? "Güvenli ödemeye geç"
              : "Siparişi tamamla"}
        </button>
        <Link className="shared-checkout-return" href={localizeStorefrontPath("/cart", locale)}><span aria-hidden="true">←</span> Sepete dön</Link>
      </footer>
    </form>
  );
}
