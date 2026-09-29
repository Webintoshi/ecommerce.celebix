import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";
import { adapter, array, call, fail, jsonArguments, record, request, text, usage } from "./policy.ts";

export function createOpenAIGenerationAdapter(fetcher: ToshiProviderFetch) {
  return adapter("openai", async (input, continuation, results) => {
    const messages = continuation.length ? [...continuation] : input.history.map(({ role, text: content }) => ({ role, content }));
    messages.push(...results.map(({ callId, result }) => ({ type: "function_call_output", call_id: callId, output: JSON.stringify(result) })));
    const response = await request(fetcher, input, "https://api.openai.com/v1/responses", (key) => ({ authorization: `Bearer ${key}` }), {
      model: input.model,
      instructions: input.system,
      input: messages,
      ...(input.outputFormat ? {} : { tools: input.tools.map(({ name, description, parameters }) => ({ type: "function", name, description, parameters, strict: true })) }),
      parallel_tool_calls: false,
      ...(input.outputFormat ? { text: { format: { type: "json_object" } } } : {}),
      store: false,
      stream: false,
      max_output_tokens: input.maxOutputTokens ?? 4096,
      ...(/^(?:o\d(?:[.-]|$)|gpt-(?:5|6)(?:[.-]|$))/u.test(input.model) && !/-pro(?:[.-]|$)/u.test(input.model) ? { reasoning: { effort: "low" } } : {}),
    });
    if (input.outputFormat && (response.status === "incomplete" && response.incomplete_details != null && record(response.incomplete_details).reason === "max_output_tokens")) fail("provider_unavailable", "truncated");
    if (response.status !== "completed" || response.error != null || response.incomplete_details != null) fail();
    const output = array(response.output);
    const toolCalls = [];
    const texts: string[] = [];
    for (const raw of output) {
      const item = record(raw);
      if (item.type === "function_call") {
        if (item.status !== undefined && item.status !== "completed") fail();
        toolCalls.push(call(input, item.call_id, item.name, jsonArguments(item.arguments)));
      } else if (item.type === "message") {
        if (item.role !== "assistant" || (item.status !== undefined && item.status !== "completed")) fail();
        for (const rawPart of array(item.content)) {
          const part = record(rawPart);
          if (part.type !== "output_text") fail();
          texts.push(text(part.text));
        }
      } else if (item.type !== "reasoning") fail();
    }
    const measured = response.usage == null ? undefined : record(response.usage);
    return { text: texts.join("\n"), toolCalls, messages: [...messages, ...output], usage: measured ? usage(measured.input_tokens, measured.output_tokens) : undefined };
  });
}
