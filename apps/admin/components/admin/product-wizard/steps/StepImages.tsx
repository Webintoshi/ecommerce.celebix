"use client";

import { useState, useRef, useEffect } from "react";
import { ImageIcon, Upload, X, Star, GripVertical, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProductImage } from "@/types/product";

// Dynamic import for Dialog to avoid hydration issues
import dynamic from "next/dynamic";
const Dialog = dynamic(() => import("@headlessui/react").then((mod) => mod.Dialog), { ssr: false });

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

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const validFiles = fileArray.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} dosya boyutu çok büyük (maksimum 5MB)`);
        return false;
      }
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name} formatı desteklenmiyor`);
        return false;
      }
      return true;
    });

    // Parallel upload
    const uploadPromises = validFiles.map(async (file) => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'products');

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        
        if (result.success && result.url) {
          return { 
            url: result.url, 
            alt: "", 
            isPrimary: false, 
            sortOrder: images.length 
          };
        }
        return null;
      } catch (error) {
        console.error('Upload error:', error);
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const newImages = results.filter((r): r is ProductImage => r !== null);

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
    <div className="p-8 space-y-8">
      {/* Section Header */}
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
        <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
          <ImageIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Ürün Görselleri</h3>
          <p className="text-sm text-gray-500">
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
          "relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer",
          dragActive 
            ? "border-amber-500 bg-amber-50" 
            : "border-gray-200 hover:border-amber-300 hover:bg-gray-50"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          className="hidden"
          multiple
          accept="image/*"
        />

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center">
            <Upload className="w-8 h-8 text-amber-500" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">
              {uploading ? "Yükleniyor..." : "Görselleri Sürükleyin veya Tıklayın"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              PNG, JPG, WebP (Max. 5MB) • {images.length}/{MAX_IMAGES}
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {errors.images && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
          <p className="text-sm text-rose-600 font-medium">{errors.images}</p>
        </div>
      )}

      {/* Images Grid */}
      {images.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-gray-700">
            Yüklenen Görseller ({images.length})
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img, index) => (
              <div
                key={img.url}
                className="group relative bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all"
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
                    <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      Ana
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewImage(img.url); }}
                      className="p-2 bg-white/20 backdrop-blur text-white rounded-xl hover:bg-white/40 transition-colors"
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                    {!img.isPrimary && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); makePrimary(index); }}
                        className="p-2 bg-white/20 backdrop-blur text-white rounded-xl hover:bg-blue-600 transition-colors"
                      >
                        <Star className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                      className="p-2 bg-white/20 backdrop-blur text-white rounded-xl hover:bg-rose-600 transition-colors"
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
                      className="p-1.5 bg-white/80 backdrop-blur text-gray-600 rounded-lg hover:bg-white disabled:opacity-30"
                    >
                      <GripVertical className="w-4 h-4 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveImage(index, index + 1); }}
                      disabled={index === images.length - 1}
                      className="p-1.5 bg-white/80 backdrop-blur text-gray-600 rounded-lg hover:bg-white disabled:opacity-30"
                    >
                      <GripVertical className="w-4 h-4 rotate-90" />
                    </button>
                  </div>
                </div>

                {/* Alt Text Input */}
                <div className="p-3 border-t border-gray-100">
                  <input
                    type="text"
                    value={img.alt}
                    onChange={(e) => updateAltText(index, e.target.value)}
                    placeholder="Alt metin (SEO için)"
                    maxLength={125}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-right">
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
            <Dialog.Panel className="max-w-5xl w-full">
              {previewImage && (
                <img
                  src={previewImage}
                  alt="Görsel önizleme"
                  className="w-full h-auto rounded-2xl shadow-2xl"
                />
              )}
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
    </div>
  );
}
