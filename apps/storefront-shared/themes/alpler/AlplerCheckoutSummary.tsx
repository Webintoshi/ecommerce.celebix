"use client";

import { useId, useState, type ReactNode } from "react";
import { formatTry } from "../../lib/format.ts";

export function AlplerCheckoutSummary({ totalCents, unavailable = false, children }: Readonly<{ totalCents?: number; unavailable?: boolean; children: ReactNode }>) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return <div className="alpler-checkout-summary-rail" data-expanded={expanded}>
    <button className="alpler-checkout-summary-toggle" type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
      <span>{expanded ? "Sipariş özetini gizle" : "Sipariş özetini göster"}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
      <strong>{totalCents === undefined ? unavailable ? "Kullanılamıyor" : "Hesaplanıyor…" : formatTry(totalCents)}</strong>
    </button>
    <div className="alpler-checkout-summary-panel" id={panelId}>{children}</div>
  </div>;
}
