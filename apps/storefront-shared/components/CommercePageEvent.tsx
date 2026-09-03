"use client";

import { useEffect } from "react";
import { emitStorefrontCommerceEvent, type PublicCommerceEvent } from "@/lib/analytics/events.ts";

export function CommercePageEvent({ event }: Readonly<{ event: PublicCommerceEvent }>) {
  useEffect(() => { emitStorefrontCommerceEvent(event); }, [event]);
  return null;
}
