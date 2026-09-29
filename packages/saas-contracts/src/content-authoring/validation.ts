import { parseProductMeasurements } from '../catalog/validation.ts';
import type { ContentAuthoringRequest, ContentAuthoringProductSnapshot, ContentAuthoringField, ContentAuthoringDraft, ProductFactPacket, ContentAuthoringBlock, ContentAuthoringTextNode, ContentGenerationView } from './types.ts';
function bad(): never { throw new TypeError('content_authoring_contract_invalid'); }
function record(v: unknown, required: string[], optional: string[] = []): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
    bad(); const descriptors = Object.getOwnPropertyDescriptors(v); if (Object.getOwnPropertySymbols(v).length)
    bad(); const out: Record<string, unknown> = {}; for (const [k, d] of Object.entries(descriptors)) {
    if (!('value' in d) || !d.enumerable || !required.concat(optional).includes(k))
        bad();
    out[k] = d.value;
} if (required.some(k => !Object.hasOwn(out, k)))
    bad(); return out; }
function text(v: unknown, max = 1000, min = 0): string { if (typeof v !== 'string' || v.length < min || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))
    bad(); return v; }
function arr(v: unknown, max = 100): unknown[] { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > max || Object.getOwnPropertySymbols(v).length)
    bad(); const d = Object.getOwnPropertyDescriptors(v); if (Object.keys(d).length !== v.length + 1)
    bad(); const out: unknown[] = []; for (let i = 0; i < v.length; i++) {
    const entry = d[String(i)];
    if (!entry || !('value' in entry) || !entry.enumerable)
        bad();
    out.push(entry.value);
} return out; }
function uuid(v: unknown): string { const s = text(v, 36, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))
    bad(); return s; }
function choice<T extends string>(v: unknown, values: readonly T[]): T { if (!values.includes(v as T))
    bad(); return v as T; }
const fields = ['description', 'seoTitle', 'seoDescription'] as const;
function attributes(v: unknown) { const result = arr(v, 32).map(a => { const r = record(a, ['attributeId', 'value']); return { attributeId: uuid(r.attributeId), value: text(r.value, 256, 1) }; }); if (new Set(result.map(a => a.attributeId)).size !== result.length)
    bad(); return result; }
export function parseContentAuthoringProductSnapshot(v: unknown): ContentAuthoringProductSnapshot { const r = record(v, ['title'], ['description', 'seoTitle', 'seoDescription', 'categoryIds', 'brandId', 'attributes', 'variants', 'measurements']); const out: Record<string, unknown> = { title: text(r.title, 200, 1).trim() }; if (!out.title)
    bad(); for (const f of fields)
    if (Object.hasOwn(r, f))
        out[f] = r[f] === null ? null : text(r[f], f === 'description' ? 10000 : f === 'seoTitle' ? 200 : 500); if (Object.hasOwn(r, 'brandId'))
    out.brandId = r.brandId === null || r.brandId === '' ? r.brandId : uuid(r.brandId); if (Object.hasOwn(r, 'categoryIds')) {
    const ids = arr(r.categoryIds, 8).map(uuid);
    if (new Set(ids).size !== ids.length)
        bad();
    out.categoryIds = ids;
} if (Object.hasOwn(r, 'attributes'))
    out.attributes = attributes(r.attributes); if (Object.hasOwn(r, 'measurements'))
    out.measurements = r.measurements === null ? null : parseProductMeasurements(r.measurements); if (Object.hasOwn(r, 'variants'))
    out.variants = arr(r.variants).map(v => { const x = record(v, ['title'], ['id', 'attributes', 'measurements']); return { title: text(x.title, 200, 1), ...(Object.hasOwn(x, 'id') ? { id: uuid(x.id) } : {}), ...(Object.hasOwn(x, 'attributes') ? { attributes: attributes(x.attributes) } : {}), ...(Object.hasOwn(x, 'measurements') ? { measurements: x.measurements === null ? null : parseProductMeasurements(x.measurements) } : {}) }; }); return out as unknown as ContentAuthoringProductSnapshot; }
export function parseContentAuthoringRequest(v: unknown): ContentAuthoringRequest { const r = record(v, ['draftId', 'productId', 'productVersion', 'profileVersion', 'currentDraft', 'action', 'fields', 'locale', 'tone', 'length', 'note', 'selection']); const versions = (v: unknown) => { if (v === null)
    return null; if (!Number.isSafeInteger(v) || (v as number) < 1)
    bad(); return v as number; }; const fs = arr(r.fields, 3).map(f => choice(f, fields)); if (!fs.length || new Set(fs).size !== fs.length)
    bad(); const action = choice(r.action, ['create', 'improve', 'shorten', 'rewrite_selection'] as const); let selection = null; if (r.selection !== null) {
    const s = record(r.selection, ['field', 'text']);
    selection = { field: choice(s.field, fields), text: text(s.text, 10000, 1) };
    if (!fs.includes(selection.field))
        bad();
} if ((action === 'rewrite_selection') !== (selection !== null))
    bad(); const locale = text(r.locale, 35, 2); if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale))
    bad(); const productId = r.productId === null ? null : uuid(r.productId); const productVersion = versions(r.productVersion), profileVersion = versions(r.profileVersion); if (productId === null && (productVersion !== null || profileVersion !== null))
    bad(); return { draftId: uuid(r.draftId), productId, productVersion, profileVersion, currentDraft: parseContentAuthoringProductSnapshot(r.currentDraft), action, fields: fs, locale, tone: choice(r.tone, ['neutral', 'friendly', 'professional']), length: choice(r.length, ['short', 'medium', 'long']), note: text(r.note, 2000), selection }; }
/** Canonical JSON distinguishes absent, empty and null; integer milli measurements never float-convert. */
export function canonicalContentAuthoringValue(v: unknown): string { if (Array.isArray(v))
    return '[' + v.map(canonicalContentAuthoringValue).join(',') + ']'; if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalContentAuthoringValue((v as Record<string, unknown>)[k])).join(',') + '}'; return JSON.stringify(v); }
function parseDraft(v: unknown, fingerprint: string, selected: readonly ContentAuthoringField[], packet?: ProductFactPacket): ContentAuthoringDraft {
    const r = record(v, ['suggestions', 'claims', 'sourceFingerprint'], [...selected]);
    if (r.sourceFingerprint !== fingerprint || selected.some(f => !Object.hasOwn(r, f)))
        bad();
    let count = 0;
    function support(ref: unknown, value: unknown, unit: unknown) { text(ref,200,1);text(value,1000,1);if(unit!==undefined)text(unit,20,1);if(!packet)return; const fact = packet.facts.find(f => f.ref === ref); if (!fact || fact.value !== value || fact.unit !== unit)
        bad(); return fact; }
    function nodes(v: unknown): ContentAuthoringTextNode[] { return arr(v, 100).map(n => { if (++count > 1000)
        bad(); const kind = (n as {
        type?: unknown;
    })?.type; if (kind === 'text') {
        const x = record(n, ['type', 'text']);
        return { type: 'text', text: text(x.text, 10000, 1) };
    } const x = record(n, ['type', 'factRef', 'value'], ['unit']); if (x.type !== 'fact')
        bad(); support(x.factRef, x.value, x.unit); return { type: 'fact', factRef: text(x.factRef, 200, 1), value: text(x.value, 1000, 1), ...(x.unit === undefined ? {} : { unit: text(x.unit, 20, 1) }) }; }); }
    const out: Record<string, unknown> = { sourceFingerprint: fingerprint, suggestions: arr(r.suggestions, 5).map(s => text(s, 300, 1)), claims: arr(r.claims, 100).map(c => { const x = record(c, ['field', 'factRef', 'value'], ['unit']); choice(x.field, selected); support(x.factRef, x.value, x.unit); return x; }) };
    if (Object.hasOwn(r, 'description'))
        out.description = arr(r.description, 100).map(b => { const kind = (b as {
            type?: unknown;
        })?.type; if (kind === 'paragraph') {
            const x = record(b, ['type', 'children']);
            return { type: 'paragraph', children: nodes(x.children) };
        } if (kind === 'heading') {
            const x = record(b, ['type', 'level', 'children']);
            if (![2, 3, 4].includes(x.level as number))
                bad();
            return { type: 'heading', level: x.level, children: nodes(x.children) };
        } if (kind === 'list') {
            const x = record(b, ['type', 'ordered', 'items']);
            if (typeof x.ordered !== 'boolean')
                bad();
            return { type: 'list', ordered: x.ordered, items: arr(x.items, 100).map(nodes) };
        } const x = record(b, ['type', 'rows']); if (x.type !== 'table')
            bad(); return { type: 'table', rows: arr(x.rows, 50).map(row => arr(row, 20).map(nodes)) }; }) as ContentAuthoringBlock[];
    for (const f of ['seoTitle', 'seoDescription'] as const)
        if (Object.hasOwn(r, f)) {
            const s = text(r[f], f === 'seoTitle' ? 200 : 500, 1);
            if (/[<>\r\n]/.test(s))
                bad();
            out[f] = s;
        }
    if (JSON.stringify(out.description ?? '').length > 20000)
        bad();
    return out as unknown as ContentAuthoringDraft;
}

export function validateProductDraftOutput(v: unknown, packet: ProductFactPacket, selected: readonly ContentAuthoringField[]): ContentAuthoringDraft {
 return parseDraft(v,packet.sourceFingerprint,selected,packet);
}
function fingerprint(v:unknown):string {const s=text(v,64,64);if(!/^[a-f0-9]{64}$/.test(s))bad();return s;}
function timestamp(v:unknown):string {const s=text(v,24,24);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s))bad();const date=new Date(s);if(!Number.isFinite(date.getTime())||date.toISOString()!==s)bad();return s;}
export function parseContentGenerationView(v:unknown):ContentGenerationView {
 const r=record(v,['id','draftId','productId','status','draft','sourceFingerprint','usage','safeCode','createdAt','updatedAt','finishedAt']);
 const status=choice(r.status,['pending','completed','failed','unknown'] as const);
 const sourceFingerprint=fingerprint(r.sourceFingerprint),createdAt=timestamp(r.createdAt),updatedAt=timestamp(r.updatedAt),finishedAt=r.finishedAt===null?null:timestamp(r.finishedAt);
 if(updatedAt<createdAt||(finishedAt!==null&&(finishedAt<createdAt||finishedAt>updatedAt)))bad();
 if((status==='pending')!==(finishedAt===null)||(status==='completed')!==(r.draft!==null))bad();
 let draft:ContentAuthoringDraft|null=null;
 if(r.draft!==null){const d=record(r.draft,['suggestions','claims','sourceFingerprint'],[...fields]);const selected=fields.filter(f=>Object.hasOwn(d,f));if(!selected.length)bad();draft=parseDraft(r.draft,sourceFingerprint,selected);}
 let usage:ContentGenerationView['usage']=null;
 if(r.usage!==null){const u=record(r.usage,['inputTokens','outputTokens','totalTokens']);const tokens=(n:unknown)=>{if(!Number.isSafeInteger(n)||(n as number)<0||(n as number)>2147483647)bad();return n as number;};usage={inputTokens:tokens(u.inputTokens),outputTokens:tokens(u.outputTokens),totalTokens:tokens(u.totalTokens)};if(usage.inputTokens+usage.outputTokens!==usage.totalTokens)bad();}
 const safeCode=r.safeCode===null?null:text(r.safeCode,100,1);if(safeCode!==null&&!/^[a-z][a-z0-9_]*$/.test(safeCode))bad();if((status==='pending'||status==='completed')&&safeCode!==null)bad();
 return {id:uuid(r.id),draftId:uuid(r.draftId),productId:r.productId===null?null:uuid(r.productId),status,draft,sourceFingerprint,usage,safeCode,createdAt,updatedAt,finishedAt};
}
