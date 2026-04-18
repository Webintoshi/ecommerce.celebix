"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface ImageGalleryProps {
  images: string[];
  productName: string;
}

type ImageLoadState = "loading" | "loaded" | "error";

const FALLBACK_RATIO = 4 / 5;

function FallbackGalleryState() {
  return (
      <div className="relative flex aspect-[4/5] flex-col items-center justify-center bg-[#ffffff]">
      <svg
        className="mb-3 h-20 w-20 text-gray-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
        <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2" />
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2" />
      </svg>
      <p className="text-sm font-medium text-gray-500">Henüz görsel eklenmemiş</p>
    </div>
  );
}

export function ImageGallery({ images, productName }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageStatus, setImageStatus] = useState<Record<string, ImageLoadState>>({});
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [isClient, setIsClient] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const hasTouchGesture = useRef(false);
  const mainImageRef = useRef<HTMLImageElement | null>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);

  const safeImages = Array.isArray(images) ? images : [];
  const displayImages = safeImages
    .filter((image) => image && typeof image === "string" && image.trim() !== "")
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => image.length > 0);

  useEffect(() => {
    setSelectedIndex(0);
    setImageStatus({});
    setImageRatios({});
  }, [images]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const setStatus = useCallback((imageUrl: string, status: ImageLoadState) => {
    if (!imageUrl) {
      return;
    }

    setImageStatus((current) => ({
      ...current,
      [imageUrl]: status,
    }));
  }, []);

  const registerImageMetrics = useCallback((imageUrl: string, imageElement: HTMLImageElement) => {
    if (!imageUrl || imageElement.naturalWidth <= 0 || imageElement.naturalHeight <= 0) {
      return;
    }

    const ratio = imageElement.naturalWidth / imageElement.naturalHeight;
    setImageRatios((current) => {
      if (current[imageUrl] && Math.abs(current[imageUrl] - ratio) < 0.001) {
        return current;
      }

      return {
        ...current,
        [imageUrl]: ratio,
      };
    });
  }, []);

  const openLightboxAt = useCallback((index: number) => {
    setSelectedIndex(index);
    setIsLightboxOpen(true);
  }, []);

  const handlePrevious = useCallback(() => {
    setSelectedIndex((current) =>
      current === 0 ? displayImages.length - 1 : current - 1,
    );
  }, [displayImages.length]);

  const handleNext = useCallback(() => {
    setSelectedIndex((current) =>
      current === displayImages.length - 1 ? 0 : current + 1,
    );
  }, [displayImages.length]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLightboxOpen(false);
      } else if (event.key === "ArrowLeft" && displayImages.length > 1) {
        handlePrevious();
      } else if (event.key === "ArrowRight" && displayImages.length > 1) {
        handleNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [displayImages.length, handleNext, handlePrevious, isLightboxOpen]);

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
    touchEndX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    touchEndY.current = event.touches[0].clientY;
    hasTouchGesture.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    touchEndX.current = event.touches[0].clientX;
    touchEndY.current = event.touches[0].clientY;

    if (
      Math.abs(touchStartX.current - touchEndX.current) > 8 ||
      Math.abs(touchStartY.current - touchEndY.current) > 8
    ) {
      hasTouchGesture.current = true;
    }
  };

  const handleTouchEnd = (onTap?: () => void) => {
    const diffX = touchStartX.current - touchEndX.current;
    const diffY = touchStartY.current - touchEndY.current;
    const isHorizontalSwipe =
      Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY);

    if (isHorizontalSwipe) {
      diffX > 0 ? handleNext() : handlePrevious();
      return;
    }

    const isTap =
      !hasTouchGesture.current ||
      (Math.abs(diffX) < 10 && Math.abs(diffY) < 10);

    if (isTap) {
      onTap?.();
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true);
    mouseStartX.current = event.clientX;
    mouseEndX.current = event.clientX;
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) {
      return;
    }

    mouseEndX.current = event.clientX;
  };

  const handleMouseUp = () => {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);
    const diff = mouseStartX.current - mouseEndX.current;
    if (Math.abs(diff) > 50) {
      diff > 0 ? handleNext() : handlePrevious();
    }
  };

  const currentImage = displayImages[selectedIndex];
  const currentStatus = currentImage ? imageStatus[currentImage] || "loading" : "loading";

  useEffect(() => {
    if (!currentImage) {
      return;
    }

    setImageStatus((current) => {
      if (current[currentImage]) {
        return current;
      }

      return {
        ...current,
        [currentImage]: "loading",
      };
    });
  }, [currentImage]);

  useEffect(() => {
    const imageElement = mainImageRef.current;
    if (!imageElement || !currentImage) {
      return;
    }

    if (imageElement.complete && imageElement.naturalWidth > 0) {
      setStatus(currentImage, "loaded");
      registerImageMetrics(currentImage, imageElement);
    }
  }, [currentImage, registerImageMetrics, setStatus]);

  const checkScroll = useCallback(() => {
    if (!thumbnailsRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = thumbnailsRef.current;
    setCanScrollUp(scrollTop > 5);
    setCanScrollDown(scrollTop < scrollHeight - clientHeight - 5);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [checkScroll, displayImages.length]);

  const scrollThumbnails = (direction: "up" | "down") => {
    if (!thumbnailsRef.current) {
      return;
    }

    thumbnailsRef.current.scrollBy({
      top: direction === "up" ? -100 : 100,
      behavior: "smooth",
    });
    window.setTimeout(checkScroll, 300);
  };

  if (displayImages.length === 0) {
    return <FallbackGalleryState />;
  }

  const getRatio = (imageUrl: string) => imageRatios[imageUrl] || FALLBACK_RATIO;

  const lightboxContent = (
    <AnimatePresence>
      {isLightboxOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="Görsel büyütmeyi kapat"
            onClick={(event) => {
              event.stopPropagation();
              setIsLightboxOpen(false);
            }}
            className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/10 backdrop-blur"
          >
            <X className="h-6 w-6 text-white" />
          </button>

          {displayImages.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Önceki görsel"
                onClick={(event) => {
                  event.stopPropagation();
                  handlePrevious();
                }}
                className="absolute left-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-white/10 backdrop-blur"
              >
                <ChevronLeft className="h-6 w-6 text-white" />
              </button>
              <button
                type="button"
                aria-label="Sonraki görsel"
                onClick={(event) => {
                  event.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-white/10 backdrop-blur"
              >
                <ChevronRight className="h-6 w-6 text-white" />
              </button>
            </>
          ) : null}

          <div
            className="relative flex h-full w-full items-center justify-center p-4"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => handleTouchEnd()}
          >
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium tracking-[0.2em] text-white/85">
              {selectedIndex + 1} / {displayImages.length}
            </div>
            <img
              src={currentImage}
              alt={productName}
              draggable={false}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const desktopGrid = (
    <div className="hidden lg:block">
      <div
        className={`grid gap-1.5 xl:gap-2 ${
          displayImages.length === 1 ? "grid-cols-1" : "grid-cols-2"
        }`}
      >
        {displayImages.map((image, index) => {
          const status = imageStatus[image] || "loading";

          return (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => openLightboxAt(index)}
                className="group relative overflow-hidden bg-[#ffffff] text-left"
              style={{ aspectRatio: `${getRatio(image)}` }}
            >
              {status === "loading" ? (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 to-gray-200" />
              ) : null}

              {status === "error" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-sm text-gray-500">
                  Görsel yüklenemedi
                </div>
              ) : null}

              <img
                src={image}
                alt={`${productName} - ${index + 1}`}
                draggable={false}
                className={`h-full w-full object-cover transition duration-500 ${
                  status === "loaded" ? "opacity-100" : "opacity-0"
                }`}
                loading={index < 2 ? "eager" : "lazy"}
                onLoad={(event) => {
                  setStatus(image, "loaded");
                  registerImageMetrics(image, event.currentTarget);
                }}
                onError={() => setStatus(image, "error")}
              />

              <div className="pointer-events-none absolute inset-0 ring-1 ring-black/6" />
              {selectedIndex === index ? (
                <div className="pointer-events-none absolute inset-0 ring-2 ring-[#171311]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const mobileSingleImage = (
    <div className="lg:hidden">
      <div
                      className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#ffffff] cursor-pointer"
        onClick={() => setIsLightboxOpen(true)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => handleTouchEnd(() => setIsLightboxOpen(true))}
      >
        {currentStatus === "loading" ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 to-gray-200" />
        ) : null}
        {currentStatus === "error" ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <svg
              className="mb-2 h-16 w-16 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l4.586-4.586a2 2 0 012.828 0L20 14M10 4v4m0 0H4m6 0h6"
              />
            </svg>
            <p className="text-sm text-gray-500">Görsel yüklenemedi</p>
          </div>
        ) : (
          <img
            ref={mainImageRef}
            src={currentImage}
            alt={productName}
            draggable={false}
            className="h-full w-full object-contain"
            loading="eager"
            onLoad={(event) => {
              setStatus(currentImage, "loaded");
              registerImageMetrics(currentImage, event.currentTarget);
            }}
            onError={() => setStatus(currentImage, "error")}
          />
        )}
      </div>
    </div>
  );

  const mobileCarousel = (
    <div className="lg:hidden">
      <div className="grid items-start gap-3 sm:grid-cols-[88px_1fr] sm:gap-4 lg:grid-cols-[104px_1fr]">
        <div className="relative flex flex-col">
          <div
            ref={thumbnailsRef}
            onScroll={checkScroll}
            className="scrollbar-hide flex max-h-[420px] flex-col gap-2 overflow-y-auto sm:max-h-[640px] sm:gap-3"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {displayImages.map((image, index) => (
              <button
                key={image}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`relative h-[88px] w-[72px] flex-shrink-0 overflow-hidden rounded-[1rem] border transition-all sm:h-[104px] sm:w-[88px] ${
                  index === selectedIndex
                    ? "border-[#171311]"
                    : "border-transparent opacity-70 hover:border-[rgba(26,26,26,0.16)] hover:opacity-100"
                }`}
              >
                <img
                  src={image}
                  alt={`${productName} - ${index + 1}`}
                  draggable={false}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onLoad={(event) => registerImageMetrics(image, event.currentTarget)}
                />
              </button>
            ))}
          </div>

          {displayImages.length > 4 ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => scrollThumbnails("up")}
                disabled={!canScrollUp}
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/78 transition-all ${
                  canScrollUp
                    ? "opacity-100 hover:border-[#222222] hover:text-[#222222]"
                    : "cursor-not-allowed opacity-30"
                }`}
              >
                <ChevronLeft className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => scrollThumbnails("down")}
                disabled={!canScrollDown}
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/78 transition-all ${
                  canScrollDown
                    ? "opacity-100 hover:border-[#222222] hover:text-[#222222]"
                    : "cursor-not-allowed opacity-30"
                }`}
              >
                <ChevronRight className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          ) : null}
        </div>

        <div
                    className={`relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#ffffff] select-none ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onClick={() => !isDragging && setIsLightboxOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => handleTouchEnd(() => setIsLightboxOpen(true))}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ touchAction: "pan-y" }}
        >
          {currentStatus === "loading" ? (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 to-gray-200" />
          ) : null}

          {currentStatus === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <svg
                className="mb-2 h-16 w-16 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l4.586-4.586a2 2 0 012.828 0L20 14M10 4v4m0 0H4m6 0h6"
                />
              </svg>
              <p className="text-sm text-gray-500">Görsel yüklenemedi</p>
            </div>
          ) : null}

          <img
            ref={mainImageRef}
            key={selectedIndex}
            src={currentImage}
            alt={`${productName} - Ana Görsel`}
            draggable={false}
            className={`h-full w-full object-contain transition-opacity duration-300 ${
              currentStatus === "loaded" ? "opacity-100" : "opacity-0"
            }`}
            loading="eager"
            onLoad={(event) => {
              setStatus(currentImage, "loaded");
              registerImageMetrics(currentImage, event.currentTarget);
            }}
            onError={() => setStatus(currentImage, "error")}
          />

          {displayImages.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handlePrevious();
                }}
                className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/80 backdrop-blur transition-colors hover:bg-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleNext();
                }}
                className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/80 backdrop-blur transition-colors hover:bg-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          {displayImages.length > 1 ? (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
              {displayImages.map((_, index) => (
                <button
                  key={`${index}-dot`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIndex(index);
                  }}
                  className={`h-2 rounded-full transition-all ${
                    index === selectedIndex ? "w-4 bg-[#171311]" : "w-2 bg-neutral-300"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {desktopGrid}
      {displayImages.length === 1 ? mobileSingleImage : mobileCarousel}
      {isClient ? createPortal(lightboxContent, document.body) : null}
    </div>
  );
}
