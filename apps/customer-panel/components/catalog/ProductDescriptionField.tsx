"use client";

import { Extension, type Editor } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import { CharacterCount } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Columns3,
  Eraser,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Maximize2,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { createElement, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  normalizeProductDescriptionRichText,
  type ProductDescriptionRichTextNode,
} from "@celebix/platform-config/src/product-description-rich-text";
import {
  normalizePastedProductDescriptionHtml,
  normalizeStoredProductDescription,
} from "@/lib/product-description-editor";
import styles from "./product-description-editor.module.css";

type ProductDescriptionPreviewProps = Readonly<{
  source?: string | null;
  emptyMessage?: string;
}>;

type ProductDescriptionFieldProps = Readonly<{
  defaultValue?: string;
  readOnly?: boolean;
  rows?: number;
  className?: string;
}>;

type ToolbarButtonProps = Readonly<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}>;

const MAX_DESCRIPTION_LENGTH = 10_000;

const PasteSanitizer = Extension.create({
  name: "productDescriptionPasteSanitizer",
  priority: 1_000,
  transformPastedHTML: normalizePastedProductDescriptionHtml,
});

function renderRichTextNode(node: ProductDescriptionRichTextNode, key: string): ReactNode {
  if (node.type === "text") return node.value;
  const attributes: Record<string, unknown> = { key };
  if (node.tag === "a" && node.href) {
    attributes.href = node.href;
    if (node.external) {
      attributes.target = "_blank";
      attributes.rel = "noopener noreferrer nofollow";
    }
  }
  return createElement(
    node.tag,
    attributes,
    node.children.map((child, index) => renderRichTextNode(child, `${key}.${index}`)),
  );
}

function safeLinkHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)) return href;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(href)) return `https://${href}`;
  return undefined;
}

function blockType(editor: Editor | null) {
  if (editor?.isActive("heading", { level: 2 })) return "h2";
  if (editor?.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
}

function ToolbarButton({ label, active = false, disabled = false, onPress, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={styles.toolbarButton}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

export function ProductDescriptionPreview({
  source,
  emptyMessage = "Bu içerik henüz eklenmemiş.",
}: ProductDescriptionPreviewProps) {
  const richText = useMemo(
    () => normalizeProductDescriptionRichText(source),
    [source],
  );

  return (
    <section className="product-description-preview" aria-label="Biçimlendirilmiş içerik">
      {richText.length > 0 ? (
        <div className="product-description-rich-text">
          {richText.map((node, index) => renderRichTextNode(node, String(index)))}
        </div>
      ) : <p>{emptyMessage}</p>}
    </section>
  );
}

export function ProductDescriptionField({
  defaultValue = "",
  readOnly = false,
  className = "",
}: ProductDescriptionFieldProps) {
  const initialValue = useMemo(() => normalizeStoredProductDescription(defaultValue), [defaultValue]);
  const [source, setSource] = useState(initialValue);
  const [focusMode, setFocusMode] = useState(false);
  const [linkPanel, setLinkPanel] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      Placeholder.configure({ placeholder: "Ürün açıklamasını yazın veya biçimlendirilmiş içerik yapıştırın…" }),
      TableKit.configure({ table: { resizable: false } }),
      CharacterCount.configure({ limit: MAX_DESCRIPTION_LENGTH }),
      PasteSanitizer,
    ],
    content: initialValue || "<p></p>",
    editorProps: {
      attributes: {
        class: styles.editorContent,
        "aria-label": "Ürün açıklaması editörü",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      setSource(normalizeStoredProductDescription(nextEditor.getHTML()));
    },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [focusMode]);

  function setBlock(next: string) {
    if (!editor) return;
    if (next === "h2") editor.chain().focus().setHeading({ level: 2 }).run();
    else if (next === "h3") editor.chain().focus().setHeading({ level: 3 }).run();
    else editor.chain().focus().setParagraph().run();
  }

  function openLinkPanel() {
    if (!editor) return;
    setLinkValue(String(editor.getAttributes("link").href ?? ""));
    setLinkError("");
    setLinkPanel(true);
  }

  function applyLink() {
    if (!editor) return;
    const href = safeLinkHref(linkValue);
    if (href === undefined) {
      setLinkError("Geçerli bir HTTP(S), e-posta veya telefon bağlantısı girin.");
      return;
    }
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkPanel(false);
    setLinkError("");
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkPanel(false);
    setLinkValue("");
    setLinkError("");
  }

  const characterCount = editor?.storage.characterCount.characters() ?? 0;
  const htmlLength = source.length;
  const invalidLength = htmlLength > MAX_DESCRIPTION_LENGTH;
  const activeTable = editor?.isActive("table") ?? false;

  return (
    <div className={`${styles.field} ${focusMode ? styles.focusMode : ""} ${className}`.trim()}>
      <div className={styles.labelRow}>
        <div>
          <strong>Açıklama</strong>
          <small>Ürünün özelliklerini ve müşterinin bilmesi gereken bilgileri ekleyin.</small>
        </div>
        {!readOnly ? (
          <button type="button" className={styles.focusButton} onClick={() => setFocusMode((current) => !current)}>
            {focusMode ? <Minus aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            {focusMode ? "Küçült" : "Tam ekran"}
          </button>
        ) : null}
      </div>

      <div className={`${styles.editor} ${editor?.isFocused ? styles.editorFocused : ""}`}>
        {!readOnly ? (
          <div className={styles.toolbar} role="toolbar" aria-label="Açıklama biçimlendirme araçları">
            <select
              className={styles.blockSelect}
              aria-label="Metin biçimi"
              value={blockType(editor)}
              onChange={(event) => setBlock(event.currentTarget.value)}
            >
              <option value="paragraph">Paragraf</option>
              <option value="h2">Başlık 2</option>
              <option value="h3">Başlık 3</option>
            </select>
            <span className={styles.toolbarGroup}>
              <ToolbarButton label="Kalın" active={editor?.isActive("bold")} onPress={() => editor?.chain().focus().toggleBold().run()}><Bold /></ToolbarButton>
              <ToolbarButton label="İtalik" active={editor?.isActive("italic")} onPress={() => editor?.chain().focus().toggleItalic().run()}><Italic /></ToolbarButton>
              <ToolbarButton label="Altı çizili" active={editor?.isActive("underline")} onPress={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon /></ToolbarButton>
              <ToolbarButton label="Üstü çizili" active={editor?.isActive("strike")} onPress={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></ToolbarButton>
            </span>
            <span className={styles.toolbarGroup}>
              <ToolbarButton label="Madde işaretli liste" active={editor?.isActive("bulletList")} onPress={() => editor?.chain().focus().toggleBulletList().run()}><List /></ToolbarButton>
              <ToolbarButton label="Numaralı liste" active={editor?.isActive("orderedList")} onPress={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarButton>
              <ToolbarButton label="Alıntı" active={editor?.isActive("blockquote")} onPress={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></ToolbarButton>
              <ToolbarButton label="Bağlantı ekle veya düzenle" active={editor?.isActive("link")} onPress={openLinkPanel}><Link2 /></ToolbarButton>
            </span>
            <span className={styles.toolbarGroup}>
              <ToolbarButton label="Tablo ekle" active={activeTable} onPress={() => editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}><Table2 /></ToolbarButton>
              <ToolbarButton label="Biçimlendirmeyi temizle" onPress={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}><Eraser /></ToolbarButton>
            </span>
            <span className={`${styles.toolbarGroup} ${styles.historyGroup}`}>
              <ToolbarButton label="Geri al" disabled={!editor?.can().chain().focus().undo().run()} onPress={() => editor?.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
              <ToolbarButton label="Yinele" disabled={!editor?.can().chain().focus().redo().run()} onPress={() => editor?.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
            </span>
          </div>
        ) : null}

        {linkPanel ? (
          <div className={styles.linkPanel} role="dialog" aria-label="Bağlantı düzenle">
            <label>
              <span>Bağlantı adresi</span>
              <input value={linkValue} onChange={(event) => setLinkValue(event.currentTarget.value)} placeholder="https://" autoFocus />
            </label>
            <button type="button" className={styles.linkApply} onClick={applyLink}>Uygula</button>
            {editor?.isActive("link") ? <button type="button" className={styles.linkRemove} onClick={removeLink}><Link2Off /> Kaldır</button> : null}
            <button type="button" className={styles.linkCancel} onClick={() => setLinkPanel(false)}>Vazgeç</button>
            {linkError ? <p role="alert">{linkError}</p> : null}
          </div>
        ) : null}

        {activeTable && !readOnly ? (
          <div className={styles.tableToolbar} aria-label="Tablo araçları">
            <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}><Rows3 /> Satır ekle</button>
            <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()}><Columns3 /> Sütun ekle</button>
            <button type="button" onClick={() => editor?.chain().focus().deleteTable().run()}><Trash2 /> Tabloyu sil</button>
          </div>
        ) : null}

        <EditorContent editor={editor} />
      </div>

      <input type="hidden" name="description" value={source} readOnly />
      {!readOnly ? (
        <div className={styles.footer}>
          <span>Biçimlendirilmiş metin yapıştırabilirsiniz.</span>
          <span className={invalidLength ? styles.countError : ""}>{characterCount.toLocaleString("tr-TR")} karakter</span>
        </div>
      ) : null}
      {invalidLength ? <p className={styles.lengthError} role="alert">Açıklama biçimlendirmeyle birlikte 10.000 karakteri aşamaz.</p> : null}
    </div>
  );
}
