import type { ToshiProviderModel } from "@celebix/saas-contracts";

import {
  boundedArray,
  boundedText,
  fetchOfficialJson,
  finalizeModels,
  ownValue,
  plainRecord,
  withApiKey,
} from "./model-policy.ts";
import type { ToshiProviderFetch, ToshiProviderVerificationAdapter } from "./types.ts";

export function createAnthropicProviderAdapter(fetcher: ToshiProviderFetch): ToshiProviderVerificationAdapter {
  return Object.freeze({
    provider: "anthropic" as const,
    async verify(apiKey: Uint8Array, signal: AbortSignal) {
      return withApiKey(apiKey, async (key) => {
        const root = plainRecord(await fetchOfficialJson(fetcher, "https://api.anthropic.com/v1/models", {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        }, signal));
        const models: ToshiProviderModel[] = [];
        for (const raw of boundedArray(ownValue(root, "data"))) {
          const record = plainRecord(raw);
          const id = boundedText(ownValue(record, "id"));
          if (!id.startsWith("claude-")) continue;
          const label = Object.hasOwn(record, "display_name") ? boundedText(ownValue(record, "display_name")) : id;
          models.push({ id, label });
        }
        return finalizeModels(models, [/sonnet/i, /opus/i, /haiku/i]);
      });
    },
  });
}
