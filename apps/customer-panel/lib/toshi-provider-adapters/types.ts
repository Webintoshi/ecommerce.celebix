import type {
  ToshiProvider,
  ToshiProviderErrorCode,
  ToshiProviderModel,
} from "@celebix/saas-contracts";

export type ToshiProviderFetch = (
  input: string | URL | Request,
  init: RequestInit,
) => Promise<Response>;

export interface ToshiProviderVerificationResult {
  readonly models: readonly ToshiProviderModel[];
  readonly selectedModel: string;
}

export interface ToshiProviderVerificationAdapter {
  readonly provider: ToshiProvider;
  verify(apiKey: Uint8Array, signal: AbortSignal): Promise<ToshiProviderVerificationResult>;
}

export interface ToshiProviderAdapterRegistry {
  get(provider: ToshiProvider): ToshiProviderVerificationAdapter;
}

export class ToshiProviderAdapterError extends Error {
  readonly code: ToshiProviderErrorCode;

  constructor(code: ToshiProviderErrorCode) {
    super(code);
    this.name = "ToshiProviderAdapterError";
    this.code = code;
  }
}
