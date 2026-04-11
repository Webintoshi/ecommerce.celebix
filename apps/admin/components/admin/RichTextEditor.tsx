"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractPlainTextFromProductDescription,
  normalizeProductDescriptionHtml,
} from "@celebix/platform-config/src/product-description-rich-text";

type ToolbarAction =
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "ul"
  | "ol"
  | "quote"
  | "link"
  | "clear";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  minHeightClassName?: string;
};

const TOOLBAR_ACTIONS: Array<{
  id: ToolbarAction;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "h2", label: "H2", icon: Heading2 },
  { id: "h3", label: "H3", icon: Heading3 },
  { id: "bold", label: "Kalın", icon: Bold },
  { id: "italic", label: "İtalik", icon: Italic },
  { id: "ul", label: "Liste", icon: List },
  { id: "ol", label: "Numaralı", icon: ListOrdered },
  { id: "quote", label: "Alıntı", icon: Quote },
  { id: "link", label: "Bağlantı", icon: Link2 },
  { id: "clear", label: "Temizle", icon: X },
];

function isSelectionInsideEditor(selection: Selection | null, editor: HTMLDivElement | null) {
  if (!selection || !editor || selection.rangeCount === 0) {
    return false;
  }

  return editor.contains(selection.anchorNode);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Metni buraya yazın veya WordPress benzeri editörlerden doğrudan yapıştırın...",
  error,
  minHeightClassName = "min-h-[220px]",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const normalizedValue = useMemo(() => normalizeProductDescriptionHtml(value), [value]);
  const plainTextValue = useMemo(
    () => extractPlainTextFromProductDescription(normalizedValue),
    [normalizedValue],
  );

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    if (editor.innerHTML !== normalizedValue) {
      editor.innerHTML = normalizedValue;
    }
  }, [normalizedValue]);

  const syncEditorState = useCallback(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextValue = normalizeProductDescriptionHtml(editor.innerHTML);
    if (editor.innerHTML !== nextValue) {
      editor.innerHTML = nextValue;
    }

    onChange(nextValue);
  }, [onChange]);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const saveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!isSelectionInsideEditor(selection, editorRef.current) || selection.rangeCount === 0) {
      return;
    }

    savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    const savedRange = savedSelectionRef.current;

    if (!selection || !savedRange) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(savedRange);
    return true;
  }, []);

  const runToolbarAction = useCallback(
    (action: ToolbarAction) => {
      focusEditor();
      restoreSelection();

      const selection = window.getSelection();
      if (!isSelectionInsideEditor(selection, editorRef.current)) {
        return;
      }

      if (action === "link") {
        const href = window.prompt("Bağlantıyı girin", "https://");
        if (!href) {
          return;
        }

        document.execCommand("createLink", false, href);
        syncEditorState();
        saveSelection();
        return;
      }

      if (action === "clear") {
        document.execCommand("removeFormat");
        syncEditorState();
        saveSelection();
        return;
      }

      if (action === "h2" || action === "h3" || action === "quote") {
        const blockMap: Record<"h2" | "h3" | "quote", string> = {
          h2: "H2",
          h3: "H3",
          quote: "BLOCKQUOTE",
        };

        document.execCommand("formatBlock", false, blockMap[action]);
        syncEditorState();
        saveSelection();
        return;
      }

      if (action === "ul") {
        document.execCommand("insertUnorderedList");
        syncEditorState();
        saveSelection();
        return;
      }

      if (action === "ol") {
        document.execCommand("insertOrderedList");
        syncEditorState();
        saveSelection();
        return;
      }

      if (action === "bold") {
        document.execCommand("bold");
        syncEditorState();
        saveSelection();
        return;
      }

      if (action === "italic") {
        document.execCommand("italic");
        syncEditorState();
        saveSelection();
      }
    },
    [focusEditor, restoreSelection, saveSelection, syncEditorState],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();

      const html = event.clipboardData.getData("text/html");
      const text = event.clipboardData.getData("text/plain");
      const nextValue = normalizeProductDescriptionHtml(html || text);

      document.execCommand("insertHTML", false, nextValue);
      syncEditorState();
      saveSelection();
    },
    [saveSelection, syncEditorState],
  );

  const handleToolbarMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, action: ToolbarAction) => {
      event.preventDefault();
      runToolbarAction(action);
    },
    [runToolbarAction],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onMouseDown={(event) => handleToolbarMouseDown(event, action.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-gray-900 hover:text-gray-900"
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all",
          error ? "border-rose-300 bg-rose-50/20" : "border-gray-200",
          isFocused && !error ? "border-blue-500 ring-4 ring-blue-50" : "",
        )}
      >
        {!plainTextValue && !isFocused ? (
          <div className="pointer-events-none absolute left-5 right-5 top-4 text-sm text-gray-400">
            {placeholder}
          </div>
        ) : null}

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => {
            setIsFocused(true);
            restoreSelection();
          }}
          onBlur={() => {
            setIsFocused(false);
            saveSelection();
            syncEditorState();
          }}
          onInput={() => {
            syncEditorState();
            saveSelection();
          }}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onPaste={handlePaste}
          className={cn(
            "prose prose-neutral max-w-none px-5 py-4 text-sm text-gray-900 outline-none",
            minHeightClassName,
            "[&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
          )}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <p>WordPress veya başka editörlerden başlık, liste ve kalın metni birlikte yapıştırabilirsiniz.</p>
        <p>{plainTextValue.length} karakter</p>
      </div>
    </div>
  );
}
