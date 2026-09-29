import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProductDescriptionHtml } from '../../../packages/platform-config/src/product-description-rich-text.ts';
import { parseSaveMerchantContentRequest } from '../../../packages/saas-contracts/src/merchant-content/index.ts';
const api = await import('../../../packages/platform-config/src/merchant-content-body.ts') as Record<string, (...args: any[]) => any>;
function call(name: string, ...args: any[]) { assert.equal(typeof api[name], 'function', `${name} is required`); return api[name]!(...args); }
test('normalization preserves whitespace/table/list/heading semantics with canonical aliases', () => { const input = '\n<h2>  Başlık </h2>\r\n<p>A <b>B</b>  <i>C</i></p><ol><li><p>Bir</p></li></ol><table><tbody><tr><td><p>😀</p></td></tr></tbody></table> '; assert.equal(call('normalizeMerchantContentBody', input), '\n<h2>  Başlık </h2>\r\n<p>A <strong>B</strong>  <em>C</em></p><ol><li><p>Bir</p></li></ol><table><tbody><tr><td><p>😀</p></td></tr></tbody></table> '); });
test('plain text becomes safe paragraphs with preserved spaces and line breaks', () => { assert.equal(call('normalizeMerchantContentBody', '  Türkçe & 😀\r\nsatır  '), '<p>  Türkçe &amp; 😀<br />satır  </p>'); assert.equal(call('normalizeMerchantContentBody', ''), ''); });
test('byte accounting measures normalized escaping growth and exact80000 ceiling', () => { const raw = '<p>' + ('&'.repeat(15998)) + 'abc</p>'; const out = call('normalizeMerchantContentBody', raw); assert.equal(new TextEncoder().encode(out).length, 80000); assert.equal(call('merchantContentBodyBytes', raw), 80000); assert.throws(() => call('normalizeMerchantContentBody', raw.replace('</p>', 'x</p>'))); const emoji = '<p>' + ('ı😀'.repeat(13332)) + 'a</p>'; assert.equal(call('merchantContentBodyBytes', emoji), 80000); assert.throws(() => call('normalizeMerchantContentBody', emoji.replace('</p>', 'a</p>'))); });
test('entity decoding and link canonicalization are idempotent and safe', () => { const out = call('normalizeMerchantContentBody', '<p>&copy; &#128512; &lt;x&gt;</p><a href="https://example.test/?a=1&amp;b=2">Bağlantı</a>'); assert.equal(out, '<p>© 😀 &lt;x&gt;</p><a href="https://example.test/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">Bağlantı</a>'); assert.equal(call('normalizeMerchantContentBody', out), out); });
test('dangerous/unsupported markup and encoded unsafe links reject instead of silent removal', () => { for (const source of ['<script>x</script>', '<p onclick="x">a</p>', '<p style="x">a</p>', '<a href="&#x6a;avascript:x">x</a>', '<a href="/\\evil.test">x</a>', '<a href="//evil.test">x</a>', '<a href="https://x.test" target="_self">x</a>', '<iframe>x</iframe>', '<img src="x">', '<p>x', '<p><h2>x</h2></p>', '\ud800', '\u0000'])
    assert.throws(() => call('normalizeMerchantContentBody', source), source); });
test('normalized rendering validates exact content while legacy rendering is unchanged and safe', () => { const normalized = '<p>  Metin &amp; içerik </p><h4>Alt</h4>'; assert.equal(call('renderMerchantContentBody', normalized, 'normalized_html'), normalized); assert.throws(() => call('renderMerchantContentBody', '<script>x</script>', 'normalized_html')); for (const legacy of ['  Existing\r\nplain text  ', '<div class="old">Text</div><script>evil</script>', '']) {
    assert.equal(call('renderMerchantContentBody', legacy, 'legacy'), normalizeProductDescriptionHtml(legacy));
} });
test('a valid80000-byte body with many small paragraphs does not hit an unrelated token ceiling', () => {
    const source = '<p>a</p>'.repeat(10000);
    assert.equal(new TextEncoder().encode(source).length, 80000);
    assert.equal(call('normalizeMerchantContentBody', source), source);
});
test('normalizer output is accepted unchanged by the strict save contract across the safe grammar', () => {
    const sources = ['', '  Türkçe & 😀\r\nsatır  ', '<h2>A</h2>\n<h3>B</h3>\r<h4>C</h4>', '<p><b>B</b><i>I</i><s>S</s><u>U</u><code>code</code></p><hr>', '<blockquote><pre>  x\n y  </pre></blockquote>', '<ul><li>one<ol><li><p>two</p></li></ol></li></ul>', '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><p>B</p></td></tr></tbody></table>', '<p>&copy; &#128512; &lt;x&gt; &quot;q&quot; &#39;a&#39;</p>', '<a href="/foo?x=1&amp;y=2">Local</a><a href="#part">Part</a><a href="mailto:a@example.test">Mail</a><a href="tel:+901234">Phone</a><a href="https://example.test/a?b=1&amp;c=2">External</a>', '<p>' + ('&'.repeat(15998)) + 'abc</p>', '<p>a</p>'.repeat(10000)];
    for (const source of sources) {
        const body = call('normalizeMerchantContentBody', source);
        const parsed = parseSaveMerchantContentRequest({ draftId: '11111111-1111-4111-8111-111111111111', recordId: null, expectedVersion: null, expectedBodyDigest: null, kind: 'page', bodyAction: 'replace', values: { name: 'Test', slug: 'test', locale: 'en', body, excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' }, origins: {} });
        assert.equal(parsed.values.body, body);
        assert.equal(call('renderMerchantContentBody', body, 'normalized_html'), body);
        assert.equal(call('normalizeMerchantContentBody', body), body);
    }
});
test('bounded nesting and decoded Unicode reject equally without accepting invalid entities', () => {
    const body = '<blockquote>'.repeat(64) + 'text' + '</blockquote>'.repeat(64);
    assert.equal(call('normalizeMerchantContentBody', body), body);
    const deep = '<blockquote>' + body + '</blockquote>';
    assert.throws(() => call('normalizeMerchantContentBody', deep));
    const save = (body: string) => parseSaveMerchantContentRequest({ draftId: '11111111-1111-4111-8111-111111111111', recordId: null, expectedVersion: null, expectedBodyDigest: null, kind: 'page', bodyAction: 'replace', values: { name: 'Test', slug: 'test', locale: 'en', body, excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' }, origins: {} });
    assert.equal(save(body).values.body, body);
    assert.throws(() => save(deep));
    for (const source of ['<p>&#0;</p>', '<p>&#xD800;</p>', '<p>&#x110000;</p>', '<p>&#x80;</p>', '<a href="https://example.test/&#9;x">x</a>'])
        assert.throws(() => call('normalizeMerchantContentBody', source));
});
