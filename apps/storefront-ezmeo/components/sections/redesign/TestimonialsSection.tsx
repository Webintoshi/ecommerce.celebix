"use client";

import Image from "next/image";
import { Check, Star } from "lucide-react";
import type { HomepageTestimonial } from "@/lib/homepage";
import { cn } from "@/lib/utils";

type TestimonialItem = {
  id: string;
  name: string;
  rating: number;
  text: string;
  image?: string | null;
  verified?: boolean;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function normalizeTestimonials(items?: HomepageTestimonial[]): TestimonialItem[] {
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
      verified: true,
    }));
}

export function TestimonialsSection({
  heading = "Gercek musteri notlari",
  countLabel = "Onayli degerlendirmeler geldikce bu alan guncellenir",
  items,
}: {
  heading?: string;
  countLabel?: string;
  items?: HomepageTestimonial[];
}) {
  const testimonials = normalizeTestimonials(items);

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <section className="pt-14 lg:pt-18">
      <div className="container-premium">
        <div className="surface-card overflow-hidden px-5 py-6 md:px-7 md:py-8 lg:px-8">
          <div className="mb-8 border-b border-[var(--border)] pb-6">
            <p className="editorial-kicker">Yorumlar</p>
            <h2 className="mt-4 text-[var(--foreground)]">{heading}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
              {countLabel}
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {testimonials.slice(0, 3).map((review) => (
              <article
                key={review.id}
                className="rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,250,244,0.78)] p-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  {review.image ? (
                    <div className="relative h-12 w-12 overflow-hidden rounded-full">
                      <Image
                        src={review.image}
                        alt={review.name}
                        fill
                        className="object-cover"
                        sizes="48px"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(144,21,20,0.08)] text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
                      {getInitials(review.name)}
                    </div>
                  )}

                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{review.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={`${review.id}-${index}`}
                            className={cn(
                              "h-3.5 w-3.5",
                              index < review.rating
                                ? "fill-[var(--hazelnut)] text-[var(--hazelnut)]"
                                : "fill-[rgba(42,28,20,0.1)] text-[rgba(42,28,20,0.1)]",
                            )}
                          />
                        ))}
                      </div>
                      {review.verified ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                          <Check className="h-3.5 w-3.5" />
                          Dogrulandi
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
                  {review.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
