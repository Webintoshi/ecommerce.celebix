"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { guzideBrowsingReturnRoute } from "./useGuzideBrowsingContinuity";
import styles from "./guzide-product-return.module.css";

function returnLabel(route: string | null, fallbackHref: string, fallbackLabel: string): string {
  if (!route || route.split("?", 1)[0] === fallbackHref.split("?", 1)[0]) return fallbackLabel;
  if (/^(?:\/(?:tr|en))?\/?$/u.test(route)) return "Ana sayfaya dön";
  if (/^(?:\/(?:tr|en))?\/search(?:\?|$)/u.test(route)) return "Arama sonuçlarına dön";
  return "Ürünlere dön";
}

export function GuzideProductReturn({ storefrontId, fallbackHref, fallbackLabel, className }: Readonly<{ storefrontId: string; fallbackHref: string; fallbackLabel: string; className?: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [route, setRoute] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setRoute(guzideBrowsingReturnRoute(storefrontId));
    // The stable shell binds this arrival in the same effect commit; read after it.
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("popstate", update);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("popstate", update); };
  }, [storefrontId, pathname, fallbackHref]);
  return <Link className={`${styles.returnLink}${className ? ` ${className}` : ""}`} href={route ?? fallbackHref} prefetch={false} data-guzide-product-return onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (guzideBrowsingReturnRoute(storefrontId) && window.history.length > 1) { event.preventDefault(); router.back(); }
  }}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="m14 5-7 7 7 7M7 12h14" /></svg><span>{returnLabel(route, fallbackHref, fallbackLabel)}</span></Link>;
}
