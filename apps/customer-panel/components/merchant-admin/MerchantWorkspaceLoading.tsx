import { PanelSkeletonBlock } from "@/components/panel/PanelPageShell";
import styles from "./merchant-workspace-loading.module.css";

/** Presentation only: never mount real inputs or actions before their data is ready. */
export function MerchantWorkspaceLoading({ label, layout = "list", rows = 3, preview = true }: Readonly<{
  label: string;
  layout?: "list" | "editor" | "analytics" | "settings";
  rows?: number;
  preview?: boolean;
}>) {
  return <div className={`${styles.loading} ${styles[layout]} ${layout === "editor" && !preview ? styles.editorSingle : ""}`} role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    {layout === "editor" ? <>
      <div className={styles.form}><PanelSkeletonBlock className={styles.heading} /><div className={styles.fields}>{[0, 1, 2, 3].map(index => <div key={index}><PanelSkeletonBlock className={styles.label} /><PanelSkeletonBlock className={styles.input} /></div>)}</div><PanelSkeletonBlock className={styles.body} /><PanelSkeletonBlock className={styles.footer} /></div>
      {preview ? <aside className={styles.preview} aria-hidden="true"><PanelSkeletonBlock className={styles.previewArt} /><PanelSkeletonBlock className={styles.heading} /><PanelSkeletonBlock className={styles.input} /><PanelSkeletonBlock className={styles.input} /></aside> : null}
    </> : layout === "settings" ? <>{[0, 1, 2].map(index => <div className={styles.settingSection} key={index} aria-hidden="true"><PanelSkeletonBlock className={styles.heading} /><div className={styles.fields}>{[0, 1].map(field => <div key={field}><PanelSkeletonBlock className={styles.label} /><PanelSkeletonBlock className={styles.input} /></div>)}</div></div>)}<PanelSkeletonBlock className={styles.footer}/></> : layout === "analytics" ? <>
      <div className={styles.metrics}>{[0].map(index => <PanelSkeletonBlock className={styles.metric} key={index} />)}</div>
      <div className={styles.reports}>{[0, 1, 2].map(index => <PanelSkeletonBlock className={styles.report} key={index} />)}</div>
    </> : <>
      <div className={styles.tableHead} aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <PanelSkeletonBlock key={index} />)}</div>
      {Array.from({ length: Math.max(1, Math.min(rows, 20)) }, (_, row) => <div className={styles.row} key={row} aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <PanelSkeletonBlock key={index} />)}</div>)}
    </>}
  </div>;
}
