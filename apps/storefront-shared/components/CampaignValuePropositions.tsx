import type { PublicStarterHomeSection } from "@celebix/saas-contracts";
import { Heart, Leaf, RotateCcw, ShieldCheck, Sparkles, Truck } from "lucide-react";

import styles from "./campaign-home.module.css";

type Section = Extract<PublicStarterHomeSection, { kind: "value_propositions" }>;
const ICONS = Object.freeze({ sparkles: Sparkles, cotton: Leaf, heart: Heart, shield: ShieldCheck, truck: Truck, return: RotateCcw });

export function CampaignValuePropositions({ section }: Readonly<{ section: Section }>) {
  return <section className={styles.values} aria-label="Mağaza değerleri"><ul>{section.items.map((item) => { const Icon = ICONS[item.icon]; return <li key={item.heading}><Icon aria-hidden="true" /><h2>{item.heading}</h2><p>{item.body}</p></li>; })}</ul></section>;
}
