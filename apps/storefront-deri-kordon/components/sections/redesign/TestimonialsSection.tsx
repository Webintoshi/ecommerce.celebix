"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";

const testimonials = [
  {
    id: 1,
    name: "Ahmet Yılmaz",
    title: "Mimar",
    content: "Apple Watch&apos;ıma aldığım deri kayış gerçekten muhteşem. Zamanla rengi daha da güzelleşti ve tam bir karakter kazandı. El işçiliği tartışılmaz.",
    rating: 5,
    location: "İstanbul",
  },
  {
    id: 2,
    name: "Zeynep Kaya",
    title: "İşletme Sahibi",
    content: "Eşime hediye olarak aldığım monogramlı kordon çok beğenildi. Kişiselleştirme hizmeti ve paketleme harikaydı. Kesinlikle tavsiye ederim.",
    rating: 5,
    location: "Ankara",
  },
  {
    id: 3,
    name: "Mehmet Demir",
    title: "Grafik Tasarımcı",
    content: "3 yıldır kullanıyorum, ilk günkü gibi sağlam. Deri kalitesi ve dikiş işçiliği gerçekten premium. Artık başka marka kullanmıyorum.",
    rating: 5,
    location: "İzmir",
  },
];

export function TestimonialsSection() {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  return (
    <section className="py-24 lg:py-32 bg-[#FAFAFA]">
      <div className="container-premium">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6">
            <span className="w-8 h-px bg-[#8A6B37]" />
            Müşteri Yorumları
            <span className="w-8 h-px bg-[#8A6B37]" />
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-[#0F1626]">
            Hikayelerimiz
          </h2>
        </motion.div>

        {/* Testimonial Slider */}
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Quote Icon */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-16 bg-[#8A6B37] flex items-center justify-center">
              <Quote className="w-8 h-8 text-white" />
            </div>

            {/* Content */}
            <div className="bg-white border border-[#E5E2DE] pt-16 pb-12 px-8 md:px-16">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="text-center"
                >
                  {/* Rating */}
                  <div className="flex justify-center gap-1 mb-8">
                    {[...Array(testimonials[current].rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-[#8A6B37] text-[#8A6B37]" />
                    ))}
                  </div>

                  {/* Quote */}
                  <blockquote className="font-serif text-xl md:text-2xl lg:text-3xl text-[#0F1626] leading-relaxed mb-10">
                    &ldquo;{testimonials[current].content}&rdquo;
                  </blockquote>

                  {/* Author */}
                  <div>
                    <p className="font-medium text-[#0F1626] text-lg">{testimonials[current].name}</p>
                    <p className="text-[#8A6B37] text-sm">{testimonials[current].title}</p>
                    <p className="text-[#0F1626]/40 text-sm mt-1">{testimonials[current].location}</p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex items-center justify-center gap-4 mt-10">
                <button
                  onClick={prev}
                  className="w-12 h-12 border border-[#E5E2DE] flex items-center justify-center text-[#0F1626] hover:bg-[#0F1626] hover:text-white hover:border-[#0F1626] transition-all"
                  aria-label="Önceki"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex gap-2">
                  {testimonials.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrent(idx)}
                      className={`h-2 transition-all duration-300 ${
                        idx === current ? "w-8 bg-[#8A6B37]" : "w-2 bg-[#E5E2DE]"
                      }`}
                      aria-label={`Yorum ${idx + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={next}
                  className="w-12 h-12 border border-[#E5E2DE] flex items-center justify-center text-[#0F1626] hover:bg-[#0F1626] hover:text-white hover:border-[#0F1626] transition-all"
                  aria-label="Sonraki"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
