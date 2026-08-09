import Link from "next/link";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";

import styles from "./campaign-home.module.css";

type CategorySection = Extract<PublicStarterHomeSection, { kind: "category_grid" }>;
type SplitSection = Extract<PublicStarterHomeSection, { kind: "split_campaign" }>;
type StorySection = Extract<PublicStarterHomeSection, { kind: "brand_story" }>;

export function CampaignCategories({ section }: Readonly<{ section: CategorySection }>) {
  if (!section.items.length) return null;
  const layoutClass = section.layout === "duo" ? styles.categoryGridDuo : styles.categoryGridGrid;
  return <section className={styles.categories} aria-labelledby="campaign-category-title"><div className={styles.sectionHeading}><div><span>KOLEKSİYONLAR</span><h2 id="campaign-category-title">{section.heading}</h2></div></div><div className={`${styles.categoryGrid} ${layoutClass}`} data-layout={section.layout}>{section.items.map((item) => <Link href={`/categories/${item.slug}`} key={item.slug}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image.url} alt={item.image.altText || item.name} width={item.image.width} height={item.image.height} /><span><strong>{item.name}</strong><small>Keşfet →</small></span></Link>)}</div></section>;
}

export function CampaignPanels({ section }: Readonly<{ section: SplitSection }>) {
  if (!section.panels.length) return null;
  return <section className={styles.panels} aria-label="Kampanyalar">{section.panels.map((panel, index) => <Link href={panel.destination} key={`${panel.heading}-${index}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={panel.image.url} alt={panel.image.altText || panel.heading} width={panel.image.width} height={panel.image.height} /><span>{panel.eyebrow ? <small>{panel.eyebrow}</small> : null}<strong>{panel.heading}</strong>{panel.body ? <p>{panel.body}</p> : null}<em>İncele →</em></span></Link>)}</section>;
}

export function CampaignStory({ section }: Readonly<{ section: StorySection }>) {
  return <section className={`${styles.story} ${section.image ? styles.hasStoryImage : ""}`}>{section.image ? /* eslint-disable-next-line @next/next/no-img-element */<img src={section.image.url} alt={section.image.altText} width={section.image.width} height={section.image.height} /> : null}<div>{section.eyebrow ? <span>{section.eyebrow}</span> : null}<h2>{section.heading}</h2><p>{section.body}</p>{section.destination ? <Link href={section.destination}>Hikâyemizi keşfet →</Link> : null}</div></section>;
}
