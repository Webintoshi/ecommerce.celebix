"use client";

import { ArrowRight } from "lucide-react";
import { PromotionIllustration } from "./PromotionIllustration";
import styles from "./promotion-template-picker.module.css";

type Template<T extends string> = Readonly<{ id: T; title: string; help: string }>;

export function PromotionTemplatePicker<T extends string>({ templates, onSelect }: {
  templates: readonly Template<T>[];
  onSelect: (id: T) => void;
}) {
  return <section className={styles.picker}>
    <h1 className="sr-only">Yeni indirim</h1>
    <div className={styles.grid}>
      {templates.map((item) => <button
        className={styles.card}
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
      >
        <PromotionIllustration kind={item.id} className={styles.art} />
        <span className={styles.copy}><strong className={styles.title}>{item.title}</strong><span className={styles.help}>{item.help}</span></span>
        <ArrowRight className={styles.arrow} size={18} aria-hidden="true" />
      </button>)}
    </div>
  </section>;
}
