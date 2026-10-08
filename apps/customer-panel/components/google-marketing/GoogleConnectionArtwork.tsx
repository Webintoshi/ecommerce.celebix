import type { GoogleMarketingService } from "@celebix/saas-contracts";
import styles from "./google-marketing.module.css";

/** Extend the panel's flat outline family without loading images or animation. */
export function GoogleConnectionArtwork({ service }: Readonly<{ service: GoogleMarketingService }>) {
  return <svg className={styles.artwork} viewBox="0 0 180 144" aria-hidden="true" focusable="false">
    <ellipse cx="90" cy="119" rx="72" ry="16" className={styles.artSoft} />
    {service === "gtm" ? <>
      <rect x="23" y="27" width="103" height="77" rx="10" className={styles.artOutline} />
      <path d="M23 45h103" className={styles.artLine} />
      <path d="M36 36h1m7 0h1m7 0h1" className={styles.artLine} />
      <rect x="38" y="60" width="24" height="29" rx="4" className={styles.artMuted} />
      <rect x="70" y="60" width="40" height="10" rx="4" className={styles.artMuted} />
      <path d="M75 81h22" className={styles.artDetail} />
      <path d="M111 64h24l26 27-29 29-26-27V70a6 6 0 0 1 5-6Z" className={styles.artOutline} />
      <circle cx="119" cy="77" r="3" className={styles.artLine} />
      <path d="m126 89-6 6 6 6m10-12 6 6-6 6M143 31l5-8m4 23h10" className={styles.artAccent} />
    </> : service === "ads" ? <>
      <rect x="26" y="36" width="106" height="80" rx="10" className={styles.artOutline} />
      <path d="M42 98h70M42 98V55" className={styles.artLine} />
      <path d="m52 84 15-12 15 7 24-26" className={styles.artAccent} />
      <circle cx="136" cy="44" r="25" className={styles.artOutline} />
      <circle cx="136" cy="44" r="13" className={styles.artLine} />
      <path d="m136 44 23-23m-9 0h9v9M24 22l-6-6m-1 26H8" className={styles.artAccent} />
    </> : <>
      <rect x="22" y="28" width="117" height="82" rx="10" className={styles.artOutline} />
      <path d="M22 47h117" className={styles.artLine} />
      <path d="M35 38h1m7 0h1m7 0h1" className={styles.artLine} />
      <rect x="36" y="60" width="88" height="15" rx="6" className={styles.artMuted} />
      <path d="M39 88h36m-36 9h22" className={styles.artDetail} />
      <circle cx="124" cy="98" r="21" className={styles.artOutline} />
      <path d="m139 113 18 17" className={styles.artLine} />
      <path d="M115 98h18m-9-9v18M151 49l7-6m-5 19h11" className={styles.artAccent} />
    </>}
  </svg>;
}
