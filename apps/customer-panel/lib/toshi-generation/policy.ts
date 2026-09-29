import type { ToshiProvider } from "@celebix/saas-contracts";
import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";
import { withApiKey } from "../toshi-provider-adapters/model-policy.ts";
import {
  ToshiGenerationError,
  type ToshiGenerationAdapter,
  type ToshiGenerationInput,
  type ToshiGenerationOutput,
  type ToshiGenerationToolCall,
} from "./types.ts";

const ENCODER = new TextEncoder();
const MAX_RESPONSE_BYTES = 524_288;
const MAX_REQUEST_BYTES = 163_840;
const NAME = /^[a-zA-Z0-9_-]{1,64}$/u;
type Code = "invalid_input" | "provider_unavailable";
export function fail(code: Code = "provider_unavailable", outcome?: "empty" | "truncated"): never { throw new ToshiGenerationError(code, outcome); }

export function record(value: unknown, code: Code = "provider_unavailable"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !descriptors[key] || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) fail(code);
  return value as Record<string, unknown>;
}
export function array(value: unknown, maximum = 32, code: Code = "provider_unavailable"): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail(code);
  for (let index = 0; index < value.length; index++) if (!descriptors[String(index)] || !("value" in descriptors[String(index)]!) || !descriptors[String(index)]!.enumerable) fail(code);
  return value;
}
export function text(value: unknown, maximum = 12_000, code: Code = "provider_unavailable"): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}

/** Clone data without invoking accessors, toJSON, sparse-array or custom-prototype code. */
export function data(value: unknown, code: Code = "provider_unavailable"): unknown {
  let nodes = 0;
  function visit(current: unknown, depth: number): unknown {
    if (++nodes > 16_000 || depth > 20) fail(code);
    if (current === null || typeof current === "boolean" || typeof current === "string") return current;
    if (typeof current === "number") { if (!Number.isFinite(current)) fail(code); return current; }
    if (Array.isArray(current)) return array(current, 2_000, code).map((entry) => visit(entry, depth + 1));
    const selected = record(current, code);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(selected)) Object.defineProperty(result, key, { value: visit(selected[key], depth + 1), enumerable: true, writable: true, configurable: true });
    return result;
  }
  return visit(value, 0);
}

export function call(input: ToshiGenerationInput, callId: unknown, name: unknown, args: unknown): ToshiGenerationToolCall {
  const id = text(callId, 160);
  const tool = text(name, 64);
  if (!id.trim() || /\s/u.test(id) || !NAME.test(tool) || !input.tools.some((entry) => entry.name === tool)) fail();
  return Object.freeze({ callId: id, name: tool, arguments: data(record(args)) });
}
export function jsonArguments(value: unknown): unknown {
  const encoded = text(value, 16_000);
  try { return record(JSON.parse(encoded)); } catch { fail(); }
}
export function usage(inputTokens: unknown, outputTokens: unknown): ToshiGenerationOutput["usage"] {
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens) || (inputTokens as number) < 0 || (outputTokens as number) < 0) fail();
  return Object.freeze({ inputTokens: inputTokens as number, outputTokens: outputTokens as number });
}

function validateInput(provider: ToshiProvider, input: ToshiGenerationInput): void {
  record(input, "invalid_input");
  if (input.outputFormat !== undefined && input.outputFormat !== "json_object") fail("invalid_input");
  if (input.maxOutputTokens !== undefined && (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 4096)) fail("invalid_input");
  if (input.outputFormat && (input.tools.length || input.continuation !== undefined || input.toolResults !== undefined)) fail("invalid_input");
  const model = text(input.model, 160, "invalid_input");
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/u.test(model)) throw new ToshiGenerationError("model_unavailable");
  const rejected = provider === "openai" ? /audio|dall-e|embedding|image|moderation|realtime|search|transcri|tts|whisper/iu
    : provider === "gemini" ? /aqa|audio|embedding|image|imagen|live|music|tts|veo/iu : null;
  if (
    (provider === "openai" && !(model.startsWith("gpt-") || /^o\d/u.test(model))) ||
    (provider === "gemini" && !model.startsWith("gemini-")) ||
    (provider === "anthropic" && !model.startsWith("claude-")) ||
    (provider === "deepseek" && !["deepseek-flash", "deepseek-v4-pro"].includes(model)) || rejected?.test(model)
  ) throw new ToshiGenerationError("model_unavailable");
  if (!(input.signal instanceof AbortSignal)) fail("invalid_input");
  if (input.signal.aborted) throw new ToshiGenerationError("provider_timeout");
  if (!text(input.system, 24_000, "invalid_input").trim()) fail("invalid_input");
  let historyLength = 0;
  for (const raw of array(input.history, 20, "invalid_input")) {
    const message = record(raw, "invalid_input");
    if (!["user", "assistant"].includes(message.role as string) || Object.keys(message).some((key) => !["role", "text"].includes(key))) fail("invalid_input");
    historyLength += text(message.text, 12_000, "invalid_input").length;
  }
  if (!input.history.length || historyLength > 24_000) fail("invalid_input");
  const names = new Set<string>();
  for (const raw of array(input.tools, 20, "invalid_input")) {
    const tool = record(raw, "invalid_input");
    const name = text(tool.name, 64, "invalid_input");
    if (!NAME.test(name) || names.has(name) || !text(tool.description, 16_000, "invalid_input").trim()) fail("invalid_input");
    names.add(name);
    const schema = record(tool.parameters, "invalid_input");
    if (schema.type !== "object") fail("invalid_input");
    data(schema, "invalid_input");
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES)) { void response.body?.cancel().catch(() => {}); fail(); }
  if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "")) { void response.body?.cancel().catch(() => {}); fail(); }
  if (!response.body) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => { void reader.cancel().catch(() => {}); reject(new ToshiGenerationError("provider_timeout")); };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) fail();
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); fail(); }
      chunks.push(chunk.value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    try {
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
    } finally { joined.fill(0); }
  } catch (error) {
    if (error instanceof ToshiGenerationError) throw error;
    if (signal.aborted) throw new ToshiGenerationError("provider_timeout");
    fail();
  } finally {
    signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

export async function request(fetcher: ToshiProviderFetch, input: ToshiGenerationInput, url: string, headers: (key: string) => HeadersInit, body: unknown): Promise<Record<string, unknown>> {
  const encoded = JSON.stringify(data(body, input.continuation === undefined ? "invalid_input" : "provider_unavailable"));
  if (ENCODER.encode(encoded).byteLength > MAX_REQUEST_BYTES) fail(input.continuation === undefined ? "invalid_input" : "provider_unavailable");
  try {
    return await withApiKey(input.secret, async (key) => {
      let response: Response;
      try {
        response = await fetcher(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", ...headers(key) }, body: encoded, redirect: "error", cache: "no-store", signal: input.signal });
      } catch {
        throw new ToshiGenerationError(input.signal.aborted ? "provider_timeout" : "provider_unavailable");
      }
      if (!(response instanceof Response) || response.redirected || (response.url && response.url !== url)) fail();
      if (response.status === 401 || response.status === 403) { void response.body?.cancel().catch(() => {}); throw new ToshiGenerationError("credential_invalid"); }
      if (response.status === 402) { void response.body?.cancel().catch(() => {}); throw new ToshiGenerationError("quota_exceeded"); }
      if (response.status === 404) { void response.body?.cancel().catch(() => {}); throw new ToshiGenerationError("model_unavailable"); }
      if (response.status === 429) {
        let code = "";
        try { const result = record(await readJson(response, input.signal)); code = String(record(result.error).code ?? record(result.error).status ?? ""); } catch { /* A malformed upstream error remains a safe rate-limit failure. */ }
        throw new ToshiGenerationError(["insufficient_quota", "quota_exceeded"].includes(code) ? "quota_exceeded" : "rate_limited");
      }
      if (!response.ok) { void response.body?.cancel().catch(() => {}); fail(); }
      const result = record(await readJson(response, input.signal));
      if (JSON.stringify(result).includes(JSON.stringify(key).slice(1, -1))) fail();
      return result;
    });
  } catch (error) {
    if (error instanceof ToshiGenerationError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "credential_invalid") throw new ToshiGenerationError("credential_invalid");
    throw new ToshiGenerationError(input.signal.aborted ? "provider_timeout" : "provider_unavailable");
  }
}

export type ProtocolResult = Readonly<{ text: string; toolCalls: readonly ToshiGenerationToolCall[]; messages: readonly unknown[]; usage?: ToshiGenerationOutput["usage"] }>;
export type Protocol = (input: ToshiGenerationInput, messages: readonly unknown[], results: readonly Readonly<{ callId: string; name: string; result: unknown }>[]) => Promise<ProtocolResult>;
type State = { model: string; binding: string; messages: readonly unknown[]; pending: readonly ToshiGenerationToolCall[]; callIds: ReadonlySet<string> };

export function adapter(provider: ToshiProvider, protocol: Protocol): ToshiGenerationAdapter {
  const continuations = new WeakMap<object, State>();
  return Object.freeze({
    provider,
    async generate(input: ToshiGenerationInput): Promise<ToshiGenerationOutput> {
      validateInput(provider, input);
      const binding = JSON.stringify(data({ system: input.system, history: input.history, tools: input.tools }, "invalid_input"));
      let state: State | undefined;
      let results: readonly Readonly<{ callId: string; name: string; result: unknown }>[] = [];
      if (input.continuation !== undefined) {
        if (typeof input.continuation !== "object" || input.continuation === null) fail("invalid_input");
        state = continuations.get(input.continuation);
        if (!state || state.model !== input.model || state.binding !== binding || state.pending.length === 0) fail("invalid_input");
        results = array(input.toolResults, 6, "invalid_input").map((raw) => {
          const value = record(raw, "invalid_input");
          const callId = text(value.callId, 160, "invalid_input");
          const name = text(value.name, 64, "invalid_input");
          if (!state!.pending.some((pending) => pending.callId === callId && pending.name === name)) fail("invalid_input");
          const result = data(value.result, "invalid_input");
          if (ENCODER.encode(JSON.stringify(result)).byteLength > 16_000) fail("invalid_input");
          return { callId, name, result };
        });
        if (results.length !== state.pending.length || new Set(results.map(({ callId }) => callId)).size !== results.length) fail("invalid_input");
        continuations.delete(input.continuation);
      } else if (input.toolResults !== undefined) fail("invalid_input");
      let output: ProtocolResult;
      try { output = await protocol(input, state?.messages ?? [], results); }
      catch (error) { if (error instanceof ToshiGenerationError) throw error; throw new ToshiGenerationError(input.signal.aborted ? "provider_timeout" : "provider_unavailable"); }
      const content = text(output.text).trim();
      const toolCalls = array(output.toolCalls, 6).map((raw) => { const selected = record(raw); return call(input, selected.callId, selected.name, selected.arguments); });
      if (!content && toolCalls.length === 0) fail("provider_unavailable", input.outputFormat ? "empty" : undefined);
      const ids = new Set(state?.callIds ?? []);
      for (const entry of toolCalls) { if (ids.has(entry.callId)) fail(); ids.add(entry.callId); }
      const continuation = Object.freeze(Object.create(null)) as object;
      continuations.set(continuation, { model: input.model, binding, messages: output.messages, pending: toolCalls, callIds: ids });
      return Object.freeze({ text: content, toolCalls: Object.freeze(toolCalls), continuation, ...(output.usage ? { usage: output.usage } : {}) });
    },
  });
}
