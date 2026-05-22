import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE_NAME,
  type StorefrontLocale,
  isSupportedLocale,
} from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";

export async function getRequestLocale(): Promise<StorefrontLocale> {
  const routing = await getLocaleRoutingConfig();
  if (routing.mode === "prefixless") {
    return routing.sourceLocale;
  }

  const requestHeaders = await headers();
  const localeHeader = requestHeaders.get("x-celebix-locale");
  if (isSupportedLocale(localeHeader) && routing.availableLocales.includes(localeHeader)) {
    return localeHeader;
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isSupportedLocale(cookieLocale) && routing.availableLocales.includes(cookieLocale)) {
    return cookieLocale;
  }

  return routing.sourceLocale;
}

export async function getRequestPathname(): Promise<string> {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-celebix-pathname");
  return pathname && pathname.startsWith("/") ? pathname : "/";
}
