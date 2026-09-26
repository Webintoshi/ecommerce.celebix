import { TOSHI_PROVIDERS, type ToshiProvider } from "./providers.ts";

export type ToshiSource = Readonly<{ label: string; href: string }>;
export type ToshiMessage = Readonly<{ id: string; role: "user" | "assistant"; text: string; sources: readonly ToshiSource[]; createdAt: string }>;
export type ToshiConversationSummary = Readonly<{ id: string; title: string; provider: ToshiProvider; model: string; version: number; createdAt: string; updatedAt: string }>;
export type ToshiConversation = ToshiConversationSummary & Readonly<{ messages: readonly ToshiMessage[] }>;
export type ToshiConversationListResponse = Readonly<{ conversations: readonly ToshiConversationSummary[]; defaultProvider: Readonly<{ provider: ToshiProvider; model: string }> | null }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const SIMPLE_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const SUMMARY_KEYS = ["id", "title", "provider", "model", "version", "createdAt", "updatedAt"];
function invalid(): never { throw new TypeError("toshi_conversation_contract_invalid"); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key))) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !d.enumerable || !("value" in d)) invalid();
    result[key] = d.value;
  }
  return result;
}
function dense(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  return Array.from({ length }, (_, i) => {
    const d = descriptors[String(i)];
    if (!d || !d.enumerable || !("value" in d)) invalid();
    return d.value as unknown;
  });
}
function text(value: unknown, maximum: number, multiline = false): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || (multiline ? CONTROL : SIMPLE_CONTROL).test(value) || new TextEncoder().encode(value).byteLength > maximum * 4) invalid();
  return value;
}
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function timestamp(value: unknown): string { const v = text(value, 32); const d = new Date(v); if (!Number.isFinite(d.getTime()) || d.toISOString() !== v) invalid(); return v; }
function provider(value: unknown): ToshiProvider { if (!TOSHI_PROVIDERS.includes(value as never)) invalid(); return value as ToshiProvider; }
export function parseToshiSource(value: unknown): ToshiSource {
  const p = exact(value, ["label", "href"]), href = text(p.href, 240);
  if (!/^\/(?:products|orders|customers|analytics|settings|marketing|discounts|promotions|content|seo|inventory|pricing|toshi|dashboard)(?:\/[A-Za-z0-9_-]+)*\/?$/.test(href) && href !== "/") invalid();
  return Object.freeze({ label: text(p.label, 120), href });
}
export function parseToshiMessage(value: unknown): ToshiMessage {
  const p = exact(value, ["id", "role", "text", "sources", "createdAt"]);
  if (p.role !== "user" && p.role !== "assistant") invalid();
  const sources = dense(p.sources, 12).map(parseToshiSource);
  if (new Set(sources.map((s) => s.href)).size !== sources.length || (p.role === "user" && sources.length !== 0)) invalid();
  return Object.freeze({ id: uuid(p.id), role: p.role, text: text(p.text, p.role === "user" ? 4000 : 12000, true), sources: Object.freeze(sources), createdAt: timestamp(p.createdAt) });
}
export function parseToshiConversationSummary(value: unknown): ToshiConversationSummary {
  const p = exact(value, SUMMARY_KEYS), createdAt = timestamp(p.createdAt), updatedAt = timestamp(p.updatedAt);
  if (!Number.isSafeInteger(p.version) || (p.version as number) < 0 || (p.version as number) > 100 || updatedAt < createdAt) invalid();
  return Object.freeze({ id: uuid(p.id), title: text(p.title, 80), provider: provider(p.provider), model: text(p.model, 160), version: p.version as number, createdAt, updatedAt });
}
export function parseToshiConversation(value: unknown): ToshiConversation {
  const p = exact(value, [...SUMMARY_KEYS, "messages"]);
  const summary = parseToshiConversationSummary(Object.fromEntries(SUMMARY_KEYS.map((k) => [k, p[k]])));
  const messages = dense(p.messages, 40).map(parseToshiMessage);
  if (new Set(messages.map((m) => m.id)).size !== messages.length || messages.some((m, i) => m.createdAt < summary.createdAt || m.createdAt > summary.updatedAt || (i > 0 && m.createdAt < messages[i - 1]!.createdAt))) invalid();
  return Object.freeze({ ...summary, messages: Object.freeze(messages) });
}
export function parseToshiConversationListResponse(value: unknown): ToshiConversationListResponse {
  const p = exact(value, ["conversations", "defaultProvider"]), conversations = dense(p.conversations, 20).map(parseToshiConversationSummary);
  if (new Set(conversations.map((c) => c.id)).size !== conversations.length) invalid();
  const selected = p.defaultProvider === null ? null : exact(p.defaultProvider, ["provider", "model"]);
  const defaultProvider = selected === null ? null : Object.freeze({ provider: provider(selected.provider), model: text(selected.model, 160) });
  return Object.freeze({ conversations: Object.freeze(conversations), defaultProvider });
}
