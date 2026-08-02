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

const REJECTED = /(?:audio|dall-e|embedding|image|moderation|realtime|search|transcri|tts|whisper)/i;

export function createOpenAIProviderAdapter(fetcher: ToshiProviderFetch): ToshiProviderVerificationAdapter {
  return Object.freeze({
    provider: "openai" as const,
    async verify(apiKey: Uint8Array, signal: AbortSignal) {
      return withApiKey(apiKey, async (key) => {
        const root = plainRecord(await fetchOfficialJson(fetcher, "https://api.openai.com/v1/models", { authorization: `Bearer ${key}` }, signal));
        const models: ToshiProviderModel[] = [];
        for (const raw of boundedArray(ownValue(root, "data"))) {
          const id = boundedText(ownValue(plainRecord(raw), "id"));
          if ((id.startsWith("gpt-") || id.startsWith("o")) && !REJECTED.test(id)) models.push({ id, label: id });
        }
        return finalizeModels(models, [/^gpt-5$/, /^gpt-5(?:[.-]|$)/, /^gpt-4[.0-9-]*$/, /mini/i]);
      });
    },
  });
}
