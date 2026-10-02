"use client";

import type { CatalogCategory, StarterThemeCompositionConfigV3, StorefrontDesignDestinationOption } from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import styles from "./starter-theme-composer.module.css";

type Navigation = StarterThemeCompositionConfigV3["navigation"];

export function CollectionNavigationEditor({ navigation, categories, destinations, disabled, onChange }: Readonly<{
  navigation: Navigation;
  categories: readonly CatalogCategory[];
  destinations: readonly StorefrontDesignDestinationOption[];
  disabled: boolean;
  onChange(value: Navigation): void;
}>) {
  const [selected, setSelected] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const instructionsId = useId();
  const links = navigation.rootLinks ?? navigation.rootCategoryIds.map((resourceId) => ({ kind: "category" as const, resourceId }));
  const options = [
    ...categories.map((category) => ({ kind: "category" as const, resourceId: category.id, label: category.name })),
    ...destinations.filter((item) => item.kind === "catalog_collection").map((item) => ({ kind: "catalog_collection" as const, resourceId: item.resourceId, label: item.label })),
  ];
  const key = (link: (typeof links)[number]) => `${link.kind}:${link.resourceId}`;
  const available = options.filter((option) => !links.some((link) => key(link) === key(option)));
  const apply = (rootLinks: typeof links) => onChange({
    ...navigation,
    rootLinks: Object.freeze(rootLinks),
    rootCategoryIds: Object.freeze(rootLinks.filter((link) => link.kind === "category").map((link) => link.resourceId)),
  });
  const moveTo = (from: number, target: number) => {
    if (disabled || from < 0 || target < 0 || target >= links.length || from === target) return;
    const next = [...links];
    const [link] = next.splice(from, 1);
    if (!link) return;
    next.splice(target, 0, link);
    apply(next);
  };
  const finishDrag = () => { setDragging(null); setDropTarget(null); };

  return <section className={styles.navigationGroup} aria-label="Ana menü bağlantıları">
    <div className={styles.navigationHeading}>
      <h3>Ana menü</h3>
      <span role="status" aria-label={`Ana menüde ${links.length} bağlantı; en fazla 8`}>{links.length} / 8</span>
    </div>
    <p id={instructionsId} className={styles.srOnly}>Sürükleyerek sıralayın veya yukarı ve aşağı düğmelerini kullanın.</p>
    {links.length ? <ol className={styles.navigationList}>{links.map((link, index) => {
      const itemKey = key(link);
      const label = options.find((option) => key(option) === itemKey)?.label ?? "Kayıt bulunamadı";
      return <li
        className={styles.navigationRow}
        key={itemKey}
        data-dragging={dragging === itemKey}
        data-drop-target={dropTarget === itemKey && dragging !== itemKey}
        onDragOver={(event) => {
          if (disabled || !dragging) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropTarget(itemKey);
        }}
        onDrop={(event) => {
          if (disabled || !dragging) return;
          event.preventDefault();
          moveTo(links.findIndex((entry) => key(entry) === dragging), index);
          finishDrag();
        }}
      >
        <button
          className={styles.navigationGrip}
          type="button"
          draggable={!disabled}
          disabled={disabled}
          aria-label={`${label} bağlantısını sürükleyerek sırala`}
          aria-describedby={instructionsId}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", itemKey);
            setDragging(itemKey);
          }}
          onDragEnd={finishDrag}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            moveTo(index, index + (event.key === "ArrowUp" ? -1 : 1));
          }}
        ><GripVertical aria-hidden="true" /></button>
        <div className={styles.navigationLabel}><span>{label}</span><small>{link.kind === "catalog_collection" ? "Koleksiyon" : "Kategori"}</small></div>
        <div className={styles.navigationActions}>
          <button type="button" aria-label={`${label} bağlantısını yukarı taşı`} disabled={disabled || index === 0} onClick={() => moveTo(index, index - 1)}><ArrowUp aria-hidden="true" /></button>
          <button type="button" aria-label={`${label} bağlantısını aşağı taşı`} disabled={disabled || index === links.length - 1} onClick={() => moveTo(index, index + 1)}><ArrowDown aria-hidden="true" /></button>
          <button type="button" aria-label={`${label} bağlantısını menüden kaldır`} disabled={disabled} onClick={() => apply(links.filter((_, at) => at !== index))}><Trash2 aria-hidden="true" /></button>
        </div>
      </li>;
    })}</ol> : <p className={styles.navigationEmpty}>Menü boş. Bir bağlantı ekleyin.</p>}
    <div className={styles.navigationAdd}>
      <label>Bağlantı<select value={selected} disabled={disabled || links.length >= 8 || !available.length} onChange={(event) => setSelected(event.currentTarget.value)}>
        <option value="">Kategori veya koleksiyon seç</option>
        {available.map((option) => <option key={key(option)} value={key(option)}>{option.label} · {option.kind === "catalog_collection" ? "Koleksiyon" : "Kategori"}</option>)}
      </select></label>
      <button type="button" disabled={disabled || !available.some((option) => key(option) === selected) || links.length >= 8} onClick={() => {
        const option = available.find((entry) => key(entry) === selected);
        if (!option) return;
        apply([...links, { kind: option.kind, resourceId: option.resourceId }]);
        setSelected("");
      }}><Plus aria-hidden="true" /> Ekle</button>
    </div>
    {links.length >= 8 ? <p className={styles.fieldHelp}>Menüde en fazla 8 bağlantı olabilir.</p> : !options.length ? <p className={styles.fieldHelp}>Henüz kategori veya koleksiyon yok.</p> : null}
  </section>;
}
