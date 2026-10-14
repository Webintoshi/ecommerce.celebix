import styles from "./marketplaces.module.css";

/** The same lightweight line artwork family used throughout the panel. */
export function MarketplaceArtwork({ variant = "connect", className = "" }: {
  variant?: "connect" | "products" | "store";
  className?: string;
}) {
  return <svg viewBox="0 0 200 144" className={`${styles.artwork} ${className}`} aria-hidden="true" focusable="false">
    <ellipse cx="99" cy="123" rx="78" ry="13" className={styles.artSoft} />
    {variant === "products" ? <>
      <rect x="33" y="22" width="132" height="99" rx="12" className={styles.artPaper} />
      <path d="M33 43h132" className={styles.artLine} />
      <circle cx="45" cy="33" r="2" className={styles.artInk} /><circle cx="54" cy="33" r="2" className={styles.artInk} />
      <rect x="47" y="56" width="29" height="39" rx="5" className={styles.artMuted} />
      <rect x="85" y="56" width="29" height="39" rx="5" className={styles.artMuted} />
      <rect x="123" y="56" width="28" height="39" rx="5" className={styles.artMuted} />
      <path d="m56 105 5 5 9-10m24 5 5 5 9-10m24 5 5 5 9-10" className={styles.artAccent} />
      <path d="m174 44 8-4m-14-8 4-8" className={styles.artAccent} />
    </> : variant === "store" ? <>
      <path d="M44 64h111v56H44z" className={styles.artPaper} />
      <path d="m37 59 15-31h94l17 31v7a13 13 0 0 1-25 4 13 13 0 0 1-25 0 13 13 0 0 1-26 0 13 13 0 0 1-25 0 13 13 0 0 1-25-4z" className={styles.artPaper} />
      <path d="m69 29-7 30m26-30-1 30m25-30 1 30m25-30 7 30" className={styles.artLine} />
      <path d="M58 84h37v23H58z" className={styles.artMuted} /><path d="M115 84h25v36h-25z" className={styles.artLine} />
      <path d="m173 35 6-8m-2 20 10-2" className={styles.artAccent} />
    </> : <>
      <rect x="22" y="29" width="97" height="78" rx="10" className={styles.artPaper} />
      <path d="M22 49h97" className={styles.artLine} />
      <circle cx="35" cy="39" r="2" className={styles.artInk} /><circle cx="44" cy="39" r="2" className={styles.artInk} />
      <rect x="37" y="62" width="25" height="28" rx="4" className={styles.artMuted} /><path d="M74 66h29M74 77h21M74 88h14" className={styles.artLine} />
      <path d="M130 69h36l13 14v37h-49z" className={styles.artPaper} /><path d="M130 83h49m-36-14v14m23-14v14M148 99h12" className={styles.artLine} />
      <path d="M111 105h15m-6-6 6 6-6 6m18-66h26m-6-6 6 6-6 6" className={styles.artAccent} />
      <path d="m168 28 5-8m8 19 9-3" className={styles.artAccent} />
    </>}
  </svg>;
}
