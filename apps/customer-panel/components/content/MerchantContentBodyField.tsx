'use client';

import type { Editor } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import Underline from '@tiptap/extension-underline';
import { EditorState } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code2, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Table2, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { normalizeMerchantContentBody } from '../../../../packages/platform-config/src/merchant-content-body.ts';
import {
  merchantContentEditorBytes, merchantContentEditorCanVisualize, merchantContentEditorHtml,
  merchantContentEditorValueAfterEdit, safeMerchantContentLinkHref, type MerchantContentBodyChange,
  type MerchantContentBodyFormat,
} from '../../lib/merchant-content-body-editor.ts';
import styles from './policy-body-field.module.css';

export type MerchantContentBodyFieldProps = Readonly<{
  value: string;
  bodyFormat: MerchantContentBodyFormat;
  readOnly?: boolean;
  onChange(value: string, bodyFormat: MerchantContentBodyFormat, valid: boolean): void;
  onEditorReady?(editor: Editor | null): void;
  onTransaction?(editor: Editor): void;
}>;

type LoadedBody = Readonly<{source: string; format: MerchantContentBodyFormat; html: string; supported: boolean}>;
const maxBytes = 80_000;
const encoder = new TextEncoder();

function ToolbarButton({label, active = false, disabled = false, onPress, children}: Readonly<{
  label: string; active?: boolean; disabled?: boolean; onPress(): void; children: ReactNode;
}>) {
  return <button type="button" className={styles.toolbarButton} title={label} aria-label={label} aria-pressed={active}
    disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onPress}>{children}</button>;
}

function blockType(editor: Editor | null): string {
  for (const level of [2, 3, 4]) if (editor?.isActive('heading', {level})) return `h${level}`;
  return 'paragraph';
}

export function MerchantContentBodyField({value, bodyFormat, readOnly = false, onChange, onEditorReady, onTransaction}: MerchantContentBodyFieldProps) {
  const linkId = useId();
  const latest = useRef({value, bodyFormat, onChange, onEditorReady, onTransaction, readOnly});
  latest.current = {value, bodyFormat, onChange, onEditorReady, onTransaction, readOnly};
  const loaded = useRef<LoadedBody | null>(null);
  const applied = useRef<Readonly<{value: string; bodyFormat: MerchantContentBodyFormat}> | null>(null);
  const emitted = useRef<MerchantContentBodyChange | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [bytes, setBytes] = useState(() => encoder.encode(value).length);
  const [error, setError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: false,
    parseOptions: {preserveWhitespace: 'full'},
    extensions: [
      StarterKit.configure({heading: {levels: [2, 3, 4]}, link: false, underline: false}), Underline,
      Link.configure({autolink: false, linkOnPaste: false, openOnClick: false, defaultProtocol: 'https',
        HTMLAttributes: {rel: 'noopener noreferrer nofollow'}, isAllowedUri: (href) => Boolean(safeMerchantContentLinkHref(href))}),
      TableKit.configure({table: {resizable: false}}),
      Placeholder.configure({placeholder: 'İçeriği yazın veya düz metin yapıştırın…'}),
    ],
    content: '',
    editorProps: {
      attributes: {class: styles.editorContent, role: 'textbox', 'aria-label': 'İçerik metni düzenleyicisi', 'aria-multiline': 'true'},
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html');
        if (!html) return false;
        try { normalizeMerchantContentBody(html); setError(''); return false; }
        catch { event.preventDefault(); setError('Yapıştırılan biçim desteklenmiyor. Düz metin olarak yapıştırın.'); return true; }
      },
    },
    onTransaction: ({editor: current}) => latest.current.onTransaction?.(current),
    onUpdate: ({editor: current}) => {
      const baseline = loaded.current;
      if (!baseline?.supported || latest.current.readOnly) return;
      let next: MerchantContentBodyChange;
      let valid = true;
      try {
        next = merchantContentEditorValueAfterEdit(baseline.source, baseline.format, baseline.html, current.getHTML());
        setBytes(next.bodyFormat === 'legacy' ? encoder.encode(next.value).length : merchantContentEditorBytes(next.value));
        setError('');
      } catch {
        next = {value: current.getHTML(), bodyFormat: 'normalized_html'};
        valid = false;
        const draftBytes = encoder.encode(next.value).length;
        setBytes(draftBytes);
        setError(draftBytes > maxBytes ? 'Metin 80.000 baytı aşıyor.' : 'Metin güvenli biçime dönüştürülemedi.');
      }
      if (next.value === latest.current.value && next.bodyFormat === latest.current.bodyFormat) return;
      emitted.current = next;
      latest.current.onChange(next.value, next.bodyFormat, valid);
    },
  });

  const editorState = useEditorState({editor, selector: ({editor: current}) => ({
    block: blockType(current), bold: current?.isActive('bold') ?? false, italic: current?.isActive('italic') ?? false,
    underline: current?.isActive('underline') ?? false, strike: current?.isActive('strike') ?? false,
    bulletList: current?.isActive('bulletList') ?? false, orderedList: current?.isActive('orderedList') ?? false,
    blockquote: current?.isActive('blockquote') ?? false, codeBlock: current?.isActive('codeBlock') ?? false,
    link: current?.isActive('link') ?? false, undo: current?.can().undo() ?? false, redo: current?.can().redo() ?? false,
  })});

  useEffect(() => {
    if (!editor || (applied.current?.value === value && applied.current.bodyFormat === bodyFormat)) return;
    applied.current = {value, bodyFormat};
    if (emitted.current?.value === value && emitted.current.bodyFormat === bodyFormat) {
      emitted.current = null;
      return;
    }
    emitted.current = null;
    const html = merchantContentEditorHtml(value, bodyFormat);
    editor.commands.setContent(html || '<p></p>', {emitUpdate: false, parseOptions: {preserveWhitespace: 'full'}});
    editor.view.updateState(EditorState.create({doc: editor.state.doc, schema: editor.schema, plugins: editor.state.plugins}));
    editor.view.dispatch(editor.state.tr);
    const compatible = merchantContentEditorCanVisualize(value, bodyFormat, editor.getHTML());
    loaded.current = {source: value, format: bodyFormat, html, supported: compatible};
    setSupported(compatible);
    setBytes(encoder.encode(value).length);
    setError(''); setLinkOpen(false); setReplaceOpen(false);
    editor.setEditable(compatible && !readOnly, false);
  }, [editor, value, bodyFormat, readOnly]);

  useEffect(() => { editor?.setEditable(supported === true && !readOnly, false); }, [editor, readOnly, supported]);
  useEffect(() => { if (!editor) return; latest.current.onEditorReady?.(editor); return () => latest.current.onEditorReady?.(null); }, [editor]);
  const disabled = !editor || supported !== true || readOnly;
  const countText = `${error ? 'Taslak: ' : ''}${bytes.toLocaleString('tr-TR')} / 80.000 bayt`;

  if (supported === false) {
    return <section className={styles.fallback}>
      <p className={styles.fallbackNotice} role="status">Bu kaynak görsel düzenleyicide kayıpsız açılamıyor. Metin korunur; düzenlemek için güvenli HTML'e dönüştürün.</p>
      <label className={styles.fallbackNotice} htmlFor={`${linkId}-source`}>Kaynak metin</label>
      <textarea id={`${linkId}-source`} value={value} readOnly={readOnly} onChange={(event) => { const next = event.currentTarget.value; emitted.current = {value: next, bodyFormat: 'legacy'}; setBytes(encoder.encode(next).length); setError(''); latest.current.onChange(next, 'legacy', false); }}
        aria-label="Kaynak metin" style={{boxSizing: 'border-box', width: '100%', minHeight: 220, padding: 16, font: 'inherit'}} />
      {!readOnly ? <div className={styles.tableTools}>
        <button type="button" onClick={() => {
          try { const normalized = normalizeMerchantContentBody(value); latest.current.onChange(normalized, 'normalized_html', true); }
          catch { setError('Desteklenmeyen etiketleri ve özellikleri kaynak metinden kaldırın, ardından yeniden deneyin.'); }
        }}>Güvenli HTML'e dönüştür</button>
        <button type="button" onClick={() => setReplaceOpen(true)}>Yeni metinle değiştir</button>
      </div> : null}
      {replaceOpen ? <div className={styles.linkPanel} role="group" aria-label="Metni değiştirmeyi onayla">
        <p>Kaydederseniz mevcut metin değiştirilecek.</p>
        <div className={styles.linkControls}><button type="button" onClick={() => latest.current.onChange('', 'normalized_html', true)}>Boş metinle devam et</button><button type="button" onClick={() => setReplaceOpen(false)}>Vazgeç</button></div>
      </div> : null}
      {error ? <p role="alert" className={styles.fallbackNotice}>{error}</p> : null}
      <output className={styles.fallbackNotice}>{countText}</output>
    </section>;
  }

  function setBlock(next: string) {
    if (!editor) return;
    if (next === 'h2' || next === 'h3' || next === 'h4') editor.chain().focus().setHeading({level: Number(next.slice(1)) as 2 | 3 | 4}).run();
    else editor.chain().focus().setParagraph().run();
  }
  function applyLink() {
    const href = safeMerchantContentLinkHref(linkValue);
    if (href === undefined) { setError('Geçerli bir bağlantı adresi girin.'); return; }
    if (href) editor?.chain().focus().extendMarkRange('link').setLink({href}).run();
    else editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false); setError(''); editor?.commands.focus();
  }

  return <section className={styles.field} aria-busy={supported === null}>
    {!readOnly ? <div className={styles.toolbar} role="toolbar" aria-label="İçerik metni biçimlendirme">
      <select className={styles.blockSelect} aria-label="Metin biçimi" value={editorState?.block ?? 'paragraph'} disabled={disabled} onChange={(event) => setBlock(event.currentTarget.value)}>
        <option value="paragraph">Paragraf</option><option value="h2">Başlık 2</option><option value="h3">Başlık 3</option><option value="h4">Başlık 4</option>
      </select>
      <span className={styles.toolbarGroup}>
        <ToolbarButton label="Kalın" active={editorState?.bold} disabled={disabled} onPress={() => editor?.chain().focus().toggleBold().run()}><Bold /></ToolbarButton>
        <ToolbarButton label="İtalik" active={editorState?.italic} disabled={disabled} onPress={() => editor?.chain().focus().toggleItalic().run()}><Italic /></ToolbarButton>
        <ToolbarButton label="Altı çizili" active={editorState?.underline} disabled={disabled} onPress={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon /></ToolbarButton>
        <ToolbarButton label="Üstü çizili" active={editorState?.strike} disabled={disabled} onPress={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></ToolbarButton>
      </span>
      <span className={styles.toolbarGroup}>
        <ToolbarButton label="Madde işaretli liste" active={editorState?.bulletList} disabled={disabled} onPress={() => editor?.chain().focus().toggleBulletList().run()}><List /></ToolbarButton>
        <ToolbarButton label="Numaralı liste" active={editorState?.orderedList} disabled={disabled} onPress={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarButton>
        <ToolbarButton label="Alıntı" active={editorState?.blockquote} disabled={disabled} onPress={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></ToolbarButton>
        <ToolbarButton label="Kod bloğu" active={editorState?.codeBlock} disabled={disabled} onPress={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 /></ToolbarButton>
        <ToolbarButton label="Bağlantı ekle veya düzenle" active={editorState?.link} disabled={disabled} onPress={() => {setLinkValue(String(editor?.getAttributes('link').href ?? ''));setLinkOpen(true);}}><Link2 /></ToolbarButton>
        <ToolbarButton label="Tablo ekle" disabled={disabled} onPress={() => editor?.chain().focus().insertTable({rows: 3, cols: 2, withHeaderRow: true}).run()}><Table2 /></ToolbarButton>
      </span>
      <span className={styles.toolbarGroup}>
        <ToolbarButton label="Geri al" disabled={disabled || !editorState?.undo} onPress={() => editor?.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Yinele" disabled={disabled || !editorState?.redo} onPress={() => editor?.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
      </span>
    </div> : null}
    {linkOpen && !disabled ? <div className={styles.linkPanel} role="group" aria-label="Bağlantı düzenle" onKeyDown={(event) => {
      if (event.key === 'Escape') {event.preventDefault();setLinkOpen(false);editor?.commands.focus();}
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {event.preventDefault();applyLink();}
    }}>
      <label htmlFor={linkId}>Bağlantı adresi</label>
      <div className={styles.linkControls}><input id={linkId} value={linkValue} placeholder="https://" autoFocus onChange={(event) => {setLinkValue(event.currentTarget.value);setError('');}} />
        <button type="button" onClick={applyLink}>Uygula</button><button type="button" onClick={() => {setLinkOpen(false);editor?.commands.focus();}}>Vazgeç</button></div>
    </div> : null}
    <EditorContent editor={editor} />
    <p className={styles.fallbackNotice}>{error ? <span role="alert">{error}</span> : null}<output aria-live="polite">{countText}</output></p>
  </section>;
}
