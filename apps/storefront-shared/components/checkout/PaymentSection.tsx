import type {
  CheckoutPaymentMethod,
  CheckoutPolicyLink,
  CheckoutQuote,
} from "@celebix/saas-contracts";
import type { FormEvent } from "react";

import type {
  CheckoutFieldErrors,
  SubmitFieldName,
} from "./model.ts";

type PaymentSectionProps = Readonly<{
  quote: CheckoutQuote;
  selectedPaymentMethodId: string | null;
  identityNumber: string;
  operationId: string;
  pending: boolean;
  errors: CheckoutFieldErrors<SubmitFieldName>;
  onFieldChange(name: SubmitFieldName): void;
  onFieldInvalid(name: SubmitFieldName, message: string): void;
  onIdentityNumberChange(value: string): void;
  onPaymentMethodChange(paymentMethodId: string): void;
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
                  aria-describedby={props.errors.paymentMethodId
                    ? "checkout-paymentMethodId-error"
                    : undefined}
                  aria-invalid={props.errors.paymentMethodId ? true : undefined}
                  checked={selected}
                  disabled={props.pending}
                  name="paymentMethodId"
                  onChange={() => {
                    props.onFieldChange("paymentMethodId");
                    props.onPaymentMethodChange(method.id);
                  }}
                  onInvalid={(event) => {
                    const form = event.currentTarget.form;
                    event.preventDefault();
                    props.onFieldInvalid("paymentMethodId", "Bir ödeme yöntemi seçin.");
                    focusFirstInvalid(form);
                  }}
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
        <FieldError
          id="checkout-paymentMethodId-error"
          message={props.errors.paymentMethodId}
        />
      </fieldset>

      {selectedMethod?.kind === "provider"
        && selectedMethod.providerCode === "iyzico_iframe"
        ? <div className="checkout-identity">
            <label className="checkout-label" htmlFor="checkout-identity-number">
              T.C. kimlik / yabancı kimlik numarası
            </label>
            <input
              aria-describedby={props.errors.identityNumber
                ? "checkout-identity-help checkout-identityNumber-error"
                : "checkout-identity-help"}
              aria-invalid={props.errors.identityNumber ? true : undefined}
              autoComplete="off"
              className="checkout-field"
              disabled={props.pending}
              id="checkout-identity-number"
              maxLength={50}
              minLength={5}
              name="identityNumber"
              onChange={(event) => props.onIdentityNumberChange(event.currentTarget.value)}
              onInvalid={(event) => {
                const form = event.currentTarget.form;
                event.preventDefault();
                props.onFieldInvalid(
                  "identityNumber",
                  event.currentTarget.validity.valueMissing
                    ? "Bu alan zorunludur."
                    : "Geçerli bir kimlik numarası girin.",
                );
                focusFirstInvalid(form);
              }}
              required
              type="text"
              value={props.identityNumber}
            />
            <FieldError
              id="checkout-identityNumber-error"
              message={props.errors.identityNumber}
            />
            <small id="checkout-identity-help">
              Bu bilgi yalnızca iyzico ödemesinin güvenli şekilde başlatılması için kullanılır.
            </small>
          </div>
        : null}

      <div className="checkout-consents">
        <div className="checkout-consent">
          <label className="checkout-check">
            <input
              aria-describedby={props.errors.distanceSales
                ? "checkout-distanceSales-error"
                : undefined}
              aria-invalid={props.errors.distanceSales ? true : undefined}
              disabled={props.pending}
              name="distanceSales"
              onChange={() => props.onFieldChange("distanceSales")}
              onInvalid={(event) => {
                const form = event.currentTarget.form;
                event.preventDefault();
                props.onFieldInvalid("distanceSales", "Devam etmek için onaylamanız gerekir.");
                focusFirstInvalid(form);
              }}
              required
              type="checkbox"
              value="true"
            />
            <span>
              {policyLink(props.quote.policyLinks, "pre_information", "Ön bilgilendirme formunu")} ve{" "}
              {policyLink(props.quote.policyLinks, "distance_sales", "mesafeli satış sözleşmesini")} okudum, anladım.
            </span>
          </label>
          <FieldError
            id="checkout-distanceSales-error"
            message={props.errors.distanceSales}
          />
        </div>
        <div className="checkout-consent">
          <label className="checkout-check">
            <input
              aria-describedby={props.errors.preInformation
                ? "checkout-preInformation-error"
                : undefined}
              aria-invalid={props.errors.preInformation ? true : undefined}
              disabled={props.pending}
              name="preInformation"
              onChange={() => props.onFieldChange("preInformation")}
              onInvalid={(event) => {
                const form = event.currentTarget.form;
                event.preventDefault();
                props.onFieldInvalid("preInformation", "Devam etmek için onaylamanız gerekir.");
                focusFirstInvalid(form);
              }}
              required
              type="checkbox"
              value="true"
            />
            <span>Sipariş ve teslimat bilgilerimin işlenmesini onaylıyorum.</span>
          </label>
          <FieldError
            id="checkout-preInformation-error"
            message={props.errors.preInformation}
          />
        </div>
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
