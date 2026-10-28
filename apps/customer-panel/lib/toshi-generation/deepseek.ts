import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";
import { adapter, array, call, fail, jsonArguments, record, request, text, usage } from "./policy.ts";

export function createDeepSeekGenerationAdapter(fetcher: ToshiProviderFetch) {
  return adapter("deepseek", async (input, continuation, results) => {
    const quality = input.authoringProfile === "product_quality";
    const messages = continuation.length ? [...continuation] : [{ role: "system", content: input.system }, ...input.history.map(({ role, text: content }) => ({ role, content }))];
    messages.push(...results.map(({ callId, result }) => ({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) })));
    const response = await request(fetcher, input, "https://api.deepseek.com/chat/completions", (key) => ({ authorization: `Bearer ${key}` }), {
      model: input.model,
      messages,
      ...(input.outputFormat ? {} : { tools: input.tools.map(({ name, description, parameters }) => ({ type: "function", function: { name, description, parameters } })) }),
      thinking: { type: quality ? "enabled" : "disabled" },
      ...(quality ? { reasoning_effort: "low" } : {}),
      max_tokens: input.maxOutputTokens ?? (quality ? 12288 : 4096),
      ...(input.outputFormat ? { response_format: { type: "json_object" } } : {}),
      stream: false,
    });
    const choices = array(response.choices, 1);
    if (choices.length !== 1) fail();
    const choice = record(choices[0]);
    if (input.outputFormat && (choice.finish_reason === "length")) fail("provider_unavailable", "truncated");
    if (!["stop", "tool_calls"].includes(choice.finish_reason as string)) fail();
    const message = record(choice.message);
    if (message.role !== "assistant" || message.refusal != null) fail();
    const toolCalls = message.tool_calls == null ? [] : array(message.tool_calls, 6).map((raw) => {
      const selected = record(raw);
      if (selected.type !== "function") fail();
      const fn = record(selected.function);
      return call(input, selected.id, fn.name, jsonArguments(fn.arguments));
    });
    if ((choice.finish_reason === "tool_calls") !== (toolCalls.length > 0)) fail();
    const measured = response.usage == null ? undefined : record(response.usage);
    const content = message.content == null ? "" : text(message.content, input.authoringProfile === "content_resource" ? 131_072 : 12_000);
    // Quality has no tools or continuation; retain only final assistant content.
    const assistant = quality ? { role: "assistant", content } : message;
    return { text: content, toolCalls, messages: [...messages, assistant], usage: measured ? usage(measured.prompt_tokens, measured.completion_tokens) : undefined };
  });
}
