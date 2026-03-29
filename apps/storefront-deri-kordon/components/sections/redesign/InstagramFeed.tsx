"use client";

import { motion } from "framer-motion";
import { Instagram, Heart } from "lucide-react";

export function InstagramFeed() {
  return (
    <section className="py-16 lg:py-24 bg-[#F8F8F8]">
      <div className="container-premium">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 lg:mb-12"
        >
          <a
            href="https://instagram.com/derikordon"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#8A6B37] font-medium hover:underline mb-4"
          >
            <Instagram className="w-5 h-5" />
            @derikordon
          </a>
          <h2 className="font-serif text-3xl md:text-4xl font-semibold text-[#0F1626]">
            Bizi Instagram&apos;da Takip Edin
          </h2>
        </motion.div>

        {/* Instagram Grid - Placeholder Icons */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.1 },
            },
          }}
          className="grid grid-cols-2 md:grid-cols-5 gap-3 lg:gap-4"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.a
              key={i}
              href="https://instagram.com/derikordon"
              target="_blank"
              rel="noopener noreferrer"
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                visible: { opacity: 1, scale: 1 },
              }}
              className="group relative aspect-square bg-[#0F1626] rounded-xl lg:rounded-2xl overflow-hidden flex items-center justify-center"
            >
              {/* Icon */}
              <Instagram className="w-10 h-10 text-[#8A6B37]/50 group-hover:text-[#8A6B37] transition-colors" />
              
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-[#0F1626]/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="text-white text-center">
                  <Heart className="w-6 h-6 mx-auto mb-1 text-[#8A6B37]" />
                  <span className="text-sm font-medium">{100 + i * 50} beğeni</span>
                </div>
              </div>
            </motion.a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
