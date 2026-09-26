import { TOSHI_PROVIDERS, type ToshiProvider } from "@celebix/saas-contracts";
import { createAnthropicGenerationAdapter } from "./anthropic.ts";
import { createDeepSeekGenerationAdapter } from "./deepseek.ts";
import { createGeminiGenerationAdapter } from "./gemini.ts";
import { createOpenAIGenerationAdapter } from "./openai.ts";
import { ToshiGenerationError, type ToshiGenerationAdapter, type ToshiGenerationFetchers, type ToshiGenerationRegistry } from "./types.ts";

export function createToshiGenerationRegistry(fetchers: ToshiGenerationFetchers = {}): ToshiGenerationRegistry {
  if (typeof fetchers !== "object" || fetchers === null || Array.isArray(fetchers)) throw new ToshiGenerationError("invalid_input");
  for (const [provider, fetcher] of Object.entries(fetchers)) if (!TOSHI_PROVIDERS.includes(provider as ToshiProvider) || typeof fetcher !== "function") throw new ToshiGenerationError("invalid_input");
  const fallback = globalThis.fetch.bind(globalThis);
  const adapters: Readonly<Record<ToshiProvider, ToshiGenerationAdapter>> = Object.freeze({
    openai: createOpenAIGenerationAdapter(fetchers.openai ?? fallback),
    deepseek: createDeepSeekGenerationAdapter(fetchers.deepseek ?? fallback),
    gemini: createGeminiGenerationAdapter(fetchers.gemini ?? fallback),
    anthropic: createAnthropicGenerationAdapter(fetchers.anthropic ?? fallback),
  });
  return Object.freeze({ get(provider: ToshiProvider) {
    if (!TOSHI_PROVIDERS.includes(provider)) throw new ToshiGenerationError("invalid_input");
    return adapters[provider];
  } });
}

export { ToshiGenerationError } from "./types.ts";
export type { ToshiGenerationInput, ToshiGenerationOutput, ToshiGenerationRegistry } from "./types.ts";
