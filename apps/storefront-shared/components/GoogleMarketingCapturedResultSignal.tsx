"use client";
import { useEffect } from "react";
import { GOOGLE_MARKETING_PAYMENT_CAPTURED_EVENT } from "../lib/google-marketing-events.ts";

/** This signal requests a proof read; the server endpoint remains purchase authority. */
export function GoogleMarketingCapturedResultSignal(props: Readonly<{ sessionId: string; version: number }>) {
  useEffect(() => {
    window.dispatchEvent(new window.Event(GOOGLE_MARKETING_PAYMENT_CAPTURED_EVENT));
  }, [props.sessionId, props.version]);
  return null;
}
