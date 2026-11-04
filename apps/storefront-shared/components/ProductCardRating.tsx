import type { PublicProduct } from "@celebix/saas-contracts";
import styles from "./product-card-rating.module.css";

const STAR = "M10 1.5 12.63 6.83 18.5 7.68 14.25 11.82 15.25 17.67 10 14.91 4.75 17.67 5.75 11.82 1.5 7.68 7.37 6.83Z";

export function ProductCardRating({ summary }: Readonly<{ summary: NonNullable<PublicProduct["reviewSummary"]> }>) {
  const label = summary.reviewCount
    ? `5 üzerinden ${summary.averageRating.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} yıldız, ${summary.reviewCount.toLocaleString("tr-TR")} değerlendirme`
    : "Henüz değerlendirme yok";
  return <span className={styles.rating} role="img" aria-label={label} data-product-card-rating>
    <span className={styles.stars} aria-hidden="true">
      {[0, 1, 2, 3, 4].map(index => <span className={styles.star} key={index} data-review-star>
        <svg viewBox="0 0 20 20" fill="none"><path d={STAR} /></svg>
        <svg viewBox="0 0 20 20" className={styles.fill} style={{ clipPath: `inset(0 ${100 - Math.min(1, Math.max(0, summary.averageRating - index)) * 100}% 0 0)` }} data-review-star-fill><path d={STAR} /></svg>
      </span>)}
    </span>
    <span className={styles.count} aria-hidden="true">({summary.reviewCount.toLocaleString("tr-TR")})</span>
  </span>;
}
