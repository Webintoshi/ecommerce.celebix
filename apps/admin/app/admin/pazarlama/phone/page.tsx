"use client";

import { useState, useEffect } from "react";
import { getCustomers } from "@/lib/customers";
import { Customer } from "@/types/customer";
import {
  Phone,
  Users,
  Filter,
  Download,
  RefreshCw,
  Copy,
  X,
} from "lucide-react";
import Link from "next/link";

export default function PhoneMarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [callNote, setCallNote] = useState("");

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
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Telefon Pazarlama</h1>
              <p className="text-gray-500">Müşterilerinizi telefonla arayın</p>
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
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="appearance-none pl-12 pr-10 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 transition-all min-w-[200px] cursor-pointer"
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
                  <thead className="bg-gradient-to-r from-purple-50 to-white border-b-2 border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-4 text-left">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
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
                          selectedCustomers.includes(customer.id) ? 'bg-purple-50' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedCustomers.includes(customer.id)}
                            onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
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
                              href={`tel:${customer.phone}`}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold text-sm"
                            >
                              <Phone className="w-4 h-4" />
                              Ara
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

          {/* Phone Numbers & Actions */}
          <div className="space-y-6">
            {/* Phone Numbers */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-gray-900">Telefon Numaraları</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Seçili müşterilerin telefon numaraları
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {customers
                  .filter(c => c.phone && selectedCustomers.includes(c.id))
                  .map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl"
                    >
                      <div>
                        <div className="font-semibold text-gray-900">
                          {customer.firstName} {customer.lastName}
                        </div>
                        <div className="text-sm text-gray-600 font-mono">
                          {customer.phone}
                        </div>
                      </div>
                      <a
                        href={`tel:${customer.phone}`}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold"
                      >
                        <Phone className="w-4 h-4" />
                        Ara
                      </a>
                    </div>
                  ))}
              </div>
              {selectedCustomers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Seçili müşteri yok
                </div>
              )}
            </div>

            {/* Call Note */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
                  <Copy className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-gray-900">Arama Notu</h3>
              </div>
              <textarea
                value={callNote}
                onChange={(e) => setCallNote(e.target.value)}
                placeholder="Arama notunuzu buraya yazın..."
                rows={6}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none text-sm"
              />
              <button
                onClick={() => {
                  if (callNote.trim()) {
                    navigator.clipboard.writeText(callNote);
                    alert("Not kopyalandı!");
                  }
                }}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-2xl hover:bg-blue-600 transition-all font-semibold"
              >
                <Copy className="w-4 h-4" />
                Notu Kopyala
              </button>
            </div>

            {/* Export Actions */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center">
                  <Download className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-gray-900">Dışa Aktar</h3>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    const phones = customers
                      .filter(c => c.phone && selectedCustomers.includes(c.id))
                      .map(c => c.phone)
                      .join('\n');
                    if (phones) {
                      navigator.clipboard.writeText(phones);
                      alert("Telefon numaraları kopyalandı!");
                    }
                  }}
                  disabled={selectedCustomers.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy className="w-4 h-4" />
                  Kopyala
                </button>
                <button
                  onClick={() => {
                    const phones = customers
                      .filter(c => c.phone && selectedCustomers.includes(c.id))
                      .map(c => c.phone)
                      .join('\n');
                    if (phones) {
                      const blob = new Blob([phones], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'phone-list.txt';
                      a.click();
                    }
                  }}
                  disabled={selectedCustomers.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-2xl hover:bg-purple-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  TXT İndir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
