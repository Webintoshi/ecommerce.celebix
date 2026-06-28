"use client";

import Image from "next/image";
import { useState } from "react";
import { Building2, CreditCard, Package, Waypoints } from "lucide-react";
import type { PaymentGateway } from "@/types/payment";

const PAYMENT_LOGO_PATHS: Partial<Record<PaymentGateway, string>> = {
  paytr: "/payment-logos/paytr.svg",
  paytr_iframe: "/payment-logos/paytr-iframe.svg",
  iyzico: "/payment-logos/iyzico.svg",
  iyzico_iframe: "/payment-logos/iyzico-iframe.svg",
  pay_with_iyzico: "/payment-logos/pay-with-iyzico.svg",
  paynet: "/payment-logos/paynet.png",
  craftgate: "/payment-logos/craftgate.svg",
  stripe: "/payment-logos/stripe.png",
  garanti: "/payment-logos/garanti.svg",
  garanti_pay: "/payment-logos/garanti-pay.svg",
  finansbank: "/payment-logos/finansbank.svg",
  ziraatpay: "/payment-logos/ziraatpay.svg",
  ziraat_katilim: "/payment-logos/ziraat-katilim.svg",
  ziraat: "/payment-logos/ziraat.svg",
  yapi_kredi: "/payment-logos/yapikredi.svg",
  esnekpos: "/payment-logos/esnekpos.svg",
  param: "/payment-logos/param.svg",
  paratika: "/payment-logos/paratika.svg",
  qnbpay: "/payment-logos/qnbpay.svg",
  lidio: "/payment-logos/lidio.svg",
  moka: "/payment-logos/moka.svg",
  hepsipay: "/payment-logos/hepsipay.svg",
  bank_transfer: "/payment-logos/bank-transfer.png",
  cod: "/payment-logos/cod.png",
};

const GATEWAY_ICONS: Partial<Record<PaymentGateway, typeof CreditCard>> = {
  craftgate: Waypoints,
  bank_transfer: Building2,
  cod: Package,
};

interface PaymentProviderLogoProps {
  gateway: PaymentGateway;
  name: string;
  accentClassName: string;
  size: number;
  iconClassName: string;
  containerClassName?: string;
}

export function PaymentProviderLogo({
  gateway,
  name,
  accentClassName,
  size,
  iconClassName,
  containerClassName = "h-full w-full",
}: PaymentProviderLogoProps) {
  const Icon = GATEWAY_ICONS[gateway] ?? CreditCard;
  const [hasError, setHasError] = useState(false);
  const src = PAYMENT_LOGO_PATHS[gateway];

  if (!src || hasError) {
    return (
      <div className={`${containerClassName} rounded-[8px] bg-gradient-to-r ${accentClassName} flex items-center justify-center shadow-sm text-white`}>
        <Icon className={iconClassName} />
      </div>
    );
  }

  return (
    <div className={`${containerClassName} rounded-[8px] flex items-center justify-center bg-white shadow-sm overflow-hidden`}>
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
