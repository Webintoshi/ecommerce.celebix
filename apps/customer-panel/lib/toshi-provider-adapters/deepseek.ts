import type { ToshiProviderModel } from "@celebix/saas-contracts";

import { boundedArray, boundedText, fetchOfficialJson, finalizeModels, ownValue, plainRecord, withApiKey } from "./model-policy.ts";
import type { ToshiProviderFetch, ToshiProviderVerificationAdapter } from "./types.ts";

const ALLOWED_MODELS = new Set(["deepseek-flash", "deepseek-v4-pro"]);

export function createDeepSeekProviderAdapter(fetcher: ToshiProviderFetch): ToshiProviderVerificationAdapter {
  return Object.freeze({
    provider: "deepseek" as const,
    async verify(apiKey: Uint8Array, signal: AbortSignal) {
      return withApiKey(apiKey, async (key) => {
        const root = plainRecord(await fetchOfficialJson(fetcher, "https://api.deepseek.com/models", { authorization: `Bearer ${key}` }, signal));
        const models: ToshiProviderModel[] = [];
        for (const raw of boundedArray(ownValue(root, "data"))) {
          const model = plainRecord(raw);
          const id = boundedText(ownValue(model, "id"));
          if (!ALLOWED_MODELS.has(id)) continue;
          const label = Object.hasOwn(model, "name") ? boundedText(ownValue(model, "name")) : id;
          models.push({ id, label });
        }
        return finalizeModels(models, [/^deepseek-flash$/, /^deepseek-v4-pro$/]);
      });
    },
  });
}
