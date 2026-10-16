import type { ReactNode } from "react";
import { AccountingArtwork, type AccountingArtworkVariant } from "./AccountingArtwork";
import styles from "./accounting.module.css";

export function AccountingEmptyState({ variant, title, description, action, compact = false }: {
  variant?: AccountingArtworkVariant;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return <div className={`${styles.illustratedEmpty} ${compact ? styles.compactEmpty : ""}`}>
    <AccountingArtwork variant={variant} />
    <div className={styles.emptyContent}><strong>{title}</strong>{description ? <p>{description}</p> : null}{action ? <div className={styles.emptyActions}>{action}</div> : null}</div>
  </div>;
}
