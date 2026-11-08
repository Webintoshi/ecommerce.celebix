const STAGES = ['output', 'json_syntax', 'contract', 'fingerprint', 'markdown_text', 'markup', 'suggestions', 'render', 'usage'] as const;
export type PolicyValidationStage = typeof STAGES[number];
export type PolicyValidationDiagnostic = Readonly<{
  event: 'toshi_policy_validation_failed';
  stage: PolicyValidationStage;
  counts: Readonly<{ outputBytes: number | null; markdownBytes: number | null; bodyWords: number | null; h2Count: number | null }>;
}>;
export type PolicyValidationDiagnosticSink = (event: PolicyValidationDiagnostic) => void | Promise<void>;
const bounded = (value: number) => Math.min(value, 1_000_000);
const bytes = (value: unknown) => typeof value === 'string' ? bounded(Buffer.byteLength(value, 'utf8')) : null;

export function reportPolicyValidationFailure(stage: PolicyValidationStage, output: unknown, markdown: unknown, sink: PolicyValidationDiagnosticSink = event => console.warn('[toshi-policy-validation]', event)): void {
  try {
    if (!STAGES.includes(stage)) return;
    const measurable = typeof markdown === 'string' && markdown.length <= 1_000_000;
    const counts = Object.freeze({
      outputBytes: bytes(output), markdownBytes: bytes(markdown),
      bodyWords: measurable ? bounded((markdown.match(/[\p{L}\p{N}]+/gu) ?? []).length) : null,
      h2Count: measurable ? bounded((markdown.match(/^##\s+\S/gmu) ?? []).length) : null,
    });
    const pending = sink(Object.freeze({ event: 'toshi_policy_validation_failed', stage, counts }));
    if (pending) void pending.catch(() => {});
  } catch { /* Diagnostics cannot change policy generation or credit settlement. */ }
}
