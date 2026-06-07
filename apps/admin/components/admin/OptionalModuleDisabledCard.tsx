"use client";

import { AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type OptionalModuleDisabledCardProps = {
  title: string;
  message: string;
  detail: string;
  className?: string;
};

export function OptionalModuleDisabledCard({
  title,
  message,
  detail,
  className,
}: OptionalModuleDisabledCardProps) {
  return (
    <section
      className={cn(
        "rounded-[30px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-[#fff9f1] p-6 shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-amber-200 bg-white text-amber-700 shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
              Güvenli kapalı durum
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
              {title}
            </h2>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-800">
            <AlertCircle className="h-4 w-4" />
            {message}
          </div>
          <p className="max-w-3xl text-sm leading-6 text-[#7d6959]">{detail}</p>
        </div>
      </div>
    </section>
  );
}
