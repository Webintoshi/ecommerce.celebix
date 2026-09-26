"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { SETTINGS_DESTINATIONS } from "./settings-navigation";
import styles from "./settings-workspace.module.css";

export function SettingsWorkspace({ children, route }: { children: ReactNode; route?: string }) {
  const pathname = usePathname();
  const path = route ?? pathname;
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState("");
  const navigationLink = useRef<HTMLAnchorElement>(null);
  const current = SETTINGS_DESTINATIONS.find(({ href }) => path === href || path.startsWith(`${href}/`));
  const label = current?.label ?? "Ayarlar";

  function navigate(href: string) { setPendingNavigation(href); }

  useEffect(() => {
    if (!pendingNavigation) return;
    // Use the same link path as the sidebar so each editor can guard pending work.
    navigationLink.current?.click();
    setPendingNavigation("");
  }, [pendingNavigation]);

  useEffect(() => {
    if (!destination) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [destination]);

  useEffect(() => {
    function hasUnsavedChanges() { return !!root.current?.querySelector('[data-settings-dirty="true"]'); }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function guard(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download") || !hasUnsavedChanges()) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      setDestination(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener("click", guard, true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { document.removeEventListener("click", guard, true); window.removeEventListener("beforeunload", beforeUnload); };
  }, []);

  return <div ref={root} className={styles.workspace} data-settings-workspace>
    <h1 className={styles.srOnly}>{label}</h1>
    <PanelTopbarBridge title={label} hideHeading context={
      <nav className={styles.breadcrumb} aria-label="Konum">
        <Link href="/settings">Ayarlar</Link>
        {current ? <><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{label}</span></> : null}
      </nav>
    } />
    {current ? <div className={styles.mobileNavigation}>
      <Link href="/settings" aria-label="Ayarlara dön"><ArrowLeft size={18} aria-hidden="true" /></Link>
      <label><span className={styles.srOnly}>Ayar bölümü</span><select value={current.href} onChange={(event) => navigate(event.target.value)}>
        {SETTINGS_DESTINATIONS.map(({ href, label: option }) => <option key={href} value={href}>{option}</option>)}
      </select></label>
    </div> : null}
    <Link ref={navigationLink} href={pendingNavigation || path} hidden tabIndex={-1} aria-hidden="true" />
    {children}
    {destination ? <dialog ref={dialog} className={styles.discardDialog} aria-labelledby="settings-discard-title" onCancel={() => setDestination("")}>
      <h2 id="settings-discard-title">Değişiklikler kaydedilmedi</h2>
      <p>Bu sayfadan ayrılırsan değişikliklerin silinir.</p>
      <div><button type="button" autoFocus onClick={() => setDestination("")}>Düzenlemeye devam et</button><button type="button" onClick={() => { const href = destination; setDestination(""); router.push(href); }}>Kaydetmeden ayrıl</button></div>
    </dialog> : null}
  </div>;
}
