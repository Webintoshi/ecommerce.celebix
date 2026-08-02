import type { PublicStarterReview } from "@celebix/saas-contracts";

import styles from "./product-detail-experience.module.css";

export function ProductApprovedReviews({ reviews }: Readonly<{ reviews: readonly PublicStarterReview[] }>) {
  if (reviews.length === 0) return null;
  return <section className={styles.reviews} aria-labelledby="approved-reviews-title">
    <div className="store-container"><header><p className={styles.eyebrow}>DOĞRULANMIŞ DENEYİMLER</p><h2 id="approved-reviews-title">Müşteriler anlatıyor</h2></header><div className={styles.reviewGrid}>{reviews.map((review, index) => <article key={`${review.reviewerName}-${index}`}><p className={styles.stars} aria-label={`${review.rating} / 5 puan`}>{"★".repeat(review.rating)}<span aria-hidden="true">{"☆".repeat(5 - review.rating)}</span></p>{review.title ? <h3>{review.title}</h3> : null}<blockquote>{review.body}</blockquote><strong>{review.reviewerName}</strong>{review.merchantReply ? <aside><b>Mağazanın yanıtı</b><p>{review.merchantReply}</p></aside> : null}</article>)}</div></div>
  </section>;
}
