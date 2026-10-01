"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep the navigation visible without changing the page's document height. */
export function SioraHeaderChrome({ children, headerStyle, headerWidth, headerLayout }: Readonly<{ children: ReactNode; headerStyle: string; headerWidth: string; headerLayout: string }>) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [view, setView] = useState({ scrolled: false, compact: false });

  useEffect(() => {
    const upper = headerRef.current?.querySelector<HTMLElement>(".siora-header-bar");
    if (!upper) return;
    upper.inert = view.compact;
    return () => { upper.inert = false; };
  }, [view.compact]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    let frame = 0;
    let anchor = Math.max(0, window.scrollY);
    let previous = anchor;
    let direction = 0;
    let compact = false;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const nextDirection = Math.sign(y - previous);
      if (nextDirection && nextDirection !== direction) { anchor = previous; direction = nextDirection; }
      const upperHeight = header.querySelector<HTMLElement>(".siora-header-bar")?.offsetHeight ?? 80;
      const engaged = header.contains(document.activeElement) || Boolean(header.querySelector(".siora-desktop-navigation details[open]"));
      if (!desktop.matches || y <= upperHeight || engaged) compact = false;
      else if (Math.abs(y - anchor) > 12) compact = direction > 0;
      previous = y;
      setView((current) => current.scrolled === (y > 24) && current.compact === compact ? current : { scrolled: y > 24, compact });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const closeMenus = (except?: HTMLDetailsElement) => {
      header.querySelectorAll<HTMLDetailsElement>(".siora-desktop-navigation details[open]").forEach((menu) => { if (menu !== except) menu.open = false; });
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !header.contains(event.target)) closeMenus(); };
    const breakpoint = () => { if (!desktop.matches) closeMenus(); schedule(); };
    const toggle = (event: Event) => {
      const menu = event.target;
      if (menu instanceof HTMLDetailsElement && menu.open && menu.closest(".siora-desktop-navigation")) closeMenus(menu);
      schedule();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !desktop.matches) return;
      const menu = header.querySelector<HTMLDetailsElement>(".siora-desktop-navigation details[open]");
      if (menu) { event.preventDefault(); closeMenus(); menu.querySelector<HTMLElement>("summary")?.focus(); }
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    desktop.addEventListener("change", breakpoint);
    document.addEventListener("pointerdown", outside);
    header.addEventListener("toggle", toggle, true);
    header.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      desktop.removeEventListener("change", breakpoint);
      document.removeEventListener("pointerdown", outside);
      header.removeEventListener("toggle", toggle, true);
      header.removeEventListener("keydown", escape);
      closeMenus();
    };
  }, [pathname]);

  return <header ref={headerRef} className="siora-header" data-storefront-header-bar data-header-style={headerStyle} data-header-width={headerWidth} data-header-layout={headerLayout} data-siora-home={/^(?:\/(?:tr|en))?\/?$/u.test(pathname)} data-siora-scrolled={view.scrolled} data-siora-compact={view.compact} onFocusCapture={() => setView((current) => current.compact ? { ...current, compact: false } : current)}>
    {children}
  </header>;
}
