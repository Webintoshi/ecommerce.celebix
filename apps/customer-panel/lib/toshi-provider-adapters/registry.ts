import { TOSHI_PROVIDERS, type ToshiProvider } from "@celebix/saas-contracts";

import { createAnthropicProviderAdapter } from "./anthropic.ts";
import { createGeminiProviderAdapter } from "./gemini.ts";
import { createOpenAIProviderAdapter } from "./openai.ts";
import {
  ToshiProviderAdapterError,
  type ToshiProviderAdapterRegistry,
  type ToshiProviderFetch,
  type ToshiProviderVerificationAdapter,
} from "./types.ts";

export type ToshiProviderFetchers = Readonly<Record<ToshiProvider, ToshiProviderFetch>>;

export function createToshiProviderAdapterRegistry(fetchers: ToshiProviderFetchers): ToshiProviderAdapterRegistry {
  if (
    typeof fetchers !== "object" || fetchers === null || Array.isArray(fetchers) ||
    Object.keys(fetchers).sort().join(",") !== [...TOSHI_PROVIDERS].sort().join(",") ||
    TOSHI_PROVIDERS.some((provider) => typeof fetchers[provider] !== "function")
  ) throw new ToshiProviderAdapterError("invalid_input");
  const adapters: Readonly<Record<ToshiProvider, ToshiProviderVerificationAdapter>> = Object.freeze({
    openai: createOpenAIProviderAdapter(fetchers.openai),
    gemini: createGeminiProviderAdapter(fetchers.gemini),
    anthropic: createAnthropicProviderAdapter(fetchers.anthropic),
  });
  return Object.freeze({
    get(provider: ToshiProvider): ToshiProviderVerificationAdapter {
      if (!TOSHI_PROVIDERS.includes(provider as never)) throw new ToshiProviderAdapterError("invalid_input");
      return adapters[provider];
    },
  });
}

export { createAnthropicProviderAdapter } from "./anthropic.ts";
export { createGeminiProviderAdapter } from "./gemini.ts";
export { createOpenAIProviderAdapter } from "./openai.ts";
export { ToshiProviderAdapterError } from "./types.ts";
export type {
  ToshiProviderAdapterRegistry,
  ToshiProviderFetch,
  ToshiProviderVerificationAdapter,
  ToshiProviderVerificationResult,
} from "./types.ts";
