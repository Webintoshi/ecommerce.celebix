import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";
import { adapter, array, call, fail, record, request, text, usage } from "./policy.ts";

export function createAnthropicGenerationAdapter(fetcher: ToshiProviderFetch) {
  return adapter("anthropic", async (input, continuation, results) => {
    const messages = continuation.length ? [...continuation] : input.history.map(({ role, text: content }) => ({ role, content }));
    if (results.length) messages.push({ role: "user", content: results.map(({ callId, result }) => ({ type: "tool_result", tool_use_id: callId, content: JSON.stringify(result) })) });
    const response = await request(fetcher, input, "https://api.anthropic.com/v1/messages", (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }), {
      model: input.model,
      system: input.system,
      messages,
      ...(input.outputFormat ? {} : { tools: input.tools.map(({ name, description, parameters }) => ({ name, description, input_schema: parameters })) }),
      ...(input.outputFormat ? {} : { tool_choice: { type: "auto" } }),
      max_tokens: input.maxOutputTokens ?? 4096,
      stream: false,
    });
    if (input.outputFormat && (response.stop_reason === "max_tokens")) fail("provider_unavailable", "truncated");
    if (response.role !== "assistant" || !["end_turn", "tool_use", "stop_sequence"].includes(response.stop_reason as string)) fail();
    const content = array(response.content);
    const texts: string[] = [];
    const toolCalls = [];
    for (const raw of content) {
      const block = record(raw);
      if (block.type === "text") texts.push(text(block.text));
      else if (block.type === "tool_use") toolCalls.push(call(input, block.id, block.name, block.input));
      else if (!["thinking", "redacted_thinking"].includes(block.type as string)) fail();
    }
    if ((response.stop_reason === "tool_use") !== (toolCalls.length > 0)) fail();
    const measured = response.usage == null ? undefined : record(response.usage);
    return { text: texts.join("\n"), toolCalls, messages: [...messages, { role: "assistant", content }], usage: measured ? usage(measured.input_tokens, measured.output_tokens) : undefined };
  });
}
