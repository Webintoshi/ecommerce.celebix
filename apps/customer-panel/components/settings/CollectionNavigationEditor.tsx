"use client";
import type { CatalogCategory, StarterThemeCompositionConfigV3, StorefrontDesignDestinationOption } from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import styles from "./starter-theme-composer.module.css";
type Navigation = StarterThemeCompositionConfigV3["navigation"];
export function CollectionNavigationEditor({ navigation, categories, destinations, disabled, onChange }: Readonly<{ navigation: Navigation; categories: readonly CatalogCategory[]; destinations: readonly StorefrontDesignDestinationOption[]; disabled: boolean; onChange(value: Navigation): void }>) {
 const [selected, setSelected] = useState("");
 const links = navigation.rootLinks ?? navigation.rootCategoryIds.map(resourceId => ({ kind: "category" as const, resourceId }));
 const options = [...categories.map(category => ({ kind: "category" as const, resourceId: category.id, label: category.name })), ...destinations.filter(item => item.kind === "catalog_collection").map(item => ({ kind: "catalog_collection" as const, resourceId: item.resourceId, label: item.label }))];
 const key = (link: (typeof links)[number]) => `${link.kind}:${link.resourceId}`;
 const apply = (rootLinks: typeof links) => onChange({ ...navigation, rootLinks: Object.freeze(rootLinks), rootCategoryIds: Object.freeze(rootLinks.filter(link => link.kind === "category").map(link => link.resourceId)) });
 const move = (index: number, step: number) => { const next = [...links]; const target = index + step; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target]!, next[index]!]; apply(next); };
 return <section aria-label="Ana menü bağlantıları">
  <p className={styles.label}>Ana menü</p>
  <div className={styles.entryList}>{links.map((link, index) => <div className={styles.entryToolbar} key={key(link)}><span>{options.find(option => key(option) === key(link))?.label ?? "Kayıt bulunamadı"} <small>{link.kind === "catalog_collection" ? "Koleksiyon" : "Kategori"}</small></span><button type="button" aria-label="Yukarı taşı" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></button><button type="button" aria-label="Aşağı taşı" disabled={disabled || index === links.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></button><button type="button" aria-label="Menüden kaldır" disabled={disabled} onClick={() => apply(links.filter((_, at) => at !== index))}><Trash2 aria-hidden="true" /></button></div>)}</div>
  <div className={styles.entryToolbar}><label>Bağlantı ekle<select value={selected} disabled={disabled || links.length >= 8} onChange={event => setSelected(event.currentTarget.value)}><option value="">Kategori veya koleksiyon seç</option>{options.filter(option => !links.some(link => key(link) === key(option))).map(option => <option key={key(option)} value={key(option)}>{option.label} · {option.kind === "catalog_collection" ? "Koleksiyon" : "Kategori"}</option>)}</select></label><button type="button" disabled={disabled || !selected || links.length >= 8} onClick={() => { const option = options.find(option => key(option) === selected); if (option) { apply([...links, { kind: option.kind, resourceId: option.resourceId }]); setSelected(""); } }}>Ekle</button></div>
 </section>;
}
