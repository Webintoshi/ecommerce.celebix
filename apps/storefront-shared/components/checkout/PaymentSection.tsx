import type {
  CheckoutPaymentMethod,
  CheckoutPolicyLink,
  CheckoutQuote,
} from "@celebix/saas-contracts";
import type { FormEvent } from "react";

type PaymentSectionProps = Readonly<{
  quote: CheckoutQuote;
  selectedPaymentMethodId: string | null;
  identityNumber: string;
  operationId: string;
  pending: boolean;
  onIdentityNumberChange(value: string): void;
  onPaymentMethodChange(paymentMethodId: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}>;

function policyLink(
  links: readonly CheckoutPolicyLink[],
  policyType: CheckoutPolicyLink["policyType"],
  fallback: string,
) {
  const link = links.find((candidate) => candidate.policyType === policyType);
  return link
    ? <a href={link.href}>{link.label}</a>
    : <span>{fallback}</span>;
}

function MethodDetails({ method }: Readonly<{ method: CheckoutPaymentMethod }>) {
  if (method.kind === "provider") {
    return <p className="checkout-method-instructions">
      Ödeme işlemi, {method.label} güvenli ödeme sayfasında tamamlanır.
    </p>;
  }
  if (method.kind === "bank_transfer") {
    return <div className="checkout-method-instructions">
      <strong>{method.bankName}</strong>
      <span>{method.accountHolder}</span>
      <code>{method.iban}</code>
      <p>{method.instructions}</p>
    </div>;
  }
  return <p className="checkout-method-instructions">{method.instructions}</p>;
}

export function PaymentSection(props: PaymentSectionProps) {
  const selectedMethod = props.quote.paymentMethods.find(
    (method) => method.id === props.selectedPaymentMethodId,
  ) ?? null;
  const iyzicoSelected = selectedMethod?.kind === "provider"
    && selectedMethod.providerCode === "iyzico_iframe";

  return <section className="checkout-section checkout-payment-section">
    <h2>Ödeme</h2>
    <p className="checkout-section-helper">Tüm işlemleriniz güvenli şekilde işlenir.</p>
    <form action="/api/checkout/submit" method="post" onSubmit={props.onSubmit}>
      <input name="cartVersion" type="hidden" value={props.quote.cartVersion} />
      <input name="checkoutNonce" type="hidden" value={props.quote.checkoutNonce} />
      <input name="operationId" type="hidden" value={props.operationId} />
      {iyzicoSelected
        ? null
        : <input name="identityNumber" type="hidden" value="" />}

      <fieldset className="checkout-fieldset">
        <legend className="checkout-sr-only">Ödeme yöntemi</legend>
        <div className="checkout-method-list checkout-payment-methods">
          {props.quote.paymentMethods.map((method) => {
            const selected = method.id === props.selectedPaymentMethodId;
            return <div className="checkout-payment-method" key={method.id}>
              <label className="checkout-method">
                <input
                  checked={selected}
                  disabled={props.pending}
                  name="paymentMethodId"
                  onChange={() => props.onPaymentMethodChange(method.id)}
                  required
                  type="radio"
                  value={method.id}
                />
                <strong>{method.label}</strong>
                {method.kind === "provider"
                  ? <img alt={method.label} height="28" src={method.logoPath} width="76" />
                  : null}
              </label>
              {selected ? <MethodDetails method={method} /> : null}
            </div>;
          })}
        </div>
      </fieldset>

      {selectedMethod?.kind === "provider"
        && selectedMethod.providerCode === "iyzico_iframe"
        ? <div className="checkout-identity">
            <label className="checkout-label" htmlFor="checkout-identity-number">
              T.C. kimlik / yabancı kimlik numarası
            </label>
            <input
              aria-describedby="checkout-identity-help"
              autoComplete="off"
              className="checkout-field"
              disabled={props.pending}
              id="checkout-identity-number"
              maxLength={50}
              minLength={5}
              name="identityNumber"
              onChange={(event) => props.onIdentityNumberChange(event.currentTarget.value)}
              required
              type="text"
              value={props.identityNumber}
            />
            <small id="checkout-identity-help">
              Bu bilgi yalnızca iyzico ödemesinin güvenli şekilde başlatılması için kullanılır.
            </small>
          </div>
        : null}

      <div className="checkout-consents">
        <label className="checkout-check">
          <input
            disabled={props.pending}
            name="distanceSales"
            required
            type="checkbox"
            value="true"
          />
          <span>
            {policyLink(props.quote.policyLinks, "pre_information", "Ön bilgilendirme formunu")} ve{" "}
            {policyLink(props.quote.policyLinks, "distance_sales", "mesafeli satış sözleşmesini")} okudum, anladım.
          </span>
        </label>
        <label className="checkout-check">
          <input
            disabled={props.pending}
            name="preInformation"
            required
            type="checkbox"
            value="true"
          />
          <span>Sipariş ve teslimat bilgilerimin işlenmesini onaylıyorum.</span>
        </label>
      </div>

      <button
        className="checkout-submit"
        disabled={props.pending || props.operationId === ""}
        type="submit"
      >
        {props.pending ? "Sipariş gönderiliyor…" : "Siparişi tamamla"}
      </button>
    </form>
  </section>;
}
