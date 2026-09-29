import type { ToshiProvider, ToshiProviderErrorCode } from "@celebix/saas-contracts";
import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";

export type ToshiGenerationHistoryMessage = Readonly<{ role: "user" | "assistant"; text: string }>;
export type ToshiGenerationTool = Readonly<{ name: string; description: string; parameters: Readonly<Record<string, unknown>> }>;
export type ToshiGenerationToolCall = Readonly<{ callId: string; name: string; arguments: unknown }>;
export type ToshiGenerationToolResult = Readonly<{ callId: string; name: string; result: unknown }>;
export type ToshiGenerationInput = Readonly<{
  authoringProfile?: "content_resource";
  outputFormat?: "json_object";
  maxOutputTokens?: number;
  model: string;
  secret: Uint8Array;
  system: string;
  history: readonly ToshiGenerationHistoryMessage[];
  tools: readonly ToshiGenerationTool[];
  continuation?: unknown;
  toolResults?: readonly ToshiGenerationToolResult[];
  signal: AbortSignal;
}>;
export type ToshiGenerationOutput = Readonly<{
  text: string;
  toolCalls: readonly ToshiGenerationToolCall[];
  /** Provider protocol state is confined to one server-side generation operation. */
  continuation: unknown;
  usage?: Readonly<{ inputTokens: number; outputTokens: number }>;
}>;
export interface ToshiGenerationAdapter {
  readonly provider: ToshiProvider;
  generate(input: ToshiGenerationInput): Promise<ToshiGenerationOutput>;
}
export interface ToshiGenerationRegistry {
  get(provider: ToshiProvider): ToshiGenerationAdapter;
}
export type ToshiGenerationFetchers = Partial<Readonly<Record<ToshiProvider, ToshiProviderFetch>>>;

export class ToshiGenerationError extends Error {
  readonly code: ToshiProviderErrorCode;
  constructor(code: ToshiProviderErrorCode, readonly outcome?: "empty" | "truncated") {
    super(code);
    this.name = "ToshiGenerationError";
    this.code = code;
  }
}
