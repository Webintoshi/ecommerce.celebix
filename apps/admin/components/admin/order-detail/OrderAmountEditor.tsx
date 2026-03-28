"use client";

import { useState } from "react";
import { DollarSign, Plus, Minus, Save, X } from "lucide-react";

interface OrderAmountEditorProps {
  subtotal: number;
  shippingCost: number;
  currentDiscount: number;
  currentTotal: number;
  onAmountChange: (discount: number, note: string) => Promise<void>;
  className?: string;
}

export function OrderAmountEditor({
  subtotal,
  shippingCost,
  currentDiscount,
  currentTotal,
  onAmountChange,
  className = "",
}: OrderAmountEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountValue, setDiscountValue] = useState(Math.abs(currentDiscount).toString());
  const [note, setNote] = useState("");

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const calculateNewTotal = () => {
    const value = parseFloat(discountValue) || 0;
    const discount = discountType === "percentage"
      ? (subtotal * value) / 100
      : value;

    if (currentDiscount < 0) {
      // Current is discount, new is also discount
      return subtotal - discount + shippingCost;
    } else {
      // Current is extra fee, new is extra fee
      return subtotal + discount + shippingCost;
    }
  };

  const handleSave = async () => {
    if (!note.trim()) {
      alert("Lütfen bir not giriniz.");
      return;
    }

    const value = parseFloat(discountValue) || 0;
    const finalDiscount = currentDiscount < 0
      ? -(discountType === "percentage" ? (subtotal * value) / 100 : value)
      : (discountType === "percentage" ? (subtotal * value) / 100 : value);

    setIsUpdating(true);
    try {
      await onAmountChange(finalDiscount, note.trim());
      setIsEditing(false);
      setNote("");
    } catch (error) {
      console.error("Tutar güncellenirken hata:", error);
      alert("Tutar güncellenirken bir hata oluştu.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDiscountValue(Math.abs(currentDiscount).toString());
    setNote("");
  };

  const newTotal = calculateNewTotal();

  return (
    <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-gray-400" />
          Sipariş Tutarı
        </h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Summary */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Ara Toplam</span>
            <span className="font-medium">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Kargo</span>
            <span className="font-medium">
              {shippingCost === 0 ? "Ücretsiz" : formatPrice(shippingCost)}
            </span>
          </div>
          {currentDiscount !== 0 && (
            <div className={`flex justify-between text-sm font-bold ${currentDiscount < 0 ? "text-emerald-600" : "text-orange-600"}`}>
              <span>{currentDiscount < 0 ? "İndirim" : "Ek Ücret"}</span>
              <span>{currentDiscount < 0 ? "-" : "+"}{formatPrice(Math.abs(currentDiscount))}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-gray-900 text-lg font-bold">
            <span>Genel Toplam</span>
            <span>{formatPrice(currentTotal)}</span>
          </div>
        </div>

        {/* Edit Section */}
        {isEditing ? (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="space-y-3">
              {/* Discount Type Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDiscountType("fixed")}
                  className={`flex-1 px-3 py-2 rounded-lg font-bold text-sm transition-all ${
                    discountType === "fixed"
                      ? "bg-primary text-white"
                      : "bg-white text-gray-700 border border-gray-200"
                  }`}
                >
                  Sabit Tutar (₺)
                </button>
                <button
                  onClick={() => setDiscountType("percentage")}
                  className={`flex-1 px-3 py-2 rounded-lg font-bold text-sm transition-all ${
                    discountType === "percentage"
                      ? "bg-primary text-white"
                      : "bg-white text-gray-700 border border-gray-200"
                  }`}
                >
                  Yüzde (%)
                </button>
              </div>

              {/* Discount Input */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">
                  {currentDiscount < 0 ? "İndirim" : "Ek Ücret"} Tutarı
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 pr-8 rounded-lg border border-gray-200 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">
                    {discountType === "percentage" ? "%" : "₺"}
                  </span>
                </div>
              </div>

              {/* Note Input */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">
                  Değişiklik Notu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Değişiklik sebebi..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              {/* New Total Preview */}
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Yeni Toplam</span>
                  <span className="font-bold text-primary">{formatPrice(newTotal)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCancel}
                  disabled={isUpdating}
                  className="flex-1 px-3 py-2 bg-white text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleSave}
                  disabled={isUpdating || !note.trim()}
                  className="flex-1 px-3 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                >
                  {isUpdating ? (
                    "Kaydediliyor..."
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full mt-4 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Tutar Düzenle
          </button>
        )}
      </div>
    </div>
  );
}
