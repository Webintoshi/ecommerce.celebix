"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { resolveStorefrontAssetUrl, resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    id: 1,
    name: "CANER T.",
    verified: true,
    rating: 5,
    content: "Kesinlikle tavsiye ediyorum. Tutun kesesi aldim, harika kalite.",
    image: "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-31-at-14.43.14.avif",
  },
  {
    id: 2,
    name: "ASLI B.",
    verified: true,
    rating: 5,
    content: "Sahane iscilik ile mukemmel bir urun cikmis. Kullandikca guzellesiyor.",
    image: "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.41adasd-scaled.webp",
  },
  {
    id: 3,
    name: "MELIS G.",
    verified: true,
    rating: 5,
    content: "Sade ve sik. Urun dayanikli, kullanisli ve gercekten guzel gorunuyor.",
    image: "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.37.jpg",
  },
  {
    id: 4,
    name: "ERTAN Z.",
    verified: true,
    rating: 5,
    content: "Deri saat kayisim geldi, sanki saatimi yeniden almis gibi oldum.",
    image: "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.37.jpg",
  },
  {
    id: 5,
    name: "NIHAT C.",
    verified: true,
    rating: 5,
    content: "Iscilikten memnun kaldim. Kalite ve iscilik standartlarin ustunde.",
    image: "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/asdasdasdas.avif",
  },
  {
    id: 6,
    name: "SEDA Y.",
    verified: true,
    rating: 5,
    content: "Bayildim. Deri kalitesi ve isciligi ust duzey hissettiriyor.",
    image: "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.37-1.avif",
  },
];

const AUTO_PLAY_INTERVAL = 5000;

function ImageWithFallback({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  fallback: string;
}) {
  const proxiedSource = resolveStorefrontAssetUrl(src);
  const directSource = resolveStorefrontDirectAssetUrl(src);
  const [currentSource, setCurrentSource] = useState(proxiedSource || directSource || "");
  const [usedFallback, setUsedFallback] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setCurrentSource(proxiedSource || directSource || "");
    setUsedFallback(false);
    setError(false);
  }, [directSource, proxiedSource]);

  const handleError = () => {
    if (!usedFallback && directSource && directSource !== currentSource) {
      setCurrentSource(directSource);
      setUsedFallback(true);
      return;
    }

    setError(true);
  };

  if (error || !currentSource) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8A6B37]/10 text-lg font-semibold tracking-[0.24em] text-[#8A6B37]">
        {fallback}
      </div>
    );
  }

  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-full">
      <Image
        src={currentSource}
        alt={alt}
        fill
        className="object-cover"
        sizes="80px"
        onError={handleError}
      />
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

type Testimonial = (typeof testimonials)[number];

interface BlogPreview {
  id: string;
  title: string;
  image: string;
  href: string;
}

function RatingStars({
  rating,
  iconClassName = "h-3.5 w-3.5",
}: {
  rating: number;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, index) => (
        <Star
          key={index}
          className={cn(
            iconClassName,
            index < rating ? "fill-[#8A6B37] text-[#8A6B37]" : "fill-neutral-200 text-neutral-200"
          )}
        />
      ))}
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
      <Check className="h-3 w-3" />
      Dogrulanmis Alici
    </span>
  );
}

function DesktopTestimonialCard({ review }: { review: Testimonial }) {
  return (
    <div className="flex h-full overflow-hidden rounded-[30px] border border-[#ebe2d6] bg-white shadow-[0_22px_48px_-32px_rgba(55,38,16,0.3)]">
      <div className="flex w-32 flex-shrink-0 items-center justify-center bg-[linear-gradient(180deg,#faf6ef_0%,#f3ece0_100%)] sm:w-40 lg:w-48">
        <ImageWithFallback
          src={review.image}
          alt={review.name}
          fallback={getInitials(review.name)}
        />
      </div>

      <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
        <div className="mb-3">
          <RatingStars rating={review.rating} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 gap-y-1">
          <span className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-900">
            {review.name}
          </span>
          {review.verified ? <VerifiedBadge /> : null}
        </div>

        <p className="text-sm leading-7 text-neutral-600">{review.content}</p>
      </div>
    </div>
  );
}

function MobileTestimonialCard({ review, cardIndex }: { review: Testimonial; cardIndex: number }) {
  return (
    <article
      data-mobile-testimonial-card={cardIndex}
      className="relative min-w-[86%] max-w-[86%] snap-center overflow-hidden rounded-[28px] border border-[#ebe2d6] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-5 shadow-[0_22px_48px_-32px_rgba(55,38,16,0.34)]"
    >
      <div className="pointer-events-none absolute right-4 top-2 text-[4rem] leading-none text-[#8A6B37]/10">
        &quot;
      </div>

      <div className="flex items-start gap-4">
        <div className="rounded-[24px] bg-[linear-gradient(180deg,#faf6ef_0%,#f3ece0_100%)] p-2.5">
          <ImageWithFallback
            src={review.image}
            alt={review.name}
            fallback={getInitials(review.name)}
          />
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <RatingStars rating={review.rating} iconClassName="h-4 w-4" />

          <div className="mt-3 flex flex-wrap items-center gap-2 gap-y-1">
            <span className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-900">
              {review.name}
            </span>
            {review.verified ? <VerifiedBadge /> : null}
          </div>
        </div>
      </div>

      <p className="mt-5 text-[0.95rem] leading-7 text-neutral-700">{review.content}</p>
    </article>
  );
}

export function TestimonialsSection({
  heading = "Musteri Yorumlari",
  countLabel = "1581 degerlendirmeden",
  blogPosts = [],
  blogViewAllHref = "/blog",
  blogHeading = "BLOG YAZILARI",
  blogViewAllLabel = "Tumunu Gor",
}: {
  heading?: string;
  countLabel?: string;
  blogPosts?: BlogPreview[];
  blogViewAllHref?: string;
  blogHeading?: string;
  blogViewAllLabel?: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const mobileScrollerRef = useRef<HTMLDivElement | null>(null);

  const totalSlides = Math.ceil(testimonials.length / 2);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const updateMobileActiveIndex = useCallback(() => {
    const container = mobileScrollerRef.current;

    if (!container) {
      return;
    }

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-mobile-testimonial-card]")
    );

    if (cards.length === 0) {
      return;
    }

    const containerCenterX = container.scrollLeft + container.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenterX = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenterX - containerCenterX);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setMobileActiveIndex((prev) => (prev === closestIndex ? prev : closestIndex));
  }, []);

  const scrollToMobileSlide = useCallback((index: number) => {
    const container = mobileScrollerRef.current;

    if (!container) {
      return;
    }

    const card = container.querySelector<HTMLElement>(`[data-mobile-testimonial-card="${index}"]`);
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  useEffect(() => {
    updateMobileActiveIndex();

    const handleResize = () => updateMobileActiveIndex();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateMobileActiveIndex]);

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const interval = setInterval(nextSlide, AUTO_PLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const displayedBlogPosts = blogPosts.length >= 3 ? blogPosts.slice(0, 3) : blogPosts.slice(0, 1);

  return (
    <section className="bg-neutral-50 py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-8 text-center lg:mb-10">
          <h2 className="mb-2 text-2xl font-medium text-neutral-900 lg:text-3xl">{heading}</h2>
          <p className="text-sm text-neutral-500">{countLabel}</p>
        </div>

        <div className="lg:hidden">
          <div
            ref={mobileScrollerRef}
            onScroll={updateMobileActiveIndex}
            className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-1"
          >
            {testimonials.map((review, index) => (
              <MobileTestimonialCard key={review.id} review={review} cardIndex={index} />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            {testimonials.map((review, index) => (
              <button
                key={review.id}
                type="button"
                onClick={() => scrollToMobileSlide(index)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  index === mobileActiveIndex
                    ? "h-2.5 w-6 bg-neutral-900"
                    : "h-2.5 w-2.5 bg-neutral-300"
                )}
                aria-label={`Yorum ${index + 1}`}
                aria-current={index === mobileActiveIndex ? "true" : undefined}
              />
            ))}
          </div>
        </div>

        <div
          className="relative hidden lg:block"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {Array.from({ length: totalSlides }).map((_, slideIndex) => (
                <div
                  key={slideIndex}
                  className="grid w-full flex-shrink-0 grid-cols-1 gap-6 lg:grid-cols-2"
                >
                  {testimonials
                    .slice(slideIndex * 2, slideIndex * 2 + 2)
                    .map((review) => (
                      <DesktopTestimonialCard key={review.id} review={review} />
                    ))}
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={prevSlide}
            className="absolute left-0 top-1/2 flex h-10 w-10 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg lg:-translate-x-6"
            aria-label="Onceki"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={nextSlide}
            className="absolute right-0 top-1/2 flex h-10 w-10 translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg lg:translate-x-6"
            aria-label="Sonraki"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="mt-8 flex items-center justify-center gap-2">
            {[...Array(totalSlides)].map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goToSlide(index)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  index === currentIndex
                    ? "h-2 w-6 bg-neutral-900"
                    : "h-2 w-2 bg-neutral-300 hover:bg-neutral-400"
                )}
                aria-label={`Sayfa ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {displayedBlogPosts.length > 0 ? (
          <div className="mt-16 lg:mt-20">
            <div className="text-center">
              <h3 className="text-3xl font-semibold uppercase tracking-tight text-neutral-900 lg:text-4xl">
                {blogHeading}
              </h3>
              <Link
                href={blogViewAllHref}
                className="mt-3 inline-flex text-base font-medium text-neutral-700 underline-offset-4 transition-colors hover:text-neutral-900 hover:underline"
              >
                {blogViewAllLabel}
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {displayedBlogPosts.map((post) => {
                const imageSource =
                  resolveStorefrontAssetUrl(post.image) || resolveStorefrontDirectAssetUrl(post.image);

                return (
                  <Link
                    key={post.id}
                    href={post.href}
                    className={cn("group block", displayedBlogPosts.length === 1 && "md:col-start-2")}
                  >
                    <article>
                      <div className="relative aspect-[16/9] overflow-hidden bg-neutral-200">
                        {imageSource ? (
                          <Image
                            src={imageSource}
                            alt={post.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                            sizes="(max-width: 768px) 100vw, 33vw"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-neutral-200 text-sm text-neutral-600">
                            Blog gorseli
                          </div>
                        )}
                      </div>

                      <h4 className="mt-5 text-center text-3xl font-semibold tracking-tight text-neutral-900">
                        {post.title}
                      </h4>
                    </article>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
