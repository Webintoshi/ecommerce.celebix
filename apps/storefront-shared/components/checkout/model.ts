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
  error: string | null;
}>;

export type CheckoutUiAction =
  | Readonly<{ type: "toggle_summary" }>
  | Readonly<{ type: "select_payment"; paymentMethodId: string }>
  | Readonly<{ type: "delivery_started" }>
  | Readonly<{ type: "delivery_succeeded"; quote: CheckoutQuote }>
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
}>;

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
      error: null,
    });
  }
  if (action.type === "submit_started") {
    return Object.freeze({ ...state, pending: "submit", error: null });
  }
  return Object.freeze({
    ...state,
    pending: null,
    error: ERROR_MESSAGES[action.code],
  });
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
      distanceSales: true,
      preInformation: true,
    },
  });
}

export function formatCheckoutMoney(cents: number): string {
  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)} TRY`;
}
