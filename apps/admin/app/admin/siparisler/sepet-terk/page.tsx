"use client";

import { useState, useEffect } from "react";
import {
  getAbandonedCarts,
  getFilteredAbandonedCarts,
  getAbandonedCartStats,
  markCartAsRecovered,
  deleteAbandonedCart,
  AbandonedCartFilters,
  AbandonedCartSort,
} from "@/lib/abandoned-carts";
import {
  ShoppingCart,
  User,
  Mail,
  Phone,
  TrendingUp,
  TrendingDown,
  Trash2,
  CheckCircle,
  XCircle,
  Package,
  Filter,
  RefreshCw,
  Download,
  ArrowRight,
  Clock,
  Calendar,
  DollarSign,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

export default function AbandonedCartsPage() {
  const [carts, setCarts] = useState<any[]>([]);
  const [filters, setFilters] = useState<AbandonedCartFilters>({});
  const [sort, setSort] = useState<AbandonedCartSort>("date-desc");
  const [loading, setLoading] = useState(true);
  const [selectedCart, setSelectedCart] = useState<any | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const allCarts = await getAbandonedCarts();
      const filteredCarts = await getFilteredAbandonedCarts(filters, sort);
      const cartStats = await getAbandonedCartStats();
      setCarts(filteredCarts);
      setStats(cartStats);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRecovered = async (id: string) => {
    await markCartAsRecovered(id);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu sepeti silmek istediğinizden emin misiniz?")) {
      return;
    }
    await deleteAbandonedCart(id);
    loadData();
  };

  const handleFilterChange = (key: keyof AbandonedCartFilters, value: any) => {
    setFilters({ ...filters, [key]: value });
  };

  const handleSortChange = (newSort: AbandonedCartSort) => {
    setSort(newSort);
  };

  const getStatusBadge = (cart: any) => {
    if (cart.recovered) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          <CheckCircle className="w-3.5 h-3.5" />
          Kurtarıldı
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <XCircle className="w-3.5 h-3.5" />
        Terk Edildi
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-3 md:px-6 py-4 md:py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-1 md:mb-2">Sepet Terk</h1>
            <p className="text-gray-500 text-sm md:text-base">Terk edilmiş sepetleri takip edin ve kurtarın</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-3 bg-white border border-gray-200 rounded-xl md:rounded-2xl hover:bg-gray-50 transition-all shadow-lg text-sm md:text-base"
            >
              <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
              <span className="hidden sm:inline">Yenile</span>
            </button>
            <button className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-3 bg-indigo-600 text-white rounded-xl md:rounded-2xl hover:bg-indigo-700 transition-all shadow-lg text-sm md:text-base">
              <Download className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden sm:inline">Dışa Aktar</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-gray-600 font-medium text-sm mb-1">Toplam Sepet</h3>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  stats.recovered > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                }`}>
                  {stats.recoveryRate.toFixed(1)}%
                </div>
              </div>
              <h3 className="text-gray-600 font-medium text-sm mb-1">Kurtarılan</h3>
              <p className="text-3xl font-bold text-gray-900">{stats.recovered}</p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-gray-600 font-medium text-sm mb-1">Toplam Değer</h3>
              <p className="text-3xl font-bold text-gray-900">
                ₺{stats.totalValue.toLocaleString("tr-TR")}
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-gray-600 font-medium text-sm mb-1">Ortalama Sepet</h3>
              <p className="text-3xl font-bold text-gray-900">
                ₺{stats.avgValue.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Filtreler</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <select
              value={filters.isAnonymous === undefined ? "" : filters.isAnonymous.toString()}
              onChange={(e) =>
                handleFilterChange(
                  "isAnonymous",
                  e.target.value === "" ? undefined : e.target.value === "true"
                )
              }
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="">Tümü</option>
              <option value="false">Kayıtlı Müşteriler</option>
              <option value="true">Anonim Sepetler</option>
            </select>

            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as AbandonedCartSort)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="date-desc">Tarih (Yeni&gt;Eski)</option>
              <option value="date-asc">Tarih (Eski&gt;Yeni)</option>
              <option value="total-desc">Değer (Yüksek&gt;Düşük)</option>
              <option value="total-asc">Değer (Düşük&gt;Yüksek)</option>
            </select>

            <input
              type="text"
              placeholder="İsim, e-posta veya telefon ara..."
              value={filters.search || ""}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Carts List */}
        {loading ? (
          <div className="bg-white rounded-3xl p-12 shadow-lg border border-gray-100 text-center">
            <RefreshCw className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Yükleniyor...</p>
          </div>
        ) : carts.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 shadow-lg border border-gray-100 text-center">
            <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Henüz Veri Yok</h3>
            <p className="text-gray-600">Terk edilmiş sepet verisi bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {carts.map((cart) => (
              <div
                key={cart.id}
                className="bg-white rounded-3xl shadow-lg border border-gray-100 hover:shadow-xl transition-all"
              >
                {/* Cart Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {getStatusBadge(cart)}
                        {cart.isAnonymous && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                            <User className="w-3.5 h-3.5" />
                            Anonim
                          </span>
                        )}
                      </div>

                      {/* Customer Info */}
                      {!cart.isAnonymous && (
                        <div className="mb-4">
                          {cart.firstName && cart.lastName && (
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <span className="font-semibold text-gray-900">
                                {cart.firstName} {cart.lastName}
                              </span>
                            </div>
                          )}
                          {cart.email && (
                            <div className="flex items-center gap-2 mb-2">
                              <Mail className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-700">{cart.email}</span>
                            </div>
                          )}
                          {cart.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-700">{cart.phone}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Anonymous Info */}
                      {cart.isAnonymous && (
                        <div className="mb-4">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-500 italic">Anonim müşteri</span>
                          </div>
                        </div>
                      )}

                      {/* Cart Summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Sepet Değeri</p>
                          <p className="font-bold text-gray-900">₺{cart.total.toLocaleString("tr-TR")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Ürün Adedi</p>
                          <p className="font-bold text-gray-900">{cart.itemCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Terk Tarihi</p>
                          <p className="font-semibold text-gray-900">
                            {format(cart.createdAt, "d MMM yyyy", { locale: tr })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Zaman</p>
                          <p className="text-sm text-gray-600">
                            {format(cart.createdAt, "HH:mm", { locale: tr })}
                            <span className="ml-2 text-gray-400">
                              ({formatDistanceToNow(cart.createdAt, { locale: tr, addSuffix: true })})
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {!cart.recovered && (
                        <button
                          onClick={() => handleMarkRecovered(cart.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all text-sm font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Kurtar
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedCart(cart)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all text-sm font-medium"
                      >
                        <Package className="w-4 h-4" />
                        Detay
                      </button>
                      <button
                        onClick={() => handleDelete(cart.id)}
                        className="p-2 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cart Items Preview */}
                <div className="px-6 py-4 bg-gray-50">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-semibold text-gray-900">Sepet İçeriği</h4>
                    <span className="text-sm text-gray-500">({cart.items.length} ürün)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cart.items.slice(0, 3).map((item: any) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200">
                        <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                          {item.productImage ? (
                            <img
                              src={item.productImage}
                              alt={item.productName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-full h-full text-gray-400 p-2" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-gray-900 text-sm truncate mb-1">
                            {item.productName}
                          </h5>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">{item.variantName}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">x{item.quantity}</span>
                              <span className="font-semibold text-indigo-600">
                                ₺{(item.price * item.quantity).toLocaleString("tr-TR")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {cart.items.length > 3 && (
                      <div className="flex items-center justify-center p-3 bg-white rounded-xl border border-gray-200 text-sm text-gray-600">
                        +{cart.items.length - 3} ürün daha
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedCart && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">Sepet Detayları</h3>
                    <p className="text-gray-500">Sepet ID: {selectedCart.id}</p>
                  </div>
                  <button
                    onClick={() => setSelectedCart(null)}
                    className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-all"
                  >
                    <XCircle className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {/* Customer Details */}
                <div className="mb-8">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-600" />
                    Müşteri Bilgileri
                  </h4>
                  {selectedCart.isAnonymous ? (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-gray-400" />
                        <span className="text-gray-600 italic">Bu sepet anonim bir kullanıcıya ait</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedCart.firstName && (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">Ad</p>
                          <p className="font-semibold text-gray-900">{selectedCart.firstName}</p>
                        </div>
                      )}
                      {selectedCart.lastName && (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">Soyad</p>
                          <p className="font-semibold text-gray-900">{selectedCart.lastName}</p>
                        </div>
                      )}
                      {selectedCart.email && (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">E-posta</p>
                          <p className="font-semibold text-gray-900">{selectedCart.email}</p>
                        </div>
                      )}
                      {selectedCart.phone && (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">Telefon</p>
                          <p className="font-semibold text-gray-900">{selectedCart.phone}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cart Items */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-indigo-600" />
                    Ürünler
                  </h4>
                  <div className="space-y-3">
                    {selectedCart.items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200"
                      >
                        <div className="w-20 h-20 bg-white rounded-lg flex-shrink-0 overflow-hidden border border-gray-200">
                          {item.productImage ? (
                            <img
                              src={item.productImage}
                              alt={item.productName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-full h-full text-gray-400 p-4" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h5 className="font-semibold text-gray-900 mb-1">{item.productName}</h5>
                          <p className="text-sm text-gray-600 mb-2">{item.variantName}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-gray-600">Adet: {item.quantity}</span>
                              <span className="text-sm text-gray-600">Stok: {item.stock}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-indigo-600">
                                ₺{(item.price * item.quantity).toLocaleString("tr-TR")}
                              </p>
                              {item.originalPrice && item.originalPrice > item.price && (
                                <p className="text-sm text-gray-400 line-through">
                                  ₺{(item.originalPrice * item.quantity).toLocaleString("tr-TR")}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Toplam {selectedCart.itemCount} ürün</p>
                    <p className="text-xs text-gray-500">
                      Tarih: {format(selectedCart.createdAt, "d MMM yyyy, HH:mm", { locale: tr })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 mb-1">Sepet Toplamı</p>
                    <p className="text-3xl font-bold text-indigo-600">
                      ₺{selectedCart.total.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
