"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  resolveStorefrontAssetUrl,
  resolveStorefrontDirectAssetUrl,
} from "@/lib/asset-url";
import { cn } from "@/lib/utils";

const AUTO_PLAY_MS = 5000;

function resolveImage(src: string) {
  return resolveStorefrontAssetUrl(src) || resolveStorefrontDirectAssetUrl(src);
}

function CarouselImage({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const imageSource = resolveImage(src);

  if (!imageSource) {
    return <div className="h-full w-full bg-[#E7DED3]" />;
  }

  return (
    <Image
      src={imageSource}
      alt={alt}
      fill
      priority={priority}
      unoptimized
      sizes="(min-width: 768px) 40vw, 90vw"
      className="object-cover"
    />
  );
}

export function StoreLocationImageCarousel({
  images,
  altPrefix,
  priority = false,
  className,
}: {
  images: string[];
  altPrefix: string;
  priority?: boolean;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slideCount = images.length;

  const goTo = useCallback(
    (index: number) => {
      if (slideCount <= 0) return;
      setActiveIndex((index + slideCount) % slideCount);
    },
    [slideCount],
  );

  const next = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const prev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    setActiveIndex(0);
  }, [images]);

  useEffect(() => {
    if (slideCount <= 1 || isPaused) {
      return undefined;
    }

    const timer = window.setInterval(next, AUTO_PLAY_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, next, slideCount]);

  if (slideCount === 0) {
    return <div className={cn("bg-[#E7DED3]", className)} />;
  }

  if (slideCount === 1) {
    return (
      <div className={cn("relative overflow-hidden bg-[#E7DED3]", className)}>
        <CarouselImage src={images[0]} alt={`${altPrefix} 1`} priority={priority} />
      </div>
    );
  }

  return (
    <div
      className={cn("group/carousel relative overflow-hidden bg-[#E7DED3]", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="flex h-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {images.map((src, index) => (
          <div key={`${src}-${index}`} className="relative h-full w-full shrink-0">
            <CarouselImage
              src={src}
              alt={`${altPrefix} ${index + 1}`}
              priority={priority && index === 0}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={prev}
        className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm transition-all hover:text-neutral-950 md:opacity-0 md:group-hover/carousel:opacity-100"
        aria-label="Önceki görsel"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <button
        type="button"
        onClick={next}
        className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm transition-all hover:text-neutral-950 md:opacity-0 md:group-hover/carousel:opacity-100"
        aria-label="Sonraki görsel"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-1.5">
        {images.map((_, index) => (
          <button
            key={`dot-${index}`}
            type="button"
            onClick={() => goTo(index)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80",
            )}
            aria-label={`Görsel ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
