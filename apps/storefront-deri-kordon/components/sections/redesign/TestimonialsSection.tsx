"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    id: 1,
    name: "CANER T.",
    verified: true,
    rating: 5,
    content: "Kesinlikle tavsiye ediyorum. Tütün kesesi aldım harika kalite.",
    productName: "Deri Tütün Kesesi",
    productPrice: "2.458,00TL",
    productImage: "/images/placeholders/T.1.jpg",
    productThumb: "/images/placeholders/T.1-thumb.jpg",
  },
  {
    id: 2,
    name: "ASLI B.",
    verified: true,
    rating: 5,
    content: "Şahane işçilik ile mükemmel ürün çıkmış kullandıkça güzelleşiyor.",
    productName: "Deri Telefon Çantası (Nova)",
    productPrice: "2.458,00TL",
    productImage: "/images/placeholders/T.2.jpg",
    productThumb: "/images/placeholders/T.2-thumb.jpg",
  },
];

export function TestimonialsSection() {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 2;
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
    <section className="py-16 lg:py-20 bg-neutral-50">
      <div className="container-premium">
        {/* Section Header */}
        <div className="text-center mb-10">
          <h2 className="text-2xl lg:text-3xl font-medium text-neutral-900 mb-2">
            Müşteri Yorumları
          </h2>
          <p className="text-neutral-500 text-sm">
            1581 değerlendirmeden
          </p>
        </div>

        {/* Testimonials Grid - Horizontal Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {currentTestimonials.map((review) => (
            <div
              key={review.id}
              className="bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow flex"
            >
              {/* Left: Large Product Image */}
              <div className="relative w-32 sm:w-40 lg:w-48 flex-shrink-0 bg-neutral-100">
                <Image
                  src={review.productImage}
                  alt={review.productName}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 128px, (max-width: 1024px) 160px, 192px"
                />
              </div>

              {/* Right: Content */}
              <div className="flex-1 p-4 sm:p-5 flex flex-col">
                {/* Stars */}
                <div className="flex items-center gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "w-3.5 h-3.5",
                        i < review.rating
                          ? "fill-[#8A6B37] text-[#8A6B37]"
                          : "fill-neutral-200 text-neutral-200"
                      )}
                    />
                  ))}
                </div>

                {/* Name with Verified Badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-neutral-900 uppercase">
                    {review.name}
                  </span>
                  {review.verified && (
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                      <Check className="w-3 h-3" />
                      Doğrulanmış Alıcı
                    </span>
                  )}
                </div>

                {/* Review Content */}
                <p className="text-sm text-neutral-600 leading-relaxed flex-1">
                  {review.content}
                </p>

                {/* Divider */}
                <div className="border-t border-neutral-100 my-4" />

                {/* Product Info */}
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded bg-neutral-100 overflow-hidden flex-shrink-0">
                    <Image
                      src={review.productThumb}
                      alt={review.productName}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {review.productName}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {review.productPrice}
                    </p>
                  </div>
                </div>
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
