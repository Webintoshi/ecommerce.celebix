"use client";

import type { CheckoutQuote } from "@celebix/saas-contracts";

import { formatCheckoutMoney } from "./model.ts";

type OrderSummaryProps = Readonly<{
  quote: CheckoutQuote;
  variant: "desktop" | "mobile";
  open: boolean;
  discountCode: string;
  pending: boolean;
  onToggle(): void;
  onDiscountChange(value: string): void;
  onApplyDiscount(): void;
}>;

function SummaryContents(props: OrderSummaryProps) {
  const { quote } = props;
  return <div className="checkout-summary-content">
    <ul className="checkout-items" aria-label="Sepetteki ürünler">
      {quote.items.map((item) => <li className="checkout-item" key={item.id}>
        <div className="checkout-item-image">
          {item.imagePath
            ? <img alt="" height="72" src={item.imagePath} width="72" />
            : <span aria-hidden="true" />}
          <b aria-label={`${item.quantity} adet`}>{item.quantity}</b>
        </div>
        <div className="checkout-item-copy">
          <strong>{item.title}</strong>
          {item.variantLabel ? <small>{item.variantLabel}</small> : null}
        </div>
        <span>{formatCheckoutMoney(item.lineTotalCents)}</span>
      </li>)}
    </ul>
    <div className="checkout-discount">
      <label htmlFor={`discount-code-${props.variant}`}>İndirim kodu</label>
      <div>
        <input
          autoComplete="off"
          className="checkout-field"
          disabled={props.pending}
          id={`discount-code-${props.variant}`}
          maxLength={64}
          onChange={(event) => props.onDiscountChange(event.currentTarget.value)}
          placeholder="İndirim kodu"
          type="text"
          value={props.discountCode}
        />
        <button
          disabled={props.pending}
          onClick={props.onApplyDiscount}
          type="button"
        >
          Uygula
        </button>
      </div>
    </div>
    <dl className="checkout-totals">
      <div><dt>Ara toplam</dt><dd>{formatCheckoutMoney(quote.subtotalCents)}</dd></div>
      <div><dt>Kargo</dt><dd>{formatCheckoutMoney(quote.shippingCents)}</dd></div>
      {quote.discountCents > 0
        ? <div><dt>İndirim</dt><dd>-{formatCheckoutMoney(quote.discountCents)}</dd></div>
        : null}
      <div className="checkout-total">
        <dt>Toplam <small>KDV dahil</small></dt>
        <dd>{formatCheckoutMoney(quote.totalCents)}</dd>
      </div>
    </dl>
  </div>;
}

export function OrderSummary(props: OrderSummaryProps) {
  if (props.variant === "desktop") {
    return <aside aria-label="Sipariş özeti" className="checkout-summary-desktop">
      <SummaryContents {...props} />
    </aside>;
  }
  return <section aria-label="Sipariş özeti" className="checkout-summary-mobile">
    <button
      aria-controls="mobile-checkout-summary"
      aria-expanded={props.open}
      className="checkout-summary-toggle"
      onClick={props.onToggle}
      type="button"
    >
      <span className="checkout-cart-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 4h2l1.7 10.2a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 1.9-1.4L20 8H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="17" cy="20" r="1" />
        </svg>
      </span>
      <span>Sipariş özeti</span>
      <svg className="checkout-chevron" aria-hidden="true" viewBox="0 0 12 8">
        <path d="m1 1.5 5 5 5-5" />
      </svg>
      <strong>{formatCheckoutMoney(props.quote.totalCents)}</strong>
    </button>
    <div hidden={!props.open} id="mobile-checkout-summary">
      <SummaryContents {...props} />
    </div>
  </section>;
}
