import {
  parseCheckoutDeliveryInput,
  parseCheckoutSubmitInput,
  type CheckoutAddress,
  type CheckoutDeliveryInput,
  type CheckoutHttpError,
  type CheckoutQuote,
  type CheckoutSubmitInput,
} from "@celebix/saas-contracts";

export type CheckoutUiState = Readonly<{
  quote: CheckoutQuote;
  summaryOpen: boolean;
  pending: null | "delivery" | "submit";
  selectedPaymentMethodId: string | null;
  appliedDeliveryFingerprint: string | null;
  deliveryDirty: boolean;
  error: string | null;
}>;

export type CheckoutUiAction =
  | Readonly<{ type: "toggle_summary" }>
  | Readonly<{ type: "select_payment"; paymentMethodId: string }>
  | Readonly<{ type: "delivery_changed" }>
  | Readonly<{ type: "delivery_started" }>
  | Readonly<{ type: "delivery_succeeded"; quote: CheckoutQuote; fingerprint: string }>
  | Readonly<{ type: "submit_started" }>
  | Readonly<{ type: "failed"; code: CheckoutHttpError }>;

type DeliveryPayloadInput = Readonly<{
  quote: CheckoutQuote;
  operationId: string;
  email: string;
  marketingOptIn: boolean;
  shippingAddress: CheckoutAddress;
  billingAddress: CheckoutAddress | null;
  shippingId: "standard" | null;
  discountCode: string | null;
}>;

type SubmitPayloadInput = Readonly<{
  quote: CheckoutQuote;
  operationId: string;
  paymentMethodId: string;
  identityNumber: string | null;
  distanceSales: boolean;
  preInformation: boolean;
}>;

export type DeliveryFieldName =
  | "email" | "firstName" | "lastName" | "phone" | "line1" | "line2"
  | "city" | "district" | "postalCode" | "shippingId";
export type SubmitFieldName =
  | "paymentMethodId" | "identityNumber" | "distanceSales" | "preInformation";
export type CheckoutFieldErrors<Field extends string> = Readonly<Partial<Record<Field, string>>>;

type DeliveryFieldValues = Readonly<Record<Exclude<DeliveryFieldName, "shippingId">, string> & {
  shippingId: "standard" | null;
}>;

export type DeliveryFormValues = Readonly<DeliveryFieldValues & {
  marketingOptIn: boolean;
  discountCode: string;
}>;

export type DeliveryAuthority =
  | Readonly<{ kind: "invalid"; errors: CheckoutFieldErrors<DeliveryFieldName> }>
  | Readonly<{ kind: "dirty"; fingerprint: string }>
  | Readonly<{ kind: "ready"; fingerprint: string }>;

type SubmitFieldValues = Readonly<{
  paymentKind: "paytr_iframe" | "iyzico_iframe" | "bank_transfer" | "cash_on_delivery" | null;
  identityNumber: string;
  distanceSales: boolean;
  preInformation: boolean;
}>;

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDENTITY_NUMBER = /^[\x21-\x7e]{5,50}$/;
const ENCODER = new TextEncoder();

const ERROR_MESSAGES: Readonly<Record<CheckoutHttpError, string>> = Object.freeze({
  invalid_input: "Bilgilerinizi kontrol edip yeniden deneyin.",
  origin_denied: "Bu ödeme isteği doğrulanamadı. Sayfayı yenileyin.",
  cart_not_found: "Sepetiniz bulunamadı. Ürünleri yeniden ekleyin.",
  cart_changed: "Sepetiniz güncellendi. Lütfen bilgileri yeniden kontrol edin.",
  discount_invalid: "İndirim kodu geçerli değil.",
  stock_unavailable: "Sepetinizdeki bir ürün artık yeterli stokta değil.",
  payment_unavailable: "Seçtiğiniz ödeme yöntemi şu anda kullanılamıyor.",
  processing: "İşleminiz doğrulanıyor. Lütfen tekrar göndermeyin.",
  unavailable: "Ödeme şu anda kullanılamıyor. Lütfen daha sonra yeniden deneyin.",
});

export function createCheckoutState(quote: CheckoutQuote): CheckoutUiState {
  return Object.freeze({
    quote,
    summaryOpen: false,
    pending: null,
    selectedPaymentMethodId: quote.paymentMethods[0]?.id ?? null,
    appliedDeliveryFingerprint: null,
    deliveryDirty: true,
    error: null,
  });
}

export function reduceCheckout(
  state: CheckoutUiState,
  action: CheckoutUiAction,
): CheckoutUiState {
  if (action.type === "toggle_summary") {
    return Object.freeze({ ...state, summaryOpen: !state.summaryOpen });
  }
  if (action.type === "select_payment") {
    return Object.freeze({ ...state, selectedPaymentMethodId: action.paymentMethodId, error: null });
  }
  if (action.type === "delivery_changed") {
    if (state.deliveryDirty) return state;
    return Object.freeze({ ...state, deliveryDirty: true });
  }
  if (action.type === "delivery_started") {
    return Object.freeze({ ...state, pending: "delivery", error: null });
  }
  if (action.type === "delivery_succeeded") {
    const selectedPaymentMethodId = action.quote.paymentMethods.some(
      (method) => method.id === state.selectedPaymentMethodId,
    )
      ? state.selectedPaymentMethodId
      : action.quote.paymentMethods[0]?.id ?? null;
    return Object.freeze({
      ...state,
      quote: action.quote,
      pending: null,
      selectedPaymentMethodId,
      appliedDeliveryFingerprint: action.fingerprint,
      deliveryDirty: false,
      error: null,
    });
  }
  if (action.type === "submit_started") {
    if (state.pending !== null || state.deliveryDirty) return state;
    return Object.freeze({ ...state, pending: "submit", error: null });
  }
  return Object.freeze({
    ...state,
    pending: null,
    error: ERROR_MESSAGES[action.code],
  });
}

export function deliveryFormFingerprint(values: DeliveryFormValues): string {
  return JSON.stringify([
    values.email,
    values.marketingOptIn,
    values.firstName,
    values.lastName,
    values.phone,
    values.line1,
    values.line2,
    values.city,
    values.district,
    values.postalCode,
    values.shippingId,
    values.discountCode.trim(),
  ]);
}

export function assessDeliveryAuthority(
  values: DeliveryFormValues,
  appliedFingerprint: string | null,
  dirty: boolean,
): DeliveryAuthority {
  const errors = validateDeliveryFields(values);
  if (Object.keys(errors).length > 0) {
    return Object.freeze({ kind: "invalid", errors });
  }
  const fingerprint = deliveryFormFingerprint(values);
  if (dirty || appliedFingerprint !== fingerprint) {
    return Object.freeze({ kind: "dirty", fingerprint });
  }
  return Object.freeze({ kind: "ready", fingerprint });
}

export function buildDeliveryPayload(input: DeliveryPayloadInput): CheckoutDeliveryInput {
  return parseCheckoutDeliveryInput({
    cartVersion: input.quote.cartVersion,
    checkoutNonce: input.quote.checkoutNonce,
    operationId: input.operationId,
    email: input.email,
    marketingOptIn: input.marketingOptIn,
    shippingAddress: input.shippingAddress,
    billingAddress: input.billingAddress,
    shippingId: input.shippingId,
    discountCode: input.discountCode,
  });
}

export function buildSubmitPayload(input: SubmitPayloadInput): CheckoutSubmitInput {
  return parseCheckoutSubmitInput({
    cartVersion: input.quote.cartVersion,
    checkoutNonce: input.quote.checkoutNonce,
    operationId: input.operationId,
    paymentMethodId: input.paymentMethodId,
    identityNumber: input.identityNumber,
    consents: {
      distanceSales: input.distanceSales,
      preInformation: input.preInformation,
    },
  });
}

function validText(value: string, minimum: number, maximum: number): boolean {
  const length = ENCODER.encode(value).byteLength;
  return length >= minimum
    && length <= maximum
    && !CONTROL.test(value)
    && !EDGE.test(value)
    && !SURROGATE.test(value);
}

export function validateDeliveryFields(
  values: DeliveryFieldValues,
): CheckoutFieldErrors<DeliveryFieldName> {
  const errors: Partial<Record<DeliveryFieldName, string>> = {};
  if (!validText(values.email, 3, 320) || !EMAIL.test(values.email)) {
    errors.email = values.email.trim() === ""
      ? "Bu alan zorunludur."
      : "Geçerli bir e-posta adresi girin.";
  }
  for (const [name, label, maximum] of [
    ["firstName", "ad", 120],
    ["lastName", "soyad", 120],
    ["line1", "adres", 240],
    ["city", "şehir", 120],
    ["district", "ilçe", 120],
  ] as const) {
    const value = values[name];
    if (value.trim() === "") errors[name] = "Bu alan zorunludur.";
    else if (!validText(value, 1, maximum)) errors[name] = `Geçerli bir ${label} girin.`;
  }
  if (!validText(values.phone, 7, 32)) {
    errors.phone = values.phone.trim() === ""
      ? "Bu alan zorunludur."
      : "Geçerli bir telefon numarası girin.";
  }
  if (values.line2 !== "" && !validText(values.line2, 1, 240)) {
    errors.line2 = "Geçerli bir adres detayı girin.";
  }
  if (values.postalCode !== "" && !validText(values.postalCode, 1, 32)) {
    errors.postalCode = "Geçerli bir posta kodu girin.";
  }
  if (values.shippingId !== "standard") errors.shippingId = "Bir kargo yöntemi seçin.";
  return Object.freeze(errors);
}

export function validateSubmitFields(
  values: SubmitFieldValues,
): CheckoutFieldErrors<SubmitFieldName> {
  const errors: Partial<Record<SubmitFieldName, string>> = {};
  if (values.paymentKind === null) errors.paymentMethodId = "Bir ödeme yöntemi seçin.";
  if (values.paymentKind === "iyzico_iframe") {
    if (values.identityNumber === "") errors.identityNumber = "Bu alan zorunludur.";
    else if (
      !IDENTITY_NUMBER.test(values.identityNumber)
      || CONTROL.test(values.identityNumber)
      || EDGE.test(values.identityNumber)
      || /^(.)\1+$/.test(values.identityNumber)
      || values.identityNumber === "12345678901"
    ) errors.identityNumber = "Geçerli bir kimlik numarası girin.";
  }
  if (!values.distanceSales) {
    errors.distanceSales = "Devam etmek için onaylamanız gerekir.";
  }
  if (!values.preInformation) {
    errors.preInformation = "Devam etmek için onaylamanız gerekir.";
  }
  return Object.freeze(errors);
}

export function formatCheckoutMoney(cents: number): string {
  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)} TRY`;
}
