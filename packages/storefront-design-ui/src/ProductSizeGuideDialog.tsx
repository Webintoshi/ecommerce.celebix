"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Shared by the public product page and the merchant's product preview. */
export function ProductSizeGuideDialog({ heading, children }: Readonly<{ heading: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const layer = dialog?.parentElement;
    if (!dialog || !layer) return;
    const overflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((element) => element !== layer);
    const inert = siblings.map((element) => element.hasAttribute("inert"));
    siblings.forEach((element) => element.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      siblings.forEach((element, index) => { if (!inert[index]) element.removeAttribute("inert"); });
      triggerRef.current?.focus();
    };
  }, [open]);
  return <>
    <button className="celebix-size-guide-trigger" type="button" ref={triggerRef} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{heading}<span aria-hidden="true">↗</span></button>
    {open ? createPortal(<div className="celebix-size-guide-layer" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="celebix-size-guide-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><h2 id={titleId}>{heading}</h2><button type="button" aria-label="Rehberi kapat" onClick={() => setOpen(false)}>×</button></header>
        <div className="celebix-size-guide-content">{children}</div>
      </div>
    </div>, document.body) : null}
  </>;
}
