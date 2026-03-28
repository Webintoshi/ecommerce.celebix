"use client";

import { useState, useEffect } from "react";
import { Shield, Trash2, UserPlus, AlertCircle, CheckCircle2, Loader2, Info } from "lucide-react";
import { ROLES, UserRole, getRoleLabel } from "@/lib/permissions";
import { STORE_RUNTIME } from "@/lib/store-runtime";

interface AdminUser {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    task_definition: string;
    created_at: string;
}

export default function AdminsPage() {
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Form Stats
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newName, setNewName] = useState("");
    const [newRole, setNewRole] = useState<UserRole>("product_manager");
    const [newTaskDef, setNewTaskDef] = useState("");

    useEffect(() => {
        loadAdmins();
    }, []);

    const loadAdmins = async () => {
        try {
            const res = await fetch("/api/admin/users");
            const data = await res.json();
            if (data.success) {
                setAdmins(data.admins);
            } else {
                console.error("Failed to load admins:", data.error);
            }
        } catch (error) {
            console.error("Error loading admins:", error);
            // Handle error appropriately if needed, or just log
            // Error variable is now used
        } finally {
            setLoading(false);
        }
    };

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage(null);

        // Basic validation
        if (newPassword.length < 6) {
            setMessage({ type: "error", text: "Şifre en az 6 karakter olmalıdır." });
            setSubmitting(false);
            return;
        }

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: newEmail,
                    password: newPassword,
                    fullName: newName,
                    role: newRole,
                    taskDefinition: newTaskDef
                })
            });

            const data = await res.json();

            if (data.success) {
                setMessage({ type: "success", text: data.message });
                setNewEmail("");
                setNewPassword("");
                setNewName("");
                setNewTaskDef("");
                setNewRole("product_manager");
                loadAdmins();
            } else {
                setMessage({ type: "error", text: data.error });
            }
        } catch (error) {
            console.error("Add admin error:", error);
            setMessage({ type: "error", text: "Bir hata oluştu." });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteAdmin = async (id: string, email: string) => {
        if (!confirm(`${email} yöneticisini silmek istediğinize emin misiniz?`)) return;

        try {
            const res = await fetch(`/api/admin/users?id=${id}`, {
                method: "DELETE"
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: "success", text: "Yönetici silindi." });
                loadAdmins();
            } else {
                setMessage({ type: "error", text: data.error });
            }
        } catch (error) {
            console.error("Delete admin error:", error);
            setMessage({ type: "error", text: "Silme işlemi başarısız." });
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Yöneticiler & Roller</h1>
                    <p className="text-gray-500">
                        Sistem yöneticilerini, yetkilerini ve görev tanımlarını buradan yönetebilirsiniz.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Admin List */}
                <div className="xl:col-span-2 space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-primary" />
                                Mevcut Yöneticiler ({admins.length})
                            </h2>
                        </div>

                        {loading ? (
                            <div className="p-8 flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {admins.map((admin) => (
                                    <div
                                        key={admin.id}
                                        className="p-5 hover:bg-gray-50 transition-colors group"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                                                    {admin.full_name?.[0]?.toUpperCase() || admin.email[0].toUpperCase()}
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-semibold text-gray-900">{admin.full_name}</h3>
                                                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${admin.role === 'super_admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                            admin.role === 'product_manager' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                admin.role === 'order_manager' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                    'bg-gray-50 text-gray-700 border-gray-200'
                                                            }`}>
                                                            {getRoleLabel(admin.role)}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 font-medium">{admin.email}</p>
                                                    {admin.task_definition && (
                                                        <div className="flex items-start gap-1.5 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg mt-2 max-w-md">
                                                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                                                            {admin.task_definition}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {admin.role !== "super_admin" && (
                                                <button
                                                    onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Yöneticiyi Sil"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {admins.length === 0 && (
                                    <div className="p-8 text-center text-gray-500">
                                        Hiç yönetici bulunamadı.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Add Admin Form */}
                <div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-6">
                            <UserPlus className="w-5 h-5 text-primary" />
                            Yeni Yönetici Ekle
                        </h2>

                        {message && (
                            <div
                                className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${message.type === "success"
                                    ? "bg-green-50 text-green-700 border border-green-200"
                                    : "bg-red-50 text-red-700 border border-red-200"
                                    }`}
                            >
                                {message.type === "success" ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                ) : (
                                    <AlertCircle className="w-4 h-4" />
                                )}
                                {message.text}
                            </div>
                        )}

                        <form onSubmit={handleAddAdmin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ad Soyad
                                </label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-400"
                                    placeholder="Örn: Ahmet Yılmaz"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    E-posta Adresi
                                </label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-400"
                                    placeholder={STORE_RUNTIME.defaultAdminEmail}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Şifre
                                </label>
                                <input
                                    type="text"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-400"
                                    placeholder="En az 6 karakter"
                                    required
                                    minLength={6}
                                />
                                <p className="text-xs text-gray-500 mt-1">Yönetici için güvenli bir şifre belirleyin.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Yönetici Rolü
                                </label>
                                <div className="space-y-2">
                                    {Object.entries(ROLES).map(([roleKey, label]) => (
                                        <label
                                            key={roleKey}
                                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${newRole === roleKey
                                                ? "border-primary bg-primary/5 shadow-sm"
                                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="role"
                                                value={roleKey}
                                                checked={newRole === roleKey}
                                                onChange={(e) => setNewRole(e.target.value as UserRole)}
                                                className="mt-1"
                                            />
                                            <div className="text-sm">
                                                <span className={`font-medium block ${newRole === roleKey ? "text-primary" : "text-gray-700"}`}>
                                                    {label}
                                                </span>
                                                <span className="text-gray-500 text-xs leading-tight block mt-0.5">
                                                    {roleKey === 'super_admin' && "Tam yetki. Tüm sistemi yönetebilir."}
                                                    {roleKey === 'product_manager' && "Ürünler, stoklar ve kategorileri yönetir."}
                                                    {roleKey === 'order_manager' && "Siparişleri, müşterileri ve kuponları yönetir."}
                                                    {roleKey === 'content_creator' && "Blog, sayfalar ve medya içeriklerini yönetir."}
                                                </span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Görev Tanımı (Opsiyonel)
                                </label>
                                <textarea
                                    value={newTaskDef}
                                    onChange={(e) => setNewTaskDef(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-400 min-h-[80px] text-sm resize-none"
                                    placeholder="Örn: Sadece kargo süreçlerini takip edecek."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                            >
                                {submitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <UserPlus className="w-4 h-4" />
                                        Yöneticiyi Kaydet
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
