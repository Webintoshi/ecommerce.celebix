"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

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
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
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
      {selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <details className={styles.classificationPicker} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <span><strong>{label}</strong><small>{selected.length ? `${selected.length} seçim` : "Seçilmedi"}</small></span>
          <ChevronDown aria-hidden="true" />
        </summary>
        {open ? <div className={styles.classificationPopover}>
          <label className={styles.classificationSearch}>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} autoComplete="off" />
          </label>
          {selected.length ? <div className={styles.classificationChips} aria-label={`${label} seçimleri`}>
            {selected.map((id) => {
              const option = optionById.get(id);
              return option ? <button key={id} type="button" onClick={() => toggle(id)}>{option.label}<X aria-hidden="true" /></button> : null;
            })}
          </div> : null}
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
