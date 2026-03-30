"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    id: 1,
    name: "Mehmet Oğuz Canan",
    verified: true,
    rating: 5,
    title: "Seiko sportura için çift kat deri",
    content: "Seikom için özel ölçü ve dikişte tam istediğim gibi geldi. Kişiye özel el işçiliği ve kaliteli deri. Çok memnun kaldım.",
    productName: "Çift Katlı Deri Saat Kayışı - Siyah",
    productImage: "/hero-banner-fistik-ezmeleri.jpg",
    date: "03/24/2026",
  },
  {
    id: 2,
    name: "Mehmet TAKIM",
    verified: true,
    rating: 5,
    title: "Çok güzel",
    content: "Sipariş verirken tereddüt etmiştim, ilk geldiğinde üst katmanı çok parlak geldi bana. Kullanmaya başlayınca çok sevdim. Güzel ve farklı bir tasarım...",
    productName: "Matrix Fosforlu - Tek Kat Deri Apple Watch Kordon - Siyah",
    productImage: "/hero-banner-super-gidalar-mobile.jpg",
    date: "03/18/2026",
  },
  {
    id: 3,
    name: "Mehmet TAKIM",
    verified: true,
    rating: 5,
    title: "Çok Beğendim",
    content: "Ürün beklentilerimi karşıladı. Özenilerek üretildiğini hissediyorsunuz. Kişiselleştirme imkanı çok hoş. Süreçten memnun kaldım.",
    productName: "MacBook Organizer - Deri Kılıf",
    productImage: "/Findik_Ezmeleri_Kategorisi.webp",
    date: "03/18/2026",
  },
  {
    id: 4,
    name: "Tuğba kayabaşı",
    verified: true,
    rating: 5,
    title: "Güzel fakat lazer yazı çok beklediğim gibi değil",
    content: "Güzel ürün. Genel olarak memnun kaldım. Deri kalitesi güzel, işçilik iyi. Tavsiye ederim.",
    productName: "A6 Defter Kılıfı - Deri Organizer",
    productImage: "/fistik_ezmesi_kategori_gorsel.webp",
    date: "03/18/2026",
  },
];

export function TestimonialsSection() {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 4;
  const totalPages = Math.ceil(testimonials.length / itemsPerPage);
  
  const currentTestimonials = testimonials.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  const nextPage = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const prevPage = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  return (
    <section className="py-20 lg:py-28 bg-neutral-50">
      <div className="container-premium">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-3xl lg:text-4xl font-serif font-medium text-neutral-900 mb-2">
            Güncel Yorumlar
          </h2>
          <p className="text-neutral-500">
            1581 değerlendirmeden
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {currentTestimonials.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Product Image */}
              <div className="relative aspect-square bg-neutral-100">
                <Image
                  src={review.productImage}
                  alt={review.productName}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              </div>

              {/* Content */}
              <div className="p-5">
                {/* Stars */}
                <div className="flex items-center justify-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "w-4 h-4",
                        i < review.rating
                          ? "fill-[#B39A73] text-[#B39A73]"
                          : "fill-neutral-200 text-neutral-200"
                      )}
                    />
                  ))}
                </div>

                {/* Name with Verified Badge */}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-sm font-medium text-neutral-400">
                    {review.name}
                  </span>
                  {review.verified && (
                    <span className="w-5 h-5 bg-[#B39A73]/20 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-[#B39A73]" />
                    </span>
                  )}
                </div>

                {/* Review Title */}
                <h3 className="text-center font-medium text-neutral-900 mb-2 line-clamp-1">
                  {review.title}
                </h3>

                {/* Review Content */}
                <p className="text-sm text-neutral-500 text-center line-clamp-3">
                  {review.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              onClick={prevPage}
              className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:border-neutral-400 transition-colors"
              aria-label="Önceki"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    i === currentPage ? "bg-neutral-900" : "bg-neutral-300"
                  )}
                  aria-label={`Sayfa ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={nextPage}
              className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:border-neutral-400 transition-colors"
              aria-label="Sonraki"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
