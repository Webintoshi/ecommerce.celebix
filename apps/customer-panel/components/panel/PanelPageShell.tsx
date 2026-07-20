import Link from "next/link";
import type { ReactNode } from "react";

import { PanelTopbarBridge } from "./PanelTopbarChrome";
import styles from "./panel-shell.module.css";

export function PanelPageShell({ children }: { children: ReactNode }) {
  return <section className={styles.pageShell}>{children}</section>;
}

export function PanelPageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <PanelTopbarBridge title={props.title} subtitle={props.description} actions={props.actions} />
      <header className={styles.pageHeader}>
        <div><h1>{props.title}</h1>{props.description ? <p>{props.description}</p> : null}</div>
        {props.actions ? <div className={styles.pageActions}>{props.actions}</div> : null}
      </header>
    </>
  );
}

export function PanelPanel({ children, title }: { children: ReactNode; title?: string }) {
  return <section className={styles.panel}>{title ? <h2>{title}</h2> : null}{children}</section>;
}

export function PanelToolbar({ children }: { children: ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>;
}

export function PanelBadge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>;
}

export function PanelStatusBadge({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={styles["status-" + tone]}>{children}</span>;
}

export function PanelMetricCard(props: { label: string; value: string; detail?: string }) {
  return <article className={styles.metric}><span>{props.label}</span><strong>{props.value}</strong>{props.detail ? <small>{props.detail}</small> : null}</article>;
}

export function PanelDataTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className={styles.tableScroll}><table aria-label={label}>{children}</table></div>;
}

export function PanelLoadingState({ label = "Yükleniyor" }: { label?: string }) {
  return <p className={styles.state} role="status">{label}</p>;
}

export function PanelActionButton(props: { href: string; children: ReactNode; primary?: boolean }) {
  return <Link className={props.primary ? styles.primaryAction : styles.action} href={props.href}>{props.children}</Link>;
}

export function PanelEmptyState(props: { title: string; description: string; action?: ReactNode }) {
  return <div className={styles.empty}><h2>{props.title}</h2><p>{props.description}</p>{props.action}</div>;
}

export function PanelSkeletonBlock({ className }: { className?: string }) {
  return <span className={`${styles.skeletonBlock} ${className ?? ""}`} aria-hidden="true" />;
}
