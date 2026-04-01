"use client";

import { useState, useEffect } from "react";
import { getCustomers } from "@/lib/customers";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { Customer } from "@/types/customer";
import {
  Mail,
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

const EMAIL_TEMPLATES = [
  {
    id: 1,
    name: "Hoşgeldin",
    subject: `${STORE_RUNTIME.name}'a Hoş Geldiniz!`,
    content: `Merhaba {firstName},\n\n${STORE_RUNTIME.name} ailesine hoş geldiniz! Yeni ürünlerimizi ve kampanyalarımızı keşfedebilirsiniz.\n\nSiparişiniz için teşekkürler.\n\nSaygılarımızla,\n${STORE_RUNTIME.name} Ekibi`,
  },
  {
    id: 2,
    name: "Özel Teklif",
    subject: "Sadece Sizin İçin Özel Teklif!",
    content: `Merhaba {firstName},\n\nSizin için bu hafta özel bir teklif hazırladık. Kampanya kodunu kullanarak alışverişinizi tamamlayabilirsiniz.\n\nKodu: SPECIAL15\n\nSaygılarımızla,\n${STORE_RUNTIME.name} Ekibi`,
  },
  {
    id: 3,
    name: "Yeni Ürün",
    subject: "Yeni Ürünlerimiz Geldi!",
    content: `Merhaba {firstName},\n\nYeni ürünlerimiz yayında. Güncel koleksiyonumuzu incelemek için mağazamızı ziyaret edin.\n\nSaygılarımızla,\n${STORE_RUNTIME.name} Ekibi`,
  },
  {
    id: 4,
    name: "Sipariş Hatırlatma",
    subject: "Sonraki Siparişiniz İçin Hazırlanın",
    content: `Merhaba {firstName},\n\nFavori ürünleriniz tekrar sipariş için hazır olabilir. Stokları kontrol edip yeni siparişinizi verebilirsiniz.\n\nSaygılarımızla,\n${STORE_RUNTIME.name} Ekibi`,
  },
];

export default function EmailMarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch =
      customer.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filter === "all" ||
      (filter === "email" && customer.email) ||
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

  const handleSendEmail = async () => {
    if (selectedCustomers.length === 0 || !emailSubject || !messageTemplate) return;

    setSending(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setSending(false);
    setSelectedCustomers([]);
    setEmailSubject("");
    setMessageTemplate("");
  };

  const getPreviewContent = () => {
    let content = messageTemplate;
    if (selectedCustomers.length === 1) {
      const customer = customers.find(c => c.id === selectedCustomers[0]);
      if (customer) {
        content = content
          .replace(/{firstName}/g, customer.firstName)
          .replace(/{lastName}/g, customer.lastName)
          .replace(/{email}/g, customer.email);
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
              <h1 className="text-3xl font-bold text-gray-900 mb-1">E-posta Pazarlama</h1>
              <p className="text-gray-500">Müşterilerinize toplu e-posta gönderin</p>
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
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="appearance-none pl-12 pr-10 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all min-w-[200px] cursor-pointer"
                    >
                      <option value="all">Tümü</option>
                      <option value="email">E-posta Sahibi</option>
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
                  <thead className="bg-gradient-to-r from-blue-50 to-white border-b-2 border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-4 text-left">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase">
                        Müşteri
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase">
                        E-posta
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCustomers.map((customer) => (
                      <tr
                        key={customer.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          selectedCustomers.includes(customer.id) ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedCustomers.includes(customer.id)}
                            onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-bold text-gray-900 text-base">
                            {customer.firstName} {customer.lastName}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {customer.email}
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

          {/* Email Form */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Konu
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="E-posta konusu..."
                  className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Şablonlar
                </label>
                <div className="space-y-3">
                  {EMAIL_TEMPLATES.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => {
                        setEmailSubject(template.subject);
                        setMessageTemplate(template.content);
                      }}
                      className={`p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                        messageTemplate === template.content
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 mb-1">{template.name}</div>
                      <div className="text-sm text-gray-600 truncate">{template.subject}</div>
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
                  placeholder="Mesajınızı buraya yazın... {firstName}, {lastName}, {email} değişkenlerini kullanabilirsiniz"
                  rows={8}
                  className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all resize-none text-sm"
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
                  onClick={handleSendEmail}
                  disabled={selectedCustomers.length === 0 || sending}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-semibold hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      {selectedCustomers.length} E-posta Gönder
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
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-semibold">Konu:</span> {emailSubject}
                  </div>
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
