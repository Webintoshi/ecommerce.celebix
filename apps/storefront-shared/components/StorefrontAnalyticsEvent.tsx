"use client";

import { useEffect, useRef } from "react";
import type { StorefrontTrackerContext } from "../lib/page-context.ts";
import { trackCommerceEvent, type PublicCommerceEvent } from "../lib/analytics/events.ts";
import { createSafeUmamiTracker } from "../lib/analytics/tracker-client.ts";

export type StorefrontAnalyticsEventProps = Readonly<{
  tracker: StorefrontTrackerContext | null;
  event: PublicCommerceEvent;
  trigger: "mount" | "form_submit";
  formId?: string;
}>;

export function StorefrontAnalyticsEvent(props: StorefrontAnalyticsEventProps) {
  const mountSent = useRef(false);
  useEffect(() => {
    if (!props.tracker) return;
    const tracker = createSafeUmamiTracker({ websiteId: props.tracker.websiteId, hostname: props.tracker.hostname });
    const send = () => trackCommerceEvent(tracker, props.event);
    if (props.trigger === "mount") {
      const sendOnce = () => {
        if (mountSent.current) return;
        mountSent.current = true;
        send();
      };
      const browser = window as typeof window & { umami?: unknown };
      if (browser.umami) sendOnce();
      else browser.addEventListener("celebix:analytics-ready", sendOnce, { once: true });
      return () => browser.removeEventListener("celebix:analytics-ready", sendOnce);
    }
    if (!props.formId) return;
    const form = document.getElementById(props.formId);
    if (!(form instanceof HTMLFormElement)) return;
    form.addEventListener("submit", send, { capture: true });
    return () => form.removeEventListener("submit", send, { capture: true });
  }, [props.event, props.formId, props.tracker, props.trigger]);
  return null;
}
