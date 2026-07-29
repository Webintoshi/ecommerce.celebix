"use client";

import {
  parseCheckoutHttpError,
  parseCheckoutQuote,
  type CheckoutAddress,
  type CheckoutHttpError,
  type CheckoutQuote,
} from "@celebix/saas-contracts";
import {
  useCallback,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";

import styles from "../../app/odeme/checkout.module.css";
import { DeliverySection } from "./DeliverySection.tsx";
import {
  buildDeliveryPayload,
  buildSubmitPayload,
  createCheckoutState,
  reduceCheckout,
} from "./model.ts";
import { OrderSummary } from "./OrderSummary.tsx";
import { PaymentSection } from "./PaymentSection.tsx";

const DELIVERY_FORM_ID = "checkout-delivery-form";

type CheckoutClientProps = Readonly<{
  initialQuote: CheckoutQuote;
  initialOperationId: string;
}>;

function optionalText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function requiredText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function responseError(value: unknown): CheckoutHttpError {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || !Object.hasOwn(value, "code")
    ) return "unavailable";
    return parseCheckoutHttpError((value as Readonly<{ code: unknown }>).code);
  } catch {
    return "unavailable";
  }
}

export function CheckoutClient(props: CheckoutClientProps) {
  const [state, dispatch] = useReducer(
    reduceCheckout,
    props.initialQuote,
    createCheckoutState,
  );
  const [discountCode, setDiscountCode] = useState(props.initialQuote.discountCode ?? "");
  const [identityNumber, setIdentityNumber] = useState("");
  const [submitOperationId, setSubmitOperationId] = useState(props.initialOperationId);
  const deliveryAbort = useRef<AbortController | null>(null);

  const applyDelivery = useCallback(async (formElement: HTMLFormElement) => {
    const form = new FormData(formElement);
    const line2 = optionalText(form, "line2");
    const postalCode = optionalText(form, "postalCode");
    const shippingAddress: CheckoutAddress = {
      firstName: requiredText(form, "firstName"),
      lastName: requiredText(form, "lastName"),
      line1: requiredText(form, "line1"),
      ...(line2 ? { line2 } : {}),
      district: requiredText(form, "district"),
      city: requiredText(form, "city"),
      ...(postalCode ? { postalCode } : {}),
      countryCode: "TR",
      phone: requiredText(form, "phone"),
    };

    let payload;
    try {
      payload = buildDeliveryPayload({
        quote: state.quote,
        operationId: crypto.randomUUID(),
        email: requiredText(form, "email"),
        marketingOptIn: form.get("marketingOptIn") === "on",
        shippingAddress,
        billingAddress: null,
        shippingId: form.get("shippingId") === "standard" ? "standard" : null,
        discountCode: discountCode.trim() === "" ? null : discountCode.trim(),
      });
    } catch {
      dispatch({ type: "failed", code: "invalid_input" });
      return;
    }

    deliveryAbort.current?.abort();
    const controller = new AbortController();
    deliveryAbort.current = controller;
    dispatch({ type: "delivery_started" });
    try {
      const response = await fetch("/api/checkout/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        dispatch({ type: "failed", code: responseError(body) });
        return;
      }
      const nextQuote = parseCheckoutQuote(body);
      dispatch({ type: "delivery_succeeded", quote: nextQuote });
      setDiscountCode(nextQuote.discountCode ?? "");
      setSubmitOperationId(crypto.randomUUID());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "failed", code: "unavailable" });
    } finally {
      if (deliveryAbort.current === controller) deliveryAbort.current = null;
    }
  }, [discountCode, state.quote]);

  function handleDeliverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void applyDelivery(event.currentTarget);
  }

  function requestDeliveryUpdate() {
    const form = document.getElementById(DELIVERY_FORM_ID);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  function selectPaymentMethod(paymentMethodId: string) {
    dispatch({ type: "select_payment", paymentMethodId });
    setIdentityNumber("");
    setSubmitOperationId(crypto.randomUUID());
  }

  function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    if (state.selectedPaymentMethodId === null) {
      event.preventDefault();
      dispatch({ type: "failed", code: "payment_unavailable" });
      return;
    }
    try {
      buildSubmitPayload({
        quote: state.quote,
        operationId: submitOperationId,
        paymentMethodId: state.selectedPaymentMethodId,
        identityNumber: identityNumber === "" ? null : identityNumber,
      });
      dispatch({ type: "submit_started" });
    } catch {
      event.preventDefault();
      dispatch({ type: "failed", code: "invalid_input" });
    }
  }

  const pending = state.pending !== null;
  return <div className={styles.page} data-checkout-root="">
    <div className={styles.grid}>
      <div className={styles.leftColumn}>
        <main className={styles.main}>
          <h1 className="checkout-wordmark">{state.quote.storeName}</h1>
          <OrderSummary
            discountCode={discountCode}
            onApplyDiscount={requestDeliveryUpdate}
            onDiscountChange={setDiscountCode}
            onToggle={() => dispatch({ type: "toggle_summary" })}
            open={state.summaryOpen}
            pending={pending}
            quote={state.quote}
            variant="mobile"
          />
          {state.error
            ? <p className="checkout-error" id="checkout-error" role="alert">{state.error}</p>
            : null}
          <DeliverySection
            formId={DELIVERY_FORM_ID}
            onSubmit={handleDeliverySubmit}
            pending={pending}
            quote={state.quote}
          />
          <PaymentSection
            identityNumber={identityNumber}
            onIdentityNumberChange={setIdentityNumber}
            onPaymentMethodChange={selectPaymentMethod}
            onSubmit={handlePaymentSubmit}
            operationId={submitOperationId}
            pending={pending}
            quote={state.quote}
            selectedPaymentMethodId={state.selectedPaymentMethodId}
          />
          <footer className="checkout-footer" aria-label="Yasal politikalar">
            {state.quote.policyLinks.map((link) => <a href={link.href} key={link.policyType}>
              {link.label}
            </a>)}
          </footer>
        </main>
      </div>
      <div className={styles.summaryColumn}>
        <div className={styles.summarySticky}>
          <OrderSummary
            discountCode={discountCode}
            onApplyDiscount={requestDeliveryUpdate}
            onDiscountChange={setDiscountCode}
            onToggle={() => dispatch({ type: "toggle_summary" })}
            open={state.summaryOpen}
            pending={pending}
            quote={state.quote}
            variant="desktop"
          />
        </div>
      </div>
    </div>
  </div>;
}
