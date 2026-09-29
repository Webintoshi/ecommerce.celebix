import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import * as body from '../../../packages/platform-config/src/merchant-content-body.ts';

const api = await import('./merchant-content-body-editor.ts').catch(() => ({})) as Record<string, (...args: any[]) => any>;
function call(name: string, ...args: any[]) { assert.equal(typeof api[name], 'function', `${name} is required`); return api[name]!(...args); }

async function withBrowser(verify: (browser: Window) => void | Promise<void>) {
  const browser = new Window({ url: 'https://panel.example.test/content/blog' });
  const prior = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Node: browser.Node, DOMParser: browser.DOMParser, getComputedStyle: browser.getComputedStyle.bind(browser)})) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  try { await verify(browser); }
  finally { for (const [key, descriptor] of prior) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

function editor(browser: Window, source: string) {
  return new Editor({
    element: browser.document.createElement('div') as unknown as HTMLElement,
    extensions: [StarterKit.configure({heading: {levels: [2, 3, 4]}}), TableKit.configure({table: {resizable: false}})],
    parseOptions: {preserveWhitespace: 'full'},
    content: source || '<p></p>',
  });
}

const table = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><p>Bir</p></td><td><p>İki</p></td></tr></tbody></table>';
test('real TipTap H4, list, table, NBSP and preformatted LF serialize to strict canonical HTML', async () => {
  await withBrowser((browser) => {
    const source = '<h4>Alt başlık</h4><p>  NBSP  ve  boşluk</p><ul><li><p>Bir</p></li></ul>'+table+'<pre>satır 1\n satır 2</pre>';
    const instance = editor(browser, source);
    try {
      const output = call('normalizeMerchantContentEditorHtml', instance.getHTML(), (html: string) => new browser.DOMParser().parseFromString(html, 'text/html'));
      assert.match(output, /<h4>Alt başlık<\/h4>/);
      assert.match(output, /NBSP  ve  boşluk/);
      assert.match(output, /<ul><li><p>Bir<\/p><\/li><\/ul>/);
      assert.match(output, /<table><tbody><tr><th><p>A<\/p><\/th>/);
      assert.match(output, /satır 1\n satır 2/);
      assert.ok(!/colgroup|colspan|rowspan|style=/.test(output));
      assert.equal(body.normalizeMerchantContentBody(output), output);
      assert.equal(call('merchantContentEditorBytes', output), new TextEncoder().encode(output).length);
      const reloaded = editor(browser, output);
      try { assert.equal(call('normalizeMerchantContentEditorHtml', reloaded.getHTML(), (html: string) => new browser.DOMParser().parseFromString(html, 'text/html')), output); }
      finally { reloaded.destroy(); }
    } finally { instance.destroy(); }
  });
});

test('only exact generated table layout defaults are stripped; merged or resized cells reject', async () => {
  await withBrowser((browser) => {
    const parse = (html: string) => new browser.DOMParser().parseFromString(html, 'text/html');
    const instance = editor(browser, table);
    try {
      const serialized = instance.getHTML();
      assert.match(serialized, /colgroup/);
      assert.match(serialized, /colspan="1"/);
      assert.equal(call('normalizeMerchantContentEditorHtml', serialized, parse).includes('colspan'), false);
      for (const unsafe of [serialized.replace('colspan="1"', 'colspan="2"'), serialized.replace('min-width: 25px;', 'min-width: 99px;'), serialized.replace('<col ', '<col width="99" '), serialized.replace('<table ', '<table onclick="x" ')]) assert.throws(() => call('normalizeMerchantContentEditorHtml', unsafe, parse));
    } finally { instance.destroy(); }
  });
});

test('unchanged and undone sources preserve exact legacy bytes; an edit yields normalized content', async () => {
  await withBrowser((browser) => {
    const parse = (html: string) => new browser.DOMParser().parseFromString(html, 'text/html');
    const original = '  Eski kaynak\r\nmetin  ';
    const initial = call('merchantContentEditorHtml', original, 'legacy');
    const instance = editor(browser, initial);
    try {
      assert.equal(call('merchantContentEditorCanVisualize', original, 'legacy', instance.getHTML(), parse), true);
      assert.deepEqual(call('merchantContentEditorValueAfterEdit', original, 'legacy', instance.getHTML(), instance.getHTML(), parse), {value: original, bodyFormat: 'legacy'});
      instance.commands.insertContentAt(instance.state.doc.content.size - 1, ' yeni');
      const changed = call('merchantContentEditorValueAfterEdit', original, 'legacy', initial, instance.getHTML(), parse);
      assert.equal(changed.bodyFormat, 'normalized_html');
      assert.match(changed.value, /yeni/);
      instance.commands.undo();
      assert.deepEqual(call('merchantContentEditorValueAfterEdit', original, 'legacy', initial, instance.getHTML(), parse), {value: original, bodyFormat: 'legacy'});
    } finally { instance.destroy(); }
  });
});

test('unsupported legacy structure remains source-only and no unsafe paste or links are converted', async () => {
  await withBrowser((browser) => {
    const parse = (html: string) => new browser.DOMParser().parseFromString(html, 'text/html');
    for (const original of ['<p>Metin<img src="/x.webp"></p>', '<table><tr><td colspan="2">Birleşik</td></tr></table>', '<p style="color:red">Metin</p>', '<script>unsafe</script>']) {
      const rendered = call('merchantContentEditorHtml', original, 'legacy');
      const instance = editor(browser, rendered);
      try { assert.equal(call('merchantContentEditorCanVisualize', original, 'legacy', instance.getHTML(), parse), false); }
      finally { instance.destroy(); }
    }
    assert.throws(() => call('normalizeMerchantContentEditorHtml', '<p onclick="x">unsafe</p>', parse));
    assert.throws(() => call('normalizeMerchantContentEditorHtml', '<script>x</script>', parse));
    assert.throws(() => call('normalizeMerchantContentEditorHtml', '<!DOCTYPE html><p>safe</p>', parse));
    assert.throws(() => call('normalizeMerchantContentEditorHtml', '<!-- hidden --><p>safe</p>', parse));
    for (const href of ['javascript:alert(1)', 'data:text/html,x', '//other.test', 'https://a.test/\nunsafe', 'https://a.test\\@other.test']) assert.equal(call('safeMerchantContentLinkHref', href), undefined);
    assert.equal(call('safeMerchantContentLinkHref', 'example.test/x'), 'https://example.test/x');
  });
});

test('legacy Markdown image and link title metadata stays source-only through real TipTap', async () => {
  await withBrowser((browser) => {
    const parse = (html: string) => new browser.DOMParser().parseFromString(html, 'text/html');
    for (const source of [
      '![Alt açıklama](https://example.test/gorsel.png)',
      '![Alt][g]\n\n[g]: https://example.test/gorsel.png',
      '[Ürün](https://example.test/urun "Kampanya notu")',
      '[Ürün][u]\n\n[u]: https://example.test/urun "Kampanya notu"',
    ]) {
      const rendered = call('merchantContentEditorHtml', source, 'legacy');
      const instance = editor(browser, rendered);
      try { assert.equal(call('merchantContentEditorCanVisualize', source, 'legacy', instance.getHTML(), parse), false, source); }
      finally { instance.destroy(); }
    }
    const safe = '[Ürün](https://example.test/urun)';
    const safeHtml = call('merchantContentEditorHtml', safe, 'legacy');
    const safeEditor = editor(browser, safeHtml);
    try { assert.equal(call('merchantContentEditorCanVisualize', safe, 'legacy', safeEditor.getHTML(), parse), true); }
    finally { safeEditor.destroy(); }
  });
});

test('serializer rejects unbalanced allowed tags before DOMParser repairs them', async () => {
  await withBrowser((browser) => {
    const parse = (html: string) => new browser.DOMParser().parseFromString(html, 'text/html');
    for (const source of ['<p>Bir<p>İki</p>', '<p>Bir</p></p>', '<p>Bir</p><h2>İki'])
      assert.throws(() => call('normalizeMerchantContentEditorHtml', source, parse), source);
  });
});
