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
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  normalizePastedProductDescriptionHtml,
  normalizeStoredProductDescription,
} from "@/lib/product-description-editor";
import { ContentAuthoringPanel, type ContentAuthoringBridge } from "@/components/content-authoring/ContentAuthoringPanel";
import { ContentAuthoringOrigin, applyDescriptionDraft, captureDescriptionSelection, descriptionOrigin, type PendingContentOrigin } from "@/lib/content-authoring-ui/editor";
import { renderContentAuthoringDescription } from "@/lib/server-content-authoring/render";
import type { ContentAuthoringRequest, ContentAuthoringField, ContentGenerationView } from "@celebix/saas-contracts";
import styles from "./product-description-editor.module.css";
export { ProductDescriptionPreview } from "./ProductDescriptionPreview";

type ProductDescriptionFieldProps = Readonly<{
  defaultValue?: string;
  readOnly?: boolean;
  rows?: number;
  className?: string;
  compact?: boolean;
  previewCollapsed?: boolean;
  onValueChange?(value: string): void;
  initialOrigin?: PendingContentOrigin | null;
  onOriginChange?(origin: PendingContentOrigin | null): void;
  authoring?: Readonly<{
    capture(): Readonly<{request: ContentAuthoringRequest; draftRevision: string; sessionId: string}>;
    applyField?(field: ContentAuthoringField, generation: ContentGenerationView): boolean;
    fields?: readonly ContentAuthoringField[];
  }>;

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
  if (editor?.isActive("heading", { level: 4 })) return "h4";
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

export function ProductDescriptionField({
  defaultValue = "",
  readOnly = false,
  className = "",
  compact = false,
  onValueChange,
  authoring,
  initialOrigin = null,
  onOriginChange,
}: ProductDescriptionFieldProps) {
  const initialValue = useMemo(() => normalizeStoredProductDescription(defaultValue), [defaultValue]);
  const [aiOpen, setAiOpen] = useState(false);
  const aiTrigger = useRef<HTMLButtonElement>(null);
  const edited = useRef(false);
  const loadedOrigin = useRef(initialOrigin);
  const originHistoryChanged = useRef(false);
  const callbacks = useRef({authoring,onOriginChange,onValueChange,initialOrigin});
  callbacks.current={authoring,onOriginChange,onValueChange,initialOrigin};
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
        heading: { levels: [2, 3, 4] },
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
      ContentAuthoringOrigin,
    ],
    content: initialValue || "<p></p>",
    onCreate: ({editor: created}) => { loadedOrigin.current = callbacks.current.initialOrigin; created.view.dispatch(created.state.tr.setDocAttribute("contentAuthoringOrigin", callbacks.current.initialOrigin).setMeta("addToHistory", false).setMeta("preventUpdate", true)); },
    editorProps: {
      attributes: {
        class: styles.editorContent,
        "aria-label": "Ürün açıklaması editörü",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      edited.current = true;
      if (JSON.stringify(descriptionOrigin(nextEditor)) !== JSON.stringify(loadedOrigin.current)) originHistoryChanged.current = true;
      const nextSource = normalizeStoredProductDescription(nextEditor.getHTML());
      setSource(nextSource);
      callbacks.current.onValueChange?.(nextSource);
      callbacks.current.onOriginChange?.(descriptionOrigin(nextEditor));
    },
  });

  useEffect(() => {
    if (!editor || originHistoryChanged.current || JSON.stringify(descriptionOrigin(editor)) === JSON.stringify(initialOrigin)) return;
    loadedOrigin.current = initialOrigin;
    editor.view.dispatch(editor.state.tr.setDocAttribute("contentAuthoringOrigin", initialOrigin).setMeta("addToHistory", false).setMeta("preventUpdate", true));
    if (edited.current) callbacks.current.onOriginChange?.(initialOrigin);
  }, [editor, initialOrigin]);

  useEffect(() => {
    editor?.setEditable(!readOnly, false);
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
    else if (next === "h4") editor.chain().focus().setHeading({ level: 4 }).run();
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

  const bridge: ContentAuthoringBridge = {
    capture() {
      if (!editor || !callbacks.current.authoring) throw new Error("editor_unavailable");
      const captured = callbacks.current.authoring.capture();
      const selection = editor.state.selection;
      const selected = captureDescriptionSelection(editor);
      return {request:{...captured.request,currentDraft:{...captured.request.currentDraft,description:normalizeStoredProductDescription(editor.getHTML())},selection:selected?{field:"description",text:selected.text}:null},lifecycle:{sessionId:captured.sessionId,draftRevision:JSON.stringify([captured.draftRevision,selection.from,selection.to]),selection:selected ? {from:selected.from,to:selected.to} : null}};
    },
    apply(field,generation,selection) {
      if(field !== "description") return callbacks.current.authoring?.applyField?.(field,generation) ?? false;
      if(!editor || !generation.draft?.description) return false;
      return applyDescriptionDraft(editor,renderContentAuthoringDescription(generation.draft.description),{generationId:generation.id,draftId:generation.draftId},selection);
    },
  };
  function closeAi() { setAiOpen(false); requestAnimationFrame(()=>aiTrigger.current?.focus()); }
  const characterCount = editor?.storage.characterCount.characters() ?? 0;
  const htmlLength = source.length;
  const invalidLength = htmlLength > MAX_DESCRIPTION_LENGTH;
  const activeTable = editor?.isActive("table") ?? false;

  return (
    <div className={`${styles.field} ${focusMode ? styles.focusMode : ""} ${compact ? styles.compact : ""} ${className}`.trim()}>
      <div className={styles.labelRow}>
        <div>
          <strong>Açıklama</strong>
          {!compact ? <small>Ürünün özelliklerini ve müşterinin bilmesi gereken bilgileri ekleyin.</small> : null}
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
            {authoring ? <button ref={aiTrigger} type="button" className={styles.focusButton} aria-expanded={aiOpen} onClick={() => setAiOpen(current=>!current)}><Sparkles aria-hidden="true" /> AI</button> : null}
            <select
              className={styles.blockSelect}
              aria-label="Metin biçimi"
              value={blockType(editor)}
              onChange={(event) => setBlock(event.currentTarget.value)}
            >
              <option value="paragraph">Paragraf</option>
              <option value="h2">Başlık 2</option>
              <option value="h3">Başlık 3</option>
              <option value="h4">Başlık 4</option>
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

        {aiOpen && authoring ? <ContentAuthoringPanel bridge={bridge} fields={authoring.fields} onClose={closeAi} /> : null}

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
          {!compact ? <span>Biçimlendirilmiş metin yapıştırabilirsiniz.</span> : null}
          <span className={invalidLength ? styles.countError : ""}>{characterCount.toLocaleString("tr-TR")} karakter</span>
        </div>
      ) : null}
      {invalidLength ? <p className={styles.lengthError} role="alert">Açıklama biçimlendirmeyle birlikte 10.000 karakteri aşamaz.</p> : null}
    </div>
  );
}
