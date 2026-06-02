import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  type StorefrontLocale,
  isSupportedLocale,
} from "@/lib/i18n";

export async function getRequestLocale(): Promise<StorefrontLocale> {
  const requestHeaders = await headers();
  const localeHeader = requestHeaders.get("x-celebix-locale");
  if (isSupportedLocale(localeHeader)) {
    return localeHeader;
  }

  return DEFAULT_LOCALE;
}

export async function getRequestPathname(): Promise<string> {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-celebix-pathname");
  return pathname && pathname.startsWith("/") ? pathname : "/";
}
