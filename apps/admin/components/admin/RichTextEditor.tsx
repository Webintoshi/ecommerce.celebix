"use client";

import { useEffect, useMemo } from "react";
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
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  extractPlainTextFromProductDescription,
  normalizeProductDescriptionHtml,
} from "@celebix/platform-config/src/product-description-rich-text";

type ToolbarAction =
  | "undo"
  | "redo"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "underline"
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
  { id: "undo", label: "Geri Al", icon: Undo2 },
  { id: "redo", label: "Yinele", icon: Redo2 },
  { id: "h2", label: "H2", icon: Heading2 },
  { id: "h3", label: "H3", icon: Heading3 },
  { id: "bold", label: "Kalın", icon: Bold },
  { id: "italic", label: "İtalik", icon: Italic },
  { id: "underline", label: "Altı Çizili", icon: UnderlineIcon },
  { id: "ul", label: "Liste", icon: List },
  { id: "ol", label: "Numaralı", icon: ListOrdered },
  { id: "quote", label: "Alıntı", icon: Quote },
  { id: "link", label: "Bağlantı", icon: Link2 },
  { id: "clear", label: "Temizle", icon: X },
];

function isActionActive(editor: Editor | null, action: ToolbarAction) {
  if (!editor) {
    return false;
  }

  switch (action) {
    case "h2":
      return editor.isActive("heading", { level: 2 });
    case "h3":
      return editor.isActive("heading", { level: 3 });
    case "bold":
      return editor.isActive("bold");
    case "italic":
      return editor.isActive("italic");
    case "underline":
      return editor.isActive("underline");
    case "ul":
      return editor.isActive("bulletList");
    case "ol":
      return editor.isActive("orderedList");
    case "quote":
      return editor.isActive("blockquote");
    case "link":
      return editor.isActive("link");
    default:
      return false;
  }
}

function canRunAction(editor: Editor | null, action: ToolbarAction) {
  if (!editor) {
    return false;
  }

  switch (action) {
    case "undo":
      return editor.can().chain().focus().undo().run();
    case "redo":
      return editor.can().chain().focus().redo().run();
    case "h2":
      return editor.can().chain().focus().toggleHeading({ level: 2 }).run();
    case "h3":
      return editor.can().chain().focus().toggleHeading({ level: 3 }).run();
    case "bold":
      return editor.can().chain().focus().toggleBold().run();
    case "italic":
      return editor.can().chain().focus().toggleItalic().run();
    case "underline":
      return editor.can().chain().focus().toggleUnderline().run();
    case "ul":
      return editor.can().chain().focus().toggleBulletList().run();
    case "ol":
      return editor.can().chain().focus().toggleOrderedList().run();
    case "quote":
      return editor.can().chain().focus().toggleBlockquote().run();
    case "link":
      return true;
    case "clear":
      return true;
    default:
      return false;
  }
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Metni buraya yazın veya WordPress benzeri editörlerden doğrudan yapıştırın...",
  error,
  minHeightClassName = "min-h-[220px]",
}: RichTextEditorProps) {
  const normalizedValue = useMemo(() => normalizeProductDescriptionHtml(value), [value]);
  const plainTextValue = useMemo(
    () => extractPlainTextFromProductDescription(normalizedValue),
    [normalizedValue],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: false,
        protocols: ["http", "https", "mailto", "tel"],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: normalizedValue || "<p></p>",
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-neutral max-w-none px-5 py-4 text-sm text-gray-900 outline-none",
          "focus:outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-gray-400",
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300",
          "[&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:text-xl",
          "[&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold",
          "[&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
          minHeightClassName,
        ),
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(normalizeProductDescriptionHtml(nextEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentNormalized = normalizeProductDescriptionHtml(editor.getHTML());
    if (currentNormalized !== normalizedValue) {
      editor.commands.setContent(normalizedValue || "<p></p>", false);
    }
  }, [editor, normalizedValue]);

  const runToolbarAction = (action: ToolbarAction) => {
    if (!editor) {
      return;
    }

    if (action === "undo") {
      editor.chain().focus().undo().run();
      return;
    }

    if (action === "redo") {
      editor.chain().focus().redo().run();
      return;
    }

    if (action === "link") {
      const previousHref = editor.getAttributes("link").href as string | undefined;
      const href = window.prompt("Bağlantıyı girin", previousHref || "https://");

      if (href === null) {
        return;
      }

      const nextHref = href.trim();
      if (!nextHref) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }

      editor.chain().focus().extendMarkRange("link").setLink({ href: nextHref }).run();
      return;
    }

    if (action === "clear") {
      editor.chain().focus().clearNodes().unsetAllMarks().run();
      return;
    }

    if (action === "h2") {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
      return;
    }

    if (action === "h3") {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
      return;
    }

    if (action === "ul") {
      editor.chain().focus().toggleBulletList().run();
      return;
    }

    if (action === "ol") {
      editor.chain().focus().toggleOrderedList().run();
      return;
    }

    if (action === "quote") {
      editor.chain().focus().toggleBlockquote().run();
      return;
    }

    if (action === "bold") {
      editor.chain().focus().toggleBold().run();
      return;
    }

    if (action === "italic") {
      editor.chain().focus().toggleItalic().run();
      return;
    }

    if (action === "underline") {
      editor.chain().focus().toggleUnderline().run();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TOOLBAR_ACTIONS.map((action) => {
          const isActive = isActionActive(editor, action.id);
          const isDisabled = !canRunAction(editor, action.id);

          return (
            <button
              key={action.id}
              type="button"
              disabled={isDisabled}
              onMouseDown={(event) => {
                event.preventDefault();
                runToolbarAction(action.id);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                isActive
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-900 hover:text-gray-900",
                isDisabled && "cursor-not-allowed opacity-45 hover:border-gray-200 hover:text-gray-600",
              )}
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all",
          error ? "border-rose-300 bg-rose-50/20" : "border-gray-200",
          editor?.isFocused && !error ? "border-blue-500 ring-4 ring-blue-50" : "",
        )}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <p>WordPress veya başka editörlerden başlık, liste ve kalın metni birlikte yapıştırabilirsiniz.</p>
        <p>{plainTextValue.length} karakter</p>
      </div>
    </div>
  );
}
