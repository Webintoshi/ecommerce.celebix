"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MEASUREMENT_FIELDS, parseProductMeasurements, type ProductMeasurementDraft } from "@/lib/catalog-ui/product-measurements";
import styles from "./product-measurements.module.css";

export function ProductMeasurementFields({ value, onChange, defaultValue, showValidation = false, labelPrefix = "" }: Readonly<{
  value?: ProductMeasurementDraft;
  defaultValue?: ProductMeasurementDraft;
  onChange?(value: ProductMeasurementDraft): void;
  showValidation?: boolean;
  labelPrefix?: string;
}>) {
  const [local, setLocal] = useState<ProductMeasurementDraft>(defaultValue ?? {});
  const [opened, setOpened] = useState(false);
  const draft = value ?? local;
  const result = parseProductMeasurements(draft);
  const invalid = showValidation && !result.ok;
  const id = useId();
  const change = (key: keyof ProductMeasurementDraft, entered: string) => {
    const next = { ...draft, [key]: entered };
    if (value === undefined) setLocal(next);
    onChange?.(next);
  };
  return <details className={styles.group} open={opened || invalid} onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary><span>Ölçü ve teknik bilgiler</span><span className={styles.summaryMeta}><small>İsteğe bağlı</small><ChevronDown aria-hidden="true" /></span></summary>
    <div className={styles.body}>
      <p id={`${id}-hint`}>Yalnız ürününüzle ilgili alanları doldurun.</p>
      <input type="hidden" name="measurementsPresent" value="1" />
      <div className={styles.grid}>
        {MEASUREMENT_FIELDS.map(({ key, label, units }) => {
          const error = invalid && !result.ok && result.field === key;
          return <div className={styles.field} key={key}>
            <label htmlFor={`${id}-${key}`}>{label}</label>
            <div className={styles.valueUnit}>
              <input id={`${id}-${key}`} name={`measurement-${key}`} aria-label={labelPrefix ? `${labelPrefix} ${label}` : label} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={error || undefined} inputMode="decimal" maxLength={32} placeholder="Örn. 14,89" value={draft[key] ?? ""} onChange={(event) => change(key, event.currentTarget.value)} />
              <select name={`measurement-${key}Unit`} aria-label={`${labelPrefix ? `${labelPrefix} ` : ""}${label} birimi`} value={draft[`${key}Unit`] ?? units[0]} onChange={(event) => change(`${key}Unit`, event.currentTarget.value)}>{units.map((unit) => <option key={unit} value={unit}>{unit === "m2" ? "m²" : unit}</option>)}</select>
            </div>
          </div>;
        })}
        <div className={styles.field}><label htmlFor={`${id}-packageCount`}>Paket içeriği</label><div className={styles.valueUnit}><input id={`${id}-packageCount`} name="measurement-packageCount" aria-label={labelPrefix ? `${labelPrefix} Paket içeriği` : "Paket içeriği"} aria-describedby={`${id}-hint${invalid && !result.ok && result.field === "packageCount" ? ` ${id}-error` : ""}`} aria-invalid={invalid && !result.ok && result.field === "packageCount" || undefined} inputMode="numeric" maxLength={16} placeholder="Örn. 6" value={draft.packageCount ?? ""} onChange={(event) => change("packageCount", event.currentTarget.value)} /><span className={styles.unit}>adet</span></div></div>
      </div>
      {invalid && !result.ok ? <p id={`${id}-error`} className={styles.error} role="alert">{result.error}</p> : null}
    </div>
  </details>;
}
