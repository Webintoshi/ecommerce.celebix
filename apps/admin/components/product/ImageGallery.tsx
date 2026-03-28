"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

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
  const mainImageRef = useRef<HTMLImageElement | null>(null);

  // Ensure images is an array
  const safeImages = Array.isArray(images) ? images : [];
  
  // Filter valid images
  const displayImages = safeImages.filter(img => 
    img && typeof img === 'string' && img.trim() !== ''
  );

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
      <div className="relative aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl border border-gray-200 flex flex-col items-center justify-center">
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
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      diff > 0 ? handleNext() : handlePrevious();
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

          <img
            src={currentImage}
            alt={productName}
            className="max-w-full max-h-full object-contain p-4"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  // TEK GÖRSEL
  if (displayImages.length === 1) {
    return (
      <div className="w-full">
        <div
          className="relative aspect-square bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer"
          onClick={() => setIsLightboxOpen(true)}
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
              className="w-full h-full object-contain"
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
                className={`relative w-[72px] h-[72px] sm:w-[100px] sm:h-[100px] flex-shrink-0 rounded-lg sm:rounded-xl overflow-hidden border-2 transition-all ${
                  index === selectedIndex
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={image}
                  alt={`${productName} - ${index + 1}`}
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
                className={`w-8 h-8 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center justify-center transition-all ${
                  canScrollUp ? 'opacity-100 hover:border-primary hover:text-primary' : 'opacity-30 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-4 h-4 -rotate-90" />
              </button>
              <button
                onClick={() => scrollThumbnails('down')}
                disabled={!canScrollDown}
                className={`w-8 h-8 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center justify-center transition-all ${
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
          className={`relative aspect-square bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onClick={() => !isDragging && setIsLightboxOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ touchAction: 'pan-y' }}
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
            alt={`${productName} - Ana Görsel`}
            className={`w-full h-full object-contain transition-opacity duration-300 ${
              currentStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
            loading="eager"
            onLoad={() => setStatus(currentImage, 'loaded')}
            onError={() => setStatus(currentImage, 'error')}
          />

          {/* Navigation arrows */}
          {displayImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-white transition-colors z-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-white transition-colors z-10"
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
                    index === selectedIndex ? 'bg-primary w-4' : 'bg-gray-300'
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
