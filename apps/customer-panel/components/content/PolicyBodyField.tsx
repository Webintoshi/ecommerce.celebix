"use client";

import { Extension, type Editor } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import { EditorState } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, Code2, Columns3, Italic, Link2, Link2Off, List, ListOrdered, Quote,
  Redo2, Rows3, Strikethrough, Table2, Trash2, Underline as UnderlineIcon, Undo2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ProductDescriptionPreview } from "@/components/catalog/ProductDescriptionPreview";
import {
  policyBodyEditorHtml,
  policyBodyRoundTripSupported,
  policyBodySemanticSignature,
  safePolicyLinkHref,
  sanitizePolicyBodyPaste,
} from "@/lib/policy-body-editor";
import styles from "./policy-body-field.module.css";

export type PolicyBodyFieldProps = Readonly<{
  value: string;
  readOnly?: boolean;
  onValueChange(value: string): void;
}>;

type LoadedDocument = Readonly<{
  source: string;
  signature: string;
  supported: boolean;
}>;

const PolicyPasteSanitizer = Extension.create({
  name: "policyBodyPasteSanitizer",
  priority: 1_000,
  transformPastedHTML: sanitizePolicyBodyPaste,
});

function ToolbarButton({
  label, active = false, disabled = false, expanded, onPress, children,
}: Readonly<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  onPress(): void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      className={styles.toolbarButton}
      title={label}
      aria-label={label}
      aria-pressed={active}
      aria-expanded={expanded}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

function selectedBlock(editor: Editor | null): string {
  for (const level of [2, 3, 4]) {
    if (editor?.isActive("heading", { level })) return `h${level}`;
  }
  return "paragraph";
}

export function PolicyBodyField({ value, readOnly = false, onValueChange }: PolicyBodyFieldProps) {
  const linkId = useId();
  const latestValue = useRef(value);
  const latestOnChange = useRef(onValueChange);
  const readOnlyRef = useRef(readOnly);
  const loadedDocument = useRef<LoadedDocument | null>(null);
  const appliedValue = useRef<string | null>(null);
  const emittedValue = useRef<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [linkPanel, setLinkPanel] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  latestValue.current = value;
  latestOnChange.current = onValueChange;
  readOnlyRef.current = readOnly;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, underline: false }),
      Underline,
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        isAllowedUri: (url) => Boolean(safePolicyLinkHref(url)),
      }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "Metni yazın veya yapıştırın…" }),
      PolicyPasteSanitizer,
    ],
    content: "",
    editorProps: {
      attributes: { class: styles.editorContent, "aria-label": "Politika metni düzenleyicisi", "aria-multiline": "true", role: "textbox" },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const baseline = loadedDocument.current;
      if (!baseline?.supported || readOnlyRef.current) return;
      const safeHtml = policyBodyEditorHtml(nextEditor.getHTML());
      const nextValue = policyBodySemanticSignature(safeHtml) === baseline.signature ? baseline.source : safeHtml;
      if (nextValue === latestValue.current) return;
      emittedValue.current = nextValue;
      latestOnChange.current(nextValue);
    },
  });

  const editorState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      block: selectedBlock(current),
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      strike: current?.isActive("strike") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      blockquote: current?.isActive("blockquote") ?? false,
      codeBlock: current?.isActive("codeBlock") ?? false,
      link: current?.isActive("link") ?? false,
      table: current?.isActive("table") ?? false,
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  });

  useEffect(() => {
    if (!editor || appliedValue.current === value) return;
    appliedValue.current = value;
    // A controlled echo of an actual edit is already in the editor. Keep the
    // original baseline so undo can restore the untouched source byte for byte.
    if (emittedValue.current === value) {
      emittedValue.current = null;
      return;
    }
    emittedValue.current = null;
    const html = policyBodyEditorHtml(value);
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
    // Each external document starts a separate undo history. Loading must never
    // become an undoable edit, or undo could restore the previous policy/empty doc.
    editor.view.updateState(EditorState.create({ doc: editor.state.doc, schema: editor.schema, plugins: editor.state.plugins }));
    editor.view.dispatch(editor.state.tr);
    const compatible = policyBodyRoundTripSupported(value, editor.getHTML());
    loadedDocument.current = { source: value, signature: policyBodySemanticSignature(html), supported: compatible };
    setSupported(compatible);
    editor.setEditable(compatible && !readOnly, false);
    setLinkPanel(false);
    setLinkError("");
  }, [editor, value, readOnly]);

  useEffect(() => {
    editor?.setEditable(supported === true && !readOnly, false);
    if (readOnly) setLinkPanel(false);
  }, [editor, readOnly, supported]);

  function setBlock(next: string) {
    if (!editor) return;
    if (next === "h2" || next === "h3" || next === "h4") editor.chain().focus().setHeading({ level: Number(next.slice(1)) as 2 | 3 | 4 }).run();
    else editor.chain().focus().setParagraph().run();
  }

  function closeLinkPanel() {
    setLinkPanel(false);
    setLinkError("");
    editor?.commands.focus();
  }

  function openLinkPanel() {
    if (!editor) return;
    setLinkValue(String(editor.getAttributes("link").href ?? ""));
    setLinkError("");
    setLinkPanel(true);
  }

  function applyLink() {
    if (!editor) return;
    const href = safePolicyLinkHref(linkValue);
    if (href === undefined) {
      setLinkError("Geçerli bir bağlantı adresi girin.");
      return;
    }
    if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    else editor.chain().focus().extendMarkRange("link").unsetLink().run();
    closeLinkPanel();
  }

  if (supported === false) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackNotice} role="status">Bu metnin biçimini korumak için Kaynak sekmesinden düzenleyin.</p>
        <div className={styles.fallbackPreview}><ProductDescriptionPreview source={value} emptyMessage="Henüz metin yok." /></div>
      </div>
    );
  }

  const disabled = !editor || readOnly || supported !== true;
  return (
    <div className={styles.field} aria-busy={supported === null}>
      {!readOnly ? (
        <div className={styles.toolbar} role="toolbar" aria-label="Politika metni biçimlendirme">
          <select className={styles.blockSelect} aria-label="Metin biçimi" value={editorState?.block ?? "paragraph"} disabled={disabled} onChange={(event) => setBlock(event.currentTarget.value)}>
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
            <ToolbarButton label="Bağlantı ekle veya düzenle" active={editorState?.link} expanded={linkPanel} disabled={disabled} onPress={openLinkPanel}><Link2 /></ToolbarButton>
          </span>
          <span className={styles.toolbarGroup}>
            <ToolbarButton label="Kod bloğu" active={editorState?.codeBlock} disabled={disabled} onPress={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 /></ToolbarButton>
            <ToolbarButton label="Tablo ekle" active={editorState?.table} disabled={disabled} onPress={() => editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}><Table2 /></ToolbarButton>
          </span>
          <span className={styles.toolbarGroup}>
            <ToolbarButton label="Geri al" disabled={disabled || !editorState?.undo} onPress={() => editor?.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
            <ToolbarButton label="Yinele" disabled={disabled || !editorState?.redo} onPress={() => editor?.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
          </span>
        </div>
      ) : null}
      {linkPanel && !disabled ? (
        <div className={styles.linkPanel} role="group" aria-label="Bağlantı düzenle" onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); closeLinkPanel(); }
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); applyLink(); }
        }}>
          <label htmlFor={linkId}>Bağlantı adresi</label>
          <div className={styles.linkControls}>
            <input id={linkId} value={linkValue} onChange={(event) => { setLinkValue(event.currentTarget.value); setLinkError(""); }} placeholder="https://" aria-invalid={Boolean(linkError)} aria-describedby={linkError ? `${linkId}-error` : undefined} autoFocus />
            <button type="button" onClick={applyLink}>Uygula</button>
            {editorState?.link ? <button type="button" onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); closeLinkPanel(); }}><Link2Off aria-hidden="true" /> Kaldır</button> : null}
            <button type="button" onClick={closeLinkPanel}>Vazgeç</button>
          </div>
          {linkError ? <p id={`${linkId}-error`} role="alert">{linkError}</p> : null}
        </div>
      ) : null}
      {editorState?.table && !disabled ? (
        <div className={styles.tableTools} aria-label="Tablo araçları">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().addRowAfter().run()}><Rows3 aria-hidden="true" /> Satır ekle</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().addColumnAfter().run()}><Columns3 aria-hidden="true" /> Sütun ekle</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().deleteTable().run()}><Trash2 aria-hidden="true" /> Tabloyu kaldır</button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
