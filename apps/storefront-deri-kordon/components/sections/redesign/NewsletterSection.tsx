"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Check, Gift } from "lucide-react";

export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    setIsSubmitted(true);
    setEmail("");
  };

  return (
    <section className="py-16 lg:py-24 bg-[#8A6B37] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Decorative Circles */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full translate-x-1/3 translate-y-1/3" />

      <div className="container-premium relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {isSubmitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-8 lg:p-12 shadow-xl"
            >
              <div className="w-20 h-20 bg-[#8A6B37]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-[#8A6B37]" />
              </div>
              <h3 className="font-serif text-2xl lg:text-3xl font-semibold text-[#0F1626] mb-3">
                Hoş Geldiniz! 🎉
              </h3>
              <p className="text-[#0F1626]/70 mb-4">
                E-bültenimize abone olduğunuz için teşekkürler.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#8A6B37]/10 rounded-full">
                <Gift className="w-4 h-4 text-[#8A6B37]" />
                <span className="text-[#8A6B37] font-medium">%10 İndirim Kodu: HOSGELDIN10</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white text-sm font-medium mb-6"
              >
                <Gift className="w-4 h-4" />
                İlk Siparişe Özel %10 İndirim
              </motion.div>

              {/* Title */}
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-white mb-4">
                Özel Fırsatları Kaçırma
              </h2>

              {/* Description */}
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                E-bültenimize abone olarak yeni koleksiyonlardan haberdar ol 
                ve özel indirim fırsatlarını yakala.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <div className="relative flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-posta adresiniz"
                    required
                    className="w-full px-5 py-4 bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder:text-white/50 focus:outline-none focus:border-white focus:bg-white/20 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-4 bg-white text-[#8A6B37] font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-[#8A6B37] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Abone Ol
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Trust Note */}
              <p className="text-white/60 text-sm mt-6">
                Spam yok, istediğin zaman abonelikten çıkabilirsin.
              </p>

              {/* Social Proof */}
              <div className="flex items-center justify-center gap-4 mt-8">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-10 h-10 rounded-full bg-white/20 border-2 border-[#8A6B37] flex items-center justify-center text-white text-sm font-medium"
                    >
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <span className="text-white/80 text-sm">
                  <span className="text-white font-semibold">5.000+</span> kişi bize katıldı
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
