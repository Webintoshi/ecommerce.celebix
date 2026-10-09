import styles from './store-tools.module.css';

export function OrderBumpArtwork() {
  return <svg className={styles.artwork} viewBox="0 0 180 144" aria-hidden="true" focusable="false">
    <ellipse cx="91" cy="120" rx="72" ry="12" className={styles.artMuted} />
    <path d="M24 34h14l14 66h69M43 49h84l-11 38H51" className={styles.artLines} />
    <rect x="58" y="24" width="27" height="40" rx="4" className={styles.artOutline} />
    <path d="M65 34h13M65 44h8" className={styles.artLines} />
    <rect x="91" y="33" width="26" height="31" rx="4" className={styles.artOutline} />
    <circle cx="58" cy="113" r="7" className={styles.artOutline} />
    <circle cx="110" cy="113" r="7" className={styles.artOutline} />
    <circle cx="143" cy="72" r="20" className={styles.artOutline} />
    <path d="M134 72h18m-9-9v18M147 35v-8m10 14 7-4" className={styles.artAccent} />
  </svg>;
}
