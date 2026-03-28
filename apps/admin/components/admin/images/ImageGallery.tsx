"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Star, X, Zoom, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "react-beautiful-dnd";

interface ImageGalleryProps {
  images: string[];
  imageAlts: Record<string, string>;
  onImagesChange: (images: string[]) => void;
  onAltChange: (imageUrl: string, alt: string) => void;
  onPrimaryChange: (index: number) => void;
  maxImages?: number;
  loading?: boolean;
}

export function ImageGallery({
  images,
  imageAlts,
  onImagesChange,
  onAltChange,
  onPrimaryChange,
  maxImages = 20,
  loading = false,
}: ImageGalleryProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoveredImage, setHoveredImage] = useState<number | null>(null);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(images);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onImagesChange(items);
  }, [images, onImagesChange]);

  const removeImage = useCallback((index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newAlts = { ...imageAlts };
    delete newAlts[images[index]];
    onImagesChange(newImages);
  }, [images, imageAlts, onImagesChange]);

  const makePrimary = useCallback((index: number) => {
    if (index === 0) return;

    const newImages = [...images];
    const [primaryImage] = newImages.splice(index, 1);
    newImages.unshift(primaryImage);

    onImagesChange(newImages);
    onPrimaryChange(0);
  }, [images, onImagesChange, onPrimaryChange]);

  return (
    <>
      <div className="space-y-4">
        {/* Gallery Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">
              Görseller
            </span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
              {images.length}/{maxImages}
            </span>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Yükleniyor...</span>
            </div>
          )}
        </div>

        {/* Image Grid */}
        {images.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">
              Henüz görsel eklenmedi
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Görsel eklemek için yukarıdaki alana sürükleyin veya dosya seçin
            </p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleImageReorder}>
            <Droppable droppableId="images" direction="horizontal">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                  {images.map((img, idx) => (
                    <Draggable key={img} draggableId={img} index={idx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={cn(
                            "relative group/img aspect-square rounded-2xl overflow-hidden bg-gray-50 border transition-all",
                            snapshot.isDragging
                              ? "shadow-2xl scale-105 border-blue-500 z-50"
                              : "border-gray-100 hover:shadow-xl hover:border-gray-300"
                          )}
                          onMouseEnter={() => setHoveredImage(idx)}
                          onMouseLeave={() => setHoveredImage(null)}
                        >
                          {/* Image */}
                          <div className="relative w-full h-full">
                            <Image
                              src={img}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 50vw, 25vw"
                            />
                          </div>

                          {/* Primary Badge */}
                          {idx === 0 && (
                            <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg">
                              <Star className="w-3 h-3 fill-current" />
                              Ana
                            </div>
                          )}

                          {/* Actions Overlay */}
                          <div
                            className={cn(
                              "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 flex items-center justify-center gap-2",
                              hoveredImage === idx ? "opacity-100" : "opacity-0"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => makePrimary(idx)}
                              className={cn(
                                "p-3 bg-white/20 backdrop-blur-md rounded-xl text-white transition-all",
                                idx !== 0 && "hover:bg-blue-600 hover:scale-110"
                              )}
                              disabled={idx === 0}
                              title="Ana görsel yap"
                            >
                              <Star className="w-5 h-5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setPreviewImage(img)}
                              className="p-3 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-gray-700 hover:scale-110 transition-all"
                              title="Yakınlaştır"
                            >
                              <Zoom className="w-5 h-5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="p-3 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-rose-600 hover:scale-110 transition-all"
                              title="Sil"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Alt Text Input */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                            <input
                              type="text"
                              value={imageAlts[img] || ''}
                              onChange={(e) => onAltChange(img, e.target.value)}
                              placeholder="Alt metin girin..."
                              className="w-full px-3 py-2 bg-white/95 rounded-lg text-sm font-medium placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              maxLength={125}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] text-white/70 font-medium">
                                SEO alt metni
                              </span>
                              {(imageAlts[img] || '').length > 0 && (
                                <span className={cn(
                                  "text-[9px] font-medium",
                                  (imageAlts[img] || '').length > 100 ? "text-amber-300" : "text-emerald-300"
                                )}>
                                  {(imageAlts[img] || '').length}/125
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl w-full">
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src={previewImage}
                alt="Görsel önizleme"
                fill
                className="object-contain bg-black"
                sizes="100vw"
              />
            </div>

            {/* Close Button */}
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 p-3 bg-white/10 backdrop-blur-md rounded-xl text-white hover:bg-white/20 transition-all"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Alt Text Display */}
            {imageAlts[previewImage] && (
              <div className="absolute -bottom-12 left-0 right-0 text-center">
                <p className="text-sm text-white/80 font-medium">
                  {imageAlts[previewImage]}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
