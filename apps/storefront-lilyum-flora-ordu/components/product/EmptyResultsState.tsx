"use client";

import Link from "next/link";

interface EmptyResultsStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  onReset?: () => void;
}

export function EmptyResultsState({
  title,
  body,
  actionLabel,
  actionHref,
  onReset,
}: EmptyResultsStateProps) {
  return (
    <div className="soft-panel rounded-[32px] px-6 py-14 text-center sm:px-10">
      <p className="section-eyebrow">Kesif beklemede</p>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--store-ink)]">{title}</h3>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--store-muted)]">
        {body}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        {onReset ? (
          <button type="button" onClick={onReset} className="cta-secondary">
            Filtreleri temizle
          </button>
        ) : null}
        {actionLabel && actionHref ? (
          <Link href={actionHref} className="cta-primary">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
