import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContentResourceAuthoringRequest, parseContentResourceTarget, parseContentOutline, parseContentResourceDraft, parseContentResourceUsage, parseContentResourceGenerationView } from './validation.ts';
const id = '11111111-1111-4111-8111-111111111111';
const values = { name: 'Başlık', slug: 'baslik', locale: 'tr', body: '<p>İçerik</p>', excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' };
const target = { kind: 'blog_post', draftId: id, recordId: null, recordVersion: null };
const outline = { title: 'Başlık', sections: [{ heading: 'Giriş', points: ['Kaynak bilgisi'] }] };
const request = () => ({ target, currentDraft: values, locale: 'tr', tone: 'neutral', length: 'medium', note: '', researchOperationId: null, stage: 'outline', topic: 'Konu', purpose: 'Açıklama' });
test('outline request preserves full unsaved snapshot and optional voice without widening product authority', () => {
    assert.deepEqual(parseContentResourceAuthoringRequest(request()), request());
    const withVoice = { ...request(), brandVoice: 'Sade anlatım' };
    assert.deepEqual(parseContentResourceAuthoringRequest(withVoice), withVoice);
    assert.throws(() => parseContentResourceTarget({ ...target, productId: id }));
    assert.throws(() => parseContentResourceTarget({ ...target, recordId: id }));
    assert.throws(() => parseContentResourceTarget({ ...target, recordVersion: 1 }));
    assert.throws(() => parseContentResourceTarget({ ...target, kind: 'product' }));
});
test('article requires explicit reviewed outline and generation reference; other actions cannot smuggle them', () => {
    const { topic, purpose, ...base } = request();
    const draft = { ...base, stage: 'draft', action: 'article', fields: ['body'], reviewedOutline: outline, outlineGenerationId: id, selection: null };
    assert.equal(parseContentResourceAuthoringRequest(draft).stage, 'draft');
    assert.throws(() => parseContentResourceAuthoringRequest({ ...draft, outlineGenerationId: null }));
    assert.throws(() => parseContentResourceAuthoringRequest({ ...draft, reviewedOutline: null }));
    assert.throws(() => parseContentResourceAuthoringRequest({ ...draft, action: 'improve' }));
    assert.throws(() => parseContentResourceAuthoringRequest({ ...draft, fields: ['body', 'body'] }));
    const rewrite = { ...draft, action: 'rewrite_selection', reviewedOutline: null, outlineGenerationId: null, selection: { field: 'body', text: 'İçerik' } };
    assert.equal(parseContentResourceAuthoringRequest(rewrite).stage, 'draft');
    assert.throws(() => parseContentResourceAuthoringRequest({ ...rewrite, selection: { field: 'body', text: 'Yok' } }));
    assert.throws(() => parseContentResourceAuthoringRequest({ ...rewrite, fields: ['name'] }));
});
test('UTF8 outline limits, body capacity and safe rendered output are independent', () => {
    assert.deepEqual(parseContentOutline(outline), outline);
    assert.throws(() => parseContentOutline({ ...outline, sections: [] }));
    assert.throws(() => parseContentOutline({ ...outline, title: 'ş'.repeat(81) }));
    assert.throws(() => parseContentOutline({ ...outline, sections: [{ heading: 'H', points: Array(7).fill('x') }] }));
    const full = '<pre>' + '\n'.repeat(79989) + '</pre>';
    assert.equal(parseContentResourceAuthoringRequest({ ...request(), currentDraft: { ...values, body: full } }).currentDraft.body, full);
    const draft = { sourceFingerprint: 'a'.repeat(64), values: { body: full }, citations: [], suggestions: [] };
    assert.deepEqual(parseContentResourceDraft(draft), draft);
    assert.throws(() => parseContentResourceDraft({ ...draft, values: { body: '<script>x</script>' } }));
    assert.throws(() => parseContentResourceDraft({ ...draft, values: { slug: 'fake' } }));
    assert.throws(() => parseContentResourceDraft({ ...draft, values: {} }));
});
test('all nested descriptor variants reject without calling getters', () => {
    let calls = 0;
    for (const base of [request(), outline, { inputTokens: 1, outputTokens: 2, totalTokens: 3 }]) {
        const key = Object.keys(base)[0]!;
        const bad = { ...base };
        Object.defineProperty(bad, key, { enumerable: true, get() { calls++; return 'x'; } });
        const parser = 'target' in base ? parseContentResourceAuthoringRequest : 'sections' in base ? parseContentOutline : parseContentResourceUsage;
        assert.throws(() => parser(bad));
        assert.throws(() => parser(Object.defineProperty({ ...base }, 'hidden', { value: 1 })));
        assert.throws(() => parser({ ...base, [Symbol('x')]: 1 }));
    }
    const badPoint: any = ['x'];
    Object.defineProperty(badPoint, '0', { get() { calls++; return 'x'; } });
    assert.throws(() => parseContentOutline({ ...outline, sections: [{ heading: 'H', points: badPoint }] }));
    assert.equal(calls, 0);
});
test('known usage validates strict range/sum and never converts absent usage to zero', () => {
    assert.equal(parseContentResourceUsage(null), null);
    assert.deepEqual(parseContentResourceUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    for (const bad of [undefined, {}, 0, { inputTokens: '1', outputTokens: 2, totalTokens: 3 }, { inputTokens: -1, outputTokens: 2, totalTokens: 1 }, { inputTokens: 1.1, outputTokens: 2, totalTokens: 3.1 }, { inputTokens: 2147483647, outputTokens: 1, totalTokens: 2147483648 }, { inputTokens: 1, outputTokens: 2, totalTokens: 4 }, { inputTokens: 1, outputTokens: 2, totalTokens: 3, extra: 0 }])
        assert.throws(() => parseContentResourceUsage(bad));
});
test('public generation view rejects private credentials and inconsistent completed stages', () => {
    const view = { id, target, stage: 'outline', status: 'completed', outline, draft: null, sourceFingerprint: 'a'.repeat(64), usage: null, safeCode: null, createdAt: '2026-09-29T12:00:00.000Z', updatedAt: '2026-09-29T12:00:00.000Z', finishedAt: '2026-09-29T12:00:00.000Z' };
    assert.deepEqual(parseContentResourceGenerationView(view), view);
    assert.throws(() => parseContentResourceGenerationView({ ...view, claimToken: id }));
    assert.throws(() => parseContentResourceGenerationView({ ...view, outline: null }));
    assert.throws(() => parseContentResourceGenerationView({ ...view, status: 'pending' }));
});
