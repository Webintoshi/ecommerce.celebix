"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import { formatPrice, cn } from "@/lib/utils";
import { TURKISH_CITIES } from "@/lib/constants";
import { getActivePaymentGateways } from "@/lib/payments";
import { fetchShippingRatesForLocation, getResolvedShippingPrice } from "@/lib/shipping";
import { PaymentGatewayConfig } from "@/types/payment";
import { ShippingRate } from "@/lib/shipping-storage";
import { isStorefrontAbandonedCartDisabled, isStorefrontCustomerAuthMigrationRequired } from "@/lib/supabase-disconnect-readiness";
import { buildRegisterBridgePath } from "@/lib/customer-auth-links";
import { toast } from "sonner";
import {
  CreditCard,
  Truck,
  Lock,
  ChevronRight,
  Building2,
  Loader2,
  AlertCircle,
  UserPlus,
  Eye,
  EyeOff,
  ShoppingBag,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckoutStepIndicator } from "@/components/checkout/CheckoutStepIndicator";
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary";
import { CheckoutDeliveryRecap } from "@/components/checkout/CheckoutDeliveryRecap";
import { CheckoutMobileSummary } from "@/components/checkout/CheckoutMobileSummary";
import { useStoreInfo } from "@/lib/store-info-context";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { getCheckoutPaymentLogo } from "@/lib/checkout-payment-logos";
import {
  checkoutCardClass,
  checkoutFieldClass,
  checkoutLabelClass,
  checkoutPrimaryButtonClass,
  checkoutSecondaryButtonClass,
} from "@/lib/checkout-ui";

type AppliedCoupon = {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  discountAmount: number;
};

type AccountAddress = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  postal_code?: string | null;
  is_default?: boolean;
};

type AccountCustomerSnapshot = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  addresses?: AccountAddress[];
};

export default function CheckoutPage() {
  const router = useRouter();
  const {
    items,
    subtotal,
    shipping: cartShipping,
    clearCart,
    freeShippingRemaining,
    freeShippingProgress,
  } = useCart();
  const { user } = useAuth();
  const { storeInfo } = useStoreInfo();
  const checkoutLogoSrc = resolveStorefrontAssetUrl(
    storeInfo?.logoUrl || STOREFRONT_RUNTIME.logoPath,
  );
  const checkoutStoreName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const customerAuthMigrationRequired = isStorefrontCustomerAuthMigrationRequired();
  const logtoCustomerAuthEnabled = isLogtoCustomerAuthEnabled();
  const abandonedCartDisabled = isStorefrontAbandonedCartDisabled();

  const [paymentGateways, setPaymentGateways] = useState<PaymentGatewayConfig[]>([]);
  const [isLoadingGateways, setIsLoadingGateways] = useState(true);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountSnapshot, setAccountSnapshot] = useState<AccountCustomerSnapshot | null>(null);

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
    if (abandonedCartDisabled) return;
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
    if (customerAuthMigrationRequired) {
      return;
    }

    if (user) {
      const loadUserData = async () => {
        try {
          const response = await fetch("/api/account", {
            cache: "no-store",
            credentials: "same-origin",
          });
          const payload = await response.json().catch(() => ({}));

          if (!response.ok || !payload?.customer) {
            setContactEmail(user.email || "");
            return;
          }

          const customer = payload.customer as AccountCustomerSnapshot;
          const defaultAddress =
            customer.addresses?.find((address) => address.is_default) ?? customer.addresses?.[0] ?? null;

          setAccountSnapshot(customer);
          setContactEmail(customer.email || user.email || "");
          setShippingInfo((prev) => ({
            ...prev,
            firstName: customer.first_name || defaultAddress?.first_name || prev.firstName,
            lastName: customer.last_name || defaultAddress?.last_name || prev.lastName,
            phone: customer.phone || defaultAddress?.phone || prev.phone,
            address: defaultAddress?.address || prev.address,
            city: defaultAddress?.city || prev.city,
            district: defaultAddress?.district || prev.district,
            postalCode: defaultAddress?.postal_code || prev.postalCode,
          }));
        } catch (error) {
          setContactEmail(user.email || "");
        }
      };
      void loadUserData();
    }
  }, [customerAuthMigrationRequired, user]);

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
    if (!customerAuthMigrationRequired && !logtoCustomerAuthEnabled && !user && createAccount) {
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
      let customerId =
        accountSnapshot?.id ||
        (typeof user?.app_metadata === "object" && user.app_metadata
          ? String(Reflect.get(user.app_metadata, "customer_id") || "") || null
          : null);
      let userId = user?.id || null;

      // Create account if requested and not logged in
      if (!customerAuthMigrationRequired && !logtoCustomerAuthEnabled && !user && createAccount) {
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
          const customerResponse = await fetch("/api/customers/create-from-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: contactEmail,
              first_name: shippingInfo.firstName,
              last_name: shippingInfo.lastName,
              phone: shippingInfo.phone,
              user_id: registerResult.user.id,
            }),
          });
          const customerPayload = await customerResponse.json().catch(() => ({}));
          customerId = customerPayload?.customer?.id || null;
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
        notes:
          !customerAuthMigrationRequired && !logtoCustomerAuthEnabled && createAccount
            ? "Hesap oluşturuldu"
            : "",
        contactEmail,
        receiveUpdates: true,
        createAccount:
          !customerAuthMigrationRequired && !logtoCustomerAuthEnabled && !user && createAccount,
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

      if (result.payment?.action === "redirect" && result.payment?.redirectUrl) {
        clearCart({ preserveServerCart: true });
        window.location.href = result.payment.redirectUrl;
        return;
      }

      toast.success(!customerAuthMigrationRequired && !logtoCustomerAuthEnabled && createAccount
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
      <div className="flex min-h-[70vh] items-center justify-center bg-[#FAF7F2] px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#E8DFD3] bg-white">
            <ShoppingBag className="h-8 w-8 text-neutral-300" />
          </div>
          <h1 className="font-serif text-2xl text-[#12100D]">Sepetiniz boş</h1>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            Ödeme adımına geçmek için sepetinize ürün ekleyin.
          </p>
          <Link
            href="/urunler"
            className="mt-8 inline-flex items-center justify-center border border-[#8A6B37] bg-[#8A6B37] px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-[#755a2d] hover:bg-[#755a2d]"
          >
            Alışverişe devam et
          </Link>
        </div>
      </div>
    );
  }

  const orderSummaryProps = {
    items,
    subtotal,
    resolvedShippingCost,
    discountAmount,
    finalTotal,
    selectedShippingRate,
    couponInput,
    appliedCoupon,
    couponError,
    isApplyingCoupon,
    freeShippingRemaining,
    freeShippingProgress,
    onCouponInputChange: setCouponInput,
    onApplyCoupon: handleApplyCoupon,
    onRemoveCoupon: removeCoupon,
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-[#FAF7F2]",
        currentStep === 2 ? "pb-28 lg:pb-16" : "pb-16",
      )}
    >
      <header className="border-b border-[#E8DFD3] bg-white">
        <div className="container-premium grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-4 sm:py-5">
          <Link
            href="/sepet"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-[#8A6B37]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sepete dön</span>
          </Link>

          <Link href="/" className="justify-self-center" aria-label={checkoutStoreName}>
            {checkoutLogoSrc ? (
              <img
                src={checkoutLogoSrc}
                alt={checkoutStoreName}
                className="mx-auto h-8 w-auto max-w-[140px] object-contain sm:h-9"
              />
            ) : (
              <span className="font-serif text-xl text-[#12100D]">{checkoutStoreName}</span>
            )}
          </Link>

          <nav
            aria-label="Ödeme adımları"
            className="flex items-center justify-end gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500"
          >
            <Link href="/sepet" className="transition-colors hover:text-[#8A6B37]">
              Sepet
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-[#E8DFD3]" />
            <span className="text-[#12100D]">Ödeme</span>
          </nav>
        </div>
      </header>

      <main className="container-premium py-8 sm:py-10 lg:py-12">
        <div className="mx-auto grid max-w-7xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(460px,520px)] lg:gap-10 xl:gap-12">
          <div className="space-y-6">
            <CheckoutMobileSummary {...orderSummaryProps} />

            <CheckoutStepIndicator
              currentStep={currentStep as 1 | 2}
              onDeliveryClick={() => currentStep === 2 && setCurrentStep(1)}
            />

            <AnimatePresence mode="wait">
              {currentStep === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className={cn(checkoutCardClass, "px-6 py-8 sm:px-8 sm:py-10")}
                >
                  <div className="mb-8 border-b border-[#E8DFD3] pb-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
                      Adım 1
                    </p>
                    <h2 className="mt-2 font-serif text-2xl text-[#12100D]">Teslimat bilgileri</h2>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      Siparişinizin ulaşacağı adres ve iletişim bilgileri
                    </p>
                  </div>

                  <div className="space-y-8">
                    <section className="space-y-4">
                      <h3 className="font-serif text-lg text-[#12100D]">İletişim</h3>
                      <div className="space-y-2">
                        <label className={checkoutLabelClass}>E-posta</label>
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
                          className={checkoutFieldClass}
                        />
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="font-serif text-lg text-[#12100D]">Teslimat adresi</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className={checkoutLabelClass}>Ad</label>
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
                          className={checkoutFieldClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={checkoutLabelClass}>Soyad</label>
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
                          className={checkoutFieldClass}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={checkoutLabelClass}>Telefon</label>
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
                        className={checkoutFieldClass}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className={checkoutLabelClass}>Adres</label>
                      <input
                        type="text"
                        value={shippingInfo.address}
                        onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })}
                        placeholder="Sokak, mahalle, bina no"
                        className={checkoutFieldClass}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="relative space-y-2">
                        <label className={checkoutLabelClass}>Şehir</label>
                        <select
                          value={shippingInfo.city}
                          onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })}
                          className={cn(checkoutFieldClass, "appearance-none cursor-pointer pr-10")}
                        >
                          <option value="">Seçiniz</option>
                          {TURKISH_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="pointer-events-none absolute right-4 bottom-3.5 text-neutral-400">
                          <ChevronRight className="h-4 w-4 rotate-90" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className={checkoutLabelClass}>İlçe</label>
                        <input
                          type="text"
                          value={shippingInfo.district}
                          onChange={(e) => setShippingInfo({ ...shippingInfo, district: e.target.value })}
                          className={checkoutFieldClass}
                          placeholder="İlçe"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={checkoutLabelClass}>Posta kodu</label>
                        <input
                          type="text"
                          value={shippingInfo.postalCode}
                          onChange={(e) => setShippingInfo({ ...shippingInfo, postalCode: e.target.value })}
                          className={checkoutFieldClass}
                          placeholder="34000"
                        />
                      </div>
                    </div>
                    </section>

                    {!user && !customerAuthMigrationRequired && !logtoCustomerAuthEnabled && (
                      <div className="space-y-4">
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] p-4 transition-colors hover:border-[#C4A062]">
                          <input
                            type="checkbox"
                            checked={createAccount}
                            onChange={(e) => setCreateAccount(e.target.checked)}
                            className="mt-0.5 h-5 w-5 cursor-pointer rounded border-[#E8DFD3] text-[#8A6B37] focus:ring-[#8A6B37]"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <UserPlus className="h-4 w-4 text-[#8A6B37]" />
                              <span className="font-semibold text-[#12100D]">Hesap oluştur</span>
                            </div>
                            <p className="mt-1 text-sm text-neutral-600">
                              Sonraki alışverişlerinizde hızlı ödeme için şifrenizi belirleyin
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
                                <label className={checkoutLabelClass}>Şifre oluştur</label>
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                                  <input
                                    type={showPassword ? "text" : "password"}
                                    value={accountPassword}
                                    onChange={(e) => setAccountPassword(e.target.value)}
                                    placeholder="En az 6 karakter"
                                    minLength={6}
                                    className={cn(checkoutFieldClass, "pl-12 pr-12")}
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
                                <label className={checkoutLabelClass}>Şifre tekrar</label>
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                                  <input
                                    type={showPassword ? "text" : "password"}
                                    value={accountPasswordConfirm}
                                    onChange={(e) => setAccountPasswordConfirm(e.target.value)}
                                    placeholder="Şifrenizi tekrar girin"
                                    className={cn(checkoutFieldClass, "pl-12")}
                                  />
                                </div>
                              </div>
                              <p className="text-xs text-neutral-500">
                                Hesap oluşturarak{" "}
                                <Link href="/kullanim-kosullari" className="text-[#8A6B37] hover:underline" target="_blank">
                                  Kullanım Koşulları
                                </Link>
                                {" "}ve{" "}
                                <Link href="/gizlilik" className="text-[#8A6B37] hover:underline" target="_blank">
                                  Gizlilik Politikası
                                </Link>
                                {" "}nı kabul etmiş olursunuz.
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {!user && customerAuthMigrationRequired && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                        Musteri hesabi olusturma bu light_postgres provasinda gecici olarak pasif. Siparisiniz
                        misafir odeme olarak tamamlanir.
                      </div>
                    )}

                    {!user && !customerAuthMigrationRequired && logtoCustomerAuthEnabled && (
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 cursor-pointer rounded border-[#E8DFD3] text-[#8A6B37] focus:ring-[#8A6B37]"
                          onChange={() => {
                            window.location.href = buildRegisterBridgePath("/odeme");
                          }}
                        />
                        <span className="text-sm text-[#12100D]">
                          Ücretsiz Hesap Oluşturmak istiyorum.
                        </span>
                      </label>
                    )}

                    <section className="space-y-4">
                      <h3 className="font-serif text-lg text-[#12100D]">Gönderi</h3>
                      <div className="space-y-3 rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-[#12100D]">Teslimat yöntemi</p>
                        {selectedShippingRate ? (
                          <span className={cn("text-sm font-semibold", resolvedShippingCost === 0 ? "text-[#8A6B37]" : "text-[#12100D]")}>
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
                                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-4 py-3 transition-all",
                                  isSelected
                                    ? "border-[#8A6B37] ring-1 ring-[#8A6B37]/15"
                                    : "border-[#E8DFD3] hover:border-[#C4A062]",
                                )}
                              >
                                <input
                                  type="radio"
                                  name="shipping-method"
                                  value={rate.id}
                                  checked={isSelected}
                                  onChange={() => setSelectedShippingMethod(rate.id)}
                                  className="mt-1 h-4 w-4 border-[#E8DFD3] text-[#8A6B37] focus:ring-[#8A6B37]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-[#12100D]">{rate.name}</span>
                                    <span className={cn("text-sm font-semibold", ratePrice === 0 ? "text-[#8A6B37]" : "text-[#12100D]")}>
                                      {ratePrice === 0 ? "Ücretsiz" : formatPrice(ratePrice)}
                                    </span>
                                  </div>
                                  {(rate.estimatedDays || rate.minOrder) ? (
                                    <p className="mt-1 text-xs text-neutral-500">
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
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          Bu adres için tanımlı teslimat seçeneği bulunamadı.
                        </div>
                      )}
                      </div>
                    </section>

                    <button
                      type="button"
                      onClick={handleNextStep}
                      className={cn(checkoutPrimaryButtonClass, "h-[52px]")}
                    >
                      Ödemeye geç <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className={cn(checkoutCardClass, "px-6 py-8 sm:px-8 sm:py-10")}
                >
                  <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[#E8DFD3] pb-6">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
                        Adım 2
                      </p>
                      <h2 className="mt-2 font-serif text-2xl text-[#12100D]">Ödeme</h2>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        Güvenli ödeme yönteminizi seçin ve siparişi tamamlayın
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E8DFD3] bg-[#FBF8F4] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A6B37]">
                      <Lock className="h-3 w-3" />
                      SSL güvenli
                    </div>
                  </div>

                  <CheckoutDeliveryRecap
                    contactEmail={contactEmail}
                    shippingInfo={shippingInfo}
                    selectedShippingRate={selectedShippingRate}
                    resolvedShippingCost={resolvedShippingCost}
                    onEdit={() => setCurrentStep(1)}
                  />

                  <div className="space-y-4">
                    {paymentGateways.map((gateway) => {
                      const paymentLogo = getCheckoutPaymentLogo(gateway.gateway);

                      return (
                        <label
                          key={gateway.id}
                          onClick={() => setSelectedPaymentMethod(gateway.id)}
                          className={cn(
                            "flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 transition-all",
                            selectedPaymentMethod === gateway.id
                              ? "border-[#8A6B37] ring-1 ring-[#8A6B37]/15"
                              : "border-[#E8DFD3] hover:border-[#C4A062]",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border-2",
                              selectedPaymentMethod === gateway.id
                                ? "border-[#8A6B37]"
                                : "border-[#E8DFD3]",
                            )}
                          >
                            {selectedPaymentMethod === gateway.id ? (
                              <div className="h-2.5 w-2.5 rounded-full bg-[#8A6B37]" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-[#12100D]">
                              {gateway.name}
                            </span>
                            <span className="text-xs text-neutral-500">{gateway.description}</span>
                          </div>
                          {paymentLogo ? (
                            <img
                              src={paymentLogo}
                              alt=""
                              className="h-8 w-8 shrink-0 object-contain"
                            />
                          ) : gateway.gateway === "bank_transfer" ? (
                            <Building2 className="h-5 w-5 shrink-0 text-[#8A6B37]" />
                          ) : gateway.gateway === "cod" ? (
                            <Truck className="h-5 w-5 shrink-0 text-[#8A6B37]" />
                          ) : isCardLikeGateway(gateway.gateway) ? (
                            <CreditCard className="h-5 w-5 shrink-0 text-[#8A6B37]" />
                          ) : null}
                        </label>
                      );
                    })}
                  </div>

                  {paymentGateways.find((g) => g.id === selectedPaymentMethod)?.gateway ===
                    "bank_transfer" && (
                    <div className="mt-6 space-y-4 rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-neutral-500">Banka</span>
                        <span className="text-right text-sm font-semibold text-[#12100D]">
                          {paymentGateways.find((g) => g.id === selectedPaymentMethod)?.bankAccount?.bankName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-neutral-500">Alıcı</span>
                        <span className="text-right text-sm font-semibold text-[#12100D]">
                          {
                            paymentGateways.find((g) => g.id === selectedPaymentMethod)?.bankAccount
                              ?.accountHolder
                          }
                        </span>
                      </div>
                      <div className="border-t border-[#E8DFD3] pt-4">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          IBAN
                        </p>
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E8DFD3] bg-white p-3">
                          <code className="break-all font-mono text-sm font-semibold text-[#12100D]">
                            {
                              paymentGateways.find((g) => g.id === selectedPaymentMethod)?.bankAccount
                                ?.iban
                            }
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                paymentGateways.find((g) => g.id === selectedPaymentMethod)
                                  ?.bankAccount?.iban || "",
                              )
                            }
                            className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A6B37] hover:underline"
                          >
                            Kopyala
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Sipariş numaranızı açıklama kısmına yazmayı unutmayınız.
                      </div>
                    </div>
                  )}

                  {isCardLikeGateway(getGatewayType(selectedPaymentMethod)) && selectedPaymentMethod ? (
                    <div className="mt-6 rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] p-4 text-center text-sm text-neutral-700">
                      Ödeme butonuna tıkladıktan sonra güvenli 3D Secure ekranına yönlendirileceksiniz.
                    </div>
                  ) : null}

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className={cn(checkoutSecondaryButtonClass, "sm:flex-1")}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Teslimata dön
                    </button>
                    <button
                      type="button"
                      onClick={handleCompleteOrder}
                      disabled={isSubmitting}
                      className={cn(checkoutPrimaryButtonClass, "h-[52px] sm:flex-[2]")}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      {formatPrice(finalTotal)} öde
                    </button>
                  </div>

                  <p className="mt-6 text-center text-[11px] leading-6 text-neutral-500">
                    Siparişi tamamlayarak{" "}
                    <Link href="/kullanim-kosullari" className="text-[#8A6B37] hover:underline">
                      kullanım koşullarını
                    </Link>{" "}
                    kabul etmiş olursunuz.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>



          </div>

          <aside className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
            <div className="rounded-[1.75rem] border border-[#E8DFD3] bg-[#FBF8F4] px-5 py-6 sm:px-6 sm:py-8">
              <CheckoutOrderSummary {...orderSummaryProps} />
            </div>
          </aside>

        </div>
      </main>

      {currentStep === 2 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DFD3] bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Toplam
              </p>
              <p className="font-serif text-xl font-semibold text-[#12100D]">
                {formatPrice(finalTotal)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCompleteOrder}
              disabled={isSubmitting}
              className={cn(checkoutPrimaryButtonClass, "h-12 w-auto min-w-[160px] px-5")}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Öde
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
