import type { PublicStarterHomeSection } from "@celebix/saas-contracts";

import styles from "./campaign-home.module.css";

type Section = Extract<PublicStarterHomeSection, { kind: "testimonials" }>;

export function CampaignTestimonials({ section }: Readonly<{ section: Section }>) {
  return <section className={styles.testimonials} aria-labelledby="starter-testimonials-heading"><header><span>DOĞRULANMIŞ DENEYİMLER</span><h2 id="starter-testimonials-heading">{section.heading}</h2></header><ul>{section.items.map((review, index) => <li key={`${review.reviewerName}-${index}`}><div aria-label={`${review.rating} / 5 yıldız`}>{"★".repeat(review.rating)}<span aria-hidden="true">{"★".repeat(5 - review.rating)}</span></div>{review.title ? <strong>{review.title}</strong> : null}<blockquote>{review.body}</blockquote><p>{review.reviewerName}</p>{review.merchantReply ? <aside><strong>Mağaza yanıtı</strong><p>{review.merchantReply}</p></aside> : null}</li>)}</ul></section>;
}
