import { NativeMarketingError, type NativeMarketingBlock, type NativeMarketingBlockContent, type NativeMarketingContent, type NativeMarketingLegacyContent } from './types.ts';
export type { NativeMarketingBlock, NativeMarketingBlockContent, NativeMarketingContent, NativeMarketingLegacyContent, NativeMarketingTemplate } from './types.ts';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const LEGACY_KEYS = ['subject', 'heading', 'body', 'buttonLabel', 'buttonPath'];
function invalid(): never { throw new NativeMarketingError('invalid_input'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, keys: readonly string[]): void { if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid(); }
function string(value: unknown, max: number, draft: boolean, visible = true, legacy = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (!legacy && /[\u0080-\u009f]/u.test(value)) || (!draft && visible && !value.trim())) invalid();
  return value;
}
function path(value: unknown, draft: boolean, optional = false, legacy = false): string {
  if (typeof value !== 'string' || value.length > 500) invalid();
  if (draft) { if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) invalid(); return value; }
  if (value === '' && optional) return value;
  if ((!legacy && /%(?:2f|5c|0[ad])/iu.test(value)) || !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/u.test(value) || (!legacy && /[\u0080-\u009f]/u.test(value))) invalid();
  let parsed: URL; try { parsed = new URL(value, 'https://native.invalid'); } catch { return invalid(); }
  if (parsed.origin !== 'https://native.invalid') invalid();
  return value;
}
function uuid(value: unknown, draft = false): string { if (draft && value === '') return ''; if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value; }
function oneOf<T extends string | number>(value: unknown, options: readonly T[]): T { if (!options.includes(value as T)) invalid(); return value as T; }
function color(value: unknown): string { if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(value)) invalid(); return value; }
function block(value: unknown, draft: boolean): NativeMarketingBlock {
  const b = object(value), id = uuid(b.id);
  const shape = (fields: readonly string[]) => exact(b, ['id', 'type', ...fields]);
  const align = () => oneOf(b.align, ['left', 'center', 'right'] as const);
  switch (b.type) {
    case 'heading': shape(['text', 'align', 'color', 'size']); return Object.freeze({ id, type: b.type, text: string(b.text, 160, draft), align: align(), color: color(b.color), size: oneOf(b.size, ['small', 'medium', 'large'] as const) });
    case 'text': shape(['text', 'align', 'color']); return Object.freeze({ id, type: b.type, text: string(b.text, 4000, draft), align: align(), color: color(b.color) });
    case 'image': shape(['assetId', 'alt', 'linkPath']); return Object.freeze({ id, type: b.type, assetId: uuid(b.assetId, draft), alt: string(b.alt, 200, draft, false), linkPath: path(b.linkPath, draft, true) });
    case 'image_text': shape(['assetId', 'alt', 'heading', 'text', 'buttonLabel', 'buttonPath', 'imagePosition']); return Object.freeze({ id, type: b.type, assetId: uuid(b.assetId, draft), alt: string(b.alt, 200, draft, false), heading: string(b.heading, 160, draft), text: string(b.text, 2000, draft), buttonLabel: string(b.buttonLabel, 80, draft), buttonPath: path(b.buttonPath, draft), imagePosition: oneOf(b.imagePosition, ['left', 'right'] as const) });
    case 'products': {
      shape(['productIds', 'columns']);
      if (!Array.isArray(b.productIds) || b.productIds.length > 8 || (!draft && b.productIds.length === 0)) invalid();
      const productIds = b.productIds.map(value => uuid(value));
      if (new Set(productIds).size !== productIds.length) invalid();
      return Object.freeze({ id, type: b.type, productIds: Object.freeze(productIds), columns: oneOf(b.columns, [1, 2] as const) });
    }
    case 'button': shape(['label', 'path', 'color', 'align']); return Object.freeze({ id, type: b.type, label: string(b.label, 80, draft), path: path(b.path, draft), color: color(b.color), align: align() });
    case 'banner': shape(['heading', 'text', 'backgroundColor', 'textColor']); return Object.freeze({ id, type: b.type, heading: string(b.heading, 160, draft), text: string(b.text, 2000, draft), backgroundColor: color(b.backgroundColor), textColor: color(b.textColor) });
    case 'divider': shape(['color']); return Object.freeze({ id, type: b.type, color: color(b.color) });
    case 'spacer': shape(['height']); return Object.freeze({ id, type: b.type, height: oneOf(b.height, [8, 16, 24, 32] as const) });
    default: return invalid();
  }
}
function parse(value: unknown, draft: boolean): NativeMarketingContent {
  const r = object(value), v2 = Object.hasOwn(r, 'schemaVersion');
  exact(r, v2 ? [...LEGACY_KEYS, 'schemaVersion', 'blocks'] : LEGACY_KEYS);
  if (v2 && r.schemaVersion !== 2) invalid();
  // V1 preserves the existing field/control policy, including meaningful whitespace.
  const legacyString = (v: unknown, max: number) => { const s = string(v, max, true, true, true); if (!draft && !s.length) invalid(); return s; };
  const subject = legacyString(r.subject, 200); if (/[\r\n]/u.test(subject)) invalid();
  const content: NativeMarketingLegacyContent = { subject, heading: legacyString(r.heading, 160), body: legacyString(r.body, 4000), buttonLabel: legacyString(r.buttonLabel, 80), buttonPath: path(r.buttonPath, draft, false, true) };
  if (!v2) return Object.freeze(content);
  if (!Array.isArray(r.blocks) || r.blocks.length > 20 || (!draft && r.blocks.length === 0)) invalid();
  const blocks = Object.freeze(r.blocks.map(value => block(value, draft)));
  if (new Set(blocks.map(b => b.id)).size !== blocks.length) invalid();
  const result = Object.freeze({ ...content, schemaVersion: 2 as const, blocks });
  if (nativeMarketingProductIds(result).length > 8 || new TextEncoder().encode(JSON.stringify(result)).byteLength > 12288) invalid();
  return result;
}
export function parseNativeMarketingContent(value: unknown): NativeMarketingContent { return parse(value, false); }
export function parseNativeMarketingDraftContent(value: unknown): NativeMarketingContent { return parse(value, true); }
export function isNativeMarketingBlockContent(content: NativeMarketingContent): content is NativeMarketingBlockContent { return 'schemaVersion' in content && content.schemaVersion === 2; }
export function nativeMarketingProductIds(content: NativeMarketingContent): readonly string[] { return Object.freeze(isNativeMarketingBlockContent(content) ? [...new Set(content.blocks.flatMap(b => b.type === 'products' ? b.productIds : []))] : []); }
export function legacyNativeMarketingBlocks(content: NativeMarketingLegacyContent, id: () => string): NativeMarketingBlock[] {
  return [
    { id: id(), type: 'heading', text: content.heading, align: 'left', color: '#292524', size: 'large' },
    { id: id(), type: 'text', text: content.body, align: 'left', color: '#292524' },
    { id: id(), type: 'button', label: content.buttonLabel, path: content.buttonPath, color: '#292524', align: 'left' },
  ];
}
