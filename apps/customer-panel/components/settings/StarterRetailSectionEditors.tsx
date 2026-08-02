"use client";

import type { StarterThemeSectionConfigV2, StarterValueIcon } from "@celebix/saas-contracts";

import styles from "./starter-theme-composer.module.css";

type ValueSection = Extract<StarterThemeSectionConfigV2, { kind: "value_propositions" }>;
type TestimonialSection = Extract<StarterThemeSectionConfigV2, { kind: "testimonials" }>;

const ICONS: readonly Readonly<{ value: StarterValueIcon; label: string }>[] = Object.freeze([
  { value: "sparkles", label: "Özen" }, { value: "cotton", label: "Malzeme" },
  { value: "heart", label: "Memnuniyet" }, { value: "shield", label: "Güven" },
  { value: "truck", label: "Teslimat" }, { value: "return", label: "İade" },
]);

export function StarterRetailSectionEditor({ disabled, section, update }: Readonly<{
  disabled: boolean;
  section: ValueSection | TestimonialSection;
  update: (section: ValueSection | TestimonialSection) => void;
}>) {
  if (section.kind === "testimonials") return <div className={styles.fieldGrid}>
    <label>Başlık<input maxLength={160} value={section.heading} onChange={(event) => update({ ...section, heading: event.currentTarget.value })} disabled={disabled} /></label>
    <label>Kaynak<select value={section.source} disabled><option value="approved_product_reviews">Yalnız onaylı ürün yorumları</option></select></label>
    <label>Gösterilecek yorum<select value={section.limit} onChange={(event) => update({ ...section, limit: Number(event.currentTarget.value) as 3 | 6 | 9 })} disabled={disabled}><option value="3">3</option><option value="6">6</option><option value="9">9</option></select></label>
    <label>En düşük puan<select value={section.minimumRating} onChange={(event) => update({ ...section, minimumRating: Number(event.currentTarget.value) as 4 | 5 })} disabled={disabled}><option value="4">4 yıldız</option><option value="5">5 yıldız</option></select></label>
    <p className={`${styles.fieldHelp} ${styles.wide}`}>Müşteri yorumları elle yazılamaz; yalnız kalıcı katalogda onaylanan gerçek yorumlar gösterilir.</p>
  </div>;

  const valueSection = section;
  function patchItem(index: number, patch: Partial<ValueSection["items"][number]>) {
    update({ ...valueSection, items: Object.freeze(valueSection.items.map((item, position) => position === index ? Object.freeze({ ...item, ...patch }) : item)) });
  }
  return <div className={styles.entryList}>
    <p className={styles.fieldHelp}>Değer önerileri doğrulanabilir mağaza vaadi olmalıdır; sahte puan, sayaç veya müşteri sözü eklenemez.</p>
    {valueSection.items.map((item, index) => <fieldset className={styles.entryCard} key={index}>
      <legend>Değer önerisi {index + 1}</legend>
      <div className={styles.fieldGrid}>
        <label>Simge<select value={item.icon} onChange={(event) => patchItem(index, { icon: event.currentTarget.value as StarterValueIcon })} disabled={disabled}>{ICONS.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}</select></label>
        <label>Başlık<input maxLength={120} value={item.heading} onChange={(event) => patchItem(index, { heading: event.currentTarget.value })} disabled={disabled} /></label>
        <label className={styles.wide}>Açıklama<textarea maxLength={300} value={item.body} onChange={(event) => patchItem(index, { body: event.currentTarget.value })} disabled={disabled} /></label>
      </div>
      <button className={styles.entryAdd} type="button" onClick={() => update({ ...valueSection, items: Object.freeze(valueSection.items.filter((_, position) => position !== index)) })} disabled={disabled || valueSection.items.length <= 2}>Öneriyi kaldır</button>
    </fieldset>)}
    <button className={styles.entryAdd} type="button" onClick={() => update({ ...valueSection, items: Object.freeze([...valueSection.items, Object.freeze({ icon: "sparkles", heading: `Yeni değer ${valueSection.items.length + 1}`, body: "Doğrulanabilir mağaza vaadinizi açıklayın." })]) })} disabled={disabled || valueSection.items.length >= 4}>Değer önerisi ekle</button>
  </div>;
}
