"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Heart, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

type GalleryBadge = {
  label: string;
  tone?: "discount" | "new" | "stock" | "neutral";
};

interface ImageGalleryProps {
  images: string[];
  productName: string;
  badges?: GalleryBadge[];
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
}

function getBadgeClass(tone: GalleryBadge["tone"] = "neutral") {
  if (tone === "discount") return "bg-[#FFF1E8] text-[#EA580C]";
  if (tone === "new") return "bg-[#DCFCE7] text-[#15803D]";
  if (tone === "stock") return "bg-[#FEF3C7] text-[#D97706]";
  return "bg-white/90 text-[#111827]";
}

export function ImageGallery({
  images,
  productName,
  badges = [],
  isWishlisted = false,
  onToggleWishlist,
}: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageStatus, setImageStatus] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [isClient, setIsClient] = useState(false);
  const [mainImageScale, setMainImageScale] = useState(1);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const hasTouchGesture = useRef(false);
  const mainImageRef = useRef<HTMLImageElement | null>(null);
  const mainStageRef = useRef<HTMLDivElement | null>(null);

  // Ensure images is an array
  const safeImages = Array.isArray(images) ? images : [];
  
  // Filter valid images
  const displayImages = safeImages
    .filter((img) => img && typeof img === "string" && img.trim() !== "")
    .map((img) => resolveStorefrontAssetUrl(img))
    .filter((img) => img.length > 0);

  // Reset selected index when images change
  useEffect(() => {
    setSelectedIndex(0);
    setImageStatus({});
    setMainImageScale(1);
  }, [images]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update status for current image
  const setStatus = useCallback((imageUrl: string, status: 'loading' | 'loaded' | 'error') => {
    if (!imageUrl) return;
    setImageStatus(prev => ({ ...prev, [imageUrl]: status }));
  }, []);

  const updateMainImageScale = useCallback(() => {
    const stage = mainStageRef.current;
    const image = mainImageRef.current;

    if (!stage || !image || !image.naturalWidth || !image.naturalHeight) {
      setMainImageScale(1);
      return;
    }

    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;

    if (!stageWidth || !stageHeight) {
      setMainImageScale(1);
      return;
    }

    const imageRatio = image.naturalWidth / image.naturalHeight;
    const stageRatio = stageWidth / stageHeight;

    if (!Number.isFinite(imageRatio) || !Number.isFinite(stageRatio) || imageRatio >= stageRatio) {
      setMainImageScale(1);
      return;
    }

    const widthRatio = imageRatio / stageRatio;
    const targetWidthRatio = stageWidth < 640 ? 0.74 : 0.68;

    if (widthRatio >= targetWidthRatio) {
      setMainImageScale(1);
      return;
    }

    const nextScale = Math.min(1.42, Math.max(1, targetWidthRatio / widthRatio));
    setMainImageScale(Number(nextScale.toFixed(3)));
  }, []);

  if (displayImages.length === 0) {
    return (
      <div className="relative flex aspect-[4/3] flex-col items-center justify-center rounded-[1.4rem] border border-[#E5E7EB] bg-[#F8FAFC] lg:aspect-[16/10]">
        <svg className="w-20 h-20 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"/>
          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2"/>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2"/>
        </svg>
        <p className="text-sm font-medium text-gray-500">Henüz görsel eklenmemiş</p>
      </div>
    );
  }

  const handlePrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev === 0 ? displayImages.length - 1 : prev - 1));
  }, [displayImages.length]);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => (prev === displayImages.length - 1 ? 0 : prev + 1));
  }, [displayImages.length]);

  useEffect(() => {
    if (!isLightboxOpen) return;

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
  }, [isLightboxOpen, displayImages.length, handleNext, handlePrevious]);

  // Touch events (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndY.current = e.touches[0].clientY;
    hasTouchGesture.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
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

  // Mouse events (desktop drag)
  const [isDragging, setIsDragging] = useState(false);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    mouseStartX.current = e.clientX;
    mouseEndX.current = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    mouseEndX.current = e.clientX;
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = mouseStartX.current - mouseEndX.current;
    if (Math.abs(diff) > 50) {
      diff > 0 ? handleNext() : handlePrevious();
    }
  };

  const currentImage = displayImages[selectedIndex];
  const currentStatus = imageStatus[currentImage] || 'loading';

  const overlayChrome = (
    <>
      {badges.length > 0 ? (
        <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2 sm:left-4 sm:top-4">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`rounded-full px-3 py-1.5 text-[11px] font-black ${getBadgeClass(badge.tone)}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
      {onToggleWishlist ? (
        <button
          type="button"
          aria-label={isWishlisted ? "Favorilerden cikar" : "Favorilere ekle"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleWishlist();
          }}
          className={`absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[#E5E7EB] bg-white/95 shadow-[0_10px_25px_rgba(15,23,42,0.12)] transition hover:scale-105 hover:text-[#FF6A00] sm:right-4 sm:top-4 ${
            isWishlisted ? "text-[#FF6A00]" : "text-[#111827]"
          }`}
        >
          <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Gorseli buyut"
        onClick={(event) => {
          event.stopPropagation();
          setIsLightboxOpen(true);
        }}
        className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white/95 text-[#111827] shadow-[0_10px_25px_rgba(15,23,42,0.10)] transition hover:text-[#FF6A00] sm:bottom-4 sm:right-4"
      >
        <Search className="h-4 w-4" />
      </button>
    </>
  );

  useEffect(() => {
    if (!currentImage) return;
    setImageStatus((prev) => {
      if (prev[currentImage]) return prev;
      return { ...prev, [currentImage]: "loading" };
    });
    setMainImageScale(1);
  }, [currentImage]);

  useEffect(() => {
    // cached image scenario: mark as loaded even if onLoad does not fire
    const img = mainImageRef.current;
    if (!img || !currentImage) return;
    if (img.complete && img.naturalWidth > 0) {
      setStatus(currentImage, "loaded");
      updateMainImageScale();
    }
  }, [currentImage, setStatus, updateMainImageScale]);

  useEffect(() => {
    const handleResize = () => updateMainImageScale();
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentImage, updateMainImageScale]);
  const lightboxContent = (
    <AnimatePresence>
      {isLightboxOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="Görsel büyütmeyi kapat"
            onClick={(e) => {
              e.stopPropagation();
              setIsLightboxOpen(false);
            }}
            className="absolute top-4 right-4 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {displayImages.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Önceki görsel"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                type="button"
                aria-label="Sonraki görsel"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}

          <div
            className="relative flex h-full w-full items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
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
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // TEK GÖRSEL
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    if (thumbnailsRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = thumbnailsRef.current;
      setCanScrollUp(scrollTop > 5);
      setCanScrollDown(scrollTop < scrollHeight - clientHeight - 5);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, displayImages.length]);

  const scrollThumbnails = (direction: 'up' | 'down') => {
    if (thumbnailsRef.current) {
      thumbnailsRef.current.scrollBy({
        top: direction === 'up' ? -100 : 100,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  if (displayImages.length === 1) {
    return (
      <div className="w-full">
        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[1.4rem] bg-[#F8FAFC] lg:aspect-[16/10]"
          onClick={() => setIsLightboxOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => handleTouchEnd(() => setIsLightboxOpen(true))}
        >
          {overlayChrome}
          {currentStatus === 'loading' && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse" />
          )}
          {currentStatus === 'error' ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <svg className="w-16 h-16 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l4.586-4.586a2 2 0 012.828 0L20 14M10 4v4m0 0H4m6 0h6" />
              </svg>
              <p className="text-sm text-gray-500">Görsel yüklenemedi</p>
            </div>
          ) : (
            <div className="absolute inset-0 p-5 sm:p-8">
              <div
                ref={mainStageRef}
                className="flex h-full w-full items-center justify-center overflow-hidden"
              >
                <img
                  ref={mainImageRef}
                  src={currentImage}
                  alt={productName}
                  draggable={false}
                  className="max-h-full max-w-full origin-center object-contain transition-transform duration-300"
                  style={{ transform: `scale(${mainImageScale})` }}
                  loading="eager"
                  onLoad={() => {
                    setStatus(currentImage, 'loaded');
                    requestAnimationFrame(updateMainImageScale);
                  }}
                  onError={() => setStatus(currentImage, 'error')}
                />
              </div>
            </div>
          )}
        </div>
        {isClient ? createPortal(lightboxContent, document.body) : null}
      </div>
    );
  }

  // ÇOKLU GÖRSEL
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[92px_1fr] sm:gap-4">
        {/* Sol: Thumbnails */}
        <div className="relative hidden flex-col sm:flex">
          <div 
            ref={thumbnailsRef}
            onScroll={checkScroll}
            className="scrollbar-hide flex max-h-[500px] flex-col gap-3 overflow-y-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {displayImages.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`relative h-[88px] w-[88px] flex-shrink-0 overflow-hidden rounded-2xl border bg-[#F8FAFC] transition-all ${
                  index === selectedIndex
                    ? "border-[#FF6A00] ring-2 ring-[#FF6A00]/15"
                    : "border-transparent hover:border-neutral-300 opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={image}
                  alt={`${productName} - ${index + 1}`}
                  draggable={false}
                  className="h-full w-full object-contain p-1.5"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
          
          {displayImages.length > 4 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => scrollThumbnails('up')}
                disabled={!canScrollUp}
                className={`w-8 h-8 bg-[#F8FAFC] border border-gray-200 rounded-full flex items-center justify-center transition-all ${
                  canScrollUp ? 'opacity-100 hover:border-[#FF6A00] hover:text-[#FF6A00]' : 'opacity-30 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-4 h-4 -rotate-90" />
              </button>
              <button
                onClick={() => scrollThumbnails('down')}
                disabled={!canScrollDown}
                className={`w-8 h-8 bg-[#F8FAFC] border border-gray-200 rounded-full flex items-center justify-center transition-all ${
                  canScrollDown ? 'opacity-100 hover:border-[#FF6A00] hover:text-[#FF6A00]' : 'opacity-30 cursor-not-allowed'
                }`}
              >
                <ChevronRight className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          )}
        </div>

        {/* Sağ: Ana Görsel */}
        <div
          className={`relative aspect-[4/3] select-none overflow-hidden rounded-[1.4rem] bg-[#F8FAFC] lg:aspect-[16/10] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onClick={() => !isDragging && setIsLightboxOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => handleTouchEnd(() => setIsLightboxOpen(true))}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ touchAction: 'pan-y' }}
        >
          {overlayChrome}
          {/* Loading placeholder */}
          {currentStatus === 'loading' && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse" />
          )}

          {/* Error state */}
          {currentStatus === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <svg className="w-16 h-16 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l4.586-4.586a2 2 0 012.828 0L20 14M10 4v4m0 0H4m6 0h6" />
              </svg>
              <p className="text-sm text-gray-500">Görsel yüklenemedi</p>
            </div>
          )}

          {/* Main image - always render, opacity based on status */}
          <div
            className={`absolute inset-0 p-5 transition-opacity duration-300 sm:p-8 ${
              currentStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div
              ref={mainStageRef}
              className="flex h-full w-full items-center justify-center overflow-hidden"
            >
              <img
                ref={mainImageRef}
                key={selectedIndex}
                src={currentImage}
                alt={`${productName} - Ana Görsel`}
                draggable={false}
                className="max-h-full max-w-full origin-center object-contain transition-transform duration-300"
                style={{ transform: `scale(${mainImageScale})` }}
                loading="eager"
                onLoad={() => {
                  setStatus(currentImage, 'loaded');
                  requestAnimationFrame(updateMainImageScale);
                }}
                onError={() => setStatus(currentImage, 'error')}
              />
            </div>
          </div>

          {/* Navigation arrows */}
          {displayImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-[#FFF1E8] hover:text-[#FF6A00] transition-colors z-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-[#FFF1E8] hover:text-[#FF6A00] transition-colors z-10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Dots indicator */}
          {displayImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {displayImages.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex(index); }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === selectedIndex ? 'bg-[#FF6A00] w-4' : 'bg-neutral-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {isClient ? createPortal(lightboxContent, document.body) : null}
    </div>
  );
}
