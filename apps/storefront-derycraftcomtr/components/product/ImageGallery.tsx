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

export function ImageGallery({ images, productName }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageStatus, setImageStatus] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [isClient, setIsClient] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const hasTouchGesture = useRef(false);
  const mainImageRef = useRef<HTMLImageElement | null>(null);

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
  }, [images]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update status for current image
  const setStatus = useCallback((imageUrl: string, status: 'loading' | 'loaded' | 'error') => {
    if (!imageUrl) return;
    setImageStatus(prev => ({ ...prev, [imageUrl]: status }));
  }, []);

  if (displayImages.length === 0) {
    return (
      <div className="relative aspect-square flex flex-col items-center justify-center bg-[#F8F8F8]">
        <svg className="w-20 h-20 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"/>
          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2"/>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2"/>
        </svg>
        <p className="text-sm font-medium text-gray-500">No images have been added yet</p>
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

  // Mouse events (desktop drag) — main gallery
  const [isDragging, setIsDragging] = useState(false);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);
  const didDrag = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    didDrag.current = false;
    setIsDragging(true);
    mouseStartX.current = e.clientX;
    mouseEndX.current = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    mouseEndX.current = e.clientX;
    if (Math.abs(mouseStartX.current - mouseEndX.current) > 8) {
      didDrag.current = true;
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = mouseStartX.current - mouseEndX.current;
    if (Math.abs(diff) > 50) {
      didDrag.current = true;
      diff > 0 ? handleNext() : handlePrevious();
    }
  };

  // Mouse events — lightbox
  const [isLightboxDragging, setIsLightboxDragging] = useState(false);
  const lightboxMouseStartX = useRef(0);
  const lightboxMouseEndX = useRef(0);

  const handleLightboxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLightboxDragging(true);
    lightboxMouseStartX.current = e.clientX;
    lightboxMouseEndX.current = e.clientX;
  };

  const handleLightboxMouseMove = (e: React.MouseEvent) => {
    if (!isLightboxDragging) return;
    lightboxMouseEndX.current = e.clientX;
  };

  const handleLightboxMouseUp = (e: React.MouseEvent) => {
    if (!isLightboxDragging) return;
    e.stopPropagation();
    setIsLightboxDragging(false);
    const diff = lightboxMouseStartX.current - lightboxMouseEndX.current;
    if (Math.abs(diff) > 50 && displayImages.length > 1) {
      diff > 0 ? handleNext() : handlePrevious();
    }
  };

  const currentImage = displayImages[selectedIndex];
  const currentStatus = imageStatus[currentImage] || 'loading';

  useEffect(() => {
    if (!currentImage) return;
    setImageStatus((prev) => {
      if (prev[currentImage]) return prev;
      return { ...prev, [currentImage]: "loading" };
    });
  }, [currentImage]);

  useEffect(() => {
    // cached image scenario: mark as loaded even if onLoad does not fire
    const img = mainImageRef.current;
    if (!img || !currentImage) return;
    if (img.complete && img.naturalWidth > 0) {
      setStatus(currentImage, "loaded");
    }
  }, [currentImage, setStatus]);
  const lightboxContent = (
    <AnimatePresence>
      {isLightboxOpen && (
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

          <div className="pointer-events-none relative flex h-full w-full items-center justify-center p-4">
            <div
              className={`pointer-events-auto ${
                isLightboxDragging
                  ? "cursor-grabbing"
                  : displayImages.length > 1
                    ? "cursor-grab"
                    : "cursor-default"
              }`}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={() => handleTouchEnd()}
              onMouseDown={handleLightboxMouseDown}
              onMouseMove={handleLightboxMouseMove}
              onMouseUp={handleLightboxMouseUp}
              onMouseLeave={handleLightboxMouseUp}
            >
              <img
                src={currentImage}
                alt={productName}
                draggable={false}
                className="max-h-[calc(100vh-6rem)] max-w-[min(100vw-2rem,1200px)] select-none object-contain"
              />
            </div>
            <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium tracking-[0.2em] text-white/85">
              {selectedIndex + 1} / {displayImages.length}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // TEK GÖRSEL
  if (displayImages.length === 1) {
    return (
      <div className="w-full">
        <div
          className="relative aspect-square cursor-zoom-in overflow-hidden bg-[#F8F8F8]"
          onClick={() => setIsLightboxOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => handleTouchEnd(() => setIsLightboxOpen(true))}
        >
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
            <img
              ref={mainImageRef}
              src={currentImage}
              alt={productName}
              draggable={false}
              className="h-full w-full cursor-zoom-in object-contain"
              loading="eager"
              onLoad={() => setStatus(currentImage, 'loaded')}
              onError={() => setStatus(currentImage, 'error')}
            />
          )}
        </div>
        {isClient ? createPortal(lightboxContent, document.body) : null}
      </div>
    );
  }

  // ÇOKLU GÖRSEL
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

  return (
    <div className="w-full">
      <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[100px_1fr] gap-3 sm:gap-4 items-start">
        {/* Sol: Thumbnails */}
        <div className="relative flex flex-col">
          <div 
            ref={thumbnailsRef}
            onScroll={checkScroll}
            className="flex flex-col gap-2 sm:gap-3 overflow-y-auto scrollbar-hide max-h-[320px] sm:max-h-[560px]"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {displayImages.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`relative w-[72px] h-[72px] sm:w-[100px] sm:h-[100px] flex-shrink-0 overflow-hidden border transition-all ${
                  index === selectedIndex
                    ? "border-primary"
                    : "border-transparent hover:border-neutral-300 opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={image}
                  alt={`${productName} - ${index + 1}`}
                  draggable={false}
                  className="w-full h-full object-cover"
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
                className={`w-8 h-8 bg-[#F8F8F8] border border-gray-200 rounded-full flex items-center justify-center transition-all ${
                  canScrollUp ? 'opacity-100 hover:border-primary hover:text-primary' : 'opacity-30 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-4 h-4 -rotate-90" />
              </button>
              <button
                onClick={() => scrollThumbnails('down')}
                disabled={!canScrollDown}
                className={`w-8 h-8 bg-[#F8F8F8] border border-gray-200 rounded-full flex items-center justify-center transition-all ${
                  canScrollDown ? 'opacity-100 hover:border-primary hover:text-primary' : 'opacity-30 cursor-not-allowed'
                }`}
              >
                <ChevronRight className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          )}
        </div>

        {/* Sağ: Ana Görsel */}
        <div
          className={`relative aspect-square select-none overflow-hidden bg-[#F8F8F8] ${
            isDragging ? "cursor-grabbing" : "cursor-zoom-in"
          }`}
          onClick={() => {
            if (!didDrag.current) {
              setIsLightboxOpen(true);
            }
            didDrag.current = false;
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => handleTouchEnd(() => setIsLightboxOpen(true))}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ touchAction: "pan-x pinch-zoom" }}
        >
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
          <img
            ref={mainImageRef}
            key={selectedIndex}
            src={currentImage}
            alt={`${productName} ana görsel`}
            draggable={false}
            className={`h-full w-full object-contain transition-opacity duration-300 ${
              isDragging ? "cursor-grabbing" : "cursor-zoom-in"
            } ${currentStatus === "loaded" ? "opacity-100" : "opacity-0"}`}
            loading="eager"
            onLoad={() => setStatus(currentImage, 'loaded')}
            onError={() => setStatus(currentImage, 'error')}
          />

          {/* Navigation arrows */}
          {displayImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#F8F8F8]/90 rounded-full flex items-center justify-center hover:bg-[#F1F1F1] transition-colors z-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#F8F8F8]/90 rounded-full flex items-center justify-center hover:bg-[#F1F1F1] transition-colors z-10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
      {isClient ? createPortal(lightboxContent, document.body) : null}
    </div>
  );
}
