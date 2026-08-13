"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import {
  getWorkspaceActiveHref,
  type PanelWorkspaceTab,
} from "@/lib/panel-ui/workspace-navigation";

import styles from "./panel-workspace-shell.module.css";

export function PanelWorkspaceShell({
  title,
  description,
  actions,
  tabs,
  children,
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs: readonly PanelWorkspaceTab[];
  children: ReactNode;
}>) {
  const pathname = usePathname() ?? "";
  const activeHref = getWorkspaceActiveHref(pathname, tabs);

  return (
    <PanelPageShell>
      <PanelPageHeader title={title} description={description} actions={actions} />
      {tabs.length ? (
        <nav className={styles.tabs} aria-label={`${title} bölümleri`}>
          {tabs.map((tab) => {
            const active = tab.href === activeHref;
            return (
              <Link
                className={`${styles.tab} ${active ? styles.active : ""}`}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                key={tab.href}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <div className={styles.content}>{children}</div>
    </PanelPageShell>
  );
}
