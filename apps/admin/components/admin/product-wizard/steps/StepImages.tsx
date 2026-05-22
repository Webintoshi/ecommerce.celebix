"use client";

import { useState, useRef, useEffect } from "react";
import { ImageIcon, Upload, X, Star, GripVertical, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProductImage } from "@/types/product";
import {
  isSupportedImageMimeType,
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL,
} from "@celebix/platform-config/src/image-formats";

// Dynamic import for Dialog to avoid hydration issues
import dynamic from "next/dynamic";
const Dialog = dynamic(() => import("@headlessui/react").then((mod) => mod.Dialog), { ssr: false });
const DialogPanel = dynamic(() => import("@headlessui/react").then((mod) => mod.DialogPanel), { ssr: false });

interface StepImagesProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  errors: Record<string, string>;
}

const MAX_IMAGES = 20;

export function StepImages({ images = [], onChange, errors }: StepImagesProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));

    if (fileArray.length === 0) return;

    if (images.length + fileArray.length > MAX_IMAGES) {
      toast.error(`En fazla ${MAX_IMAGES} görsel ekleyebilirsiniz`);
      return;
    }

    setUploading(true);

    const validFiles = fileArray.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} dosya boyutu çok büyük (maksimum 5MB)`);
        return false;
      }
      if (!isSupportedImageMimeType(file.type, file.name)) {
        toast.error(`${file.name} formatı desteklenmiyor (${SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL})`);
        return false;
      }
      return true;
    });

    // Parallel upload
    const uploadPromises = validFiles.map(async (file, uploadIndex) => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'products');

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json().catch(() => null);

        if (response.ok && result?.success && result?.url) {
          return {
            success: true as const,
            url: result.url, 
            alt: "", 
            isPrimary: false, 
            sortOrder: images.length + uploadIndex,
          };
        }
        return {
          success: false as const,
          fileName: file.name,
          error: result?.error || "Görsel yüklenemedi.",
        };
      } catch (error) {
        console.error('Upload error:', error);
        return {
          success: false as const,
          fileName: file.name,
          error: error instanceof Error ? error.message : "Görsel yüklenirken hata oluştu.",
        };
      }
    });

    const results = await Promise.all(uploadPromises);
    const newImages: ProductImage[] = results
      .filter((result): result is { success: true; url: string; alt: string; isPrimary: boolean; sortOrder: number } => result.success)
      .map(({ url, alt, isPrimary, sortOrder }) => ({ url, alt, isPrimary, sortOrder }));
    const failedUploads = results.filter((result): result is { success: false; fileName: string; error: string } => !result.success);

    if (newImages.length > 0) {
      // İlk görsel ana görsel olsun (eğer hiç ana görsel yoksa)
      const hasPrimary = images.some(img => img.isPrimary);
      if (!hasPrimary && newImages.length > 0) {
        newImages[0].isPrimary = true;
      }
      
      const updatedImages = [...images, ...newImages];
      console.log('StepImages - onChange called with:', updatedImages);
      onChange(updatedImages);
      toast.success(`${newImages.length} görsel yüklendi`);
    }

    if (failedUploads.length > 0) {
      const firstFailure = failedUploads[0];
      toast.error(`${firstFailure.fileName}: ${firstFailure.error}`);
    }

    setUploading(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeImage = (index: number) => {
    const removedImage = images[index];
    const newImages = images.filter((_, i) => i !== index);
    
    // Eğer ana görsel silindiyse, yeni ilk görseli ana yap
    if (removedImage.isPrimary && newImages.length > 0) {
      newImages[0].isPrimary = true;
    }
    
    // Sort order'ları güncelle
    newImages.forEach((img, i) => {
      img.sortOrder = i;
    });
    
    onChange(newImages);
  };

  const makePrimary = (index: number) => {
    const newImages = images.map((img, i) => ({
      ...img,
      isPrimary: i === index,
    }));
    onChange(newImages);
    toast.success("Ana görsel değiştirildi");
  };

  const updateAltText = (index: number, alt: string) => {
    const newImages = [...images];
    newImages[index].alt = alt;
    onChange(newImages);
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= images.length) return;
    
    const newImages = [...images];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);
    
    // Sort order'ları güncelle
    newImages.forEach((img, i) => {
      img.sortOrder = i;
    });
    
    onChange(newImages);
  };

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      {/* Section Header */}
      <div className="flex items-center gap-4 border-b border-[var(--admin-border)] pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--admin-accent)] text-white shadow-[0_14px_28px_rgba(255,106,0,0.22)]">
          <ImageIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-stone-900">Ürün Görselleri</h3>
          <p className="text-sm text-stone-500">
            En fazla {MAX_IMAGES} görsel yükleyebilirsiniz. İlk görsel ana görsel olarak kullanılır.
          </p>
        </div>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={handleDrag}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative cursor-pointer overflow-hidden rounded-[28px] border-2 border-dashed p-8 transition-all md:p-12 focus-within:ring-2 focus-within:ring-[#FF6A00]/25",
          dragActive
            ? "border-[var(--admin-accent)] bg-[var(--admin-accent-soft)] shadow-[var(--shadow-md)]"
            : "border-[var(--admin-accent-border)] bg-white hover:border-[var(--admin-accent)]/35 hover:bg-[#FCFDFE]"
        )}
        role="button"
        tabIndex={0}
        aria-label="Ürün görselleri yükleme alanı"
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#FF6A00]/6 to-transparent" />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          className="hidden"
          multiple
          accept={SUPPORTED_IMAGE_ACCEPT}
        />

        <div className="relative flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[var(--admin-border)] bg-white shadow-sm">
            <Upload className="w-8 h-8 text-[var(--admin-accent)]" />
          </div>
          <div>
            <p className="text-lg font-semibold text-stone-900">
              {uploading ? "Yükleniyor..." : "Görselleri Sürükleyin veya Tıklayın"}
            </p>
            <p className="mt-1 text-sm text-stone-500" aria-live="polite">
              {SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL} (Max. 5MB) • {images.length}/{MAX_IMAGES}
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {errors.images && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4" aria-live="polite">
          <p className="text-sm text-rose-600 font-medium">{errors.images}</p>
        </div>
      )}

      {/* Images Grid */}
      {images.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">
            Yüklenen Görseller ({images.length})
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img, index) => (
              <div
                key={img.url}
                className="group relative overflow-hidden rounded-[26px] border border-[var(--admin-border)] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(72,36,8,0.08)]"
              >
                {/* Image */}
                <div className="aspect-square relative">
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Primary Badge */}
                  {img.isPrimary && (
                    <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[var(--admin-accent)] px-2.5 py-1 text-[10px] font-bold text-white shadow-[0_10px_20px_rgba(255,106,0,0.24)]">
                      <Star className="w-3 h-3" />
                      Ana
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-stone-950/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewImage(img.url); }}
                      className="rounded-xl bg-white/20 p-2 text-white backdrop-blur transition-colors hover:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                      aria-label={`${index + 1}. görseli büyüt`}
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                    {!img.isPrimary && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); makePrimary(index); }}
                        className="rounded-xl bg-white/20 p-2 text-white backdrop-blur transition-colors hover:bg-[var(--admin-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        aria-label={`${index + 1}. görseli ana görsel yap`}
                      >
                        <Star className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                      className="rounded-xl bg-white/20 p-2 text-white backdrop-blur transition-colors hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                      aria-label={`${index + 1}. görseli sil`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Reorder Buttons */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveImage(index, index - 1); }}
                      disabled={index === 0}
                      className="rounded-lg bg-white/85 p-1.5 text-stone-600 backdrop-blur transition-colors hover:bg-white disabled:opacity-30"
                      aria-label={`${index + 1}. görseli sola taşı`}
                    >
                      <GripVertical className="w-4 h-4 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveImage(index, index + 1); }}
                      disabled={index === images.length - 1}
                      className="rounded-lg bg-white/85 p-1.5 text-stone-600 backdrop-blur transition-colors hover:bg-white disabled:opacity-30"
                      aria-label={`${index + 1}. görseli sağa taşı`}
                    >
                      <GripVertical className="w-4 h-4 rotate-90" />
                    </button>
                  </div>
                </div>

                {/* Alt Text Input */}
                <div className="border-t border-[var(--admin-border)] p-3">
                  <input
                    type="text"
                    value={img.alt}
                    onChange={(e) => updateAltText(index, e.target.value)}
                    placeholder="Alt metin (SEO için)"
                    maxLength={125}
                    className="w-full rounded-xl border border-[#e8dbcf] bg-[#FCFDFE] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                  />
                  <p className="mt-1 text-right text-[10px] text-stone-400" aria-live="polite">
                    {img.alt.length}/125
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {mounted && (
        <Dialog open={!!previewImage} onClose={() => setPreviewImage(null)} className="relative z-50">
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setPreviewImage(null)} />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 shadow-2xl">
              {previewImage && (
                <img
                  src={previewImage}
                  alt="Görsel önizleme"
                  className="w-full h-auto rounded-2xl shadow-2xl"
                />
              )}
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </div>
  );
}
