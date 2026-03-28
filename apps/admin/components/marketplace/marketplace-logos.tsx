"use client";

import React, { useState } from "react";

interface LogoProps {
  className?: string;
  size?: number;
}

// Logo dosya yolları - public/marketplace-logos/ klasöründe olmalı
const LOGO_PATHS: Record<string, string> = {
  trendyol: "/marketplace-logos/trendyol.png",
  hepsiburada: "/marketplace-logos/hepsiburada.png",
  n11: "/marketplace-logos/n11.png",
  amazon_tr: "/marketplace-logos/amazon-tr.png",
};

// Placeholder component
function Placeholder({ text, bg, size }: { text: string; bg: string; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: "bold",
        fontSize: size > 40 ? 16 : 14,
      }}
    >
      {text}
    </div>
  );
}

// Trendyol Logo
export function TrendyolLogo({ className = "", size = 40 }: LogoProps) {
  const [error, setError] = useState(false);
  
  if (error) {
    return <Placeholder text="TY" bg="#F27A1A" size={size} />;
  }
  
  return (
    <img
      src={LOGO_PATHS.trendyol}
      alt="Trendyol"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 10, objectFit: "contain" }}
      onError={() => setError(true)}
    />
  );
}

// Hepsiburada Logo
export function HepsiburadaLogo({ className = "", size = 40 }: LogoProps) {
  const [error, setError] = useState(false);
  
  if (error) {
    return <Placeholder text="HB" bg="linear-gradient(135deg,#FF6000,#FF8A00)" size={size} />;
  }
  
  return (
    <img
      src={LOGO_PATHS.hepsiburada}
      alt="Hepsiburada"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 10, objectFit: "contain" }}
      onError={() => setError(true)}
    />
  );
}

// N11 Logo
export function N11Logo({ className = "", size = 40 }: LogoProps) {
  const [error, setError] = useState(false);
  
  if (error) {
    return <Placeholder text="n11" bg="#5D196A" size={size} />;
  }
  
  return (
    <img
      src={LOGO_PATHS.n11}
      alt="N11"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 10, objectFit: "contain" }}
      onError={() => setError(true)}
    />
  );
}

// Amazon TR Logo
export function AmazonTrLogo({ className = "", size = 40 }: LogoProps) {
  const [error, setError] = useState(false);
  
  if (error) {
    return <Placeholder text="a" bg="#232F3E" size={size} />;
  }
  
  return (
    <img
      src={LOGO_PATHS.amazon_tr}
      alt="Amazon TR"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 10, objectFit: "contain" }}
      onError={() => setError(true)}
    />
  );
}

// Çiçek Sepeti (opsiyonel)
export function CicekSepetiLogo({ className = "", size = 40 }: LogoProps) {
  const [error, setError] = useState(false);
  
  if (error) {
    return <Placeholder text="ÇS" bg="#E91E63" size={size} />;
  }
  
  return (
    <img
      src="/marketplace-logos/ciceksepeti.png"
      alt="Çiçek Sepeti"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 10, objectFit: "contain" }}
      onError={() => setError(true)}
    />
  );
}
