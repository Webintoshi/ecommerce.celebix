import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {Window} from 'happy-dom';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import * as bodyEditor from '../../lib/merchant-content-body-editor.ts';
import * as bodyNormalizer from '../../../../packages/platform-config/src/merchant-content-body.ts';

const require = createRequire(import.meta.url);
type Props = {value: string; bodyFormat: 'legacy' | 'normalized_html'; readOnly?: boolean; onChange(value: string, bodyFormat: 'legacy' | 'normalized_html', valid: boolean): void};

async function withField(verify: (ctx: {browser: Window; container: HTMLElement; editor(): import('@tiptap/core').Editor; update(value: string, bodyFormat?: Props['bodyFormat'], readOnly?: boolean): Promise<void>; changes: Array<{value:string; bodyFormat: Props['bodyFormat']; valid:boolean}>;}) => Promise<void>, initial: string, initialFormat: Props['bodyFormat'] = 'normalized_html') {
  const browser = new Window({url: 'https://panel.example.test/content/blog'});
  const prior = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({window: browser, document: browser.document, navigator: browser.navigator, Node: browser.Node, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, HTMLButtonElement: browser.HTMLButtonElement, DOMParser: browser.DOMParser, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true})) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
  }
  const tiptap = require('@tiptap/react') as typeof import('@tiptap/react');
  let actual: import('@tiptap/core').Editor | null = null;
  const source = await readFile(new URL('./MerchantContentBodyField.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const compiled: {exports: Record<string, unknown>} = {exports: {}};
  Function('require','module','exports',code)((name:string) => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'lucide-react') return new Proxy({}, {get: () => () => React.createElement('svg', {'aria-hidden': true})});
    if (name.endsWith('.module.css')) return {__esModule: true, default: new Proxy({}, {get: (_target,key) => String(key)})};
    if (name.endsWith('merchant-content-body-editor.ts')) return bodyEditor;
    if (name.endsWith('merchant-content-body.ts')) return bodyNormalizer;
    if (name === '@tiptap/react') return {...tiptap, useEditor: (...args: Parameters<typeof tiptap.useEditor>) => {actual = tiptap.useEditor(...args); return actual;}};
    return require(name);
  }, compiled, compiled.exports);
  const Field = compiled.exports.MerchantContentBodyField as React.ComponentType<Props>;
  const {createRoot} = await import('react-dom/client');
  const element = browser.document.createElement('form');
  browser.document.body.append(element);
  const container = element as unknown as HTMLElement;
  const root = createRoot(container);
  const changes: Array<{value:string; bodyFormat: Props['bodyFormat']; valid:boolean}> = [];
  let value=initial, bodyFormat=initialFormat, readOnly=false;
  const onChange: Props['onChange'] = (next, format, valid) => {changes.push({value:next,bodyFormat:format,valid});value=next;bodyFormat=format;render();};
  const render = () => root.render(React.createElement(Field,{value,bodyFormat,readOnly,onChange}));
  const update = async (next: string, nextFormat: Props['bodyFormat']=bodyFormat, nextReadOnly=readOnly) => {
    value=next;bodyFormat=nextFormat;readOnly=nextReadOnly;
    await React.act(async()=>{render();await new Promise(resolve=>setTimeout(resolve,20));});
  };
  try {
    await update(initial,initialFormat);
    await verify({browser,container,editor:()=>{assert.ok(actual);return actual;},update,changes});
  } finally {
    await React.act(async()=>{root.unmount();await new Promise(resolve=>setTimeout(resolve,20));});
    (actual as import('@tiptap/core').Editor | null)?.destroy();
    for(const [key,descriptor] of prior) descriptor ? Object.defineProperty(globalThis,key,descriptor) : Reflect.deleteProperty(globalThis,key);
    await browser.happyDOM.close();
  }
}

test('mounted controlled field preserves pristine loads, H4, NBSP and exact undo source', async()=>{
  const original='<h4>Başlık</h4><p>  NBSP  ve  boşluk<br />satır</p>';
  await withField(async({container,editor,update,changes})=>{
    assert.equal(changes.length,0);
    assert.match(container.textContent??'',/\d+ \/ 80.000 bayt/);
    assert.equal(editor().state.doc.firstChild?.attrs.level,4);
    assert.equal(editor().isEditable,true);
    await React.act(async()=>{editor().commands.insertContentAt(editor().state.doc.content.size-1,' yeni');});
    assert.equal(changes.at(-1)?.bodyFormat,'normalized_html');
    assert.equal(changes.at(-1)?.valid,true);
    assert.match(changes.at(-1)?.value??'',/yeni/);
    await React.act(async()=>{editor().commands.undo();});
    assert.deepEqual(changes.at(-1),{value:original,bodyFormat:'normalized_html',valid:true});
    await update('<p>Başka kayıt</p>');
    assert.equal(editor().getText(),'Başka kayıt');
    assert.equal(changes.length,2,'loading another record must not emit dirty changes');
    await update('<p>Salt okunur</p>','normalized_html',true);
    assert.equal(editor().isEditable,false);
    assert.equal(changes.length,2);
  },original);
});

test('table edit strips only generated layout and reports canonical byte count',async()=>{
  const original='<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><p>Bir</p></td></tr></tbody></table>';
  await withField(async({container,editor,changes})=>{
    assert.equal(editor().isEditable,true);
    const position=editor().state.doc.content.size-3;
    await React.act(async()=>{editor().commands.insertContentAt(position,'😀');});
    assert.equal(changes.length,1);
    const {value,valid}=changes[0]!;
    assert.equal(valid,true);
    assert.ok(value.includes('<table><tbody>'));
    assert.ok(!value.includes('colgroup'));
    assert.ok(!value.includes('colspan'));
    assert.equal(bodyNormalizer.normalizeMerchantContentBody(value),value);
    assert.match(container.textContent??'',new RegExp(`${new TextEncoder().encode(value).length.toLocaleString('tr-TR')} \\/ 80\\.000 bayt`));
    await React.act(async()=>{editor().commands.undo();});
    assert.deepEqual(changes.at(-1),{value:original,bodyFormat:'normalized_html',valid:true},'table undo restores exact original source');
  },original);
});

test('80,001-byte visual edit stays visible and invalid until one undo restores exact original',async()=>{
  const original='<p>'+'x'.repeat(79993)+'</p>';
  await withField(async({container,editor,changes})=>{
    assert.equal(editor().isEditable,true);
    await React.act(async()=>{editor().commands.insertContentAt(editor().state.doc.content.size-1,'y');});
    assert.equal(changes.at(-1)?.valid,false);
    assert.match(container.textContent??'',/80.000 baytı aşıyor/);
    await React.act(async()=>{editor().commands.undo();});
    assert.deepEqual(changes.at(-1),{value:original,bodyFormat:'normalized_html',valid:true});
  },original);
});

test('unsupported legacy source is unchanged until explicit conversion or confirmed replacement',async()=>{
  const original='<p>Metin<img src="/old.webp"></p>';
  await withField(async({container,changes,editor,browser})=>{
    assert.equal(editor().isEditable,false);
    assert.equal((container.querySelector('textarea[aria-label="Kaynak metin"]') as HTMLTextAreaElement)?.value,original);
    assert.equal(container.querySelector('img'),null);
    assert.deepEqual(changes,[]);
    const convert=Array.from(container.querySelectorAll('button')).find(button=>button.textContent?.includes('Güvenli HTML')) as HTMLButtonElement;
    await React.act(async()=>convert.click());
    assert.match(container.textContent??'',/Desteklenmeyen etiketleri/);
    assert.deepEqual(changes,[]);
    const replace=Array.from(container.querySelectorAll('button')).find(button=>button.textContent?.includes('Yeni metinle')) as HTMLButtonElement;
    await React.act(async()=>replace.click());
    assert.deepEqual(changes,[],'opening confirmation cannot clear the source');
    const proceed=Array.from(container.querySelectorAll('button')).find(button=>button.textContent?.includes('Boş metinle')) as HTMLButtonElement;
    await React.act(async()=>proceed.click());
    assert.deepEqual(changes,[{value:'',bodyFormat:'normalized_html',valid:true}]);
    assert.equal(editor().isEditable,true);
    assert.equal(container.querySelector('textarea[aria-label="Kaynak metin"]'),null);
    assert.ok(browser.document.body.textContent?.includes('80.000 bayt'));
  },original,'legacy');
});

test('legacy source edits stay in source mode and require an explicit safe conversion',async()=>{
  const original='<p>Metin<img src="/old.webp"></p>';
  await withField(async({browser,container,changes,editor})=>{
    const textarea=container.querySelector('textarea[aria-label="Kaynak metin"]') as HTMLTextAreaElement;
    assert.ok(textarea);
    await React.act(async()=>{
      Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'<p>Metin</p>');
      textarea.dispatchEvent(new browser.Event('input',{bubbles:true}) as unknown as Event);
    });
    assert.deepEqual(changes,[{value:'<p>Metin</p>',bodyFormat:'legacy',valid:false}]);
    assert.equal(editor().isEditable,false,'a now-valid draft cannot silently enter visual mode');
    assert.ok(container.querySelector('textarea[aria-label="Kaynak metin"]'));
    const convert=Array.from(container.querySelectorAll('button')).find(button=>button.textContent?.includes('Güvenli HTML')) as HTMLButtonElement;
    await React.act(async()=>convert.click());
    assert.deepEqual(changes.at(-1),{value:'<p>Metin</p>',bodyFormat:'normalized_html',valid:true});
    assert.equal(editor().isEditable,true);
  },original,'legacy');
});

test('mounted legacy Markdown image and titled link remain in source mode without dirtying',async()=>{
  for (const original of ['![Alt][g]\n\n[g]: https://example.test/gorsel.png', '[Ürün](https://example.test/urun "Kampanya notu")']) {
    await withField(async({container,changes,editor})=>{
      assert.equal(editor().isEditable,false,original);
      assert.equal((container.querySelector('textarea[aria-label="Kaynak metin"]') as HTMLTextAreaElement)?.value,original);
      assert.deepEqual(changes,[]);
    },original,'legacy');
  }
});

test('unsafe rich HTML paste is rejected visibly without changing the draft',async()=>{
  const original='<p>Güvenli metin</p>';
  await withField(async({container,editor,changes})=>{
    const before=editor().getHTML();
    let prevented=false;
    const paste={clipboardData:{getData:(format:string)=>format==='text/html'?'<p onclick="evil()">Yapıştır</p>':''},preventDefault:()=>{prevented=true;}} as unknown as ClipboardEvent;
    let consumed: unknown;
    await React.act(async()=>{consumed=editor().view.someProp('handlePaste',handler=>handler(editor().view,paste,editor().state.selection.content()));});
    assert.equal(consumed,true);
    assert.equal(prevented,true);
    assert.equal(editor().getHTML(),before);
    assert.deepEqual(changes,[]);
    assert.match(container.textContent??'',/Düz metin olarak yapıştırın/);
  },original);
});
