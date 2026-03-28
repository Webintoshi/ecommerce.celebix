"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    CheckCircle2,
    CircleAlert,
    Printer,
    Download,
    Loader2,
    RefreshCw,
} from "lucide-react";
import type { OrderActivityLog as OrderActivityLogType, OrderStatus } from "@/types/order";
import {
    OrderStatusSection,
    OrderActivityLog,
    CustomerInfoCard,
    ShippingInfoCard,
    InternalNotes,
    OrderItemsList,
} from "@/components/admin/order-detail";
import type { AccountingOrderSnapshot } from "@/types/accounting";
import type { OrderItemCustomization } from "@/types/product-customization";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import "./print.css";

interface Order {
    id: string;
    order_number: string;
    status: OrderStatus;
    payment_method: string;
    payment_status: string;
    subtotal: number;
    shipping_cost: number;
    discount: number;
    total: number;
    notes?: string;
    internal_notes?: string;
    shipping_carrier?: string;
    tracking_number?: string;
    estimated_delivery?: string;
    shipping_address?: {
        firstName?: string;
        lastName?: string;
        address?: string;
        city?: string;
        country?: string;
        phone?: string;
        email?: string;
    };
    billing_address?: unknown;
    created_at: string;
    updated_at: string;
}

interface OrderItem {
    id: string;
    product_name: string;
    variant_name?: string;
    price: number;
    quantity: number;
    total: number;
    customizations?: OrderItemCustomization[];
    product?: {
        id?: string;
        images?: string[];
        category?: string;
        slug?: string;
    };
}

interface Customer {
    id: string;
    email: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    total_orders?: number;
    total_spent?: number;
}

interface CustomerOrder {
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
}

interface OrderDetailClientProps {
    order: Order;
    items: OrderItem[];
    activityLogs: OrderActivityLogType[];
    customer: Customer | null;
    customerOrders: CustomerOrder[];
    paymentMethodName: string;
    statusConfig: { label: string; color: string };
    accountingSnapshot: AccountingOrderSnapshot | null;
}


export function OrderDetailClient({
    order,
    items,
    activityLogs,
    customer,
    customerOrders,
    paymentMethodName,
    statusConfig,
    accountingSnapshot,
}: OrderDetailClientProps) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [isAccountingActionLoading, setIsAccountingActionLoading] = useState(false);

    const [notes, setNotes] = useState(
        activityLogs.filter(
            (log) => log.action === "note_added" || log.action === "note_updated"
        )
    );
    const [logs, setLogs] = useState<OrderActivityLogType[]>(activityLogs);

    // Format activity logs for display
    const formattedLogs = logs.map((log) => ({
        ...log,
        adminName: log.adminName || "Admin",
    }));

    // Handle status change
    const handleStatusChange = async (newStatus: OrderStatus) => {
        const response = await fetch(`/api/admin/orders/${order.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });

        if (response.ok) {
            // Add new activity log
            const newLog: OrderActivityLogType = {
                id: crypto.randomUUID(),
                orderId: order.id,
                action: "status_changed",
                oldValue: order.status,
                newValue: newStatus,
                adminName: "Admin",
                createdAt: new Date(),
            };
            setLogs([newLog, ...logs]);

            // Refresh page data
            startTransition(() => {
                router.refresh();
            });
        }
    };

    // Handle tracking update
    const handleTrackingUpdate = async (data: { carrier: string; trackingNumber: string }) => {
        const response = await fetch(`/api/admin/orders/${order.id}/shipping`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            const newLog: OrderActivityLogType = {
                id: crypto.randomUUID(),
                orderId: order.id,
                action: "shipping_updated",
                newValue: data,
                adminName: "Admin",
                createdAt: new Date(),
            };
            setLogs([newLog, ...logs]);

            startTransition(() => {
                router.refresh();
            });
        }
    };

    // Handle note add
    const handleAddNote = async (text: string) => {
        const response = await fetch(`/api/admin/orders/${order.id}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, adminName: "Admin" }),
        });

        if (response.ok) {
            const { activityLog } = await response.json();
            const newLog: OrderActivityLogType = {
                ...activityLog,
                orderId: order.id,
                adminName: "Admin",
                createdAt: new Date(activityLog.createdAt),
            };
            setNotes([newLog, ...notes]);
            setLogs([newLog, ...logs]);
        }
    };

    // Handle note update
    const handleUpdateNote = async (noteId: string, text: string) => {
        const response = await fetch(`/api/admin/orders/${order.id}/notes`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noteId, text }),
        });

        if (response.ok) {
            setNotes(
                notes.map((n) =>
                    n.id === noteId
                        ? { ...n, newValue: { text } }
                        : n
                )
            );
        }
    };

    // Handle note delete
    const handleDeleteNote = async (noteId: string) => {
        const response = await fetch(`/api/admin/orders/${order.id}/notes?noteId=${noteId}`, {
            method: "DELETE",
        });

        if (response.ok) {
            setNotes(notes.filter((n) => n.id !== noteId));
        }
    };

    const formattedDate = (() => {
        try {
            const date = new Date(order.created_at);
            if (isNaN(date.getTime())) return "Bilinmiyor";
            return date.toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "Bilinmiyor";
        }
    })();

    const accountingStatusLabel: Record<string, string> = {
        idle: "Henüz Kuyruğa Alınmadı",
        queued: "Kuyrukta",
        syncing: "Senkron Ediliyor",
        synced: "Senkronlandı",
        failed: "Hata",
        manual_action_required: "Manuel Müdahale Gerekli",
    };

    const triggerInvoiceCreation = async () => {
        setIsAccountingActionLoading(true);
        try {
            const response = await fetch("/api/admin/accounting/invoices/create-from-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result?.error || "Fatura islemi basarisiz.");
            }
            window.alert("Fatura adayi olusturuldu ve senkron tetiklendi.");
            startTransition(() => {
                router.refresh();
            });
        } catch (error) {
            window.alert(error instanceof Error ? error.message : "Fatura olusturulamadi.");
        } finally {
            setIsAccountingActionLoading(false);
        }
    };

    return (
        <div className="space-y-5 animate-in fade-in duration-500">
            {/* Print Header - Only visible when printing */}
            <div className="hidden print:block text-center mb-6 pb-4 border-b-2 border-black">
                <h1 className="text-2xl font-bold">{STORE_RUNTIME.name}</h1>
                <p className="text-sm mt-1">Sipariş #{order.order_number}</p>
                <p className="text-sm text-gray-600">{formattedDate}</p>
            </div>

            {/* Top Navigation & Status */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/siparisler"
                        className="p-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl shadow-sm transition-all"
                    >
                        <ArrowLeft className="w-4 h-4 text-gray-500" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight">
                                #{order.order_number}
                            </h1>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusConfig.color}`}>
                                {statusConfig.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{formattedDate}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/siparisler/${order.id}/yazdir`}
                        target="_blank"
                        className="h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all flex items-center gap-1.5"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Yazdır</span>
                    </Link>
                    <button
                        onClick={() => {
                            alert("Fatura indiriliyor...");
                        }}
                        className="h-9 px-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-red-800 transition-all flex items-center gap-1.5"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Fatura</span>
                    </button>
                </div>
            </div>

            {/* Timeline & Quick Actions - Combined */}
            <OrderStatusSection
                currentStatus={order.status}
                orderId={order.id}
                orderNumber={order.order_number}
                customerEmail={order.shipping_address?.email}
                customerPhone={order.shipping_address?.phone}
                onStatusChange={handleStatusChange}
            />

            {/* Accounting Snapshot */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Muhasebe Durumu</h3>
                        <p className="text-xs text-gray-500">Fatura entegrasyonu ve senkron bilgisi</p>
                    </div>
                    <button
                        onClick={triggerInvoiceCreation}
                        disabled={isAccountingActionLoading}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
                    >
                        {isAccountingActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Fatura Kes
                    </button>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Ödeme Yöntemi</p>
                        <p className="font-semibold text-gray-900">{paymentMethodName}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Senkron Durumu</p>
                        <p className="font-semibold text-gray-900 flex items-center gap-2">
                            {accountingSnapshot?.syncStatus === "synced" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                                <CircleAlert className="w-4 h-4 text-amber-500" />
                            )}
                            {accountingStatusLabel[accountingSnapshot?.syncStatus || "idle"]}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Sağlayıcı</p>
                        <p className="font-semibold text-gray-900">{accountingSnapshot?.provider || "-"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Fatura Numarası</p>
                        <p className="font-semibold text-gray-900">{accountingSnapshot?.invoiceNo || "-"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Fatura Linki</p>
                        {accountingSnapshot?.invoiceUrl ? (
                            <a
                                href={accountingSnapshot.invoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-blue-600 hover:underline break-all"
                            >
                                Görüntüle
                            </a>
                        ) : (
                            <p className="font-semibold text-gray-900">-</p>
                        )}
                    </div>
                </div>

                {accountingSnapshot?.lastError && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {accountingSnapshot.lastError}
                    </div>
                )}
            </div>

            {/* Order Items - Full Width */}
            <OrderItemsList
                items={items}
                subtotal={order.subtotal}
                shippingCost={order.shipping_cost}
                discount={order.discount}
                total={order.total}
            />

            {/* Middle Section: Customer & Shipping - More Compact */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Customer Info - Takes 2 columns on large screens */}
                {customer && (
                    <div className="lg:col-span-2">
                        <CustomerInfoCard
                            customer={{
                                id: customer.id,
                                firstName: customer.first_name,
                                lastName: customer.last_name,
                                email: customer.email,
                                phone: customer.phone,
                                totalOrders: customer.total_orders,
                                totalSpent: customer.total_spent,
                            }}
                            customerOrders={customerOrders.map((o) => ({
                                id: o.id,
                                orderNumber: o.order_number,
                                status: o.status,
                                total: o.total,
                                createdAt: o.created_at,
                            }))}
                        />
                    </div>
                )}

                {/* Shipping Info - Compact */}
                <div className="lg:col-span-1">
                    <ShippingInfoCard
                        trackingNumber={order.tracking_number}
                        carrier={order.shipping_carrier}
                        estimatedDelivery={order.estimated_delivery}
                        shippingAddress={order.shipping_address}
                        onTrackingUpdate={handleTrackingUpdate}
                    />
                </div>
            </div>

            {/* Bottom Section: Activity Log & Notes - Side by Side with better use of space */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Activity Log */}
                <OrderActivityLog activities={formattedLogs} />

                {/* Internal Notes */}
                <InternalNotes
                    notes={notes.map((n) => ({
                        id: n.id,
                        text: n.newValue?.text || "",
                        adminName: n.adminName,
                        createdAt: new Date(n.createdAt),
                    }))}
                    customerNote={order.notes}
                    onAddNote={handleAddNote}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                    currentAdminName="Admin"
                />
            </div>

            {/* Print Footer - Only visible when printing */}
            <div className="hidden print:block text-center mt-6 pt-4 border-t border-gray-300 text-xs text-gray-500">
                <p>{STORE_RUNTIME.name} | {STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "")}</p>
                <p>Bu belge bilgisayar ortamında otomatik olarak üretilmiştir.</p>
            </div>
        </div>
    );
}
