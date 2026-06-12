import { CartItem } from "./cart";
import { Address } from "./user";
import { LucideIcon, Clock, CheckCircle, Package, Truck, XCircle, ArrowLeft } from "lucide-react";

// Sipariş Durumu
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

// Sipariş Durumu Konfigürasyonu
export const ORDER_STATUS_CONFIG: Record<OrderStatus, {
  label: string;
  description: string;
  color: string;
  icon: LucideIcon;
  stepIndex: number;
}> = {
  pending: {
    label: "Beklemede",
    description: "Sipariş alındı, onay bekliyor",
    color: "yellow",
    icon: Clock,
    stepIndex: 0,
  },
  confirmed: {
    label: "Onaylandı",
    description: "Sipariş onaylandı, hazırlanıyor",
    color: "blue",
    icon: CheckCircle,
    stepIndex: 1,
  },
  preparing: {
    label: "Hazırlanıyor",
    description: "Ürünler paketleniyor",
    color: "purple",
    icon: Package,
    stepIndex: 2,
  },
  shipped: {
    label: "Kargolandı",
    description: "Kargo firmasına teslim edildi",
    color: "indigo",
    icon: Truck,
    stepIndex: 3,
  },
  delivered: {
    label: "Teslim Edildi",
    description: "Müşteriye teslim edildi",
    color: "green",
    icon: CheckCircle,
    stepIndex: 4,
  },
  cancelled: {
    label: "İptal",
    description: "Sipariş iptal edildi",
    color: "red",
    icon: XCircle,
    stepIndex: -1,
  },
  refunded: {
    label: "İade",
    description: "İade edildi",
    color: "orange",
    icon: ArrowLeft,
    stepIndex: -1,
  },
};

// Sipariş Timeline Adımları
export const ORDER_TIMELINE_STEPS = [
  { status: "pending" as OrderStatus, label: "Beklemede" },
  { status: "confirmed" as OrderStatus, label: "Onaylandı" },
  { status: "preparing" as OrderStatus, label: "Hazırlanıyor" },
  { status: "shipped" as OrderStatus, label: "Kargolandı" },
  { status: "delivered" as OrderStatus, label: "Teslim Edildi" },
];

// Kargo Firmaları
export const SHIPPING_CARRIERS = [
  { id: "aras", name: "Aras Kargo", trackingUrl: "https://www.araskargo.com.tr/tracking/sorgu?code=" },
  { id: "yurtici", name: "Yurtiçi Kargo", trackingUrl: "https://www.yurticikargo.com/tr/track-shipment?trackingCode=" },
  { id: "surat", name: "Sürat Kargo", trackingUrl: "https://www.suratkargo.com.tr/trkargo/Sayfalar/KargonuzNerede.aspx?kargoTakipNo=" },
  { id: "mng", name: "MNG Kargo", trackingUrl: "https://mngkargo.com.tr/musteri-hizmetleri/kargo-takip?code=" },
  { id: "ptt", name: "PTT Kargo", trackingUrl: "https://gonderitakip.ptt.gov.tr/track?code=" },
] as const;

export type ShippingCarrier = typeof SHIPPING_CARRIERS[number]["id"];

// Aktivite Log Türleri
export type OrderActivityAction =
  | "order_created"
  | "status_changed"
  | "payment_status_changed"
  | "shipping_updated"
  | "note_added"
  | "note_updated"
  | "note_deleted"
  | "customer_notified";

// Sipariş Aktivite Log
export interface OrderActivityLog {
  id: string;
  orderId: string;
  action: OrderActivityAction;
  oldValue?: unknown;
  newValue?: unknown;
  adminId?: string;
  adminName?: string;
  createdAt: Date;
}

// Ödeme Yöntemi
export type PaymentMethod =
  | "credit-card"
  | "bank-transfer"
  | "cash-on-delivery";

// Ödeme Durumu
export type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded";

// Ödeme Durumu Konfigürasyonu
export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, {
  label: string;
  color: string;
}> = {
  pending: { label: "Beklemede", color: "amber" },
  processing: { label: "İşleniyor", color: "blue" },
  completed: { label: "Tamamlandı", color: "green" },
  failed: { label: "Hata", color: "red" },
  refunded: { label: "İade Edildi", color: "orange" },
};

// Sipariş Öğesi
export interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  price: number;
  total: number;
}

// Kargo Bilgisi
export interface ShippingInfo {
  method: "standard" | "express";
  company: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  cost: number;
}

// Sipariş
export interface Order {
  id: string;
  orderNumber: string; // "EZM-2024-000123"
  userId: string;
  customerEmail?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingAddress: Address;
  shippingInfo: ShippingInfo;
  couponCode?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Sipariş Oluşturma Formu
export interface CreateOrderData {
  items: CartItem[];
  shippingAddress: Address;
  shippingMethod: "standard" | "express";
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
}
