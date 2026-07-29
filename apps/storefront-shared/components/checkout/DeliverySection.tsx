import type { CheckoutQuote } from "@celebix/saas-contracts";
import type { FormEvent, Ref } from "react";

import {
  type CheckoutFieldErrors,
  type DeliveryFieldName,
  formatCheckoutMoney,
} from "./model.ts";

type DeliverySectionProps = Readonly<{
  applyButtonId: string;
  applyError: string | null;
  applyErrorId: string;
  formId: string;
  formRef: Ref<HTMLFormElement>;
  quote: CheckoutQuote;
  pending: boolean;
  errors: CheckoutFieldErrors<DeliveryFieldName>;
  onFieldChange(name: DeliveryFieldName): void;
  onFieldInvalid(name: DeliveryFieldName, message: string): void;
  onDeliveryChange(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}>;

function FieldError(props: Readonly<{
  id: string;
  message: string | undefined;
}>) {
  return props.message
    ? <span className="checkout-field-error" id={props.id}>{props.message}</span>
    : null;
}

function focusFirstInvalid(form: HTMLFormElement | null) {
  queueMicrotask(() => form?.querySelector<HTMLElement>(":invalid")?.focus());
}

export function DeliverySection(props: DeliverySectionProps) {
  function inputA11y(name: DeliveryFieldName, invalidMessage: string) {
    const error = props.errors[name];
    const errorId = `checkout-${name}-error`;
    return {
      "aria-describedby": error ? errorId : undefined,
      "aria-invalid": error ? true : undefined,
      onChange: () => props.onFieldChange(name),
      onInvalid: (event: FormEvent<HTMLInputElement>) => {
        const form = event.currentTarget.form;
        event.preventDefault();
        props.onFieldInvalid(
          name,
          event.currentTarget.validity.valueMissing ? "Bu alan zorunludur." : invalidMessage,
        );
        focusFirstInvalid(form);
      },
    } as const;
  }

  return <form id={props.formId} onSubmit={props.onSubmit} ref={props.formRef}>
    <section className="checkout-section">
      <h2>İletişim</h2>
      <label className="checkout-label" htmlFor="checkout-email">
        <span>E-posta adresi</span>
        <input
          autoComplete="email"
          className="checkout-field"
          disabled={props.pending}
          id="checkout-email"
          maxLength={320}
          name="email"
          placeholder="E-posta"
          required
          type="email"
          {...inputA11y("email", "Geçerli bir e-posta adresi girin.")}
        />
        <FieldError id="checkout-email-error" message={props.errors.email} />
      </label>
      <div className="checkout-check checkout-marketing">
        <span className="checkout-consent-control">
          <input
            aria-labelledby="checkout-marketing-copy"
            disabled={props.pending}
            name="marketingOptIn"
            onChange={props.onDeliveryChange}
            type="checkbox"
          />
        </span>
        <span className="checkout-consent-copy" id="checkout-marketing-copy">
          Özel kampanyalar ve yeni ürünler hakkında e-posta ile bilgilendir.
        </span>
      </div>
    </section>

    <section className="checkout-section">
      <h2>Teslimat</h2>
      <div className="checkout-name-grid">
        <label className="checkout-label">
          <span>Ad</span>
          <input
            autoComplete="given-name"
            className="checkout-field"
            disabled={props.pending}
            maxLength={120}
            name="firstName"
            placeholder="Ad"
            required
            type="text"
            {...inputA11y("firstName", "Geçerli bir ad girin.")}
          />
          <FieldError id="checkout-firstName-error" message={props.errors.firstName} />
        </label>
        <label className="checkout-label">
          <span>Soyad</span>
          <input
            autoComplete="family-name"
            className="checkout-field"
            disabled={props.pending}
            maxLength={120}
            name="lastName"
            placeholder="Soyad"
            required
            type="text"
            {...inputA11y("lastName", "Geçerli bir soyad girin.")}
          />
          <FieldError id="checkout-lastName-error" message={props.errors.lastName} />
        </label>
      </div>
      <label className="checkout-label">
        <span>Telefon</span>
        <input
          autoComplete="tel"
          className="checkout-field"
          disabled={props.pending}
          inputMode="tel"
          maxLength={32}
          minLength={7}
          name="phone"
          placeholder="Telefon"
          required
          type="tel"
          {...inputA11y("phone", "Geçerli bir telefon numarası girin.")}
        />
        <FieldError id="checkout-phone-error" message={props.errors.phone} />
      </label>
      <label className="checkout-label">
        <span>Adres</span>
        <input
          autoComplete="address-line1"
          className="checkout-field"
          disabled={props.pending}
          maxLength={240}
          name="line1"
          placeholder="Adres"
          required
          type="text"
          {...inputA11y("line1", "Geçerli bir adres girin.")}
        />
        <FieldError id="checkout-line1-error" message={props.errors.line1} />
      </label>
      <label className="checkout-label">
        <span>Apartman, daire, kat vb. (isteğe bağlı)</span>
        <input
          autoComplete="address-line2"
          className="checkout-field"
          disabled={props.pending}
          maxLength={240}
          name="line2"
          placeholder="Apartman, daire, kat vb. (isteğe bağlı)"
          type="text"
          {...inputA11y("line2", "Geçerli bir adres detayı girin.")}
        />
        <FieldError id="checkout-line2-error" message={props.errors.line2} />
      </label>
      <div className="checkout-city-grid">
        <label className="checkout-label">
          <span>Şehir</span>
          <input
            autoComplete="address-level1"
            className="checkout-field"
            disabled={props.pending}
            maxLength={120}
            name="city"
            placeholder="Şehir"
            required
            type="text"
            {...inputA11y("city", "Geçerli bir şehir girin.")}
          />
          <FieldError id="checkout-city-error" message={props.errors.city} />
        </label>
        <label className="checkout-label">
          <span>İlçe</span>
          <input
            autoComplete="address-level2"
            className="checkout-field"
            disabled={props.pending}
            maxLength={120}
            name="district"
            placeholder="İlçe"
            required
            type="text"
            {...inputA11y("district", "Geçerli bir ilçe girin.")}
          />
          <FieldError id="checkout-district-error" message={props.errors.district} />
        </label>
        <label className="checkout-label">
          <span>Posta kodu</span>
          <input
            autoComplete="postal-code"
            className="checkout-field"
            disabled={props.pending}
            inputMode="numeric"
            maxLength={32}
            name="postalCode"
            placeholder="Posta kodu"
            type="text"
            {...inputA11y("postalCode", "Geçerli bir posta kodu girin.")}
          />
          <FieldError id="checkout-postalCode-error" message={props.errors.postalCode} />
        </label>
      </div>
    </section>

    <fieldset className="checkout-section checkout-fieldset">
      <legend><h2>Kargo yöntemi</h2></legend>
      <div className="checkout-method-list checkout-shipping-list">
        {props.quote.shippingOptions.map((option) => <label key={option.id} className="checkout-method">
          <input
            defaultChecked={option.id === props.quote.selectedShippingId}
            disabled={props.pending}
            name="shippingId"
            required
            type="radio"
            value={option.id}
            {...inputA11y("shippingId", "Bir kargo yöntemi seçin.")}
          />
          <span>
            <strong>{option.label}</strong>
            {option.description ? <small>{option.description}</small> : null}
          </span>
          <b>{formatCheckoutMoney(option.priceCents)}</b>
        </label>)}
      </div>
      <FieldError id="checkout-shippingId-error" message={props.errors.shippingId} />
    </fieldset>

    <button
      aria-describedby={props.applyError ? props.applyErrorId : undefined}
      className="checkout-delivery-submit"
      disabled={props.pending}
      id={props.applyButtonId}
      type="submit"
    >
      {props.pending ? "Bilgiler uygulanıyor…" : "Bilgileri uygula"}
    </button>
    {props.applyError
      ? <span className="checkout-apply-error" id={props.applyErrorId} role="alert">
          {props.applyError}
        </span>
      : null}
  </form>;
}
