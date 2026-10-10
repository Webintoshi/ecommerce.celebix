"use client";
import type { LuckyWheelAppearance, LuckyWheelPublicPrize } from "@celebix/saas-contracts";
import styles from "./LuckyWheel.module.css";
export function luckyWheelInk(hex: string): string { const rgb = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4); return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722 > .179 ? "#000000" : "#ffffff"; }
export function LuckyWheelGraphic({ prizes, appearance, angle, animate, prizeId, onAnimationEnd }: Readonly<{ prizes: readonly LuckyWheelPublicPrize[]; appearance: LuckyWheelAppearance; angle: number; animate: boolean; prizeId?: string; onAnimationEnd(): void }>) {
  const count = prizes.length, step = 360 / count;
  const point = (degrees: number, radius = 144) => [Number((160 + Math.cos(degrees * Math.PI / 180) * radius).toFixed(3)), Number((160 + Math.sin(degrees * Math.PI / 180) * radius).toFixed(3))];
  return <div className={styles.wheel} aria-hidden="true" data-wheel-prize={prizeId}>
    <span className={styles.pointer} data-wheel-pointer style={{ borderTopColor: appearance.accent }} />
    <svg className={`${styles.graphic} ${animate ? styles.spinning : ""}`} viewBox="0 0 320 320" style={{ transform: `rotate(${angle}deg)` }} onTransitionEnd={event => { if (event.propertyName === "transform") onAnimationEnd(); }}>
      <circle cx="160" cy="160" r="153" fill={appearance.accent} />
      {prizes.map((prize, index) => { const start = -90 + index * step, end = start + step, [x1, y1] = point(start), [x2, y2] = point(end), middle = start + step / 2, [tx, ty] = point(middle, 94), fill = index % 2 ? appearance.sliceB : appearance.sliceA; return <g key={prize.id} data-wheel-slice>
        <path d={`M160 160 L${x1} ${y1} A144 144 0 0 1 ${x2} ${y2} Z`} fill={fill} stroke={appearance.background} strokeWidth="1.5" />
        <text transform={`translate(${tx} ${ty}) rotate(${middle + 90})`} textAnchor="middle" dominantBaseline="middle" fill={luckyWheelInk(fill)} fontSize={prize.label.length > 18 ? 11 : 13} fontWeight="750">{prize.label}</text>
      </g>; })}
      <circle cx="160" cy="160" r="35" fill={appearance.background} stroke={appearance.accent} strokeWidth="5" />
      <text x="160" y="163" textAnchor="middle" dominantBaseline="middle" fill={luckyWheelInk(appearance.background)} fontSize="15" fontWeight="750">Çevir</text>
    </svg>
  </div>;
}
