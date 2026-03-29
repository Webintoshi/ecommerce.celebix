"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MapPin, Phone, Clock, Send, CheckCircle, Instagram, MessageCircle } from "lucide-react";
import Link from "next/link";

export default function IletisimPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({ name: "", email: "", subject: "", message: "" });
    }, 3000);
  };

  const contactInfo = [
    {
      icon: MapPin,
      title: "Atölye",
      content: "Akyazı Mahallesi 873. Sokak No:2 Daire:4\nAltınordu / Ordu, Türkiye",
    },
    {
      icon: Mail,
      title: "E-posta",
      content: "destek@derikordon.com",
      href: "mailto:destek@derikordon.com",
    },
    {
      icon: Phone,
      title: "Telefon",
      content: "+90 555 123 4567",
      href: "tel:+905551234567",
    },
    {
      icon: Clock,
      title: "Çalışma Saatleri",
      content: "Pazartesi - Cuma: 09:00 - 18:00\nCumartesi: 10:00 - 14:00",
    },
  ];

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Hero Section */}
      <section className="relative py-24 lg:py-32 bg-[#0F1626] overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="container-premium relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6"
            >
              <span className="w-8 h-px bg-[#8A6B37]" />
              İletişim
              <span className="w-8 h-px bg-[#8A6B37]" />
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-serif text-4xl md:text-5xl lg:text-6xl text-white mb-6"
            >
              Bize Ulaşın
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/60 text-lg max-w-2xl mx-auto"
            >
              Sorularınız, önerileriniz veya özel sipariş talepleriniz için bizimle iletişime geçin. 
              Size en kısa sürede dönüş yapacağız.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24 lg:py-32">
        <div className="container-premium">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            {/* Contact Info */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-serif text-3xl text-[#0F1626] mb-8">
                İletişim Bilgileri
              </h2>
              
              <div className="space-y-8">
                {contactInfo.map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="flex gap-4"
                  >
                    <div className="w-14 h-14 rounded-xl bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-6 h-6 text-[#8A6B37]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-[#0F1626] mb-1">{item.title}</h3>
                      {item.href ? (
                        <a 
                          href={item.href}
                          className="text-[#0F1626]/60 hover:text-[#8A6B37] transition-colors whitespace-pre-line"
                        >
                          {item.content}
                        </a>
                      ) : (
                        <p className="text-[#0F1626]/60 whitespace-pre-line">
                          {item.content}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Social Links */}
              <div className="mt-12 pt-8 border-t border-[#E5E2DE]">
                <h3 className="font-medium text-[#0F1626] mb-4">Sosyal Medya</h3>
                <div className="flex gap-3">
                  <a
                    href="https://instagram.com/derikordon"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-xl bg-[#0F1626] flex items-center justify-center text-white hover:bg-[#8A6B37] transition-colors"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                  <a
                    href="https://wa.me/905551234567"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-xl bg-[#0F1626] flex items-center justify-center text-white hover:bg-[#8A6B37] transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-white p-8 lg:p-12 border border-[#E5E2DE]"
            >
              <h2 className="font-serif text-2xl text-[#0F1626] mb-2">
                Mesaj Gönderin
              </h2>
              <p className="text-[#0F1626]/60 mb-8">
                Formu doldurun, size en kısa sürede dönüş yapalım.
              </p>

              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#8A6B37]/10 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-[#8A6B37]" />
                  </div>
                  <h3 className="font-serif text-2xl text-[#0F1626] mb-2">
                    Mesajınız Alındı!
                  </h3>
                  <p className="text-[#0F1626]/60">
                    En kısa sürede size dönüş yapacağız.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-[#0F1626] mb-2">
                        Adınız
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#E5E2DE] text-[#0F1626] placeholder:text-[#0F1626]/40 focus:outline-none focus:border-[#8A6B37] transition-colors"
                        placeholder="Ahmet Yılmaz"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F1626] mb-2">
                        E-posta
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#E5E2DE] text-[#0F1626] placeholder:text-[#0F1626]/40 focus:outline-none focus:border-[#8A6B37] transition-colors"
                        placeholder="ahmet@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#0F1626] mb-2">
                      Konu
                    </label>
                    <select
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#E5E2DE] text-[#0F1626] focus:outline-none focus:border-[#8A6B37] transition-colors appearance-none cursor-pointer"
                    >
                      <option value="">Konu seçin</option>
                      <option value="siparis">Sipariş Durumu</option>
                      <option value="iade">İade / Değişim</option>
                      <option value="urun">Ürün Bilgisi</option>
                      <option value="toptan">Toptan Satış</option>
                      <option value="diger">Diğer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#0F1626] mb-2">
                      Mesajınız
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#E5E2DE] text-[#0F1626] placeholder:text-[#0F1626]/40 focus:outline-none focus:border-[#8A6B37] transition-colors resize-none"
                      placeholder="Mesajınızı buraya yazın..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-[#8A6B37] text-white font-medium tracking-wider uppercase hover:bg-[#0F1626] transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Gönder</span>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="py-24 lg:py-32 bg-[#0F1626]">
        <div className="container-premium">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl text-white mb-4">
              Atölyemizi Ziyaret Edin
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Üretim sürecimizi yakından görmek ve ürünlerimizi yerinde incelemek için atölyemize bekleriz.
            </p>
          </div>
          
          {/* Map Placeholder */}
          <div className="aspect-[21/9] bg-[#1A2332] border border-[#8A6B37]/20 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-[#8A6B37] mx-auto mb-4" />
              <p className="text-white/40 text-sm">Harita entegrasyonu için API anahtarı gerekli</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
