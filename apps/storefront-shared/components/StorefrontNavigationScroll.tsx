"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** New pages start at the top; history traversal remains owned by the browser and theme continuity. */
export function StorefrontNavigationScroll() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const historyDestination = useRef<string | null>(null);

  useLayoutEffect(() => {
    const onPop = () => { historyDestination.current = window.location.pathname; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const traversingHistory = historyDestination.current === pathname;
    historyDestination.current = null;
    if (traversingHistory || window.location.hash) return;

    // Next can retain coordinates when a dynamic product template is reused.
    // Run on the committed destination, after departure listeners have saved the source position.
    const reset = () => {
      if (window.location.pathname === pathname && !window.location.hash && historyDestination.current !== pathname) {
        window.scrollTo({ left: 0, top: 0, behavior: "instant" });
      }
    };
    reset();
    // Let route/overlay cleanup finish, without polling or fighting subsequent user scrolling.
    const frame = window.requestAnimationFrame(reset);
    const cancel = () => window.cancelAnimationFrame(frame);
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchstart", cancel, { passive: true, once: true });
    window.addEventListener("keydown", cancel, { once: true });
    return () => {
      cancel();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [pathname]);
  return null;
}
