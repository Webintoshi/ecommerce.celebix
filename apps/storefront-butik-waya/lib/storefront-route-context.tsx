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
  DEFAULT_LOCALE,
  getLocaleFromPathname,
  stripLocaleFromPathname,
  type StorefrontLocale,
} from "@/lib/i18n";

type StorefrontRouteContextValue = {
  locale: StorefrontLocale;
  internalPathname: string;
};

const StorefrontRouteContext = createContext<StorefrontRouteContextValue | null>(null);

export function StorefrontRouteProvider({
  initialLocale,
  initialInternalPathname,
  children,
}: {
  initialLocale: StorefrontLocale;
  initialInternalPathname: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [routeState, setRouteState] = useState<StorefrontRouteContextValue>({
    locale: initialLocale,
    internalPathname: initialInternalPathname,
  });

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const nextLocale = getLocaleFromPathname(pathname) || DEFAULT_LOCALE;
    const nextInternalPathname = stripLocaleFromPathname(pathname);

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
      };
    });
  }, [pathname]);

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
