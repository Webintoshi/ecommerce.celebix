"use client";

import { useState } from "react";

export function PromotionCouponField({
  codes,
  pending,
  status,
  onApply,
  onRemove,
}: Readonly<{
  codes: readonly string[];
  pending: boolean;
  status: string;
  onApply(value: string): Promise<boolean>;
  onRemove(value: string): Promise<void>;
}>) {
  const [candidate, setCandidate] = useState("");
  return (
    <section className="promotion-coupon" aria-labelledby="promotion-coupon-title">
      <h3 id="promotion-coupon-title">İndirim kodu</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !candidate) return;
          void onApply(candidate).then((applied) => {
            if (applied) setCandidate("");
          });
        }}
      >
        <label htmlFor="promotion-coupon-input">Kupon kodu</label>
        <div className="promotion-coupon-controls">
          <input
            id="promotion-coupon-input"
            name="coupon"
            value={candidate}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={pending || codes.length >= 5}
            onChange={(event) => setCandidate(event.currentTarget.value)}
          />
          <button className="store-button" type="submit" disabled={pending || !candidate}>
            Uygula
          </button>
        </div>
      </form>
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
