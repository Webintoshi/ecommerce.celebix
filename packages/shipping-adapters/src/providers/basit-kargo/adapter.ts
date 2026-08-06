import type {
  CancelProviderShipmentInput,
  CreateProviderShipmentInput,
  CreateProviderShipmentResult,
  CreateReturnShipmentInput,
  DownloadShippingLabelInput,
  GetProviderShipmentInput,
  GetProviderShipmentResult,
  ProviderShipment,
  ProviderShipmentMutationResult,
  QuoteShippingPackagesInput,
  ShippingCredentialResourceInput,
  ShippingCredentialVerification,
  ShippingHandlerListResult,
  ShippingLabelDownloadResult,
  ShippingProviderAdapter,
  ShippingProviderReadFailure,
  ShippingQuoteResult,
  ShippingResourceListResult,
  VerifyShippingCredentialInput,
} from "../../contracts.ts";
import {
  createShippingProviderTransport,
  type ShippingProviderTransport,
  type ShippingProviderTransportResult,
} from "../../transport.ts";
import { BASIT_KARGO_API_ORIGIN } from "../../validation.ts";
import type { BasitKargoCredential } from "./types.ts";
import {
  buildBasitKargoCreateBody,
  buildBasitKargoPackageBody,
  encodeBasitKargoJson,
  parseBasitKargoAddresses,
  parseBasitKargoBrands,
  parseBasitKargoCredential,
  parseBasitKargoHandlers,
  parseBasitKargoJson,
  parseBasitKargoQuotes,
  parseBasitKargoShipment,
  parseBasitKargoSvg,
} from "./validation.ts";

type JsonOperation = "read" | "mutation";

function classifyResponse(
  result: ShippingProviderTransportResult,
  operation: "read",
): ShippingProviderReadFailure | null;
function classifyResponse(
  result: ShippingProviderTransportResult,
  operation: "mutation",
): ShippingProviderReadFailure | Readonly<{ kind: "provider_outcome_unknown"; providerReference: null }> | null;
function classifyResponse(
  result: ShippingProviderTransportResult,
  operation: JsonOperation,
): ShippingProviderReadFailure | Readonly<{ kind: "provider_outcome_unknown"; providerReference: null }> | null {
  if (result.kind === "failure") {
    return operation === "mutation"
      ? Object.freeze({ kind: "provider_outcome_unknown", providerReference: null })
      : Object.freeze({ kind: "temporary_failure", safeCode: "provider_transport_failure" });
  }
  if (result.status === 401 || result.status === 403) return Object.freeze({ kind: "credential_invalid", safeCode: "credential_rejected" });
  if (result.status === 429) return result.retryAfterSeconds === null
    ? Object.freeze({ kind: "temporary_failure", safeCode: "provider_throttled" })
    : Object.freeze({ kind: "throttled", retryAfterSeconds: result.retryAfterSeconds });
  if (result.status >= 400 && result.status <= 499) return Object.freeze({ kind: "rejected", safeCode: "provider_rejected" });
  if (result.status >= 500) return operation === "mutation"
    ? Object.freeze({ kind: "provider_outcome_unknown", providerReference: null })
    : Object.freeze({ kind: "temporary_failure", safeCode: "provider_unavailable" });
  if (result.status < 200 || result.status > 299) return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
  return null;
}

async function jsonRequest(
  transport: ShippingProviderTransport,
  input: Readonly<{
    method: "GET" | "POST" | "DELETE";
    path: string;
    credential: BasitKargoCredential;
    signal: AbortSignal;
    body?: unknown;
    operation: "read";
  }>,
): Promise<Readonly<{ kind: "json"; value: unknown }> | ShippingProviderReadFailure>;
async function jsonRequest(
  transport: ShippingProviderTransport,
  input: Readonly<{
    method: "GET" | "POST" | "DELETE";
    path: string;
    credential: BasitKargoCredential;
    signal: AbortSignal;
    body?: unknown;
    operation: "mutation";
  }>,
): Promise<
  | Readonly<{ kind: "json"; value: unknown }>
  | ShippingProviderReadFailure
  | Readonly<{ kind: "provider_outcome_unknown"; providerReference: null }>
>;
async function jsonRequest(
  transport: ShippingProviderTransport,
  input: Readonly<{
    method: "GET" | "POST" | "DELETE";
    path: string;
    credential: BasitKargoCredential;
    signal: AbortSignal;
    body?: unknown;
    operation: JsonOperation;
  }>,
): Promise<
  | Readonly<{ kind: "json"; value: unknown }>
  | ShippingProviderReadFailure
  | Readonly<{ kind: "provider_outcome_unknown"; providerReference: null }>
> {
  let result: ShippingProviderTransportResult;
  try {
    result = await transport.request({
      origin: BASIT_KARGO_API_ORIGIN,
      path: input.path,
      method: input.method,
      token: input.credential.token,
      ...(input.body === undefined ? {} : { body: encodeBasitKargoJson(input.body) }),
      signal: input.signal,
    });
  } catch {
    return input.operation === "mutation"
      ? Object.freeze({ kind: "provider_outcome_unknown", providerReference: null })
      : Object.freeze({ kind: "temporary_failure", safeCode: "provider_transport_failure" });
  }
  const failure = input.operation === "read"
    ? classifyResponse(result, "read")
    : classifyResponse(result, "mutation");
  if (failure !== null) return failure;
  if (result.kind !== "response" || result.contentType !== "application/json") {
    return input.operation === "mutation"
      ? Object.freeze({ kind: "provider_outcome_unknown", providerReference: null })
      : Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
  }
  try {
    return Object.freeze({ kind: "json", value: parseBasitKargoJson(result.body) });
  } catch {
    return input.operation === "mutation"
      ? Object.freeze({ kind: "provider_outcome_unknown", providerReference: null })
      : Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
  }
}

function safeMutationParse<T>(parse: () => T): T | Readonly<{ kind: "provider_outcome_unknown"; providerReference: null }> {
  try {
    return parse();
  } catch {
    return Object.freeze({ kind: "provider_outcome_unknown", providerReference: null });
  }
}

export class BasitKargoAdapter implements ShippingProviderAdapter<BasitKargoCredential> {
  readonly providerCode = "basit_kargo" as const;
  readonly #transport: ShippingProviderTransport;

  constructor(dependencies: Readonly<{ transport?: ShippingProviderTransport }> = {}) {
    this.#transport = dependencies.transport ?? createShippingProviderTransport();
  }

  parseCredential(value: unknown): BasitKargoCredential {
    return parseBasitKargoCredential(value);
  }

  async verifyCredential(input: VerifyShippingCredentialInput<BasitKargoCredential>): Promise<ShippingCredentialVerification> {
    const result = await this.listHandlers(input);
    return result.kind === "succeeded"
      ? Object.freeze({ kind: "succeeded", accountIdentity: "basit_kargo" })
      : result;
  }

  async listBrands(input: ShippingCredentialResourceInput<BasitKargoCredential>): Promise<ShippingResourceListResult> {
    const result = await jsonRequest(this.#transport, { ...input, method: "GET", path: "/firm/brand", operation: "read" });
    if (result.kind !== "json") return result;
    try {
      return Object.freeze({ kind: "succeeded", resources: parseBasitKargoBrands(result.value) });
    } catch {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
  }

  async listSenderAddresses(input: ShippingCredentialResourceInput<BasitKargoCredential>): Promise<ShippingResourceListResult> {
    const result = await jsonRequest(this.#transport, { ...input, method: "GET", path: "/firm/address", operation: "read" });
    if (result.kind !== "json") return result;
    try {
      return Object.freeze({ kind: "succeeded", resources: parseBasitKargoAddresses(result.value) });
    } catch {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
  }

  async listHandlers(input: ShippingCredentialResourceInput<BasitKargoCredential>): Promise<ShippingHandlerListResult> {
    const result = await jsonRequest(this.#transport, { ...input, method: "GET", path: "/handlers", operation: "read" });
    if (result.kind !== "json") return result;
    try {
      return Object.freeze({ kind: "succeeded", handlers: parseBasitKargoHandlers(result.value) });
    } catch {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
  }

  async quotePackages(input: QuoteShippingPackagesInput<BasitKargoCredential>): Promise<ShippingQuoteResult> {
    let body: unknown;
    try {
      body = buildBasitKargoPackageBody(input.packages);
    } catch {
      return Object.freeze({ kind: "rejected", safeCode: "shipping_input_invalid" });
    }
    const result = await jsonRequest(this.#transport, {
      credential: input.credential, signal: input.signal, method: "POST", path: "/handlers/fee/packages", body, operation: "read",
    });
    if (result.kind !== "json") return result;
    try {
      return Object.freeze({ kind: "succeeded", options: parseBasitKargoQuotes(result.value) });
    } catch {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
  }

  async createShipment(input: CreateProviderShipmentInput<BasitKargoCredential>): Promise<CreateProviderShipmentResult> {
    let body: unknown;
    try {
      body = buildBasitKargoCreateBody(input);
    } catch {
      return Object.freeze({ kind: "rejected", safeCode: "shipping_input_invalid" });
    }
    const result = await jsonRequest(this.#transport, {
      credential: input.credential, signal: input.signal, method: "POST", path: "/v2/order/barcode", body, operation: "mutation",
    });
    if (result.kind !== "json") return result;
    const shipment = safeMutationParse(() => parseBasitKargoShipment(result.value));
    return Object.hasOwn(shipment, "kind")
      ? shipment as Extract<CreateProviderShipmentResult, { kind: "provider_outcome_unknown" }>
      : Object.freeze({ kind: "succeeded", shipment: shipment as ProviderShipment });
  }

  async getShipment(input: GetProviderShipmentInput<BasitKargoCredential>): Promise<GetProviderShipmentResult> {
    const result = await jsonRequest(this.#transport, {
      credential: input.credential, signal: input.signal, method: "GET", path: `/v2/order/${input.providerReference}`, operation: "read",
    });
    if (result.kind !== "json") return result;
    try {
      return Object.freeze({ kind: "succeeded", shipment: parseBasitKargoShipment(result.value) });
    } catch {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
  }

  async cancelShipment(input: CancelProviderShipmentInput<BasitKargoCredential>): Promise<ProviderShipmentMutationResult> {
    const result = await jsonRequest(this.#transport, {
      credential: input.credential, signal: input.signal, method: "DELETE", path: `/order/barcode/${input.barcode}`, operation: "mutation",
    });
    if (result.kind !== "json") return result;
    const shipment = safeMutationParse(() => parseBasitKargoShipment(result.value));
    if (Object.hasOwn(shipment, "kind")) return shipment as Extract<ProviderShipmentMutationResult, { kind: "provider_outcome_unknown" }>;
    const parsed = shipment as ProviderShipment;
    return Object.freeze({ kind: "succeeded", shipment: Object.freeze({ ...parsed, status: "cancelled" as const, providerStatus: "CANCELLED" }) });
  }

  async createReturnShipment(input: CreateReturnShipmentInput<BasitKargoCredential>): Promise<CreateProviderShipmentResult> {
    const result = await jsonRequest(this.#transport, {
      credential: input.credential, signal: input.signal, method: "GET", path: `/v2/order/return/barcode/${input.barcode}`, operation: "mutation",
    });
    if (result.kind !== "json") return result;
    const shipment = safeMutationParse(() => parseBasitKargoShipment(result.value));
    return Object.hasOwn(shipment, "kind")
      ? shipment as Extract<CreateProviderShipmentResult, { kind: "provider_outcome_unknown" }>
      : Object.freeze({ kind: "succeeded", shipment: shipment as ProviderShipment });
  }

  async downloadLabel(input: DownloadShippingLabelInput<BasitKargoCredential>): Promise<ShippingLabelDownloadResult> {
    const result = await this.#transport.request({
      origin: BASIT_KARGO_API_ORIGIN,
      path: `/label/svg/${input.providerReference}`,
      method: "GET",
      token: input.credential.token,
      signal: input.signal,
    });
    const failure = classifyResponse(result, "read");
    if (failure !== null) return failure;
    if (result.kind !== "response" || result.contentType !== "image/svg+xml") {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
    try {
      return Object.freeze({ kind: "succeeded", contentType: "image/svg+xml", bytes: parseBasitKargoSvg(result.body) });
    } catch {
      return Object.freeze({ kind: "temporary_failure", safeCode: "provider_response_invalid" });
    }
  }
}
