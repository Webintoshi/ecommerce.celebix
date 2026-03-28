"use client";

import { useState } from "react";
import { Truck, MapPin, Calendar, ExternalLink, Package, Edit2, Check, X } from "lucide-react";
import { SHIPPING_CARRIERS } from "@/types/order";
import type { ShippingCarrier } from "@/types/order";

interface ShippingInfoCardProps {
  trackingNumber?: string;
  carrier?: ShippingCarrier | string;
  estimatedDelivery?: string | Date;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
  };
  onTrackingUpdate?: (data: { carrier: ShippingCarrier | string; trackingNumber: string }) => Promise<void>;
  className?: string;
}

export function ShippingInfoCard({
  trackingNumber = "",
  carrier = "",
  estimatedDelivery,
  shippingAddress,
  onTrackingUpdate,
  className = "",
}: ShippingInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [trackingInput, setTrackingInput] = useState(trackingNumber);
  const [carrierInput, setCarrierInput] = useState(carrier);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSave = async () => {
    if (!onTrackingUpdate) return;

    setIsUpdating(true);
    try {
      await onTrackingUpdate({
        carrier: carrierInput,
        trackingNumber: trackingInput,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Kargo bilgisi güncellenirken hata:", error);
      alert("Kargo bilgisi güncellenirken bir hata oluştu.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getTrackingUrl = () => {
    if (!trackingNumber) return null;
    const selectedCarrier = SHIPPING_CARRIERS.find(c => c.id === carrier);
    if (selectedCarrier) {
      return `${selectedCarrier.trackingUrl}${trackingNumber}`;
    }
    return `https://www.google.com/search?q=${trackingNumber}+kargo+takip`;
  };

  const trackingUrl = getTrackingUrl();

  const formatDate = (dateString?: string | Date) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
    });
  };

  const estDate = formatDate(estimatedDelivery);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Compact Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-gray-500" />
          Kargo & Teslimat
        </h3>
        {onTrackingUpdate && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-primary"
            title="Düzenle"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Shipping Address - Compact */}
        {shippingAddress && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Teslimat Adresi</p>
              <p className="font-bold text-gray-900 text-sm">
                {shippingAddress.firstName} {shippingAddress.lastName}
              </p>
              <p className="text-gray-600 text-sm truncate">{shippingAddress.address}</p>
              <p className="text-gray-900 font-medium text-sm">
                {shippingAddress.city} / {shippingAddress.country}
              </p>
              {shippingAddress.phone && (
                <p className="text-xs text-gray-500 mt-0.5">{shippingAddress.phone}</p>
              )}
            </div>
          </div>
        )}

        {/* Tracking Info - Compact */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Kargo Takip</p>
            
            {isEditing ? (
              <div className="space-y-2">
                <select
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Kargo Firması</option>
                  {SHIPPING_CARRIERS.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="Takip No"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isUpdating}
                    className="flex-1 px-3 py-1.5 bg-primary text-white rounded-lg font-bold text-xs hover:bg-red-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    Kaydet
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setTrackingInput(trackingNumber);
                      setCarrierInput(carrier);
                    }}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs hover:bg-gray-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : trackingNumber ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-sm">
                    {SHIPPING_CARRIERS.find(c => c.id === carrier)?.name || carrier}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">{trackingNumber}</code>
                  {trackingUrl && (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-blue-50 rounded text-blue-600 transition-colors"
                      title="Kargo Takip"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400">
                <span className="text-sm">Takip numarası girilmemiş</span>
                {onTrackingUpdate && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-primary font-bold hover:underline"
                  >
                    Ekle
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Estimated Delivery - Compact */}
        {estDate && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-gray-400 uppercase mb-0.5">Tahmini Teslimat</p>
              <p className="font-bold text-gray-900 text-sm">{estDate}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
