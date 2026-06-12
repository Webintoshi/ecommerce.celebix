"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Prize {
  id: string;
  name: string;
  description?: string | null;
  prize_type: "coupon" | "none";
  color_hex: string;
  icon_emoji?: string | null;
  image_url?: string | null;
  display_order: number;
}

interface LuckyWheelSpinAnimation {
  spinId: string;
  prizeId: string;
}

interface LuckyWheelProps {
  config?: {
    id: string;
    name: string;
    is_active: boolean;
    wheel_segments: number;
    primary_color: string;
    secondary_color: string;
  };
  prizes: Prize[];
  spinAnimation?: LuckyWheelSpinAnimation | null;
  onSpinAnimationComplete?: (prize: Prize) => void;
  className?: string;
}

export default function LuckyWheel({ config, prizes, spinAnimation, onSpinAnimationComplete, className }: LuckyWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  const sortedPrizes = useMemo(() => [...prizes].sort((a, b) => a.display_order - b.display_order), [prizes]);
  const segmentCount = Math.max(1, sortedPrizes.length);
  const primaryColor = config?.primary_color || "#FF6B35";
  const secondaryColor = config?.secondary_color || "#FFE66D";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;
    const segmentAngle = (2 * Math.PI) / segmentCount;

    ctx.clearRect(0, 0, width, height);

    for (let index = 0; index < segmentCount; index += 1) {
      const prize = sortedPrizes[index] || sortedPrizes[0];
      const startAngle = index * segmentAngle - Math.PI / 2;
      const endAngle = startAngle + segmentAngle;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = index % 2 === 0 ? primaryColor : secondaryColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (!prize) continue;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + segmentAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px system-ui";
      const text = prize.icon_emoji ? `${prize.icon_emoji} ${prize.name}` : prize.name;
      const displayText = text.length > 16 ? `${text.slice(0, 16)}...` : text;
      ctx.fillText(displayText, radius - 18, 4);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [primaryColor, secondaryColor, segmentCount, sortedPrizes]);

  useEffect(() => {
    if (!spinAnimation || sortedPrizes.length === 0) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const prizeIndex = sortedPrizes.findIndex((item) => item.id === spinAnimation.prizeId);
    if (prizeIndex < 0) return;

    const segmentAngle = 360 / segmentCount;
    const targetAngle = 360 - prizeIndex * segmentAngle - segmentAngle / 2;
    const extraSpins = 6 + Math.floor(Math.random() * 3);
    const finalRotation = rotationRef.current + extraSpins * 360 + targetAngle;
    rotationRef.current = finalRotation;

    const animationFrame = requestAnimationFrame(() => {
      setIsSpinning(true);
      setRotation(finalRotation);
    });

    timeoutRef.current = setTimeout(() => {
      setIsSpinning(false);
      onSpinAnimationComplete?.(sortedPrizes[prizeIndex]);
    }, 4200);

    return () => {
      cancelAnimationFrame(animationFrame);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onSpinAnimationComplete, segmentCount, sortedPrizes, spinAnimation]);

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="max-w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? "transform 4.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
          }}
        />

        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-2">
          <div
            className="h-12 w-8"
            style={{
              backgroundColor: primaryColor,
              clipPath: "polygon(50% 100%, 0 0, 100% 0)",
            }}
          />
        </div>
      </div>
      <p className="mt-5 text-sm text-gray-500">{isSpinning ? "Sonuc hesaplaniyor..." : "Formu doldurup sansini dene."}</p>
    </div>
  );
}
