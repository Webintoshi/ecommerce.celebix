"use client";

import { useId, useState } from "react";

export function PromotionCouponField({
  codes,
  pending,
  status,
  onApply,
  onRemove,
  embedded = false,
}: Readonly<{
  codes: readonly string[];
  pending: boolean;
  status: string;
  onApply(value: string): Promise<boolean>;
  onRemove(value: string): Promise<void>;
  embedded?: boolean;
}>) {
  const [candidate, setCandidate] = useState("");
  const fieldId = useId();
  const apply = async () => {
    if (pending || !candidate || codes.length >= 5) return;
    if (await onApply(candidate)) setCandidate("");
  };
  const controls = <>
    <label htmlFor={fieldId}>Kupon kodu</label>
    <div className="promotion-coupon-controls">
      <input
        id={fieldId}
        name="coupon"
        value={candidate}
        maxLength={64}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        disabled={pending || codes.length >= 5}
        onChange={(event) => setCandidate(event.currentTarget.value)}
        onKeyDown={embedded ? (event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          void apply();
        } : undefined}
      />
      {embedded ? <button className="store-button" type="button" disabled={pending || !candidate || codes.length >= 5} onClick={() => void apply()}>Uygula</button> : <button className="store-button" type="submit" disabled={pending || !candidate || codes.length >= 5}>Uygula</button>}
    </div>
  </>;
  return (
    <section className="promotion-coupon" aria-labelledby={`${fieldId}-title`}>
      <h3 id={`${fieldId}-title`}>İndirim kodu</h3>
      {embedded ? <div>{controls}</div> : <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        {controls}
      </form>}
      {codes.length > 0 ? (
        <ul className="promotion-coupon-list" aria-label="Eklenen kuponlar">
          {codes.map((code) => (
            <li key={code}>
              <code>{code}</code>
              <button type="button" disabled={pending} onClick={() => void onRemove(code)}>
                <span className="sr-only">{code} kodunu </span>Kaldır
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="promotion-coupon-status" aria-live="polite" aria-busy={pending}>
        {status}
      </p>
    </section>
  );
}
