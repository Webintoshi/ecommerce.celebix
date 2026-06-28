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
    <div className={`overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur ${className}`}>
      {/* Compact Header */}
      <div className="flex items-center justify-between border-b border-[var(--admin-border)] bg-gradient-to-r from-[#fffaf5] to-white px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-950">
          <Truck className="w-4 h-4 text-[var(--admin-text-secondary)]" />
          Kargo & Teslimat
        </h3>
        {onTrackingUpdate && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-[8px] p-2 text-stone-400 transition-colors hover:bg-white hover:text-[var(--admin-accent-hover)]"
            title="Düzenle"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        {/* Shipping Address - Compact */}
        {shippingAddress && (
          <div className="flex gap-3 rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#f3dfc9] bg-[#fff3e6]">
              <MapPin className="w-4 h-4 text-[var(--admin-accent-hover)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Teslimat Adresi</p>
              <p className="text-sm font-semibold text-stone-900">
                {shippingAddress.firstName} {shippingAddress.lastName}
              </p>
              <p className="break-words text-sm text-stone-600">{shippingAddress.address}</p>
              <p className="text-sm font-medium text-stone-900">
                {shippingAddress.city} / {shippingAddress.country}
              </p>
              {shippingAddress.phone && (
                <p className="mt-1 text-xs text-stone-500">{shippingAddress.phone}</p>
              )}
            </div>
          </div>
        )}

        {/* Tracking Info - Compact */}
        <div className="flex gap-3 rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#f3dfc9] bg-white">
            <Package className="w-4 h-4 text-[var(--admin-accent-hover)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Kargo Takip</p>
            
            {isEditing ? (
              <div className="space-y-2">
                <select
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  className="w-full rounded-[8px] border border-[#e1d2c3] bg-white px-3 py-2.5 text-sm text-stone-700 focus:border-[var(--admin-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15"
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
                  className="w-full rounded-[8px] border border-[#e1d2c3] bg-white px-3 py-2.5 text-sm text-stone-700 focus:border-[var(--admin-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isUpdating}
                    className="flex flex-1 items-center justify-center gap-1 rounded-[8px] bg-gradient-to-r from-[#FF6A00] to-[#d95a00] px-3 py-2.5 text-xs font-semibold text-white transition-all hover:from-[#f56a12] hover:to-[#c94d00] disabled:opacity-50"
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
                    className="rounded-[8px] border border-[#e1d2c3] bg-white px-3 py-2.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-[#FCFDFE]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : trackingNumber ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-900">
                    {SHIPPING_CARRIERS.find(c => c.id === carrier)?.name || carrier}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded-[8px] border border-[var(--admin-border)] bg-white px-2.5 py-1 font-mono text-sm text-stone-700">{trackingNumber}</code>
                  {trackingUrl && (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[8px] p-1.5 text-[var(--admin-accent-hover)] transition-colors hover:bg-white"
                      title="Kargo Takip"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-stone-400">
                <span className="text-sm">Takip numarası girilmemiş</span>
                {onTrackingUpdate && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-semibold text-[var(--admin-accent-hover)] hover:text-[#a84300]"
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
          <div className="flex gap-3 rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#f3dfc9] bg-white">
              <Calendar className="w-4 h-4 text-[var(--admin-accent-hover)]" />
            </div>
            <div className="flex-1">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Tahmini Teslimat</p>
              <p className="text-sm font-semibold text-stone-900">{estDate}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
