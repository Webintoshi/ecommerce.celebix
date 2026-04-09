"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, HelpCircle, MessageCircle, Mail, ArrowRight } from "lucide-react";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: "1",
    question: "Ürünleriniz katkı maddesi içeriyor mu?",
    answer:
      "Hayır, ürünlerimiz %100 doğal ve katkısız. Hiçbir koruyucu, yapay tatlandırıcı veya katkı maddesi kullanmıyoruz.",
    category: "Ürünler",
  },
  {
    id: "2",
    question: "Kargo ücreti ne kadar?",
    answer:
      "Standart kargo 29.90 TL, hızlı kargo 49.90 TL'dir. 500 TL ve üzeri siparişlerde kargo ücretsizdir.",
    category: "Kargo",
  },
  {
    id: "3",
    question: "Siparişim ne zaman kargoya verilir?",
    answer:
      "Siparişiniz onaylandıktan sonra aynı gün veya en geç 1 iş günü içinde kargoya verilir.",
    category: "Kargo",
  },
  {
    id: "4",
    question: "İade koşulları nelerdir?",
    answer:
      "Ürün teslim tarihinden itibaren 14 gün içinde, ambalajı açılmamış ve kullanılmamış ürünleri iade edebilirsiniz. Gıda ürünleri olduğu için hijyen kuralları gereği açılmış ürünler iade edilemez.",
    category: "İade",
  },
  {
    id: "5",
    question: "Ürünlerinizin son kullanma tarihi ne kadar?",
    answer:
      "Ürünlerimizin son kullanma tarihi üretim tarihinden itibaren 12 aydır. Her ürünün üzerinde son kullanma tarihi belirtilmiştir.",
    category: "Ürünler",
  },
  {
    id: "6",
    question: "Ürünleriniz vegan mı?",
    answer:
      "Çoğu ürünümüz vegan'dır. Sütlü fındık kreması hariç tüm ürünlerimiz vegan ve bitkisel kaynaklıdır.",
    category: "Ürünler",
  },
  {
    id: "7",
    question: "Glutensiz ürünleriniz var mı?",
    answer:
      "Evet, tüm fıstık ezmeleri, fındık ezmeleri ve kuruyemişlerimiz glutensizdir.",
    category: "Ürünler",
  },
  {
    id: "8",
    question: "Ödeme yöntemleri nelerdir?",
    answer:
      "Kredi kartı, havale/EFT ve kapıda ödeme seçeneklerimiz bulunmaktadır. Tüm ödemeler güvenli altyapı ile yapılır.",
    category: "Ödeme",
  },
  {
    id: "9",
    question: "Toplu alımlarda indirim var mı?",
    answer:
      "Evet, toplu alımlarda özel indirimler sunuyoruz. Detaylı bilgi için müşteri hizmetlerimizle iletişime geçebilirsiniz.",
    category: "Ödeme",
  },
  {
    id: "10",
    question: "Ürünlerinizi nasıl saklamalıyım?",
    answer:
      "Ürünlerimizi serin ve kuru bir yerde, direkt güneş ışığından uzak tutmanızı öneririz. Açıldıktan sonra buzdolabında saklanabilir.",
    category: "Ürünler",
  },
  {
    id: "11",
    question: "Kargo takip numaramı nasıl öğrenebilirim?",
    answer:
      "Siparişiniz kargoya verildikten sonra, size e-posta ve SMS ile kargo takip numarası gönderilir.",
    category: "Kargo",
  },
  {
    id: "12",
    question: "Fatura kesiliyor mu?",
    answer:
      "Evet, tüm siparişlerimize e-fatura kesilir. Faturanız e-posta adresinize gönderilir.",
    category: "Ödeme",
  },
];

const CATEGORIES = ["Tümü", "Ürünler", "Kargo", "İade", "Ödeme"];

export default function FAQPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Tümü");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFAQs = FAQ_ITEMS.filter((item) => {
    const matchesCategory =
      selectedCategory === "Tümü" || item.category === selectedCategory;
    const matchesSearch =
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#FFF5F5]">
      {/* Minimal Hero Section */}
      <section className="pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#7B1113]/10 mb-6"
            >
              <HelpCircle className="w-8 h-8 text-[#7B1113]" />
            </motion.div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#7B1113] mb-4 tracking-tight">
              Sıkça Sorulan Sorular
            </h1>
            <p className="text-lg md:text-xl text-[#6b4b4c] max-w-xl mx-auto">
              Merak ettiğiniz her şey için hazırladığımız kapsamlı rehber
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-20 md:pb-32">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Search Bar - Premium Style */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-10"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-[#7B1113]/5 rounded-2xl transform group-focus-within:scale-[1.02] transition-transform" />
                <div className="relative flex items-center bg-white rounded-2xl shadow-sm border border-[#7B1113]/10 group-focus-within:ring-2 group-focus-within:ring-[#7B1113]/20 group-focus-within:border-transparent transition-all">
                  <Search className="ml-5 w-5 h-5 text-[#7B1113]/50" />
                  <input
                    type="text"
                    placeholder="Soru ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-4 bg-transparent text-[#7B1113] placeholder:text-[#7B1113]/40 focus:outline-none text-base"
                  />
                </div>
              </div>
            </motion.div>

            {/* Category Pills - Minimalist */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex flex-wrap justify-center gap-2 mb-12"
            >
              {CATEGORIES.map((category, index) => (
                <motion.button
                  key={category}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedCategory === category
                      ? "bg-[#7B1113] text-white shadow-lg shadow-[#7B1113]/25"
                      : "bg-white text-[#6b4b4c] border border-[#7B1113]/10 hover:border-[#7B1113]/30 hover:bg-[#7B1113]/5"
                  }`}
                >
                  {category}
                </motion.button>
              ))}
            </motion.div>

            {/* FAQ Items - Premium Accordion */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-3"
            >
              <AnimatePresence mode="wait">
                {filteredFAQs.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="text-center py-16"
                  >
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#F3E0E1] flex items-center justify-center">
                      <Search className="w-8 h-8 text-[#7B1113]/50" />
                    </div>
                    <p className="text-[#6b4b4c] text-lg mb-2">Sonuç bulunamadı</p>
                    <p className="text-[#6b4b4c]/70">
                      Farklı bir arama yapın veya kategori seçin
                    </p>
                  </motion.div>
                ) : (
                  filteredFAQs.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white rounded-2xl border border-[#7B1113]/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                      <button
                        onClick={() => setOpenId(openId === item.id ? null : item.id)}
                        className="w-full px-6 py-5 flex items-center justify-between text-left group"
                      >
                        <div className="flex-1 pr-4">
                          <span className="inline-block px-2.5 py-1 bg-[#F3E0E1] text-[#7B1113] text-xs font-medium rounded-md mb-2">
                            {item.category}
                          </span>
                          <h3 className="font-semibold text-[#7B1113] text-lg group-hover:text-[#7B1113]/80 transition-colors">
                            {item.question}
                          </h3>
                        </div>
                        <motion.div
                          animate={{ rotate: openId === item.id ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                            openId === item.id
                              ? "bg-[#7B1113] text-white"
                              : "bg-[#F3E0E1] text-[#7B1113] group-hover:bg-[#7B1113]/10"
                          }`}
                        >
                          <ChevronDown className="w-5 h-5" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {openId === item.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-5 pt-2 border-t border-[#7B1113]/5">
                              <p className="text-[#6b4b4c] leading-relaxed">
                                {item.answer}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </motion.div>

            {/* Still Need Help Section */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="mt-16"
            >
              <div className="relative overflow-hidden rounded-3xl bg-[#7B1113] p-8 md:p-12">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#F3E0E1]/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#F3E0E1]/5 rounded-full blur-2xl transform -translate-x-1/2 translate-y-1/2" />

                <div className="relative z-10 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white/10 mb-6">
                    <MessageCircle className="w-7 h-7 text-white" />
                  </div>
                  
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    Hala sorunuz mu var?
                  </h2>
                  <p className="text-white/80 mb-8 max-w-md mx-auto">
                    Size yardımcı olmaktan mutluluk duyarız. Bize ulaşın, en kısa sürede yanıtlayalım.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a
                      href="/iletisim"
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#7B1113] rounded-full font-semibold hover:bg-[#F3E0E1] transition-colors shadow-lg"
                    >
                      İletişime Geç
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <a
                      href="mailto:ornek-magazashopify@proton.me"
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 text-white border border-white/20 rounded-full font-semibold hover:bg-white/20 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      E-posta Gönder
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
