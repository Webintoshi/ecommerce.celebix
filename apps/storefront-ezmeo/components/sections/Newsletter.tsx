"use client";

import { useState } from "react";
import { Mail, Sparkles, CheckCircle, Gift, Bell } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) return;
    
    setLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setLoading(false);
    setSubscribed(true);
    setEmail("");
    toast.success("Bültenimize başarıyla abone oldunuz! %10 indirim kodunuz e-postanıza gönderildi.");
  };

  const benefits = [
    { icon: Gift, text: "İlk siparişe %10 indirim" },
    { icon: Bell, text: "Yeni ürünlerden ilk haberdar ol" },
    { icon: Sparkles, text: "Özel kampanya ve fırsatlar" },
  ];

  return (
    <section className="relative bg-stone-50 border-y border-stone-100">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%237B1113' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 relative z-10">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Özel Fırsatlar
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              İlk Siparişine %10 İndirim Kazan
            </h2>
            
            <p className="text-gray-600 mb-6 text-sm md:text-base leading-relaxed">
              E-bültenimize abone olarak yeni ürünlerden ilk haberdar ol, 
              özel kampanyaları kaçırma!
            </p>

            {/* Benefits */}
            <div className="space-y-3">
              {benefits.map((benefit, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm text-gray-700">{benefit.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-stone-100"
          >
            {subscribed ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Hoş Geldin!</h3>
                <p className="text-gray-600 text-sm">
                  Bültenimize başarıyla abone oldun. İndirim kodun e-postana gönderildi.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Hemen Abone Ol</h3>
                    <p className="text-xs text-gray-500">Spam yok, istediğin zaman çık</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="E-posta adresin"
                      required
                      className="w-full px-4 py-3.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Abone Ol & İndirim Kazan</span>
                      </>
                    )}
                  </button>
                </form>

                <p className="text-[11px] text-gray-400 text-center mt-4">
                  Abone olarak gizlilik politikamızı kabul etmiş olursunuz.
                </p>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
