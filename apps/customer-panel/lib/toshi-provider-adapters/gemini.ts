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

const REJECTED = /(?:aqa|audio|embedding|image|imagen|live|music|tts|veo)/i;

export function createGeminiProviderAdapter(fetcher: ToshiProviderFetch): ToshiProviderVerificationAdapter {
  return Object.freeze({
    provider: "gemini" as const,
    async verify(apiKey: Uint8Array, signal: AbortSignal) {
      return withApiKey(apiKey, async (key) => {
        const root = plainRecord(await fetchOfficialJson(fetcher, "https://generativelanguage.googleapis.com/v1beta/models", { "x-goog-api-key": key }, signal));
        const models: ToshiProviderModel[] = [];
        for (const raw of boundedArray(ownValue(root, "models"))) {
          const record = plainRecord(raw);
          const name = boundedText(ownValue(record, "name"));
          const methods = boundedArray(ownValue(record, "supportedGenerationMethods"));
          if (!methods.includes("generateContent")) continue;
          const id = name.startsWith("models/") ? name.slice(7) : name;
          if (!id.startsWith("gemini-") || REJECTED.test(id)) continue;
          const label = Object.hasOwn(record, "displayName") ? boundedText(ownValue(record, "displayName")) : id;
          models.push({ id, label });
        }
        return finalizeModels(models, [/pro/i, /flash/i]);
      });
    },
  });
}
