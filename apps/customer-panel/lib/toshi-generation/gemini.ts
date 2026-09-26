import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";
import { adapter, array, call, fail, record, request, text, usage } from "./policy.ts";

export function createGeminiGenerationAdapter(fetcher: ToshiProviderFetch) {
  return adapter("gemini", async (input, continuation, results) => {
    const contents = continuation.length ? [...continuation] : input.history.map(({ role, text }) => ({ role: role === "assistant" ? "model" : "user", parts: [{ text }] }));
    if (results.length) {
      const previousParts = array(record(continuation.at(-1)).parts);
      const providerIds = new Set(previousParts.flatMap((raw) => {
        const part = record(raw);
        if (part.functionCall === undefined) return [];
        const id = record(part.functionCall).id;
        return typeof id === "string" ? [id] : [];
      }));
      contents.push({ role: "user", parts: results.map(({ callId, name, result }) => ({ functionResponse: { ...(providerIds.has(callId) ? { id: callId } : {}), name, response: result } })) });
    }
    const response = await request(fetcher, input, `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`, (key) => ({ "x-goog-api-key": key }), {
      systemInstruction: { parts: [{ text: input.system }] },
      contents,
      tools: [{ functionDeclarations: input.tools.map(({ name, description, parameters }) => ({ name, description, parametersJsonSchema: parameters })) }],
      generationConfig: { candidateCount: 1, maxOutputTokens: 4096, ...(/^gemini-2\.5-flash/u.test(input.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    });
    if (response.promptFeedback != null && record(response.promptFeedback).blockReason != null) fail();
    const candidates = array(response.candidates, 1);
    if (candidates.length !== 1) fail();
    const candidate = record(candidates[0]);
    if (candidate.finishReason !== "STOP") fail();
    const content = record(candidate.content);
    if (content.role !== "model") fail();
    const texts: string[] = [];
    const toolCalls = [];
    for (const raw of array(content.parts)) {
      const part = record(raw);
      if (part.functionCall !== undefined) {
        const fn = record(part.functionCall);
        toolCalls.push(call(input, fn.id ?? `gemini_call_${continuation.length}_${toolCalls.length}`, fn.name, fn.args ?? {}));
      } else if (part.text !== undefined) {
        if (part.thought !== true) texts.push(text(part.text));
      } else fail();
    }
    const measured = response.usageMetadata == null ? undefined : record(response.usageMetadata);
    const thoughtTokens = measured?.thoughtsTokenCount ?? 0;
    if (!Number.isSafeInteger(thoughtTokens) || (thoughtTokens as number) < 0) fail();
    return { text: texts.join("\n"), toolCalls, messages: [...contents, content], usage: measured ? usage(measured.promptTokenCount, typeof measured.candidatesTokenCount === "number" ? measured.candidatesTokenCount + (thoughtTokens as number) : measured.candidatesTokenCount) : undefined };
  });
}
