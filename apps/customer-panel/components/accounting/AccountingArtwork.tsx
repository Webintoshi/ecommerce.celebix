import styles from "./accounting.module.css";

export type AccountingArtworkVariant = "overview" | "accounts" | "receivables" | "expenses" | "suppliers" | "cash" | "profitability" | "invoice" | "legal";

export function AccountingArtwork({ variant = "overview", className = "" }: { variant?: AccountingArtworkVariant; className?: string }) {
  const receipt = variant === "overview" || variant === "expenses" || variant === "invoice";
  return <svg className={`${styles.artwork} ${className}`} viewBox="0 0 200 144" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="100" cy="126" rx="76" ry="12" fill="var(--cp-art-peach)" />
    <g stroke="var(--cp-art-outline)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {receipt ? <>
        <path d="M59 20h69l15 15v88l-12-6-12 6-12-6-12 6-12-6-12 6-12-6V20Z" fill="var(--cp-surface)" />
        <path d="M128 20v16h15M76 49h47M76 61h32M76 98h47" />
        <rect x="76" y="75" width="11" height="11" rx="2" fill="var(--cp-art-soft)" stroke="none" />
        <path d={variant === "expenses" ? "M151 73v28m-8-8 8 8 8-8" : "m151 83 7 7 14-16"} stroke="var(--cp-brand)" />
      </> : variant === "accounts" || variant === "cash" ? <>
        <rect x="34" y="52" width="126" height="67" rx="10" fill="var(--cp-surface)" />
        <path d="M48 52V40h93v12M34 72h126" />
        <rect x="104" y="84" width="56" height="24" rx="6" fill="var(--cp-art-soft)" />
        <circle cx="119" cy="96" r="3" fill="var(--cp-art-outline)" stroke="none" />
        {variant === "cash" ? <><path d="M64 40V23h31v17M73 30h13" /><path d="m48 91 6 6 11-14" stroke="var(--cp-brand)" /></> : <><path d="m48 91 9-9 9 9M57 83v21" stroke="var(--cp-brand)" /><circle cx="152" cy="38" r="16" fill="var(--cp-surface)" /><path d="M152 30v16m-5-12h10m-10 8h10" stroke="var(--cp-brand)" /></>}
      </> : variant === "suppliers" ? <>
        <path d="m31 76 37-17 38 17v42H31V76Z" fill="var(--cp-surface)" /><path d="m31 76 37 17 38-17M68 93v25M49 68l38 17" />
        <path d="M121 29h38l13 13v77h-51V29Z" fill="var(--cp-surface)" /><path d="M158 29v14h14M133 58h27M133 69h19M133 80h27" />
        <path d="M98 45h15m-5-5 5 5-5 5" stroke="var(--cp-brand)" />
      </> : variant === "profitability" ? <>
        <rect x="34" y="29" width="132" height="91" rx="10" fill="var(--cp-surface)" /><path d="M51 47v56h98" />
        <path d="m63 86 20-18 21 8 29-31" stroke="var(--cp-brand)" strokeWidth="3" /><path d="M123 45h10v10" stroke="var(--cp-brand)" />
        <path d="M68 103v-9m21 9V90m21 13V89m21 14V71" stroke="var(--cp-art-soft)" strokeWidth="8" />
      </> : variant === "legal" ? <>
        <rect x="45" y="25" width="96" height="98" rx="9" fill="var(--cp-surface)" /><path d="M63 44h60M63 57h43M63 70h60M63 83h31" />
        <path d="m151 80 17 7v15c0 13-17 22-17 22s-17-9-17-22V87l17-7Z" fill="var(--cp-surface)" /><path d="m143 101 6 6 11-14" stroke="var(--cp-brand)" />
      </> : <>
        <rect x="30" y="40" width="94" height="75" rx="9" fill="var(--cp-surface)" /><path d="M46 58h49M46 70h33M46 94h49" />
        <circle cx="142" cy="87" r="32" fill="var(--cp-surface)" /><path d="M142 68v20l13 8" stroke="var(--cp-brand)" /><path d="M135 43h15M142 43v12" />
      </>}
      <path d="m166 22 3-10m7 19 9-5" stroke="var(--cp-brand)" strokeWidth="3" />
    </g>
  </svg>;
}
