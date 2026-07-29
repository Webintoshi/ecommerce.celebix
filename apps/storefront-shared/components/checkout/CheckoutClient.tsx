"use client";

import {
  parseCheckoutHttpErrorResponse,
  parseCheckoutQuote,
  type CheckoutAddress,
  type CheckoutHttpError,
  type CheckoutQuote,
} from "@celebix/saas-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";

import styles from "../../app/odeme/checkout.module.css";
import {
  StorefrontAnalyticsEvent,
  type StorefrontAnalyticsEventProps,
} from "../StorefrontAnalyticsEvent.tsx";
import {
  createCheckoutCommerceEvent,
  trackCommerceEvent,
  type CheckoutCommerceEvent,
} from "../../lib/analytics/events.ts";
import { createSafeUmamiTracker } from "../../lib/analytics/tracker-client.ts";
import { DeliverySection } from "./DeliverySection.tsx";
import {
  buildDeliveryPayload,
  buildSubmitPayload,
  type CheckoutFieldErrors,
  createCheckoutState,
  assessDeliveryAuthority,
  deliveryFormFingerprint,
  type DeliveryFieldName,
  type DeliveryFormValues,
  reduceCheckout,
  type SubmitFieldName,
  validateDeliveryFields,
  validateSubmitFields,
} from "./model.ts";
import { OrderSummary } from "./OrderSummary.tsx";
import { PaymentSection } from "./PaymentSection.tsx";
import { requestCheckoutSubmission } from "./submission.ts";

const DELIVERY_FORM_ID = "checkout-delivery-form";
const DELIVERY_APPLY_ID = "checkout-delivery-apply";
const DELIVERY_APPLY_ERROR_ID = "checkout-delivery-apply-error";
const DELIVERY_APPLY_ERROR = "Teslimat bilgilerindeki değişiklikleri uygulayın.";

type CheckoutClientProps = Readonly<{
  initialQuote: CheckoutQuote;
  initialOperationId: string;
  tracker: StorefrontAnalyticsEventProps["tracker"];
}>;

function checkoutMethodFacts(
  method: CheckoutQuote["paymentMethods"][number],
): Readonly<{
  methodKind: "provider" | "cash_on_delivery" | "bank_transfer";
  providerCode?: "paytr_iframe" | "iyzico_iframe";
}> {
  return method.kind === "provider"
    ? Object.freeze({
        methodKind: "provider" as const,
        providerCode: method.providerCode,
      })
    : Object.freeze({ methodKind: method.kind });
}

function sendCheckoutAnalytics(
  tracker: CheckoutClientProps["tracker"],
  event: CheckoutCommerceEvent,
): void {
  if (tracker === null) return;
  try {
    trackCommerceEvent(
      createSafeUmamiTracker({
        websiteId: tracker.websiteId,
        hostname: tracker.hostname,
      }),
      createCheckoutCommerceEvent(event),
    );
  } catch {}
}

function optionalText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function requiredText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rawText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function readDeliveryFormValues(form: FormData, discountCode: string): DeliveryFormValues {
  return Object.freeze({
    email: rawText(form, "email"),
    firstName: rawText(form, "firstName"),
    lastName: rawText(form, "lastName"),
    phone: rawText(form, "phone"),
    line1: rawText(form, "line1"),
    line2: rawText(form, "line2"),
    city: rawText(form, "city"),
    district: rawText(form, "district"),
    postalCode: rawText(form, "postalCode"),
    shippingId: form.get("shippingId") === "standard" ? "standard" : null,
    marketingOptIn: form.get("marketingOptIn") === "on",
    discountCode,
  });
}

function responseError(value: unknown): CheckoutHttpError {
  try {
    return parseCheckoutHttpErrorResponse(value).code;
  } catch {
    return "unavailable";
  }
}

function focusNamedControl(form: HTMLFormElement, name: string): void {
  const selected = form.elements.namedItem(name);
  const control = selected instanceof RadioNodeList ? selected.item(0) : selected;
  if (control instanceof HTMLElement) control.focus();
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
  const [deliveryErrors, setDeliveryErrors] = useState<CheckoutFieldErrors<DeliveryFieldName>>({});
  const [deliveryAuthorityError, setDeliveryAuthorityError] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<CheckoutFieldErrors<SubmitFieldName>>({});
  const deliveryFormRef = useRef<HTMLFormElement>(null);
  const deliveryAbort = useRef<AbortController | null>(null);
  const submitAbort = useRef<AbortController | null>(null);
  const startedEvent = useMemo(() => createCheckoutCommerceEvent({
    name: "checkout_started",
    data: {
      currency: props.initialQuote.currency,
      itemCount: props.initialQuote.items.length,
    },
  }), [props.initialQuote.currency, props.initialQuote.items.length]);

  useEffect(() => () => {
    deliveryAbort.current?.abort();
    submitAbort.current?.abort();
  }, []);

  const applyDelivery = useCallback(async (formElement: HTMLFormElement) => {
    const form = new FormData(formElement);
    const deliveryValues = readDeliveryFormValues(form, discountCode);
    const nextErrors = validateDeliveryFields(deliveryValues);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError !== undefined) {
      setDeliveryErrors(nextErrors);
      setDeliveryAuthorityError(null);
      dispatch({ type: "failed", code: "invalid_input" });
      focusNamedControl(formElement, firstError);
      return;
    }
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
      const appliedFingerprint = deliveryFormFingerprint({
        ...deliveryValues,
        discountCode: nextQuote.discountCode ?? "",
      });
      dispatch({
        type: "delivery_succeeded",
        quote: nextQuote,
        fingerprint: appliedFingerprint,
      });
      setDeliveryErrors({});
      setDeliveryAuthorityError(null);
      setDiscountCode(nextQuote.discountCode ?? "");
      setSubmitOperationId(crypto.randomUUID());
      sendCheckoutAnalytics(props.tracker, {
        name: "checkout_delivery_saved",
        data: {
          currency: nextQuote.currency,
          itemCount: nextQuote.items.length,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "failed", code: "unavailable" });
    } finally {
      if (deliveryAbort.current === controller) deliveryAbort.current = null;
    }
  }, [discountCode, props.tracker, state.quote]);

  function handleDeliverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void applyDelivery(event.currentTarget);
  }

  function requestDeliveryUpdate() {
    const form = deliveryFormRef.current;
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  function selectPaymentMethod(paymentMethodId: string) {
    dispatch({ type: "select_payment", paymentMethodId });
    setIdentityNumber("");
    setSubmitErrors({});
    setSubmitOperationId(crypto.randomUUID());
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.pending !== null || submitAbort.current !== null) return;
    const formElement = event.currentTarget;
    const deliveryFormElement = deliveryFormRef.current;
    if (!(deliveryFormElement instanceof HTMLFormElement)) {
      dispatch({ type: "failed", code: "unavailable" });
      return;
    }
    const deliveryValues = readDeliveryFormValues(
      new FormData(deliveryFormElement),
      discountCode,
    );
    const deliveryAuthority = assessDeliveryAuthority(
      deliveryValues,
      state.appliedDeliveryFingerprint,
      state.deliveryDirty,
    );
    if (deliveryAuthority.kind === "invalid") {
      const firstError = Object.keys(deliveryAuthority.errors)[0];
      setDeliveryErrors(deliveryAuthority.errors);
      setDeliveryAuthorityError(null);
      dispatch({ type: "failed", code: "invalid_input" });
      if (firstError !== undefined) focusNamedControl(deliveryFormElement, firstError);
      return;
    }
    if (deliveryAuthority.kind === "dirty") {
      setDeliveryAuthorityError(DELIVERY_APPLY_ERROR);
      deliveryFormRef.current
        ?.querySelector<HTMLElement>(`#${DELIVERY_APPLY_ID}`)
        ?.focus();
      return;
    }
    setDeliveryAuthorityError(null);
    const form = new FormData(formElement);
    const selectedMethod = state.quote.paymentMethods.find(
      (method) => method.id === state.selectedPaymentMethodId,
    ) ?? null;
    const paymentKind = selectedMethod?.kind === "provider"
      ? selectedMethod.providerCode
      : selectedMethod?.kind ?? null;
    const distanceSales = form.get("distanceSales") === "true";
    const preInformation = form.get("preInformation") === "true";
    const nextErrors = validateSubmitFields({
      paymentKind,
      identityNumber,
      distanceSales,
      preInformation,
    });
    const firstError = Object.keys(nextErrors)[0];
    if (
      firstError !== undefined
      || state.selectedPaymentMethodId === null
      || selectedMethod === null
    ) {
      setSubmitErrors(nextErrors);
      dispatch({
        type: "failed",
        code: state.selectedPaymentMethodId === null || selectedMethod === null
          ? "payment_unavailable"
          : "invalid_input",
      });
      focusNamedControl(formElement, firstError ?? "paymentMethodId");
      return;
    }
    let payload;
    try {
      payload = buildSubmitPayload({
        quote: state.quote,
        operationId: submitOperationId,
        paymentMethodId: state.selectedPaymentMethodId,
        identityNumber: identityNumber === "" ? null : identityNumber,
        distanceSales,
        preInformation,
      });
    } catch {
      dispatch({ type: "failed", code: "invalid_input" });
      return;
    }
    const body = new URLSearchParams({
      cartVersion: String(payload.cartVersion),
      checkoutNonce: payload.checkoutNonce,
      operationId: payload.operationId,
      paymentMethodId: payload.paymentMethodId,
      identityNumber: payload.identityNumber ?? "",
      distanceSales: "true",
      preInformation: "true",
    });
    const controller = new AbortController();
    submitAbort.current = controller;
    setSubmitErrors({});
    dispatch({ type: "submit_started" });
    const methodFacts = checkoutMethodFacts(selectedMethod);
    sendCheckoutAnalytics(props.tracker, {
      name: "checkout_submitted",
      data: {
        ...methodFacts,
        currency: state.quote.currency,
        itemCount: state.quote.items.length,
      },
    });
    const result = await requestCheckoutSubmission({
      body,
      deliveryReady: deliveryAuthority.kind === "ready",
      signal: controller.signal,
    });
    if (submitAbort.current !== controller) return;
    submitAbort.current = null;
    if (result.kind === "aborted") return;
    if (result.kind === "delivery_dirty") {
      setDeliveryAuthorityError(DELIVERY_APPLY_ERROR);
      deliveryFormRef.current
        ?.querySelector<HTMLElement>(`#${DELIVERY_APPLY_ID}`)
        ?.focus();
      return;
    }
    if (result.kind === "failed") {
      dispatch({ type: "failed", code: result.code });
      sendCheckoutAnalytics(props.tracker, {
        name: "checkout_failed",
        data: {
          ...methodFacts,
          resultCode: result.code,
        },
      });
      return;
    }
    window.location.assign(result.location);
  }

  function clearDeliveryError(name: DeliveryFieldName) {
    dispatch({ type: "delivery_changed" });
    setDeliveryErrors((current) => {
      if (current[name] === undefined) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function markDeliveryChanged() {
    dispatch({ type: "delivery_changed" });
  }

  function setDeliveryInvalid(name: DeliveryFieldName, message: string) {
    setDeliveryErrors((current) => ({ ...current, [name]: message }));
  }

  function clearSubmitError(name: SubmitFieldName) {
    setSubmitErrors((current) => {
      if (current[name] === undefined) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function setSubmitInvalid(name: SubmitFieldName, message: string) {
    setSubmitErrors((current) => ({ ...current, [name]: message }));
  }

  const pending = state.pending !== null;
  return <div className={styles.page} data-checkout-root="">
    <StorefrontAnalyticsEvent
      event={startedEvent}
      tracker={props.tracker}
      trigger="mount"
    />
    <div className={styles.grid}>
      <div className={styles.leftColumn}>
        <main className={styles.main}>
          <h1 className="checkout-wordmark">{state.quote.storeName}</h1>
          <OrderSummary
            discountCode={discountCode}
            onApplyDiscount={requestDeliveryUpdate}
            onDiscountChange={(value) => {
              setDiscountCode(value);
              markDeliveryChanged();
            }}
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
            applyButtonId={DELIVERY_APPLY_ID}
            applyError={deliveryAuthorityError}
            applyErrorId={DELIVERY_APPLY_ERROR_ID}
            errors={deliveryErrors}
            formId={DELIVERY_FORM_ID}
            formRef={deliveryFormRef}
            onFieldChange={clearDeliveryError}
            onFieldInvalid={setDeliveryInvalid}
            onDeliveryChange={markDeliveryChanged}
            onSubmit={handleDeliverySubmit}
            pending={pending}
            quote={state.quote}
          />
          <PaymentSection
            errors={submitErrors}
            identityNumber={identityNumber}
            onFieldChange={clearSubmitError}
            onFieldInvalid={setSubmitInvalid}
            onIdentityNumberChange={(value) => {
              setIdentityNumber(value);
              clearSubmitError("identityNumber");
            }}
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
            onDiscountChange={(value) => {
              setDiscountCode(value);
              markDeliveryChanged();
            }}
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
