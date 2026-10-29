"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import styles from "./product-onboarding.module.css";

type ClassificationChoice = Readonly<{
  id: string;
  label: string;
}>;

export function ProductClassificationPicker({
  label,
  name,
  options,
  selected,
  onChange,
  searchLabel,
}: Readonly<{
  label: string;
  name: string;
  options: readonly ClassificationChoice[];
  selected: readonly string[];
  onChange(value: readonly string[]): void;
  searchLabel: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const labelId = useId();
  const valueId = useId();
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selectedLabel = selected.map((id) => optionById.get(id)?.label).filter(Boolean).join(", ");
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
    : options;

  function toggle(id: string) {
    onChange(selected.includes(id)
      ? Object.freeze(selected.filter((selectedId) => selectedId !== id))
      : Object.freeze([...selected, id]));
  }

  return (
    <div className={styles.classificationField}>
      <span id={labelId} className={styles.classificationLabel}>{label}</span>
      {selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <details className={styles.classificationPicker} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary aria-labelledby={`${labelId} ${valueId}`} title={selectedLabel || undefined}>
          <span id={valueId} className={styles.classificationValue}>{selectedLabel || "—"}</span>
          <ChevronDown aria-hidden="true" />
        </summary>
        {open ? <div className={styles.classificationPopover}>
          <label className={styles.classificationSearch}>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={searchLabel} placeholder={searchLabel} autoComplete="off" />
          </label>
          <div className={styles.classificationOptions}>
            {visibleOptions.length ? visibleOptions.map((option) => {
              const checked = selected.includes(option.id);
              return <label key={option.id} className={checked ? styles.classificationSelected : ""}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} />
                <span>{option.label}</span>
                {checked ? <Check aria-hidden="true" /> : null}
              </label>;
            }) : <p>Aramanızla eşleşen seçenek yok.</p>}
          </div>
        </div> : null}
      </details>
    </div>
  );
}
