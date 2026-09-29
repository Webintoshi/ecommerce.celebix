import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMerchantAdminRecord } from '../merchant-admin/index.ts';
import { acceptedMerchantContentHrefs, rejectedMerchantContentHrefs } from './href-vectors.fixture.ts';
const api = await import('./index.ts') as Record<string, (value: unknown) => any>;
function parse(name: string, value: unknown) { assert.equal(typeof api[name], 'function', `${name} is required`); return api[name]!(value); }
const id = '11111111-1111-4111-8111-111111111111', generationId = '22222222-2222-4222-8222-222222222222', digest = `sha256:${'a'.repeat(64)}`, time = '2026-09-29T12:00:00.000Z';
const values = () => ({ name: 'Örnek içerik', slug: 'ornek-icerik', locale: 'tr-TR', body: '<p>İçerik 😀</p>', excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' });
const request = () => ({ draftId: id, recordId: null, expectedVersion: null, expectedBodyDigest: null, kind: 'blog_post', bodyAction: 'replace', values: values(), origins: {} });
const document = () => ({ ...values(), id, kind: 'page', version: 1, publishedAt: null, createdAt: time, updatedAt: time, bodyFormat: 'normalized_html', bodyDigest: digest, origins: {} });
test('typed normalized body applies the portable href vectors on write and read', () => {
    const canonical = (href: string) => `<a href="${href}"${/^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>link</a>`;
    for (const href of acceptedMerchantContentHrefs) {
        const body = canonical(href);
        assert.equal(parse('parseSaveMerchantContentRequest', { ...request(), values: { ...values(), body } }).values.body, body, href);
        assert.equal(parse('parseMerchantContentDocument', { ...document(), body }).body, body, href);
    }
    for (const href of rejectedMerchantContentHrefs) {
        const body = canonical(href);
        assert.throws(() => parse('parseSaveMerchantContentRequest', { ...request(), values: { ...values(), body } }), { message: 'merchant_content_contract_invalid' }, href);
        assert.throws(() => parse('parseMerchantContentDocument', { ...document(), body }), { message: 'merchant_content_contract_invalid' }, href);
    }
});
test('full snapshot retains explicit empty body and nullable clears, deeply frozen', () => { const input = request(); input.values.body = ''; const out = parse('parseSaveMerchantContentRequest', input); assert.equal(out.values.body, ''); assert.equal(out.values.excerpt, null); assert.ok(Object.isFrozen(out)); assert.ok(Object.isFrozen(out.values)); assert.ok(Object.isFrozen(out.origins)); });
test('legacy generic tag-shaped metadata remains literal on read but cannot be newly typed', () => {
    const name = '<b>Heading</b>', excerpt = '<b>Excerpt</b>';
    const read = parse('parseMerchantContentDocument', { ...document(), name, excerpt });
    assert.equal(read.name, name);
    assert.equal(read.excerpt, excerpt);
    assert.throws(() => parse('parseSaveMerchantContentRequest', { ...request(), values: { ...values(), name, excerpt } }), { message: 'merchant_content_contract_invalid' });
});
test('normalized Turkish/emoji exact80000 UTF8 bytes passes and80001 fails', () => { const body = '<p>' + ('ı😀'.repeat(13332)) + 'a</p>'; assert.equal(new TextEncoder().encode(body).length, 80000); const input = request(); input.values.body = body; assert.equal(parse('parseSaveMerchantContentRequest', input).values.body, body); input.values.body = body.replace('</p>', 'a</p>'); assert.throws(() => parse('parseSaveMerchantContentRequest', input)); });
test('canonical safe headings, lists, tables and LF/CR remain exact', () => { const input = request(); input.values.body = '<h2>Başlık</h2>\n<h3>Alt</h3>\r<h4>Detay</h4><ul><li><p>Bir <strong>özellik</strong></p></li></ul><table><thead><tr><th><p>Ad</p></th></tr></thead><tbody><tr><td>😀<br /></td></tr></tbody></table>'; assert.equal(parse('parseSaveMerchantContentRequest', input).values.body, input.values.body); });
test('unsafe, noncanonical or structurally broken replacement bodies fail', () => { for (const body of ['plain source', '<script>x</script>', '<p onclick="x">a</p>', '<p style="color:red">a</p>', '<a href="javascript:x">x</a>', '<a href="//evil.test">x</a>', '<p>&#x3c;script&#x3e;</p>', '<p>a', '<p><table><tr><td>x</td></tr></table></p>', '<table><td>x</td></table>']) {
    const input = request();
    input.values.body = body;
    assert.throws(() => parse('parseSaveMerchantContentRequest', input), body);
} });
test('new/existing ID-version-digest tuples and preserve guard are inseparable', () => { for (const change of [{ expectedVersion: 1 }, { recordId: id }, { expectedBodyDigest: digest }, { bodyAction: 'preserve' }])
    assert.throws(() => parse('parseSaveMerchantContentRequest', { ...request(), ...change })); const existing = { ...request(), recordId: id, expectedVersion: 2, expectedBodyDigest: digest, bodyAction: 'preserve', values: { ...values(), body: '<div data-old="1">Legacy\r\nsource</div>' } }; assert.equal(parse('parseSaveMerchantContentRequest', existing).values.body, existing.values.body); for (const expectedBodyDigest of [undefined, null, 'a'.repeat(64), 'sha256:ABC'])
    assert.throws(() => parse('parseSaveMerchantContentRequest', { ...existing, expectedBodyDigest })); });
test('required bodyDigest/format in documents rejects omission, wrong shape and unsafe normalized reads', () => { const input = document(); assert.equal(parse('parseMerchantContentDocument', input).bodyDigest, digest); for (const bodyDigest of [undefined, null, 'SHA256:' + 'a'.repeat(64), 'sha256:' + 'A'.repeat(64)])
    assert.throws(() => parse('parseMerchantContentDocument', { ...input, bodyDigest })); assert.throws(() => parse('parseMerchantContentDocument', { ...input, body: '<script>x</script>' })); });
test('legacy documents preserve exact source bytes and archived publication metadata', () => { const body = '  Legacy\r\n<div class="old">Text & words</div>  '; const out = parse('parseMerchantContentDocument', { ...document(), body, bodyFormat: 'legacy', status: 'archived', published: true }); assert.equal(out.body, body); assert.equal(out.bodyFormat, 'legacy'); assert.equal(out.published, true); });
test('typed plain metadata fits generic record text rules while body retains line breaks', () => {
    const body = '<pre>satır 1\nsatır 2\rsatır 3</pre>';
    const compatible = { name: 'İçerik başlığı', excerpt: 'A\u00a0B', seoTitle: 'SEO başlığı', seoDescription: 'Açıklama metni' };
    const valuesInput = { ...values(), ...compatible, body };
    assert.equal(parse('parseSaveMerchantContentRequest', { ...request(), values: valuesInput }).values.body, body);
    assert.equal(parse('parseMerchantContentDocument', { ...document(), ...valuesInput }).body, body);
    assert.equal(parseMerchantAdminRecord({ id, kind: 'blog_post', name: compatible.name, config: { excerpt: compatible.excerpt, seoTitle: compatible.seoTitle, seoDescription: compatible.seoDescription }, status: 'draft', version: 1, createdAt: time, updatedAt: time }).config.excerpt, compatible.excerpt);
    for (const field of ['name', 'excerpt', 'seoTitle', 'seoDescription'] as const) {
        for (const bad of ['a\nb', 'a\rb', 'a\tb', 'a\u0080b', ' leading', 'trailing ', '\u00a0edge', 'edge\u3000', '\ufeffedge']) {
            const invalidValues = { ...valuesInput, [field]: bad };
            assert.throws(() => parse('parseSaveMerchantContentRequest', { ...request(), values: invalidValues }), { message: 'merchant_content_contract_invalid' }, `${field}:${JSON.stringify(bad)}`);
            assert.throws(() => parse('parseMerchantContentDocument', { ...document(), ...invalidValues }), { message: 'merchant_content_contract_invalid' }, `${field}:${JSON.stringify(bad)}`);
        }
    }
});
test('origins strictly retain manual/AI lineage without invoking getters or accepting hidden fields', () => { const out = parse('parseMerchantContentOrigins', { body: { generationId, state: 'edited_ai' }, name: { state: 'manual' } }); assert.deepEqual(out, { body: { generationId, state: 'edited_ai' }, name: { state: 'manual' } }); assert.ok(Object.isFrozen(out.body)); let invoked = 0; const getter = {}; Object.defineProperty(getter, 'body', { enumerable: true, get() { invoked++; return { state: 'manual' }; } }); assert.throws(() => parse('parseMerchantContentOrigins', getter)); const hidden = {}; Object.defineProperty(hidden, 'unknown', { value: { state: 'manual' }, enumerable: false }); assert.throws(() => parse('parseMerchantContentOrigins', hidden)); assert.equal(invoked, 0); for (const bad of [{ body: { state: 'manual', generationId } }, { body: { state: 'ai' } }, { slug: { state: 'manual' } }, { body: { state: 'manual', [Symbol('x')]: 1 } }, Object.create({ body: { state: 'manual' } })])
    assert.throws(() => parse('parseMerchantContentOrigins', bad)); });
test('all request objects reject accessors/symbols/nonenumerable extras/prototypes without reads', () => { let invoked = 0; const base = request(); Object.defineProperty(base, 'values', { enumerable: true, get() { invoked++; return values(); } }); assert.throws(() => parse('parseSaveMerchantContentRequest', base)); assert.equal(invoked, 0); for (const level of ['root', 'values', 'origins'] as const) {
    for (const key of [Symbol('extra'), 'extra']) {
        const input = request();
        const target = level === 'root' ? input : input[level];
        Object.defineProperty(target, key, { value: 1, enumerable: false });
        assert.throws(() => parse('parseSaveMerchantContentRequest', input));
    }
} assert.throws(() => parse('parseSaveMerchantContentRequest', Object.assign(Object.create({}), request()))); const input = request(); delete (input.values as Partial<ReturnType<typeof values>>).excerpt; assert.throws(() => parse('parseSaveMerchantContentRequest', input)); });
test('Unicode and plain metadata byte limits reject without coercion', () => { for (const field of ['name', 'body', 'excerpt', 'seoTitle', 'seoDescription'] as const) {
    const input = request();
    (input.values as any)[field] = '\ud800';
    assert.throws(() => parse('parseSaveMerchantContentRequest', input));
} const input = request(); input.values.name = 'ğ'.repeat(80); assert.equal(parse('parseSaveMerchantContentRequest', input).values.name, input.values.name); input.values.name += 'ğ'; assert.throws(() => parse('parseSaveMerchantContentRequest', input)); for (const change of [{ published: true }, { locale: 'TR-tr' }, { slug: 'a--b' }, { seoTitle: '<b>SEO</b>' }])
    assert.throws(() => parse('parseSaveMerchantContentRequest', { ...request(), values: { ...values(), ...change } })); });
test('typed manual save accepts exact80000-byte LF and backslash bodies after JSON escaping', () => {
    for (const escaped of ['\\', '\n']) {
        const input = request();
        input.values.body = '<pre>' + escaped.repeat(79989) + '</pre>';
        assert.equal(new TextEncoder().encode(input.values.body).length, 80000);
        assert.ok(new TextEncoder().encode(JSON.stringify(input)).length > 131072);
        assert.equal(parse('parseSaveMerchantContentRequest', input).values.body, input.values.body);
    }
});
test('typed envelope accepts maximal bounded metadata and origins but rejects a truly oversized envelope', () => {
    const input = { ...request(), values: { ...values(), name: '\\'.repeat(160), slug: 'a'.repeat(100), locale: 'tr-TR', body: '<pre>' + '\\'.repeat(79989) + '</pre>', excerpt: '\\'.repeat(4000), seoTitle: '\\'.repeat(160), seoDescription: '\\'.repeat(4000), published: true, status: 'active' }, origins: Object.fromEntries(['name', 'body', 'excerpt', 'seoTitle', 'seoDescription'].map(field => [field, { state: 'ai', generationId }])) };
    const decodedBytes = new TextEncoder().encode(JSON.stringify(input)).length;
    assert.ok(decodedBytes>131072&&decodedBytes<262144, `valid envelope bytes: ${decodedBytes}`);
    assert.equal(parse('parseSaveMerchantContentRequest',input).values.body,input.values.body);
    const oversized = request();
    oversized.values.body = '<pre>'+'\\'.repeat(262144)+'</pre>';
    assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).length>262144);
    assert.throws(()=>parse('parseSaveMerchantContentRequest',oversized));
    input.values.body += 'a';
    assert.equal(new TextEncoder().encode(input.values.body).length,80001);
    assert.throws(()=>parse('parseSaveMerchantContentRequest',input));
});
test('generic merchant contract retains4000 string budget and strict existing DTO keys', () => { const generic = { id, kind: 'page', name: 'Existing', config: { body: 'a'.repeat(4000) }, status: 'active', version: 1, createdAt: time, updatedAt: time }; assert.equal(parseMerchantAdminRecord(generic).config.body, generic.config.body); assert.throws(() => parseMerchantAdminRecord({ ...generic, config: { body: 'a'.repeat(4001) } })); assert.throws(() => parseMerchantAdminRecord({ ...generic, bodyDigest: digest })); });
test('many small canonical paragraphs can use the full80000-byte allowance', () => {
    const input = request();
    input.values.body = '<p>a</p>'.repeat(10000);
    assert.equal(parse('parseSaveMerchantContentRequest', input).values.body, input.values.body);
});
test('nested origin accessors and document descriptor traps are rejected before reads', () => {
    let reads = 0;
    const origin = {};
    Object.defineProperty(origin, 'state', { enumerable: true, get() { reads++; return 'manual'; } });
    assert.throws(() => parse('parseMerchantContentOrigins', { body: origin }));
    const input = document();
    Object.defineProperty(input, 'body', { enumerable: true, get() { reads++; return '<p>x</p>'; } });
    assert.throws(() => parse('parseMerchantContentDocument', input));
    assert.equal(reads, 0);
    const oversized = request();
    oversized.values.body = '<p>' + ('x'.repeat(81913)) + '</p>';
    assert.equal(new TextEncoder().encode(oversized.values.body).length, 81920);
    assert.throws(() => parse('parseSaveMerchantContentRequest', oversized));
});
