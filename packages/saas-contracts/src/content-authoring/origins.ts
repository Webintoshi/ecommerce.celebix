import type { ContentAuthoringField, ContentAuthoringFieldOriginsInput } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function object(value: unknown): Record<string, unknown> {
  if (
    !value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) throw new TypeError("invalid_content_origins");
  return value as Record<string, unknown>;
}

/** Accept only references to generated fields. Authority and content hashes never come from a caller. */
export function parseContentAuthoringFieldOrigins(
  value: unknown,
  fields: readonly ContentAuthoringField[] = ["description", "seoTitle", "seoDescription"],
): ContentAuthoringFieldOriginsInput {
  const parsed = object(value);
  return Object.freeze(Object.fromEntries(Object.entries(parsed).map(([field, ref]) => {
    if (!fields.includes(field as ContentAuthoringField)) throw new TypeError("invalid_content_origins");
    if (ref === null) return [field, null];
    const origin = object(ref);
    if (
      Object.keys(origin).sort().join(",") !== "draftId,generationId"
      || typeof origin.generationId !== "string" || !UUID.test(origin.generationId)
      || typeof origin.draftId !== "string" || !UUID.test(origin.draftId)
    ) throw new TypeError("invalid_content_origins");
    return [field, Object.freeze({ generationId: origin.generationId, draftId: origin.draftId })];
  })));
}
