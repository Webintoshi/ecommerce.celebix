"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { 
  Mail, Lock, User, Eye, EyeOff, ShoppingBag, Heart, MapPin, 
  LogOut, Package, ChevronRight, Loader2, Edit2, Save, X,
  Phone, Calendar, CreditCard, Trash2
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  items: Array<{
    product_name: string;
    quantity: number;
    price: number;
  }>;
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  total_orders: number;
  total_spent: number;
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "addresses" | "profile">("overview");
  
  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);

  // Address State
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const [addressForm, setAddressForm] = useState({
    title: "",
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    district: "",
    postalCode: "",
  });

  // Fetch customer data and orders
  useEffect(() => {
    if (!user) {
      if (!authLoading) {
        router.push("/giris");
      }
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch customer data
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (customerError) {
          console.error("Error fetching customer:", customerError);
        } else if (customerData) {
          setCustomer(customerData);
          setEditForm({
            firstName: customerData.first_name || "",
            lastName: customerData.last_name || "",
            phone: customerData.phone || "",
          });

          // Fetch orders
          const { data: ordersData, error: ordersError } = await supabase
            .from("orders")
            .select("*")
            .eq("customer_id", customerData.id)
            .order("created_at", { ascending: false });

          if (ordersError) {
            console.error("Error fetching orders:", ordersError);
          } else {
            setOrders(ordersData || []);
          }

          // Fetch addresses
          const { data: addressesData, error: addressesError } = await supabase
            .from("customer_addresses")
            .select("*")
            .eq("customer_id", customerData.id)
            .order("is_default", { ascending: false });

          if (addressesError) {
            console.error("Error fetching addresses:", addressesError);
          } else {
            setAddresses(addressesData || []);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router]);

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  const handleSaveProfile = async () => {
    if (!customer) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          first_name: editForm.firstName,
          last_name: editForm.lastName,
          phone: editForm.phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customer.id);

      if (error) {
        console.error("Error updating profile:", error);
      } else {
        setCustomer({
          ...customer,
          first_name: editForm.firstName,
          last_name: editForm.lastName,
          phone: editForm.phone,
        });
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered": return "bg-emerald-100 text-emerald-700";
      case "shipped": return "bg-blue-100 text-blue-700";
      case "preparing": return "bg-amber-100 text-amber-700";
      case "pending": return "bg-gray-100 text-gray-700";
      case "cancelled": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Beklemede";
      case "confirmed": return "Onaylandı";
      case "preparing": return "Hazırlanıyor";
      case "shipped": return "Kargolandı";
      case "delivered": return "Teslim Edildi";
      case "cancelled": return "İptal";
      case "refunded": return "İade Edildi";
      default: return status;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-gray-600 font-medium">Yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  const displayName = customer ? `${customer.first_name} ${customer.last_name}` : user.email?.split("@")[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white py-8">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">Hesabım</h1>
          <p className="text-white/80 mt-2">
            Hoş geldiniz, {displayName}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {[
              { id: "overview", label: "Genel Bakış", icon: Package },
              { id: "orders", label: "Siparişlerim", icon: ShoppingBag },
              { id: "addresses", label: "Adreslerim", icon: MapPin },
              { id: "profile", label: "Profil", icon: User },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Toplam Sipariş</p>
                      <p className="text-2xl font-bold text-gray-900">{customer?.total_orders || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Toplam Harcama</p>
                      <p className="text-2xl font-bold text-gray-900">{formatPrice(customer?.total_spent || 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Üyelik Tarihi</p>
                      <p className="text-lg font-bold text-gray-900">
                        {new Date(user.created_at).toLocaleDateString("tr-TR")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Son Siparişler</h2>
                  <button
                    onClick={() => setActiveTab("orders")}
                    className="text-primary font-medium hover:underline flex items-center gap-1"
                  >
                    Tümünü Gör
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                {orders.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Henüz siparişiniz yok</h3>
                    <p className="text-gray-600 mb-4">İlk siparişinizi vererek alışverişe başlayın.</p>
                    <Link
                      href="/urunler"
                      className="inline-block px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#7B1113] transition-colors"
                    >
                      Alışverişe Başla
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.slice(0, 3).map((order) => (
                      <Link
                        key={order.id}
                        href={`/siparisler/${order.id}`}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-gray-900">#{order.order_number}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(order.created_at).toLocaleDateString("tr-TR")}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                          <p className="font-bold text-gray-900 mt-1">{formatPrice(order.total)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href="/urunler"
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-xl">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Ürünlere Göz At</h3>
                      <p className="text-sm text-gray-600">Yeni ürünleri keşfedin</p>
                    </div>
                  </div>
                </Link>
                <Link
                  href="/favoriler"
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-100 rounded-xl">
                      <Heart className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Favorilerim</h3>
                      <p className="text-sm text-gray-600">Kaydedilmiş ürünler</p>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => setActiveTab("addresses")}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow text-left w-full"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-xl">
                      <MapPin className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Adreslerim</h3>
                      <p className="text-sm text-gray-600">Teslimat adresleri</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Tüm Siparişlerim</h2>
              
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Henüz siparişiniz yok</h3>
                  <p className="text-gray-600 mb-4">İlk siparişinizi vererek alışverişe başlayın.</p>
                  <Link
                    href="/urunler"
                    className="inline-block px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#7B1113] transition-colors"
                  >
                    Alışverişe Başla
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/siparisler/${order.id}`}
                      className="block p-6 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-gray-900">#{order.order_number}</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">
                            {new Date(order.created_at).toLocaleDateString("tr-TR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                          {order.items && order.items.length > 0 && (
                            <p className="text-sm text-gray-600 mt-2">
                              {order.items.map(i => i.product_name).join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{formatPrice(order.total)}</p>
                          <p className="text-sm text-gray-500">{order.items?.length || 0} ürün</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Addresses Tab */}
          {activeTab === "addresses" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Adreslerim</h2>
                  <p className="text-gray-600">Teslimat adreslerinizi yönetin</p>
                </div>
                <button
                  onClick={() => {
                    setEditingAddress(null);
                    setAddressForm({
                      title: "",
                      firstName: customer?.first_name || "",
                      lastName: customer?.last_name || "",
                      phone: customer?.phone || "",
                      address: "",
                      city: "",
                      district: "",
                      postalCode: "",
                    });
                    setShowAddressForm(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-red-800 transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  Yeni Adres
                </button>
              </div>

              {/* Address Form */}
              <AnimatePresence>
                {showAddressForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
                  >
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {editingAddress ? "Adres Düzenle" : "Yeni Adres Ekle"}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Adres Başlığı</label>
                        <input
                          type="text"
                          value={addressForm.title}
                          onChange={(e) => setAddressForm({ ...addressForm, title: e.target.value })}
                          placeholder="Örn: Ev, İş"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Ad</label>
                          <input
                            type="text"
                            value={addressForm.firstName}
                            onChange={(e) => setAddressForm({ ...addressForm, firstName: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Soyad</label>
                          <input
                            type="text"
                            value={addressForm.lastName}
                            onChange={(e) => setAddressForm({ ...addressForm, lastName: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                        <input
                          type="tel"
                          value={addressForm.phone}
                          onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="05XX XXX XX XX"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Adres</label>
                        <input
                          type="text"
                          value={addressForm.address}
                          onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Mahalle, Sokak, Bina No..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Şehir</label>
                        <select
                          value={addressForm.city}
                          onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="">Seçiniz</option>
                          {["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"].map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">İlçe</label>
                        <input
                          type="text"
                          value={addressForm.district}
                          onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Posta Kodu</label>
                        <input
                          type="text"
                          value={addressForm.postalCode}
                          onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={async () => {
                          if (!customer) return;
                          try {
                            if (editingAddress) {
                              await supabase
                                .from("customer_addresses")
                                .update({
                                  title: addressForm.title,
                                  first_name: addressForm.firstName,
                                  last_name: addressForm.lastName,
                                  phone: addressForm.phone,
                                  address: addressForm.address,
                                  city: addressForm.city,
                                  district: addressForm.district,
                                  postal_code: addressForm.postalCode,
                                })
                                .eq("id", editingAddress.id);
                            } else {
                              await supabase
                                .from("customer_addresses")
                                .insert({
                                  title: addressForm.title,
                                  first_name: addressForm.firstName,
                                  last_name: addressForm.lastName,
                                  phone: addressForm.phone,
                                  address: addressForm.address,
                                  city: addressForm.city,
                                  district: addressForm.district,
                                  postal_code: addressForm.postalCode,
                                  customer_id: customer.id,
                                  is_default: addresses.length === 0,
                                });
                            }
                            // Refresh addresses
                            const { data } = await supabase
                              .from("customer_addresses")
                              .select("*")
                              .eq("customer_id", customer.id)
                              .order("is_default", { ascending: false });
                            setAddresses(data || []);
                            setShowAddressForm(false);
                          } catch (error) {
                            console.error("Error saving address:", error);
                          }
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-red-800 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        Kaydet
                      </button>
                      <button
                        onClick={() => setShowAddressForm(false)}
                        className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                      >
                        İptal
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Address List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addresses.length === 0 ? (
                  <div className="md:col-span-2 text-center py-12 bg-gray-50 rounded-xl">
                    <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Kayıtlı adresiniz yok</h3>
                    <p className="text-gray-600">İlk adresinizi ekleyin</p>
                  </div>
                ) : (
                  addresses.map((address) => (
                    <div
                      key={address.id}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative"
                    >
                      {address.is_default && (
                        <span className="absolute top-3 right-3 text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg font-semibold">
                          Varsayılan
                        </span>
                      )}
                      <div className="flex items-start gap-3 mb-3">
                        <MapPin className="w-5 h-5 text-primary mt-1 shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{address.title || "Adres"}</p>
                          <p className="text-gray-700">
                            {address.first_name} {address.last_name}
                          </p>
                          <p className="text-gray-600">{address.phone}</p>
                          <p className="text-gray-600">{address.address}</p>
                          <p className="text-gray-600">
                            {address.district}, {address.city} / {address.postal_code}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => {
                            setEditingAddress(address);
                            setAddressForm({
                              title: address.title || "",
                              firstName: address.first_name || "",
                              lastName: address.last_name || "",
                              phone: address.phone || "",
                              address: address.address || "",
                              city: address.city || "",
                              district: address.district || "",
                              postalCode: address.postal_code || "",
                            });
                            setShowAddressForm(true);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          Düzenle
                        </button>
                        {!address.is_default && (
                          <button
                            onClick={async () => {
                              await supabase
                                .from("customer_addresses")
                                .delete()
                                .eq("id", address.id);
                              setAddresses(addresses.filter(a => a.id !== address.id));
                            }}
                            className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* Profile Info Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Profil Bilgileri</h2>
                    <p className="text-gray-600">Kişisel bilgilerinizi yönetin</p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-[#7B1113] transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Düzenle
                    </button>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {isEditing ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Ad</label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                              type="text"
                              value={editForm.firstName}
                              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Soyad</label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                              type="text"
                              value={editForm.lastName}
                              onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="05XX XXX XX XX"
                          />
                        </div>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleSaveProfile}
                          disabled={saving}
                          className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#7B1113] transition-colors disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Kaydet
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          İptal
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Ad Soyad</p>
                          <p className="font-semibold text-gray-900">
                            {customer?.first_name} {customer?.last_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">E-posta</p>
                          <p className="font-semibold text-gray-900">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Telefon</p>
                          <p className="font-semibold text-gray-900">{customer?.phone || "Belirtilmemiş"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Üyelik Tarihi</p>
                          <p className="font-semibold text-gray-900">
                            {new Date(user.created_at).toLocaleDateString("tr-TR")}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Security Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Güvenlik</h2>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-semibold text-gray-900">Şifre</p>
                      <p className="text-sm text-gray-600">Şifrenizi değiştirmek için tıklayın</p>
                    </div>
                  </div>
                  <Link
                    href="/sifremi-unuttum"
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Değiştir
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Logout */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 mx-auto text-red-600 hover:text-red-700 font-bold transition-colors px-6 py-3 bg-red-50 rounded-xl hover:bg-red-100"
            >
              <LogOut className="h-5 w-5" />
              Çıkış Yap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
