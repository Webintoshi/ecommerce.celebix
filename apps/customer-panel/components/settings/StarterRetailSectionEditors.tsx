"use client";

import type { StarterThemeSectionConfigV2, StarterValueIcon } from "@celebix/saas-contracts";
import { Heart, Leaf, RotateCcw, ShieldCheck, Sparkles, Trash2, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  addStarterValueProposition,
  isStarterValuePropositionDraftPublishable,
  removeStarterValueProposition,
  updateStarterValueProposition,
} from "@/lib/starter-theme-composer-model";
import styles from "./starter-theme-composer.module.css";

type ValueSection = Extract<StarterThemeSectionConfigV2, { kind: "value_propositions" }>;
type TestimonialSection = Extract<StarterThemeSectionConfigV2, { kind: "testimonials" }>;

const ICONS: readonly Readonly<{ value: StarterValueIcon; label: string; Icon: typeof Sparkles }>[] = Object.freeze([
  { value: "sparkles", label: "Özen", Icon: Sparkles },
  { value: "cotton", label: "Malzeme", Icon: Leaf },
  { value: "heart", label: "Memnuniyet", Icon: Heart },
  { value: "shield", label: "Güven", Icon: ShieldCheck },
  { value: "truck", label: "Teslimat", Icon: Truck },
  { value: "return", label: "İade", Icon: RotateCcw },
]);

function ValuePropositionEditor({ disabled, section, update }: Readonly<{
  disabled: boolean;
  section: ValueSection;
  update: (section: ValueSection) => void;
}>) {
  const [draftSection, setDraftSection] = useState(section);

  useEffect(() => { setDraftSection(section); }, [section]);

  function updateDraft(next: ValueSection) {
    setDraftSection(next);
    if (isStarterValuePropositionDraftPublishable(next)) update(next);
  }

  return <div className={styles.entryList}>
    <p className={styles.fieldHelp}>Yalnızca mağazanızın gerçekten sunduğu avantajları yazın.</p>
    {draftSection.items.map((item, index) => {
      const selected = ICONS.find(({ value }) => value === item.icon) ?? ICONS[0]!;
      const SelectedIcon = selected.Icon;
      return <fieldset className={`${styles.entryCard} ${styles.valueCard}`} key={index}>
        <legend>Değer {index + 1}</legend>
        <div className={styles.valuePreview} aria-label={`${index + 1}. değer önizlemesi`}>
          <span aria-hidden="true"><SelectedIcon /></span>
          <div>
            <strong>{item.heading || "Başlığınızı yazın"}</strong>
            <small>{item.body || "Müşterilerinize sunduğunuz avantajı kısaca açıklayın."}</small>
          </div>
          <button
            className={styles.valueDelete}
            type="button"
            aria-label={`${index + 1}. değeri kaldır`}
            onClick={() => updateDraft(removeStarterValueProposition(draftSection, index))}
            disabled={disabled || draftSection.items.length <= 2}
          ><Trash2 aria-hidden="true" /></button>
        </div>
        <div className={styles.valueIconGrid} role="group" aria-label="Simge seçimi">
          {ICONS.map(({ value, label, Icon }) => <button
            className={`${styles.valueIconChoice} ${item.icon === value ? styles.valueIconChoiceSelected : ""}`}
            type="button"
            key={value}
            aria-label={`${label} simgesini seç`}
            aria-pressed={item.icon === value}
            onClick={() => updateDraft(updateStarterValueProposition(draftSection, index, { icon: value }))}
            disabled={disabled}
          ><Icon aria-hidden="true" /><span>{label}</span></button>)}
        </div>
        <div className={styles.valueFields}>
          <label>Başlık<input maxLength={120} value={item.heading} onChange={(event) => updateDraft(updateStarterValueProposition(draftSection, index, { heading: event.currentTarget.value }))} disabled={disabled} placeholder="Örn. Aynı gün kargo" /></label>
          <label>Açıklama<textarea maxLength={300} value={item.body} onChange={(event) => updateDraft(updateStarterValueProposition(draftSection, index, { body: event.currentTarget.value }))} disabled={disabled} placeholder="Avantajınızı kısa ve anlaşılır biçimde yazın." /></label>
        </div>
      </fieldset>;
    })}
    <button className={styles.entryAdd} type="button" onClick={() => updateDraft(addStarterValueProposition(draftSection))} disabled={disabled || draftSection.items.length >= 4}>Değer ekle</button>
  </div>;
}

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

  return <ValuePropositionEditor disabled={disabled} section={section} update={update} />;
}
