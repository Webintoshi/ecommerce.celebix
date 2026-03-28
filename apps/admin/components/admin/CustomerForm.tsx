"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Plus, Trash2, Phone, Mail, User, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";

interface AddressInput {
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string;
}

interface CustomerFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  addresses: AddressInput[];
  status: "active" | "inactive" | "blocked";
  notes: string;
  tags: string[];
}

interface CustomerFormProps {
  customerId?: string;
}

export default function CustomerForm({ customerId }: CustomerFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const [formData, setFormData] = useState<CustomerFormData>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    addresses: [],
    status: "active",
    notes: "",
    tags: [],
  });

  // Load customer data if editing
  useEffect(() => {
    if (customerId) {
      loadCustomer();
    }
  }, [customerId]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?id=${customerId}`);
      const data = await res.json();
      
      if (data.success && data.customer) {
        const c = data.customer;
        setFormData({
          email: c.email || "",
          firstName: c.first_name || "",
          lastName: c.last_name || "",
          phone: c.phone || "",
          status: c.status || "active",
          notes: c.notes || "",
          tags: [], // Tags not in DB yet
          addresses: (c.addresses || []).map((addr: any) => ({
            title: addr.type === "shipping" ? "Teslimat" : "Fatura",
            firstName: addr.first_name || "",
            lastName: addr.last_name || "",
            phone: addr.phone || "",
            city: addr.city || "",
            district: addr.state || "",
            addressLine: addr.address_line1 || "",
            postalCode: addr.postal_code || "",
          })),
        });
      }
    } catch (error) {
      console.error("Failed to load customer:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (customerId) {
        // Update existing customer
        await fetch("/api/customers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: customerId,
            ...formData,
          }),
        });
      } else {
        // Create new customer
        await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }

      router.push("/admin/musteriler");
    } catch (error) {
      console.error("Failed to save customer:", error);
      alert("Müşteri kaydedilirken bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAddress = () => {
    setFormData({
      ...formData,
      addresses: [
        ...formData.addresses,
        {
          title: "Yeni Adres",
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || "",
          city: "",
          district: "",
          addressLine: "",
          postalCode: "",
        },
      ],
    });
  };

  const handleRemoveAddress = (index: number) => {
    setFormData({
      ...formData,
      addresses: formData.addresses.filter((_, i) => i !== index),
    });
  };

  const handleAddressChange = (index: number, field: keyof AddressInput, value: string) => {
    const newAddresses = [...formData.addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setFormData({ ...formData, addresses: newAddresses });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/musteriler" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {customerId ? "Müşteri Düzenle" : "Yeni Müşteri Ekle"}
          </h1>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Kaydet
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-5 h-5" />
              Kişisel Bilgiler
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soyad</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="05XXXXXXXXX"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Adresler
              </h3>
              <button
                type="button"
                onClick={handleAddAddress}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Adres Ekle
              </button>
            </div>

            {formData.addresses.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Henüz adres eklenmedi.</p>
            )}

            {formData.addresses.map((address, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">Adres {index + 1}</h4>
                  {formData.addresses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAddress(index)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adres Başlığı</label>
                  <input
                    type="text"
                    value={address.title}
                    onChange={(e) => handleAddressChange(index, "title", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Ev, İş vb."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ad</label>
                    <input
                      type="text"
                      value={address.firstName}
                      onChange={(e) => handleAddressChange(index, "firstName", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Soyad</label>
                    <input
                      type="text"
                      value={address.lastName}
                      onChange={(e) => handleAddressChange(index, "lastName", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                  <input
                    type="text"
                    value={address.addressLine}
                    onChange={(e) => handleAddressChange(index, "addressLine", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Şehir</label>
                    <input
                      type="text"
                      value={address.city}
                      onChange={(e) => handleAddressChange(index, "city", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">İlçe</label>
                    <input
                      type="text"
                      value={address.district}
                      onChange={(e) => handleAddressChange(index, "district", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Posta Kodu</label>
                    <input
                      type="text"
                      value={address.postalCode}
                      onChange={(e) => handleAddressChange(index, "postalCode", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                    <input
                      type="tel"
                      value={address.phone}
                      onChange={(e) => handleAddressChange(index, "phone", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Durum</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  checked={formData.status === "active"}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm text-gray-700">Aktif</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="inactive"
                  checked={formData.status === "inactive"}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm text-gray-700">Pasif</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="blocked"
                  checked={formData.status === "blocked"}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm text-gray-700">Engellendi</span>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Etiketler</h3>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                placeholder="Etiket ekle..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded"
                >
                  {tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-600 transition-colors">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notlar</h3>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Müşteri hakkında notlar..."
            />
          </div>
        </div>
      </div>
    </form>
  );
}
