"use client";

import { useState, useEffect } from "react";
import { getCustomers } from "@/lib/customers";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { Customer } from "@/types/customer";
import {
  MessageCircle,
  Send,
  Users,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Copy,
  X,
} from "lucide-react";
import Link from "next/link";

const WHATSAPP_TEMPLATES = [
  {
    id: 1,
    name: "Promo",
    content: `Merhaba {firstName}!\n\n${STORE_RUNTIME.name} magazasinda sizin icin ozel bir kampanya aktif. Hemen kontrol edin!`,
  },
  {
    id: 2,
    name: "Sipariş Bildirimi",
    content: "Siparişiniz hazırlanıyor 📦\n\nSipariş numarası: {orderNumber}",
  },
  {
    id: 3,
    name: "Teşekkür",
    content: "Siparişiniz için teşekkürler! 🙏\n\nBizi tercih ettiğiniz için minnettarız.",
  },
];

export default function WhatsAppMarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch =
      customer.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (customer.phone && customer.phone.includes(searchQuery));

    const matchesFilter = filter === "all" ||
      (filter === "phone" && customer.phone) ||
      (filter === "new" && customer.tags?.includes("Yeni")) ||
      (filter === "vip" && customer.tags?.includes("VIP"));

    return matchesSearch && matchesFilter;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(filteredCustomers.map(c => c.id));
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleSelectCustomer = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedCustomers(prev => [...prev, id]);
    } else {
      setSelectedCustomers(prev => prev.filter(cId => cId !== id));
    }
  };

  const handleSendWhatsApp = async () => {
    if (selectedCustomers.length === 0 || !messageTemplate) return;

    setSending(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setSending(false);
    setSelectedCustomers([]);
    setMessageTemplate("");
  };

  const generateWhatsAppLink = (phone: string, message: string) => {
    const formattedPhone = phone.replace(/\D/g, "");
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  };

  const getPreviewContent = () => {
    let content = messageTemplate;
    if (selectedCustomers.length === 1) {
      const customer = customers.find(c => c.id === selectedCustomers[0]);
      if (customer) {
        content = content
          .replace(/{firstName}/g, customer.firstName)
          .replace(/{lastName}/g, customer.lastName);
      }
    }
    return content;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/pazarlama"
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
            >
              <X className="w-4 h-4" />
              Geri
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">WhatsApp Pazarlama</h1>
              <p className="text-gray-500">Müşterilerinize WhatsApp üzerinden mesaj gönderin</p>
            </div>
          </div>
          <button
            onClick={() => setCustomers(getCustomers())}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all shadow-lg"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
            Yenile
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Customer List */}
          <div className="xl:col-span-2 space-y-6">
            {/* Toolbar */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                  <div className="flex-1 w-full relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Müşteri ara..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="appearance-none pl-12 pr-10 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 transition-all min-w-[200px] cursor-pointer"
                    >
                      <option value="all">Tümü</option>
                      <option value="phone">Telefon Sahibi</option>
                      <option value="new">Yeni Müşteriler</option>
                      <option value="vip">VIP Müşteriler</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Table */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-green-50 to-white border-b-2 border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-4 text-left">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase">
                        Müşteri
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase">
                        Telefon
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase">
                        İşlem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCustomers.map((customer) => (
                      <tr
                        key={customer.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          selectedCustomers.includes(customer.id) ? 'bg-green-50' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedCustomers.includes(customer.id)}
                            onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-bold text-gray-900 text-base">
                            {customer.firstName} {customer.lastName}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 font-mono">
                          {customer.phone || "-"}
                        </td>
                        <td className="px-4 py-4">
                          {customer.phone && (
                            <a
                              href={generateWhatsAppLink(customer.phone, getPreviewContent())}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold text-sm"
                            >
                              <MessageCircle className="w-4 h-4" />
                              WhatsApp'a Git
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredCustomers.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Users className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Müşteri Bulunamadı</h3>
                  <p className="text-gray-500">
                    Arama kriterlerinize uygun müşteri bulunamadı.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp Form */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Şablonlar
                </label>
                <div className="space-y-3">
                  {WHATSAPP_TEMPLATES.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => setMessageTemplate(template.content)}
                      className={`p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                        messageTemplate === template.content
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 mb-1">{template.name}</div>
                      <div className="text-sm text-gray-600 line-clamp-2">{template.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Mesaj
                </label>
                <textarea
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="WhatsApp mesajınızı buraya yazın... {firstName}, {lastName} değişkenlerini kullanabilirsiniz"
                  rows={8}
                  className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500 transition-all resize-none text-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewMode(!previewMode)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all font-semibold"
                  >
                    <Eye className="w-4 h-4" />
                    Önizle
                  </button>
                  <button
                    onClick={() => {
                      const content = getPreviewContent();
                      navigator.clipboard.writeText(content);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all font-semibold"
                  >
                    <Copy className="w-4 h-4" />
                    Kopyala
                  </button>
                </div>
                <button
                  onClick={handleSendWhatsApp}
                  disabled={selectedCustomers.length === 0 || sending}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl font-semibold hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      {selectedCustomers.length} Mesaj Gönder
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Preview */}
            {previewMode && (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Önizleme</h3>
                  <button
                    onClick={() => setPreviewMode(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                    {getPreviewContent()}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
