"use client";

import { BadgeCheck, Flower2, ShieldCheck, Sparkles } from "lucide-react";

interface TrustItem {
  id: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DEFAULT_ITEMS: TrustItem[] = [
  {
    id: "vitrin",
    title: "Canli vitrin",
    body: "Banner, kategori ve kampanya alanlari admin icerigiyle anlik yenilenir.",
    icon: Flower2,
  },
  {
    id: "stok",
    title: "Guncel secim",
    body: "Fiyat, varyant ve stok gorunumu secilen urune gore storefront'ta ayni anda yansir.",
    icon: Sparkles,
  },
  {
    id: "guven",
    title: "Guvenli akis",
    body: "Sepet, odeme ve siparis akislari mevcut commerce mantigi korunarak calisir.",
    icon: ShieldCheck,
  },
  {
    id: "yorum",
    title: "Gercek sinyaller",
    body: "Onayli yorumlar ve urun odakli kesif bloklari deneyimi destekler.",
    icon: BadgeCheck,
  },
];

export function TrustStrip({ items = DEFAULT_ITEMS }: { items?: TrustItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="section-shell pt-6 sm:pt-8">
      <div className="container-premium">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <article key={item.id} className="soft-panel flex gap-4 px-5 py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--foreground)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {item.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
