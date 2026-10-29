import { PanelInitialDataGate } from "@/components/panel/PanelInitialDataGate";
import styles from "./catalog-workspace-loading.module.css";

export function CatalogWorkspaceLoading({ layout = "list", label = "Katalog yükleniyor…" }: {
  layout?: "list" | "editor" | "product" | "preview";
  label?: string;
}) {
  const field = (index: number) => <div className={styles.field} key={index} aria-hidden="true"><span /><span /></div>;
  return <PanelInitialDataGate pending={true}>{<div className={`${styles.root} ${styles[layout]}`} data-catalog-loading={layout} role="status" aria-label={label}>
    {layout === "list" ? <><div className={styles.toolbar} aria-hidden="true"><span /><span /></div>{Array.from({ length: 5 }, (_, index) => <div className={styles.row} key={index} aria-hidden="true"><span /><span /><span /></div>)}</>
      : layout === "preview" ? <><div className={styles.image} aria-hidden="true" /><div className={styles.main}>{Array.from({ length: 3 }, (_, index) => field(index))}</div></>
        : <><div className={styles.main}><div className={styles.panel}>{Array.from({ length: 3 }, (_, index) => field(index))}</div><div className={styles.panel}>{Array.from({ length: 2 }, (_, index) => field(index))}</div></div>{layout === "product" ? <div className={styles.aside}><div className={styles.panel}>{field(0)}{field(1)}</div><div className={styles.image} aria-hidden="true" /></div> : null}</>}
  </div>}</PanelInitialDataGate>;
}
