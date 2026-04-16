"use client";

import Image from "next/image";
import { Check, Star } from "lucide-react";
import type { HomepageTestimonial } from "@/lib/homepage";
import { SectionHeader } from "./SectionHeader";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function normalizeTestimonials(items?: HomepageTestimonial[]) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items
    .filter((item) => item.body && item.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      rating: Math.max(1, Math.min(5, item.rating || 5)),
      text: item.body,
      image: item.image,
    }));
}

export function TestimonialsSection({
  heading = "Musteri Yorumlari",
  countLabel = "Gercek yorumlar geldikce bu alan otomatik yenilenir",
  items,
}: {
  heading?: string;
  countLabel?: string;
  items?: HomepageTestimonial[];
}) {
  const testimonials = normalizeTestimonials(items).slice(0, 6);

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <section className="section-shell">
      <div className="container-premium">
        <SectionHeader
          eyebrow="Guven Veren Yorumlar"
          title={heading}
          description={countLabel}
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {testimonials.map((review) => (
            <article
              key={review.id}
              className="rounded-[28px] border border-[var(--store-border)] bg-white p-5 shadow-[var(--store-shadow-soft)]"
            >
              <div className="flex items-center gap-3">
                {review.image ? (
                  <div className="relative h-14 w-14 overflow-hidden rounded-full">
                    <Image
                      src={review.image}
                      alt={review.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--store-surface-alt)] text-sm font-semibold tracking-[0.14em] text-[var(--store-accent)]">
                    {getInitials(review.name)}
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-base font-semibold text-[var(--store-ink)]">{review.name}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--store-muted)]">
                    <Check className="h-3 w-3" />
                    Dogrulanmis yorum
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={`${review.id}-${index}`}
                    className={cn(
                      "h-4 w-4",
                      index < review.rating
                        ? "fill-[var(--store-accent)] text-[var(--store-accent)]"
                        : "fill-[var(--store-surface-alt)] text-[var(--store-surface-alt)]",
                    )}
                  />
                ))}
              </div>

              <p className="mt-4 text-sm leading-7 text-[var(--store-ink-soft)]">
                {review.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
