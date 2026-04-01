"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  MapPin,
  Phone,
  Clock,
  Send,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
const FAQ_ITEMS = [
  {
    id: "1",
    question: "Ürünlerinizde Hangi Kalite Malzeme Kullanılıyor?",
    answer:
      "Tüm ürünlerimizde üst kalite gerçek deriler ve kaliteli mumlu iplikler kullanılmaktadır.",
  },
  {
    id: "2",
    question: "Siparişleri Hangi Kargo Firması İle Gönderiyorsunuz?",
    answer:
      "Türkiye içine tüm siparişleri Aras Kargo ile gönderiyoruz.",
  },
  {
    id: "3",
    question: "Ne Kadar Sürede Kargolanıyor?",
    answer:
      "Siparişiniz ödeme onaylandıktan sonra genellikle 1-3 iş günü içinde kargoya verilmektedir. Bu süre, sipariş verilen ürünlerin adedine ve el yapımı üretim süreçlerine göre değişiklik gösterebilir.",
  },
  {
    id: "4",
    question: "Hangi Ödeme Yöntemlerini Kullanabilirim?",
    answer:
      "Ödeme seçeneğini ödeme adımında seçersiniz. İki farklı ödeme seçeneğiniz bulunuyor:\n1. Kredi kartı veya banka kartı ile ödemenizi güvenli bir şekilde gerçekleştirebilirsiniz. Tüm finansal verileriniz güvence altındadır.\n2. Havale/EFT işlemlerinde ise siparişinizi tamamladıktan sonra, size iletilen IBAN numarasına toplam tutarı havale etmeniz yeterlidir. Ödeme onaylandığında siparişiniz işleme alınır.",
  },
  {
    id: "5",
    question: "Özel Tasarım Ürün Yapıyor Musunuz?",
    answer:
      "Maalesef. Kurumsal ve toplu siparişler haricinde özel tasarım hizmeti veremiyoruz. Ürün model şablonunun hazırlanması, numunelerin üretimi ve test edilmesi gibi aşamalar uzun bir süreç gerektiriyor.",
  },
];

export default function IletisimPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({ name: "", email: "", subject: "", message: "" });
    }, 3000);
  };

  const contactCards = [
    {
      icon: Phone,
      label: "Telefon",
      value: "+90 (507) 559-7228",
      href: "tel:+905075597228",
    },
    {
      icon: Mail,
      label: "E-posta",
      value: "bilgi@derycraft.com",
      href: "mailto:bilgi@derycraft.com",
    },
    {
      icon: MapPin,
      label: "Adres",
      value: "Fatih Cd. No:29/A Bulancak/Giresun",
      href: "https://www.google.com/maps/search/?api=1&query=Fatih+Cd.+No:29%2FA+Bulancak%2FGiresun",
      external: true,
    },
  ];

  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* ── Hero ── */}
      <section className="pt-20 pb-12 sm:pt-28 sm:pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs text-neutral-400 uppercase tracking-[0.2em] mb-6"
          >
            İletişim
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-medium text-neutral-900 mb-6 tracking-tight"
          >
            Bize Ulaşın
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-neutral-500 leading-relaxed max-w-2xl mx-auto"
          >
            Sorularınız, önerileriniz veya özel sipariş talepleriniz için buradayız.
            En kısa sürede dönüş yapacağız.
          </motion.p>
        </div>
      </section>

      {/* ── Contact Cards ── */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {contactCards.map((card, index) => (
              <motion.a
                key={card.label}
                href={card.href}
                target={card.external ? "_blank" : undefined}
                rel={card.external ? "noopener noreferrer" : undefined}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="group block bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 transition-all hover:shadow-md hover:-translate-y-1"
              >
                <div className="w-10 h-10 mb-5 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                  <card.icon className="w-5 h-5 stroke-[1.5]" />
                </div>
                <p className="text-sm text-neutral-400 mb-1">{card.label}</p>
                <p className="text-base font-medium text-neutral-900 group-hover:text-neutral-700 transition-colors">
                  {card.value}
                </p>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form + Working Hours ── */}
      <section className="pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="lg:col-span-3 bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10"
            >
              <h2 className="text-xl sm:text-2xl font-medium text-neutral-900 mb-2">
                Mesaj Gönderin
              </h2>
              <p className="text-neutral-500 mb-8">
                Formu doldurun, size en kısa sürede dönüş yapalım.
              </p>

              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-neutral-100 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-neutral-900 stroke-[1.5]" />
                  </div>
                  <h3 className="text-xl font-medium text-neutral-900 mb-2">
                    Mesajınız Alındı
                  </h3>
                  <p className="text-neutral-500">
                    En kısa sürede size dönüş yapacağız.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-neutral-900 mb-2">
                        Adınız
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full px-4 py-3 bg-[#F8F8F8] border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
                        placeholder="Ahmet Yılmaz"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-900 mb-2">
                        E-posta
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="w-full px-4 py-3 bg-[#F8F8F8] border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
                        placeholder="ahmet@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-900 mb-2">
                      Konu
                    </label>
                    <select
                      required
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-[#F8F8F8] border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Konu seçin</option>
                      <option value="siparis">Sipariş Durumu</option>
                      <option value="iade">İade / Değişim</option>
                      <option value="urun">Ürün Bilgisi</option>
                      <option value="toptan">Toptan / Kurumsal</option>
                      <option value="diger">Diğer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-900 mb-2">
                      Mesajınız
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-[#F8F8F8] border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all resize-none"
                      placeholder="Mesajınızı buraya yazın..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-neutral-900 text-white font-medium rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Gönder</span>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </motion.div>

            {/* Side Panel */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-2 space-y-6"
            >
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                    <Clock className="w-5 h-5 stroke-[1.5]" />
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900">
                    Çalışma Saatleri
                  </h3>
                </div>
                <div className="space-y-3 text-neutral-600">
                  <div className="flex justify-between">
                    <span>Pazartesi - Cuma</span>
                    <span className="font-medium text-neutral-900">09:00 - 18:00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cumartesi</span>
                    <span className="font-medium text-neutral-900">10:00 - 14:00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pazar</span>
                    <span className="font-medium text-neutral-900">Kapalı</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8">
                <h3 className="text-lg font-medium text-neutral-900 mb-3">
                  Hızlı Destek
                </h3>
                <p className="text-neutral-500 mb-5">
                  Acil bir konunuz mu var? Doğrudan telefon veya WhatsApp üzerinden bize ulaşabilirsiniz.
                </p>
                <a
                  href="tel:+905075597228"
                  className="inline-flex items-center justify-center gap-2 w-full py-3 border border-neutral-200 rounded-xl text-neutral-900 font-medium hover:bg-neutral-50 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Hemen Ara
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-3">
              Sıkça Sorulan Sorular
            </h2>
            <p className="text-neutral-500">
              Aklınıza takılanları önceden yanıtladık.
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3 }}
                className="bg-white border border-neutral-200 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() =>
                    setOpenFaqId(openFaqId === item.id ? null : item.id)
                  }
                  className="w-full px-5 py-5 flex items-center justify-between text-left"
                >
                  <span className="pr-4 font-medium text-neutral-900">
                    {item.question}
                  </span>
                  <motion.div
                    animate={{ rotate: openFaqId === item.id ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-900"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openFaqId === item.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-0 border-t border-neutral-100">
                        <p className="pt-4 text-neutral-600 leading-relaxed">
                          {item.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
