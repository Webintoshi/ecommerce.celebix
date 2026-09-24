"use client";

import { useState } from "react";
import { composeManualSku, manualSkuDisplay } from "@/lib/catalog-ui/sku-prefix";
import styles from "./sku-input.module.css";

export function SkuInput({ skuPrefix, value, onChange, name, labelClassName }: Readonly<{
  skuPrefix?: string;
  value?: string;
  onChange?(value: string): void;
  name?: string;
  labelClassName?: string;
}>) {
  const [localValue, setLocalValue] = useState(value ?? "");
  const current = onChange ? (value ?? "") : localValue;
  const display = manualSkuDisplay(current, skuPrefix);
  const update = (next: string) => onChange ? onChange(next) : setLocalValue(next);
  const maximum = skuPrefix ? 63 - skuPrefix.length : 64;

  return <div className={styles.field}>
    <label className={labelClassName}>
      <span>SKU</span>
      {name ? <input type="hidden" name={name} value={current} readOnly /> : null}
      {display.legacy ? <input value={current} readOnly aria-label="Mevcut SKU" /> : <span className={styles.entry}>
        {skuPrefix ? <span aria-hidden="true">{skuPrefix}-</span> : null}
        <input
          aria-label={skuPrefix ? "SKU son kısmı" : "SKU"}
          maxLength={maximum}
          placeholder={skuPrefix ? "Örn. 001" : undefined}
          value={display.suffix}
          onChange={(event) => {
            try { update(composeManualSku(event.currentTarget.value, skuPrefix)); }
            catch { /* Keep the last valid SKU while the user types. */ }
          }}
        />
      </span>}
    </label>
    {display.legacy ? <button className={styles.replace} type="button" onClick={() => update("")}>Yeni SKU başlangıcıyla değiştir</button> : null}
  </div>;
}
