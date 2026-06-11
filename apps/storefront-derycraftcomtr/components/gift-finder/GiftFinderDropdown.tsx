"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HeaderIconChevron } from "@/components/layout/HeaderIcons";
import { cn } from "@/lib/utils";

type GiftFinderDropdownOption = {
  value: string;
  label: string;
};

type GiftFinderDropdownProps = {
  label: string;
  value: string;
  placeholder: string;
  options: GiftFinderDropdownOption[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function GiftFinderDropdown({
  label,
  value,
  placeholder,
  options,
  onChange,
  isOpen,
  onOpen,
  onClose,
}: GiftFinderDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const listboxId = useId();
  const selectableOptions = options.filter((option) => option.value);
  const selected = selectableOptions.find((option) => option.value === value);
  const displayLabel = selected?.label ?? placeholder;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    function updatePosition() {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      setMenuPosition({
        top: triggerRect.bottom + 8,
        left: triggerRect.left,
        width: Math.max(triggerRect.width, 220),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const menu =
    isOpen && menuPosition ? (
      <ul
        id={listboxId}
        role="listbox"
        style={{
          position: "fixed",
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
        }}
        className="z-[120] max-h-72 overflow-y-auto border border-[#E5D9CA] bg-white py-1.5 shadow-[0_22px_60px_rgba(18,16,13,0.14)]"
      >
        {selectableOptions.map((option) => (
          <li key={option.value} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={cn(
                "block w-full px-4 py-2.5 text-left text-[13px] transition-colors",
                option.value === value
                  ? "bg-[#FBF8F4] font-medium text-[#8B6914]"
                  : "text-neutral-800 hover:bg-[#FAF7F2]",
              )}
              onClick={() => {
                onChange(option.value);
                onClose();
              }}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 basis-[150px] sm:basis-[170px] lg:max-w-[210px]">
      <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "group flex w-full items-center justify-between gap-3 border-0 border-b bg-transparent pb-3 text-left transition-colors",
          isOpen ? "border-[#8B6914] text-[#8B6914]" : "border-neutral-900/80 text-neutral-900",
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        <span className={cn("truncate text-[13px] sm:text-sm", !selected && "text-neutral-500")}>
          {displayLabel}
        </span>
        <HeaderIconChevron
          size={12}
          className={cn("shrink-0 text-neutral-400 transition-transform group-hover:text-[#8B6914]", isOpen && "rotate-180 text-[#8B6914]")}
        />
      </button>

      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
