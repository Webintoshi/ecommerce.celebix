import type { PromotionDraft } from "@/lib/promotion-ui/model";
import styles from "./promotion-illustration.module.css";

const KINDS = new Set([
  "first_paid_order_percentage", "basket_threshold_fixed_amount", "free_shipping",
  "buy_x_get_y", "quantity_tiers", "category_percentage", "bundle_price", "gift",
  "abandoned_cart", "vip", "influencer_code", "custom",
]);

const BENEFIT_ART: Readonly<Record<string, string>> = {
  percentage: "influencer_code", fixed_amount: "basket_threshold_fixed_amount",
  free_shipping: "free_shipping", buy_x_get_y: "buy_x_get_y",
  quantity_tiers: "quantity_tiers", bundle_price: "bundle_price", gift: "gift",
};

export function promotionIllustrationKind(draft: Pick<PromotionDraft, "templateId" | "benefit">): string {
  return draft.templateId === "custom" ? BENEFIT_ART[draft.benefit.kind] ?? "custom" : draft.templateId;
}

function AccentRays() {
  return <path d="m143 35 9-7m-13-2 3-12m5 29 13-1" className={styles.accent} strokeWidth="3" />;
}

function Percent({ x, y }: Readonly<{ x: number; y: number }>) {
  return <g transform={`translate(${x} ${y})`} className={styles.accent}>
    <path d="m0 18 15-18" />
    <circle cx="2" cy="2" r="3" /><circle cx="13" cy="16" r="3" />
  </g>;
}

function Basket() {
  return <>
    <path d="M41 62h86l-11 47H52L41 62Z" className={styles.paper} />
    <path d="m57 62 20-27m34 27L91 35M65 76l4 20m15-20v20m19-20-4 20" />
    <path d="M39 62h90" />
  </>;
}

function Scene({ kind }: Readonly<{ kind: string }>) {
  switch (kind) {
    case "first_paid_order_percentage":
      return <>
        <path d="M54 52h59l7 59H47l7-59Z" className={styles.paper} />
        <path d="M68 60V40c0-12 6-19 16-19s16 7 16 19v20" strokeWidth="3" />
        <path d="m84 73 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z" className={styles.star} />
        <AccentRays />
      </>;
    case "basket_threshold_fixed_amount":
      return <>
        <Basket />
        <path d="M126 71h22l8 12v24h-30V71Z" className={styles.paper} transform="rotate(9 141 89)" />
        <Percent x={133} y={84} />
        <path d="M119 48h14m-7-7v14" className={styles.accent} />
      </>;
    case "free_shipping":
      return <>
        <path d="M41 48h66v51H41V48Zm66 17h23l16 20v14h-39V65Z" className={styles.paper} />
        <path d="M116 71v14h24M43 91h13m22 8h35m19 0h14" />
        <circle cx="64" cy="100" r="10" className={styles.paper} />
        <circle cx="124" cy="100" r="10" className={styles.paper} />
        <path d="M22 62h12m-18 14h18m-9 14h9" className={styles.accent} strokeWidth="3" />
        <path d="M56 58h34" className={styles.mutedLine} />
      </>;
    case "buy_x_get_y":
      return <>
        <rect x="26" y="51" width="44" height="58" rx="5" className={styles.paper} />
        <rect x="60" y="32" width="43" height="77" rx="5" className={styles.paper} />
        <path d="M74 44h15M39 65h17" className={styles.mutedLine} />
        <rect x="111" y="68" width="43" height="41" rx="4" className={styles.paper} />
        <path d="M107 67h51v12h-51V67Z" className={styles.paper} />
        <path d="M132 68v41m0-41c-25-2-15-22-2-5l2 5Zm0 0c25-2 15-22 2-5l-2 5Z" className={styles.accent} />
      </>;
    case "quantity_tiers":
      return <>
        <path d="M31 109V86h31V63h31V37h32v72H31Z" className={styles.paper} />
        <path d="M62 86v23m31-46v46" className={styles.mutedLine} />
        <path d="m46 63 22-20 15 8 24-24m-11 0h11v11" className={styles.accent} strokeWidth="3" />
        <circle cx="137" cy="94" r="20" className={styles.paper} />
        <Percent x={130} y={85} />
      </>;
    case "category_percentage":
      return <>
        <path d="M23 100c-6-19-14-23-22-26 1 15 8 22 22 26Zm0 0c0-23 10-31 19-34-1 17-7 27-19 34Z" className={styles.leaf} />
        <path d="M14 99h18l-3 13H17l-3-13Z" className={styles.star} />
        <rect x="48" y="29" width="108" height="82" rx="8" className={styles.paper} />
        <path d="M49 46h106" />
        <circle cx="58" cy="37" r="1.5" className={styles.dot} /><circle cx="65" cy="37" r="1.5" className={styles.dot} /><circle cx="72" cy="37" r="1.5" className={styles.dot} />
        {[59, 91, 123].map(x => <rect key={x} x={x} y="58" width="23" height="33" rx="4" className={styles.tile} />)}
        <path d="M131 25v-8m-4 4h8" className={styles.accent} />
      </>;
    case "bundle_price":
      return <>
        <rect x="33" y="64" width="28" height="45" rx="6" className={styles.paper} />
        <path d="M39 64V52h16v12" className={styles.paper} />
        <rect x="67" y="39" width="31" height="70" rx="6" className={styles.paper} />
        <path d="M74 39V27h17v12" className={styles.paper} />
        <rect x="103" y="70" width="37" height="39" rx="6" className={styles.paper} />
        <path d="M104 80h35" />
        <path d="M30 86h112m-56-9v32m0-23c-25 0-21-20-5-7l5 7Zm0 0c25 0 21-20 5-7l-5 7Z" className={styles.accent} />
      </>;
    case "gift":
      return <>
        <rect x="46" y="66" width="82" height="44" rx="4" className={styles.paper} />
        <g transform="rotate(-9 85 57)">
          <rect x="41" y="45" width="92" height="18" rx="4" className={styles.paper} />
          <path d="M87 45v18m0-18c-29-2-23-27-5-8l5 8Zm0 0c29-2 23-27 5-8l-5 8Z" className={styles.accent} />
        </g>
        <path d="M87 68v42" className={styles.accent} />
        <path d="m143 43 11-7m-14-4 2-10m5 31 12 1" className={styles.accent} />
      </>;
    case "abandoned_cart":
      return <>
        <path d="M32 47h14l12 49h63l12-36H50" className={styles.paper} />
        <path d="M69 70v15m18-15v15m18-15v15" className={styles.mutedLine} />
        <circle cx="66" cy="108" r="6" className={styles.paper} /><circle cx="113" cy="108" r="6" className={styles.paper} />
        <path d="M105 49a22 22 0 1 1 36-16m0-13v14h-14" className={styles.accent} strokeWidth="3" />
      </>;
    case "vip":
      return <>
        <rect x="34" y="38" width="94" height="57" rx="7" className={styles.tile} transform="rotate(-8 81 66)" />
        <rect x="49" y="54" width="94" height="57" rx="7" className={styles.paper} transform="rotate(5 96 82)" />
        <path d="M62 72h29m-29 13h18" className={styles.mutedLine} />
        <path d="m115 70 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z" className={styles.star} />
        <path d="M144 31v-9m-4 4h8" className={styles.accent} />
      </>;
    case "influencer_code":
      return <>
        <path d="M35 46h103v13a10 10 0 0 0 0 20v20H35V79a10 10 0 0 0 0-20V46Z" className={styles.paper} transform="rotate(-6 86 72)" />
        <path d="M101 47v52" className={styles.mutedLine} strokeDasharray="3 5" />
        <Percent x={59} y={64} />
        <path d="M137 38h14m-7-7v14" className={styles.accent} />
      </>;
    default:
      return <>
        <rect x="44" y="25" width="92" height="87" rx="8" className={styles.paper} />
        <path d="M59 47h60m-60 22h60m-60 22h60" />
        <circle cx="78" cy="47" r="6" className={styles.knob} />
        <circle cx="103" cy="69" r="6" className={styles.knob} />
        <circle cx="83" cy="91" r="6" className={styles.knob} />
        <path d="M148 68v10m-5-5h10" className={styles.accent} />
      </>;
  }
}

export function PromotionIllustration({ kind, className }: Readonly<{
  kind: string; className?: string;
}>) {
  const asset = KINDS.has(kind) ? kind : "custom";
  return <svg
    className={`${styles.art}${className ? ` ${className}` : ""}`}
    data-promotion-illustration={asset}
    viewBox="0 0 180 140" width={180} height={140}
    fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"
  >
    <ellipse cx="89" cy="114" rx="69" ry="12" className={styles.base} />
    <Scene kind={asset} />
  </svg>;
}
