import styles from "./popup-artwork.module.css";

export type PopupArtworkVariant = "minimal" | "image_left" | "discount" | "empty";

/** Small, static scenes from the panel's approved outline illustration family. */
export function PopupArtwork({ variant = "minimal", className }: Readonly<{ variant?: PopupArtworkVariant; className?: string }>) {
  return <svg className={[styles.artwork, className].filter(Boolean).join(" ")} viewBox="0 0 240 160" aria-hidden="true" focusable="false">
    <ellipse cx="120" cy="138" rx="96" ry="16" className={variant === "image_left" || variant === "empty" ? styles.peach : styles.soft} />
    {variant === "minimal" ? <>
      <rect x="40" y="24" width="152" height="112" rx="14" className={styles.paper} />
      <path d="M40 47h152" className={styles.line} />
      <path d="M54 35h1m10 0h1m10 0h1" className={styles.line} />
      <path d="M65 66h68" className={styles.detail} />
      <path d="M65 80h102m-102 12h77" className={styles.mutedLine} />
      <rect x="65" y="108" width="70" height="12" rx="6" className={styles.muted} />
      <path d="m161 112 13 10-8 2-3 8-8-16a3 3 0 0 1 6-4Z" className={styles.paper} />
      <path d="M209 48h12m-19-17 6-8M25 87H15" className={styles.accent} />
    </> : variant === "image_left" ? <>
      <rect x="32" y="25" width="165" height="108" rx="14" className={styles.paper} />
      <path d="M32 47h165" className={styles.line} />
      <path d="M46 36h1m10 0h1m10 0h1" className={styles.line} />
      <rect x="47" y="62" width="62" height="55" rx="6" className={styles.soft} />
      <circle cx="90" cy="76" r="6" className={styles.muted} />
      <path d="m51 107 16-21 13 15 9-9 16 15" className={styles.line} />
      <path d="M126 67h50m-50 15h39" className={styles.detail} />
      <rect x="126" y="99" width="42" height="12" rx="6" className={styles.muted} />
      <path d="M201 121c-1-19 3-34 13-45 2 19-1 33-13 45Zm-1 0c-16-9-24-22-26-38 16 7 25 20 26 38Z" className={styles.leaf} />
      <path d="M190 119h24l-5 20h-14Z" className={styles.accentFill} />
      <path d="M25 55 16 49m191 8 8-7" className={styles.accent} />
    </> : variant === "discount" ? <>
      <path d="M42 53a12 12 0 0 1 12-12h39v10a12 12 0 0 0 24 0V41h73a12 12 0 0 1 12 12v26a12 12 0 0 0 0 24v26a12 12 0 0 1-12 12h-73v-10a12 12 0 0 0-24 0v10H54a12 12 0 0 1-12-12v-26a12 12 0 0 0 0-24Z" className={styles.paper} transform="rotate(-8 122 91)" />
      <path d="M101 67v7m0 12v7m0 12v7" className={styles.mutedLine} transform="rotate(-8 122 91)" />
      <path d="m132 111 31-40" className={styles.accent} />
      <circle cx="134" cy="76" r="9" className={styles.accent} />
      <circle cx="162" cy="106" r="9" className={styles.accent} />
      <path d="M56 77h19m-19 14h14" className={styles.detail} />
      <path d="M211 33 219 26m-4 26h12M33 25l-4-9" className={styles.accent} />
    </> : <>
      <rect x="29" y="27" width="155" height="108" rx="14" className={styles.paper} />
      <path d="M29 50h155" className={styles.line} />
      <path d="M44 38h1m10 0h1m10 0h1" className={styles.line} />
      <rect x="44" y="65" width="30" height="44" rx="6" className={styles.muted} />
      <rect x="86" y="65" width="30" height="44" rx="6" className={styles.muted} />
      <path d="M46 122h52" className={styles.mutedLine} />
      <rect x="108" y="73" width="100" height="72" rx="12" className={styles.paper} />
      <path d="m188 85 5 5m0-5-5 5" className={styles.line} />
      <path d="M124 98h44m-44 12h62" className={styles.detail} />
      <rect x="124" y="124" width="48" height="8" rx="4" className={styles.muted} />
      <path d="M205 46v10m-5-5h10M219 98h10m-14-22 7-5" className={styles.accent} />
    </>}
  </svg>;
}
