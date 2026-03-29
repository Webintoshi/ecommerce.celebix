"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setEmail("");
      }, 3000);
    }
  };

  return (
    <section className="py-24 lg:py-32 bg-[#0F1626] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Gold Lines */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#8A6B37]/30 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#8A6B37]/30 to-transparent" />

      <div className="container-premium relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6">
              <span className="w-8 h-px bg-[#8A6B37]" />
              Bülten
              <span className="w-8 h-px bg-[#8A6B37]" />
            </span>

            <h2 className="font-serif text-4xl md:text-5xl text-white mb-6">
              İlk Siz Öğrenin
            </h2>

            <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
              Yeni koleksiyonlar, özel indirimler ve deri bakım ipuçları için bültenimize katılın.
              Spam yok, sadece değerli içerikler.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
              <div className="flex-1 relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-posta adresiniz"
                  className="w-full px-6 py-4 bg-white/5 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-[#8A6B37] transition-colors"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitted}
                className="px-8 py-4 bg-[#8A6B37] text-white font-medium tracking-wider uppercase hover:bg-[#A67C3D] transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isSubmitted ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Kaydedildi</span>
                  </>
                ) : (
                  <>
                    <span>Katıl</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <p className="text-white/30 text-sm mt-6">
              Kaydolarak gizlilik politikasını kabul etmiş olursunuz.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
