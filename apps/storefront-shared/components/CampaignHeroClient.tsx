"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";

import styles from "./campaign-home.module.css";

export function CampaignHeroClient({ children, count }: Readonly<{ children: ReactNode; count: number }>) {
  const railRef = useRef<HTMLDivElement>(null);
  const move = (direction: -1 | 1) => railRef.current?.scrollBy({ left: direction * railRef.current.clientWidth, behavior: "smooth" });
  return <div className={styles.heroShell}><div className={styles.heroRail} ref={railRef}>{children}</div>{count > 1 ? <div className={styles.heroControls}><button type="button" aria-label="Önceki slayt" onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button><button type="button" aria-label="Sonraki slayt" onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button></div> : null}</div>;
}
