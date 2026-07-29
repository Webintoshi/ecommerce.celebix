import type { CheckoutQuote } from "@celebix/saas-contracts";
import type { FormEvent } from "react";

import { formatCheckoutMoney } from "./model.ts";

type DeliverySectionProps = Readonly<{
  formId: string;
  quote: CheckoutQuote;
  pending: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}>;

export function DeliverySection(props: DeliverySectionProps) {
  return <form id={props.formId} onSubmit={props.onSubmit}>
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
        />
      </label>
      <label className="checkout-check checkout-marketing">
        <input disabled={props.pending} name="marketingOptIn" type="checkbox" />
        <span>Özel kampanyalar ve yeni ürünler hakkında e-posta ile bilgilendir.</span>
      </label>
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
          />
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
          />
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
        />
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
        />
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
        />
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
          />
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
          />
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
          />
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
          />
          <span>
            <strong>{option.label}</strong>
            {option.description ? <small>{option.description}</small> : null}
          </span>
          <b>{formatCheckoutMoney(option.priceCents)}</b>
        </label>)}
      </div>
    </fieldset>

    <button className="checkout-delivery-submit" disabled={props.pending} type="submit">
      {props.pending ? "Bilgiler uygulanıyor…" : "Bilgileri uygula"}
    </button>
  </form>;
}
