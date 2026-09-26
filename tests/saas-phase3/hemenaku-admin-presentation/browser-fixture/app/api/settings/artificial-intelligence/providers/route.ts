import { parseToshiProviderConnectionList } from "@celebix/saas-contracts";

const PROVIDERS = Object.freeze([
  { provider: "openai", label: "OpenAI", model: "fixture-openai", modelLabel: "OpenAI fixture" },
  { provider: "gemini", label: "Google Gemini", model: "fixture-gemini", modelLabel: "Gemini fixture" },
  { provider: "anthropic", label: "Anthropic Claude", model: "fixture-claude", modelLabel: "Claude fixture" },
  { provider: "deepseek", label: "DeepSeek", model: "fixture-deepseek", modelLabel: "DeepSeek fixture" },
]);

// Named local presentation records only; this route does not contain credentials,
// call a provider, or implement a mutation endpoint.
export function GET() {
  return Response.json(parseToshiProviderConnectionList({
    items: PROVIDERS.map((entry) => ({
      provider: entry.provider,
      label: entry.label,
      status: "active",
      isDefault: entry.provider === "openai",
      maskedKey: "••••demo",
      selectedModel: entry.model,
      availableModels: [{ id: entry.model, label: entry.modelLabel }],
      version: 1,
      verifiedAt: "2026-09-26T12:00:00.000Z",
      updatedAt: "2026-09-26T12:00:00.000Z",
    })),
  }));
}
