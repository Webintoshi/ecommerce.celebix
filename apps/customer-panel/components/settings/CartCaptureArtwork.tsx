import styles from './store-tools.module.css';

export function CartCaptureArtwork({ className }: Readonly<{ className?: string }> = {}) {
    return <svg className={[styles.artwork, className].filter(Boolean).join(' ')} viewBox="0 0 180 144" aria-hidden="true" focusable="false">
        <ellipse cx="91" cy="119" rx="73" ry="13" className={styles.artMuted} />
        <path d="M24 37h14l15 64h56" className={styles.artLines} />
        <path d="M43 49h78l-11 39H52z" className={styles.artOutline} />
        <path d="M64 60v17m20-17v17m20-17v17" className={styles.artLines} />
        <circle cx="59" cy="113" r="7" className={styles.artOutline} />
        <circle cx="104" cy="113" r="7" className={styles.artOutline} />
        <rect x="111" y="70" width="49" height="38" rx="6" className={styles.artOutline} />
        <path d="m113 75 22 16 23-16m-45 28 15-12m30 12-16-12" className={styles.artLines} />
        <path d="M144 43v-8m10 14 7-3" className={styles.artAccent} />
        <circle cx="132" cy="44" r="3" className={styles.artOrange} />
    </svg>;
}
