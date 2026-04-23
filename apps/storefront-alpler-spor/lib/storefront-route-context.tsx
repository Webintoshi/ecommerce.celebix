"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  buildLocalizedPath,
  getLocaleFromPathname,
  stripLocaleFromPathname,
  type LocaleRoutingConfig,
  type StorefrontLocale,
} from "@/lib/i18n";

type StorefrontRouteContextValue = {
  locale: StorefrontLocale;
  internalPathname: string;
  routing: LocaleRoutingConfig;
  buildPath: (pathname: string, locale?: StorefrontLocale) => string;
};

const StorefrontRouteContext = createContext<StorefrontRouteContextValue | null>(null);

export function StorefrontRouteProvider({
  initialLocale,
  initialInternalPathname,
  initialRouting,
  children,
}: {
  initialLocale: StorefrontLocale;
  initialInternalPathname: string;
  initialRouting: LocaleRoutingConfig;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [routeState, setRouteState] = useState<StorefrontRouteContextValue>({
    locale: initialLocale,
    internalPathname: initialInternalPathname,
    routing: initialRouting,
    buildPath: (nextPathname: string, locale = initialLocale) =>
      buildLocalizedPath(nextPathname, locale, initialRouting),
  });

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const nextLocale =
      initialRouting.mode === "prefixed"
        ? (() => {
            const detectedLocale = getLocaleFromPathname(pathname);
            return detectedLocale && initialRouting.availableLocales.includes(detectedLocale)
              ? detectedLocale
              : initialRouting.sourceLocale;
          })()
        : initialRouting.sourceLocale;
    const nextInternalPathname =
      initialRouting.mode === "prefixed" ? stripLocaleFromPathname(pathname) : pathname;

    setRouteState((current) => {
      if (
        current.locale === nextLocale &&
        current.internalPathname === nextInternalPathname
      ) {
        return current;
      }

      return {
        locale: nextLocale,
        internalPathname: nextInternalPathname,
        routing: initialRouting,
        buildPath: (nextPathname: string, locale = nextLocale) =>
          buildLocalizedPath(nextPathname, locale, initialRouting),
      };
    });
  }, [pathname, initialRouting]);

  const value = useMemo(() => routeState, [routeState]);

  return (
    <StorefrontRouteContext.Provider value={value}>
      {children}
    </StorefrontRouteContext.Provider>
  );
}

export function useStorefrontRoute() {
  const context = useContext(StorefrontRouteContext);

  if (!context) {
    throw new Error("useStorefrontRoute must be used within StorefrontRouteProvider");
  }

  return context;
}
