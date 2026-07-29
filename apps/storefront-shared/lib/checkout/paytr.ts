import {
  authenticatePaytrIframeCallback,
  createBoundedProviderTransport,
  createPaytrIframePresentationUrl as createProviderPresentationUrl,
  createPaytrIframeStatusToken,
  createPaytrIframeToken,
  initializePaytrIframeWithTransport,
  queryPaytrIframeWithTransport,
  verifyPaytrIframeCallbackHash,
  type PaytrIframeCallback,
  type PaytrIframeCredential,
  type PaytrIframeInitializationResult,
  type PaytrIframeStatusResult,
} from "@celebix/payment-adapters";
import {
  serializeCanonicalPaytrConfiguration,
  type CanonicalPaytrConfiguration,
} from "@celebix/saas-data";

export type PaytrConfiguration = CanonicalPaytrConfiguration;
export type PaytrCallback = PaytrIframeCallback;
export type PaytrIframeTokenResult = PaytrIframeInitializationResult;

const PROVIDER_TIMEOUT_MS = 20_000;
const MAXIMUM_RESPONSE_BYTES = 4_096;

function credential(value: PaytrConfiguration): PaytrIframeCredential {
  serializeCanonicalPaytrConfiguration(value);
  return {
    merchantId: value.merchantId,
    merchantKey: value.merchantKey,
    merchantSalt: value.merchantSalt,
  };
}

function wipeCredential(value: PaytrIframeCredential): void {
  try {
    value.merchantId = "";
    value.merchantKey = "";
    value.merchantSalt = "";
  } catch {
    // Compatibility cleanup cannot replace the provider result.
  }
}

function providerTransport() {
  return createBoundedProviderTransport({
    fetch: async (request) => await globalThis.fetch(request),
    timeoutMs: PROVIDER_TIMEOUT_MS,
    maximumResponseBytes: MAXIMUM_RESPONSE_BYTES,
  });
}

export function createPaytrToken(input: Readonly<{
  configuration: PaytrConfiguration;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: number;
  userBasket: string;
  noInstallment: 0 | 1;
  maxInstallment: number;
  currency: "TL";
}>): string {
  const selected = credential(input.configuration);
  try {
    return createPaytrIframeToken({
      credential: selected,
      userIp: input.userIp,
      merchantOid: input.merchantOid,
      email: input.email,
      paymentAmount: input.paymentAmount,
      userBasket: input.userBasket,
      noInstallment: input.noInstallment,
      maxInstallment: input.maxInstallment,
      currency: input.currency,
      testMode: 1,
    });
  } finally {
    wipeCredential(selected);
  }
}

export function verifyPaytrCallback(input: Readonly<{
  configuration: PaytrConfiguration;
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
  providedHash: string;
}>): boolean {
  let selected: PaytrIframeCredential | undefined;
  try {
    selected = credential(input.configuration);
    return verifyPaytrIframeCallbackHash({
      credential: selected,
      merchantOid: input.merchantOid,
      status: input.status,
      totalAmount: input.totalAmount,
      providedHash: input.providedHash,
    });
  } catch {
    return false;
  } finally {
    if (selected !== undefined) wipeCredential(selected);
  }
}

export function authenticatePaytrCallback(input: Readonly<{
  configuration: PaytrConfiguration;
  form: string;
  expectedPaymentAmount: number;
}>): PaytrCallback | null {
  let selected: PaytrIframeCredential | undefined;
  try {
    selected = credential(input.configuration);
    return authenticatePaytrIframeCallback({
      credential: selected,
      form: input.form,
      expectedPaymentAmount: input.expectedPaymentAmount,
    });
  } catch {
    return null;
  } finally {
    if (selected !== undefined) wipeCredential(selected);
  }
}

export function createPaytrStatusToken(
  configuration: PaytrConfiguration,
  merchantOid: string,
): string {
  const selected = credential(configuration);
  try {
    return createPaytrIframeStatusToken(selected, merchantOid);
  } finally {
    wipeCredential(selected);
  }
}

export function createPaytrIframePresentationUrl(token: unknown): string {
  return createProviderPresentationUrl(token);
}

export async function requestPaytrIframeToken(input: Readonly<{
  configuration: PaytrConfiguration;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: number;
  userBasket: string;
  userName: string;
  userAddress: string;
  userPhone: string;
  successUrl: string;
  failureUrl: string;
  noInstallment: 0 | 1;
  maxInstallment: number;
  signal: AbortSignal;
}>): Promise<PaytrIframeTokenResult> {
  let selected: PaytrIframeCredential | undefined;
  try {
    selected = credential(input.configuration);
    return await initializePaytrIframeWithTransport(providerTransport(), {
      environment: "test",
      credential: selected,
      userIp: input.userIp,
      merchantOid: input.merchantOid,
      email: input.email,
      paymentAmount: input.paymentAmount,
      userBasket: input.userBasket,
      userName: input.userName,
      userAddress: input.userAddress,
      userPhone: input.userPhone,
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
      noInstallment: input.noInstallment,
      maxInstallment: input.maxInstallment,
      signal: input.signal,
    });
  } catch {
    return Object.freeze({ status: "unknown" });
  } finally {
    if (selected !== undefined) wipeCredential(selected);
  }
}

export async function queryPaytrStatus(input: Readonly<{
  configuration: PaytrConfiguration;
  merchantOid: string;
  signal: AbortSignal;
}>): Promise<PaytrIframeStatusResult> {
  let selected: PaytrIframeCredential | undefined;
  try {
    selected = credential(input.configuration);
    return await queryPaytrIframeWithTransport(providerTransport(), {
      environment: "test",
      credential: selected,
      merchantOid: input.merchantOid,
      signal: input.signal,
    });
  } catch {
    return Object.freeze({ status: "unknown" });
  } finally {
    if (selected !== undefined) wipeCredential(selected);
  }
}
