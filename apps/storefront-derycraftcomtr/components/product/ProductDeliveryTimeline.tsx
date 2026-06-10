"use client";

import { useMemo } from "react";
import { Package, Truck, CheckCircle2 } from "lucide-react";

const PREP_BUSINESS_DAYS = { min: 1, max: 3 };
const SHIP_BUSINESS_DAYS = { min: 2, max: 4 };

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;

  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }

  return result;
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatRange(minDate: Date, maxDate: Date): string {
  const min = formatShortDate(minDate);
  const max = formatShortDate(maxDate);
  return min === max ? min : `${min} – ${max}`;
}

export function ProductDeliveryTimeline() {
  const steps = useMemo(() => {
    const today = new Date();
    const prepStart = addBusinessDays(today, PREP_BUSINESS_DAYS.min);
    const prepEnd = addBusinessDays(today, PREP_BUSINESS_DAYS.max);
    const shipStart = addBusinessDays(prepEnd, SHIP_BUSINESS_DAYS.min);
    const shipEnd = addBusinessDays(prepEnd, SHIP_BUSINESS_DAYS.max);

    return [
      {
        icon: Package,
        title: "Sipariş alındı",
        date: formatShortDate(today),
      },
      {
        icon: Truck,
        title: "Hazırlanıyor",
        date: formatRange(prepStart, prepEnd),
      },
      {
        icon: CheckCircle2,
        title: "Tahmini teslimat",
        date: formatRange(shipStart, shipEnd),
      },
    ];
  }, []);

  return (
    <div className="rounded-2xl border border-[#E8DFD3] bg-[#FAF7F2] px-4 py-4">
      <p className="text-[0.58rem] font-medium uppercase tracking-[0.24em] text-[#9A7234]">
        Tahmini teslimat
      </p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-3 sm:flex-col sm:gap-2">
            {index < steps.length - 1 ? (
              <span
                className="absolute left-[11px] top-7 hidden h-px w-[calc(100%+0.5rem)] bg-[#E8DFD3] sm:left-[calc(50%+1.25rem)] sm:top-[0.65rem] sm:block sm:h-px sm:w-[calc(100%-2.5rem)]"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-[1] grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[#9A7234] shadow-sm ring-1 ring-[#E8DFD3]">
              <step.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.72rem] font-medium text-[#12100D]">{step.title}</p>
              <p className="text-[0.68rem] text-[#6B5F54]">{step.date}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
