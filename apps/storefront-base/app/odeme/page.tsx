"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { formatPrice, cn } from "@/lib/utils";
import { TURKISH_CITIES, SHIPPING_THRESHOLD } from "@/lib/constants";
import { getActivePaymentGateways } from "@/lib/payments";
import { fetchShippingRatesForLocation, getResolvedShippingPrice } from "@/lib/shipping";
import { PaymentGatewayConfig } from "@/types/payment";
import { ShippingRate } from "@/lib/shipping-storage";
import { toast } from "sonner";
import {
  CreditCard,
  Truck,
  Mail,
  MapPin,
  Lock,
  ChevronRight,
  ShieldCheck,
  Package,
  Building2,
  Phone,
  Loader2,
  AlertCircle,
  RotateCcw,
  Check,
  ChevronLeft,
  UserPlus,
  Eye,
  EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type AppliedCoupon = {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  discountAmount: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, shipping: cartShipping, clearCart } = useCart();
  const { user } = useAuth();

  const [paymentGateways, setPaymentGateways] = useState<PaymentGatewayConfig[]>([]);
  const [isLoadingGateways, setIsLoadingGateways] = useState(true);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [contactEmail, setContactEmail] = useState("");
  const [shippingInfo, setShippingInfo] = useState({
    firstName: "",
    lastName: "",
    address: "",
    postalCode: "",
    city: "",
    district: "",
    phone: "",
    country: "Türkiye",
  });

  // Account Creation State
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // Update abandoned cart with customer info when they enter details
  const updateAbandonedCartWithCustomerInfo = async (email: string, firstName: string, lastName: string, phone: string) => {
    if (typeof window === "undefined") return;
    
    const sessionId = localStorage.getItem("celebix_storefront_session_id");
    if (!sessionId) return;

    try {
      await fetch('/api/abandoned-carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          is_anonymous: false,
          status: 'active'
        })
      });
    } catch (error) {
      console.error("Failed to update cart with customer info:", error);
    }
  };

  const [selectedShippingMethod, setSelectedShippingMethod] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");

  // Step State (1: Delivery, 2: Payment)
  const [currentStep, setCurrentStep] = useState(1);
  const [paytrIframeUrl, setPaytrIframeUrl] = useState<string | null>(null);
  const discountAmount = appliedCoupon?.discountAmount || 0;
  const selectedShippingRate =
    shippingRates.find((rate) => rate.id === selectedShippingMethod) ?? shippingRates[0] ?? null;
  const resolvedShippingCost = selectedShippingRate
    ? getResolvedShippingPrice(selectedShippingRate, subtotal)
    : cartShipping;
  const finalTotal = Math.max(0, subtotal + resolvedShippingCost - discountAmount);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError("");
  }, [subtotal]);

  // Load user data if logged in
  useEffect(() => {
    if (user) {
      // User is logged in, fetch customer data
      const loadUserData = async () => {
        const { data: customer } = await supabase
          .from("customers")
          .select("*")
          .eq("user_id", user.id)
          .single();
        
        if (customer) {
          setContactEmail(user.email || "");
          setShippingInfo(prev => ({
            ...prev,
            firstName: customer.first_name || "",
            lastName: customer.last_name || "",
            phone: customer.phone || "",
          }));
        }
      };
      loadUserData();
    }
  }, [user]);

  useEffect(() => {
    const initData = async () => {
      try {
        setIsLoadingGateways(true);
        const [gateways, rates] = await Promise.all([
          getActivePaymentGateways(),
          fetchShippingRatesForLocation({
            country: shippingInfo.country,
            city: shippingInfo.city,
          })
        ]);

        setPaymentGateways(gateways);
        setShippingRates(rates);

        setSelectedShippingMethod((current) =>
          rates.some((rate) => rate.id === current) ? current : (rates[0]?.id ?? "")
        );
      } catch (error) {
        setShippingRates([]);
        setSelectedShippingMethod("");
        toast.error("İşlem sırasında bir hata oluştu.");
      } finally {
        setIsLoadingGateways(false);
      }
    };

    initData();
  }, [shippingInfo.country, shippingInfo.city]);

  const handleNextStep = () => {
    if (!contactEmail || !contactEmail.includes("@")) {
      toast.error("Geçerli bir e-posta adresi giriniz.");
      return;
    }
    if (!shippingInfo.firstName || !shippingInfo.lastName) {
      toast.error("Ad ve Soyad alanları zorunludur.");
      return;
    }
    if (!shippingInfo.phone) {
      toast.error("Telefon numarası zorunludur.");
      return;
    }
    if (false) {
      toast.error("Adres ve Şehir alanları zorunludur.");
      return;
    }
    if (!shippingInfo.address || !shippingInfo.city || !shippingInfo.district) {
      toast.error("Adres, şehir ve ilçe alanları zorunludur.");
      return;
    }

    if (!selectedShippingMethod || shippingRates.length === 0) {
      toast.error("Bu teslimat bölgesi için kargo seçeneği bulunamadı.");
      return;
    }

    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError("Lütfen bir kupon kodu girin.");
      return;
    }

    setIsApplyingCoupon(true);
    setCouponError("");

    try {
      const response = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Kupon doğrulanamadı.");
      }

      setAppliedCoupon({
        code: result.coupon.code,
        type: result.coupon.type,
        value: result.coupon.value,
        discountAmount: Number(result.discountAmount) || 0,
      });
      setCouponInput(result.coupon.code);
      toast.success("Kupon başarıyla uygulandı.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kupon uygulanamadı.";
      setAppliedCoupon(null);
      setCouponError(message);
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const getAbandonedCartSessionId = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("celebix_storefront_session_id");
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
    setCouponInput("");
  };

  const handleCompleteOrder = async () => {
    if (!selectedPaymentMethod) {
      toast.error("Lütfen bir ödeme yöntemi seçiniz.");
      return;
    }

    // Validate account creation fields if checked
    if (!user && createAccount) {
      if (!accountPassword || accountPassword.length < 6) {
        toast.error("Şifre en az 6 karakter olmalıdır.");
        return;
      }
      if (accountPassword !== accountPasswordConfirm) {
        toast.error("Şifreler eşleşmiyor.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let customerId = null;
      let userId = user?.id || null;

      // Create account if requested and not logged in
      if (!user && createAccount) {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: contactEmail,
            password: accountPassword,
            metadata: {
              first_name: shippingInfo.firstName,
              last_name: shippingInfo.lastName,
              phone: shippingInfo.phone,
            },
          }),
        });
        const registerResult = await registerResponse.json().catch(() => ({}));

        if (!registerResponse.ok) {
          const message = registerResult.error || "Hesap oluşturulurken bir hata oluştu.";
          if (message.includes("zaten kayıtlı")) {
            toast.error("Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın.");
          } else {
            toast.error("Hesap oluşturulurken bir hata oluştu: " + message);
          }
          setIsSubmitting(false);
          return;
        }

        if (registerResult.user) {
          userId = registerResult.user.id;
          
          // Create customer record linked to the new user
          const { data: customerData, error: customerError } = await supabase
            .from("customers")
            .insert({
              user_id: registerResult.user.id,
              email: contactEmail,
              first_name: shippingInfo.firstName,
              last_name: shippingInfo.lastName,
              phone: shippingInfo.phone,
              status: "active",
            })
            .select()
            .single();

          if (customerError) {
            console.error("Error creating customer:", customerError);
          } else {
            customerId = customerData.id;
          }
        }
      } else if (user) {
        // Get existing customer ID for logged-in user
        const { data: customer } = await supabase
          .from("customers")
          .select("id")
          .eq("user_id", user.id)
          .single();
        
        if (customer) {
          customerId = customer.id;
        }
      }

      const orderData = {
        customerId,
        userId,
        items: items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.product.name,
          variantName: item.variant.name,
          price: item.unitPrice,
          quantity: item.quantity,
          total: item.unitPrice * item.quantity,
          category: item.product.category,
          customization: item.customization || null,
        })),
        shippingAddress: shippingInfo,
        billingAddress: shippingInfo,
        paymentMethod: selectedPaymentMethod,
        shippingCost: resolvedShippingCost,
        discount: discountAmount,
        couponCode: appliedCoupon?.code || null,
        notes: createAccount ? "Hesap oluşturuldu" : "",
        contactEmail,
        receiveUpdates: true,
        createAccount: !user && createAccount,
        shippingMethod: selectedShippingRate ? {
          id: selectedShippingRate.id,
          name: selectedShippingRate.name,
          estimatedDays: selectedShippingRate.estimatedDays || null,
        } : null,
        abandonedCartSessionId: getAbandonedCartSessionId()
      };

      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.payment?.action === "iframe" && result.payment?.iframeUrl) {
        setPaytrIframeUrl(result.payment.iframeUrl);
        setCurrentStep(2);
        toast.success("PayTR güvenli ödeme ekranı hazır.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (result.payment?.action === "redirect" && result.payment?.redirectUrl) {
        clearCart({ preserveServerCart: true });
        window.location.href = result.payment.redirectUrl;
        return;
      }

      toast.success(createAccount 
        ? "Siparişiniz alındı! Hesabınız başarıyla oluşturuldu." 
        : "Siparişiniz başarıyla alındı!"
      );
      clearCart({ preserveServerCart: true });
      router.push(`/siparisler/${result.order.id}?new=true`);
    } catch (error) {
      toast.error("Bir bağlantı hatası oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Kopyalandı!");
  };

  const getGatewayType = (id: string) => {
    return paymentGateways.find(g => g.id === id)?.gateway;
  };

  const isCardLikeGateway = (gatewayType?: string) => {
    return Boolean(gatewayType && !["bank_transfer", "cod"].includes(gatewayType));
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Sepetiniz Boş</h1>
          <Link href="/urunler" className="text-primary hover:underline underline-offset-4">Alışverişe Devam Et</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans pb-20">

      {/* Header Removed as requested */}

      <main className="container mx-auto max-w-[1200px] px-4 md:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column (Forms) */}
          <div className="lg:col-span-8 space-y-8">

            {/* Breadcrumbs - Moved here since header is gone */}
            {/* Keeping it subtle as a navigation aid */}
            <div className="flex items-center gap-3 mb-2">
              <div onClick={() => currentStep === 2 && setCurrentStep(1)} className={cn("flex items-center gap-2 cursor-pointer transition-colors", currentStep === 1 ? "text-primary font-bold" : "text-gray-500 font-medium")}>
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs", currentStep === 1 ? "bg-primary text-white" : "bg-emerald-100 text-emerald-600")}>
                  {currentStep > 1 ? <Check className="h-4 w-4" /> : "1"}
                </div>
                <span className="hidden sm:inline">Teslimat</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
              <div className={cn("flex items-center gap-2", currentStep === 2 ? "text-primary font-bold" : "text-gray-400 font-medium")}>
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs", currentStep === 2 ? "bg-primary text-white" : "bg-gray-100 text-gray-400")}>
                  2
                </div>
                <span className="hidden sm:inline">Ödeme</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {currentStep === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white rounded-[1.5rem] shadow-sm p-8"
                >
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-700">
                      <Truck className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Teslimat Bilgileri</h2>
                      <p className="text-sm text-gray-500">Siparişinizin gönderileceği adres</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600">Ad</label>
                        <input
                          type="text"
                          value={shippingInfo.firstName}
                          onChange={(e) => {
                            setShippingInfo({ ...shippingInfo, firstName: e.target.value });
                            updateAbandonedCartWithCustomerInfo(
                              contactEmail,
                              e.target.value,
                              shippingInfo.lastName,
                              shippingInfo.phone
                            );
                          }}
                          placeholder="Adınız"
                          className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600">Soyad</label>
                        <input
                          type="text"
                          value={shippingInfo.lastName}
                          onChange={(e) => {
                            setShippingInfo({ ...shippingInfo, lastName: e.target.value });
                            updateAbandonedCartWithCustomerInfo(
                              contactEmail,
                              shippingInfo.firstName,
                              e.target.value,
                              shippingInfo.phone
                            );
                          }}
                          placeholder="Soyadınız"
                          className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-600">E-posta</label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => {
                          setContactEmail(e.target.value);
                          updateAbandonedCartWithCustomerInfo(
                            e.target.value,
                            shippingInfo.firstName,
                            shippingInfo.lastName,
                            shippingInfo.phone
                          );
                        }}
                        placeholder="ornek@email.com"
                        disabled={!!user}
                        className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>

                    {/* Account Creation - Only for non-logged in users */}
                    {!user && (
                      <div className="space-y-4">
                        <label className="flex items-start gap-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 cursor-pointer hover:bg-emerald-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={createAccount}
                            onChange={(e) => setCreateAccount(e.target.checked)}
                            className="mt-0.5 w-5 h-5 text-emerald-600 border-emerald-300 rounded focus:ring-emerald-500 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <UserPlus className="w-4 h-4 text-emerald-600" />
                              <span className="font-semibold text-gray-900">Hesap Oluştur</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              Sonraki alışverişlerinizde hızlı checkout için şifrenizi belirleyin
                            </p>
                          </div>
                        </label>

                        {/* Password Fields - Only when account creation is checked */}
                        <AnimatePresence>
                          {createAccount && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-4 overflow-hidden"
                            >
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Şifre Oluştur</label>
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                  <input
                                    type={showPassword ? "text" : "password"}
                                    value={accountPassword}
                                    onChange={(e) => setAccountPassword(e.target.value)}
                                    placeholder="En az 6 karakter"
                                    minLength={6}
                                    className="w-full h-12 pl-12 pr-12 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                  >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Şifre Tekrar</label>
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                  <input
                                    type={showPassword ? "text" : "password"}
                                    value={accountPasswordConfirm}
                                    onChange={(e) => setAccountPasswordConfirm(e.target.value)}
                                    placeholder="Şifrenizi tekrar girin"
                                    className="w-full h-12 pl-12 pr-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                                  />
                                </div>
                              </div>
                              <p className="text-xs text-gray-500">
                                Hesap oluşturarak{" "}
                                <Link href="/kullanim-kosullari" className="text-primary hover:underline" target="_blank">
                                  Kullanım Koşulları
                                </Link>
                                {" "}ve{" "}
                                <Link href="/gizlilik" className="text-primary hover:underline" target="_blank">
                                  Gizlilik Politikası
                                </Link>
                                {" "}nı kabul etmiş olursunuz.
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-600">Telefon</label>
                      <input
                        type="tel"
                        value={shippingInfo.phone}
                        onChange={(e) => {
                          setShippingInfo({ ...shippingInfo, phone: e.target.value });
                          updateAbandonedCartWithCustomerInfo(
                            contactEmail,
                            shippingInfo.firstName,
                            shippingInfo.lastName,
                            e.target.value
                          );
                        }}
                        placeholder="05XX XXX XX XX"
                        className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-600">Adres</label>
                      <input
                        type="text"
                        value={shippingInfo.address}
                        onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })}
                        placeholder="Sokak, Mahalle, Bina No"
                        className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                      />
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2 relative">
                        <label className="text-sm font-medium text-gray-600">Şehir</label>
                        <select
                          value={shippingInfo.city}
                          onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })}
                          className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300 appearance-none cursor-pointer"
                        >
                          <option value="">Seçiniz</option>
                          {TURKISH_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="absolute right-4 bottom-3.5 pointer-events-none text-gray-400">
                          <ChevronRight className="h-4 w-4 rotate-90" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600">İlçe</label>
                        <input
                          type="text"
                          value={shippingInfo.district}
                          onChange={(e) => setShippingInfo({ ...shippingInfo, district: e.target.value })}
                          className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                          placeholder="İlçe"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600">Posta Kodu</label>
                        <input
                          type="text"
                          value={shippingInfo.postalCode}
                          onChange={(e) => setShippingInfo({ ...shippingInfo, postalCode: e.target.value })}
                          className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors bg-white text-gray-900 placeholder:text-gray-300"
                          placeholder="34000"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Teslimat Yöntemi</p>
                          <p className="text-xs text-gray-500">Checkout ekranında müşteriye gösterilir.</p>
                        </div>
                        {selectedShippingRate ? (
                          <span className={cn("text-sm font-semibold", resolvedShippingCost === 0 ? "text-emerald-600" : "text-gray-900")}>
                            {resolvedShippingCost === 0 ? "Ücretsiz" : formatPrice(resolvedShippingCost)}
                          </span>
                        ) : null}
                      </div>

                      {shippingRates.length > 0 ? (
                        <div className="space-y-3">
                          {shippingRates.map((rate) => {
                            const ratePrice = getResolvedShippingPrice(rate, subtotal);
                            const isSelected = selectedShippingMethod === rate.id;

                            return (
                              <label
                                key={rate.id}
                                className={cn(
                                  "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all",
                                  isSelected
                                    ? "border-primary bg-white shadow-sm"
                                    : "border-gray-200 bg-white hover:border-gray-300"
                                )}
                              >
                                <input
                                  type="radio"
                                  name="shipping-method"
                                  value={rate.id}
                                  checked={isSelected}
                                  onChange={() => setSelectedShippingMethod(rate.id)}
                                  className="mt-1 h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-gray-900">{rate.name}</span>
                                    <span className={cn("text-sm font-semibold", ratePrice === 0 ? "text-emerald-600" : "text-gray-900")}>
                                      {ratePrice === 0 ? "Ücretsiz" : formatPrice(ratePrice)}
                                    </span>
                                  </div>
                                  {(rate.estimatedDays || rate.minOrder) ? (
                                    <p className="mt-1 text-xs text-gray-500">
                                      {[rate.estimatedDays, rate.minOrder ? `${formatPrice(rate.minOrder)} üzeri ücretsiz` : null]
                                        .filter(Boolean)
                                        .join(" • ")}
                                    </p>
                                  ) : null}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          Bu adres için tanımlı teslimat seçeneği bulunamadı.
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleNextStep}
                      className="w-full bg-primary text-white font-bold h-14 rounded-xl hover:bg-red-800 transition-colors flex items-center justify-center gap-2 mt-4 shadow-lg shadow-primary/20"
                    >
                      Ödemeye Geç <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white rounded-[1.5rem] shadow-sm p-8"
                >
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Ödeme Bilgileri</h2>
                      <p className="text-sm text-gray-500">Güvenli ödeme işlemi</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-3 py-1.5 rounded-full">
                      <Lock className="h-3 w-3" /> SSL Güvenli
                    </div>
                  </div>

                  {paytrIframeUrl ? (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-700">
                        Kart bilgileriniz PayTR güvenli ödeme ekranında alınır; ödeme tamamlandığında sipariş durumunuz otomatik güncellenir.
                      </div>
                      <iframe
                        title="PayTR güvenli ödeme"
                        src={paytrIframeUrl}
                        className="h-[760px] w-full rounded-2xl border border-gray-200 bg-white shadow-sm"
                        allow="payment *; fullscreen"
                      />
                      <a
                        href={paytrIframeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm font-bold text-primary underline underline-offset-4"
                      >
                        Ödeme ekranını yeni sekmede aç
                      </a>
                    </div>
                  ) : (
                    <>
                  {/* VISUAL CREDIT CARD WRAPPER */}
                  <div className="mb-8">
                    {isCardLikeGateway(getGatewayType(selectedPaymentMethod)) && (
                      <div className="w-full max-w-md mx-auto aspect-[1.586] rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-500/20 mb-8 transform transition-transform hover:scale-[1.02] duration-500">
                        {/* Gradient Background */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#ec4899]" />

                        {/* Chip */}
                        <div className="relative w-12 h-9 bg-yellow-400 rounded-lg mb-8 opacity-90 shadow-sm border border-yellow-300/50 flex items-center justify-center">
                          <div className="w-8 h-px bg-yellow-600/30 absolute" />
                          <div className="h-5 w-px bg-yellow-600/30 absolute" />
                        </div>

                        {/* Card Number Dots */}
                        <div className="relative flex gap-4 text-2xl tracking-widest mb-8 font-mono opacity-90">
                          <span>••••</span>
                          <span>••••</span>
                          <span>••••</span>
                          <span>••••</span>
                        </div>

                        {/* Bottom Row */}
                        <div className="relative flex justify-between items-end">
                          <div>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-70 mb-1">Kart Sahibi</p>
                            <p className="font-medium tracking-wide">AD SOYAD</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-70 mb-1">SKT</p>
                            <p className="font-medium tracking-wide">AA/YY</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Method Selection */}
                  <div className="grid grid-cols-1 gap-4 mb-8">
                    {paymentGateways.map(gateway => (
                      <label
                        key={gateway.id}
                        onClick={() => setSelectedPaymentMethod(gateway.id)}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          selectedPaymentMethod === gateway.id ? "border-primary bg-primary/5" : "border-gray-100 hover:border-gray-200"
                        )}
                      >
                        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", selectedPaymentMethod === gateway.id ? "border-primary" : "border-gray-300")}>
                          {selectedPaymentMethod === gateway.id && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                        </div>
                        <div className="flex-1">
                          <span className="font-bold text-gray-900 block">{gateway.name}</span>
                          <span className="text-xs text-gray-400">{gateway.description}</span>
                        </div>
                        {/* Icon */}
                        {gateway.gateway === 'bank_transfer' && <Building2 className="h-5 w-5 text-gray-400" />}
                        {gateway.gateway === 'cod' && <Truck className="h-5 w-5 text-gray-400" />}
                        {isCardLikeGateway(gateway.gateway) && <CreditCard className="h-5 w-5 text-gray-400" />}
                      </label>
                    ))}
                  </div>

                  {/* Selected Gateway Details */}
                  {paymentGateways.find(g => g.id === selectedPaymentMethod)?.gateway === 'bank_transfer' && (
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500 font-medium">Banka</span>
                        <span className="font-bold text-gray-900 text-right">{paymentGateways.find(g => g.id === selectedPaymentMethod)?.bankAccount?.bankName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500 font-medium">Alıcı</span>
                        <span className="font-bold text-gray-900 text-right">{paymentGateways.find(g => g.id === selectedPaymentMethod)?.bankAccount?.accountHolder}</span>
                      </div>
                      <div className="pt-4 border-t border-gray-200">
                        <p className="text-xs text-gray-500 font-bold uppercase mb-2">IBAN</p>
                        <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                          <code className="font-mono font-bold text-gray-900 break-all">{paymentGateways.find(g => g.id === selectedPaymentMethod)?.bankAccount?.iban}</code>
                          <button onClick={() => copyToClipboard(paymentGateways.find(g => g.id === selectedPaymentMethod)?.bankAccount?.iban || "")} className="text-primary text-sm font-bold hover:underline shrink-0 ml-2">Kopyala</button>
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Sipariş numaranızı açıklama kısmına yazmayı unutmayınız.
                      </div>
                    </div>
                  )}

                  {isCardLikeGateway(getGatewayType(selectedPaymentMethod)) && selectedPaymentMethod && (
                    <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm font-medium text-center animate-in fade-in">
                      Ödeme butonuna tıkladıktan sonra güvenli 3D Secure ekranına yönlendirileceksiniz.
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-8">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="flex-1 h-14 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Geri
                    </button>
                    <button
                      onClick={handleCompleteOrder}
                      disabled={isSubmitting}
                      className="flex-[2] h-14 bg-primary text-white font-bold rounded-xl hover:bg-red-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-primary/20"
                    >
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4 w-4" />}
                      {formatPrice(finalTotal)} Öde
                    </button>
                  </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>



          </div>

          {/* Right Column (Summary) */}
          <div className="lg:col-span-4 relative">
            <div className="sticky top-8 space-y-6">

              <h2 className="text-lg font-bold text-gray-900">Sipariş Özeti</h2>

              <div className="bg-white rounded-[1.5rem] shadow-sm p-6">
                <div className="space-y-6">
                  {/* Items */}
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {items.map(item => (
                      <div key={item.id} className="flex gap-4 group">
                        <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center text-2xl border border-gray-100 shrink-0 overflow-hidden">
                          {item.product.images && item.product.images.length > 0 ? (
                            <img src={item.product.images[0]} alt={item.product.name} className="w-full h-full object-cover" />
                          ) : (
                            <>
                              {item.product.category === "fistik-ezmesi" && "🥜"}
                              {item.product.category === "findik-ezmesi" && "🌰"}
                              {item.product.category === "kuruyemis" && "🥔"}
                            </>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 py-1">
                          <h4 className="font-bold text-gray-900 text-sm truncate">{item.product.name}</h4>
                          <p className="text-xs text-gray-500">{item.variant.name}</p>
                          {item.customization?.selections?.length ? (
                            <div className="mt-1 text-[11px] text-gray-600 space-y-0.5">
                              {item.customization.selections.map((selection, idx) => (
                                <p key={idx}>
                                  <span className="font-semibold">{selection.step_label}:</span>{" "}
                                  {selection.display_value}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-600">Adet: {item.quantity}</span>
                            <span className="font-bold text-gray-900 text-sm">{formatPrice(item.unitPrice * item.quantity)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="h-px bg-gray-100" />

                  {/* Totals table */}
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-gray-600 font-medium">
                      <span>Ara Toplam</span>
                      <span className="text-gray-900 font-bold">{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 font-medium">
                      <span>Kargo</span>
                      <span className={resolvedShippingCost === 0 ? "text-emerald-600 font-bold" : "text-gray-900 font-bold"}>
                        {resolvedShippingCost === 0 ? "0 ₺" : formatPrice(resolvedShippingCost)}
                      </span>
                    </div>
                    {selectedShippingRate ? (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{selectedShippingRate.name}</span>
                        <span>{selectedShippingRate.estimatedDays || ""}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-gray-600 font-medium">
                      <span>İndirim</span>
                      <span className="text-emerald-600 font-bold">
                        -{discountAmount > 0 ? formatPrice(discountAmount) : "0 ₺"}
                      </span>
                    </div>
                  </div>

                  {/* Dark Total Box - Using Primary Brand Color as base */}
                  {/* Total Box - Nude Theme */}
                  <div className="bg-[#F5E6E0] rounded-xl p-5 flex justify-between items-center text-[#7B1113] shadow-sm">
                    <span className="font-bold text-lg">Toplam</span>
                    <span className="font-black text-2xl tracking-tight">{formatPrice(finalTotal)}</span>
                  </div>

                  {/* Discount Code */}
                  <div className="pt-2">
                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">İndirim Kodu</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                        placeholder="Kodu girin"
                        disabled={isApplyingCoupon}
                        className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-primary focus:ring-1 bg-gray-50"
                      />
                      {appliedCoupon ? (
                        <button
                          type="button"
                          onClick={removeCoupon}
                          className="px-4 h-10 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50"
                        >
                          Kaldır
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={isApplyingCoupon}
                          className="px-4 h-10 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {isApplyingCoupon ? "Kontrol..." : "Uygula"}
                        </button>
                      )}
                    </div>
                    {appliedCoupon && (
                      <p className="mt-2 text-xs text-emerald-600 font-medium">
                        {appliedCoupon.code} uygulandı: -{formatPrice(discountAmount)}
                      </p>
                    )}
                    {!!couponError && <p className="mt-2 text-xs text-rose-600 font-medium">{couponError}</p>}
                  </div>

                  <div className="flex items-center gap-2 justify-center text-[10px] text-gray-400 mt-2">
                    <Lock className="h-3 w-3" /> Ödemeniz güvenli bir şekilde işlenir
                  </div>

                </div>
              </div>

            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
