"use client";

import type { CSSProperties } from "react";
import styles from "./promotion-template-picker.module.css";

type Template<T extends string> = Readonly<{ id: T; title: string; help: string }>;

export function PromotionTemplatePicker<T extends string>({ templates, onSelect }: {
  templates: readonly Template<T>[];
  onSelect: (id: T) => void;
}) {
  return <section className={styles.picker}>
    <header className={styles.heading}>
      <h1>Kampanyanıza uygun bir başlangıç seçin</h1>
      <p>Hazır şablonlarla başlayın, kuralları mağazanıza göre düzenleyin.</p>
    </header>
    <div className={styles.grid}>
      {templates.map((item, index) => <button
        className={styles.card}
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
      >
        <strong className={styles.title}>{item.title}</strong>
        <span className={styles.help}>{item.help}</span>
        <span className={styles.art} aria-hidden="true" style={{
          "--art-x": `${(index % 3) * 50}%`,
          "--art-y": `${Math.floor(index / 3) * (100 / 3)}%`,
        } as CSSProperties} />
        <span className={styles.action}>Bu şablonla başla →</span>
      </button>)}
    </div>
  </section>;
}
