"use client";

import { useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { PromotionIllustration } from "./PromotionIllustration";
import styles from "./promotion-template-picker.module.css";

type Template<T extends string> = Readonly<{ id: T; title: string; help: string }>;
const searchable = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i");

export function PromotionTemplatePicker<T extends string>({ templates, onSelect }: {
  templates: readonly Template<T>[];
  onSelect: (id: T) => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };
  const term = searchable(query.trim());
  const visible = templates.filter((item) => searchable(`${item.title} ${item.help}`).includes(term));
  return <section className={styles.picker}>
    <h1 className="sr-only">Yeni indirim</h1>
    <div className={styles.toolbar}>
      <span className={styles.count} role="status">{visible.length} şablon</span>
      <div className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <input ref={searchRef} type="search" aria-label="Şablon ara" value={query} placeholder="Şablon ara" onChange={(event) => setQuery(event.target.value)} />
        {query ? <button type="button" aria-label="Aramayı temizle" onClick={clearSearch}><X size={16} aria-hidden="true" /></button> : null}
      </div>
    </div>
    <div className={styles.grid}>
      {visible.map((item, index) => <button
        className={styles.card}
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
      >
        <PromotionIllustration kind={item.id} className={styles.art} eager={index < 4} />
        <span className={styles.copy}><strong className={styles.title}>{item.title}</strong><span className={styles.help}>{item.help}</span></span>
        <ArrowRight className={styles.arrow} size={18} aria-hidden="true" />
      </button>)}
    </div>
    {visible.length === 0 ? <div className={styles.empty}>
      <PromotionIllustration kind="custom" />
      <strong>Eşleşen şablon yok</strong>
      <button type="button" onClick={clearSearch}>Aramayı temizle</button>
    </div> : null}
  </section>;
}
