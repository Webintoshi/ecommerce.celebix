"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ChevronLeft, ChevronRight, Check } from "lucide-react";

const testimonials = [
  {
    id: 1,
    name: "Mehmet TAKIM",
    title: "Çok Beğendim",
    content: "Ürün beklentilerimi karşıladı. Özenilerek üretildiğini hissediyorsunuz. Deri kalitesi muhteşem, tavsiye ederim.",
    rating: 5,
    verified: true,
  },
  {
    id: 2,
    name: "Tuğba Kayabaşı",
    title: "Güzel fakat lazer yazı...",
    content: "Güzel ürün, el işçiliği harika. Lazer yazı biraz daha belirgin olabilirdi ama genel olarak memnun kaldım.",
    rating: 4,
    verified: true,
  },
  {
    id: 3,
    name: "Övünç Kıray",
    title: "TEK KELİME YETERLİ...",
    content: "KALİTE. Deneme amaçlı deri anahtar düzenleyicisi almıştım, şimdi tüm koleksiyonu takip ediyorum.",
    rating: 5,
    verified: true,
  },
  {
    id: 4,
    name: "Emre Arslan",
    title: "teşekkürler",
    content: "çok kaliteli teşekkürler. İkinci alışverişim ve yine çok memnun kaldım. Kargo da çok hızlıydı.",
    rating: 5,
    verified: true,
  },
];

export function TestimonialsSection() {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 4;
  const totalPages = Math.ceil(testimonials.length / itemsPerPage);

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);

  const currentTestimonials = testimonials.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  return (
    <section className="py-16 lg:py-24 bg-[#F0F0F0]">
      <div className="container-premium">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="font-serif text-3xl md:text-4xl font-semibold text-[#0F1626] mb-2">
            Güncel Yorumlar
          </h2>
          <p className="text-[#0F1626]/60">
            1581 değerlendirmeden
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="relative">
          {/* Navigation Arrows */}
          <button
            onClick={prevPage}
            className="absolute -left-4 lg:-left-12 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-[#0F1626]/40 hover:text-[#0F1626] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextPage}
            className="absolute -right-4 lg:-right-12 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-[#0F1626]/40 hover:text-[#0F1626] transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Cards Grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {currentTestimonials.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Top Color Bar */}
                  <div className="h-1.5 bg-[#8A6B37]" />
                  
                  {/* Content */}
                  <div className="p-5">
                    {/* Stars */}
                    <div className="flex justify-center gap-1 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < testimonial.rating
                              ? "text-[#8A6B37] fill-[#8A6B37]"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>

                    {/* User Name with Verified Badge */}
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <span className="font-medium text-[#0F1626] text-sm">
                        {testimonial.name}
                      </span>
                      {testimonial.verified && (
                        <div className="w-4 h-4 rounded-full bg-[#8A6B37]/20 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-[#8A6B37]" />
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="font-semibold text-[#0F1626] text-center mb-2 text-sm truncate">
                      {testimonial.title}
                    </h4>

                    {/* Content */}
                    <p className="text-[#0F1626]/60 text-center text-sm line-clamp-3">
                      {testimonial.content}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {[...Array(totalPages)].map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPage(idx)}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentPage ? "w-6 bg-[#8A6B37]" : "bg-[#0F1626]/20"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
