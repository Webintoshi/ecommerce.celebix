import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { OwnerShellFrame } from "@/components/OwnerShellFrame";
import { getOwnerAuthContext } from "@/lib/owner-auth";
import { ThemeProvider } from "@/components/theme-provider";
import {
  getOwnerPreviewBannerMessage,
  getOwnerPreviewBannerTitle,
  getOwnerPreviewFlags,
} from "@/lib/preview-mode";
import {
  getPreviewOwnerAuthContext,
  hasOwnerPreviewDataFallback,
} from "@/lib/owner-preview-fixtures";

export const metadata: Metadata = {
  title: "Celebix Owner Panel",
  description: "Tüm e-ticaret mağazalarını tek panelden yönet."
};

// Prevent FOUC (Flash of Unstyled Content) script
const themeScript = `
  (function() {
    function getThemePreference() {
      try {
        if (typeof localStorage !== 'undefined') {
          var stored = localStorage.getItem('owner-theme');
          if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored;
          }
        }
      } catch (_) {
        return 'system';
      }
      return 'light';
    }

    var mode = getThemePreference();
    var prefersDark = false;

    try {
      prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {}

    var resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.documentElement.style.colorScheme = resolved;
  })();
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [auth, requestHeaders] = await Promise.all([getOwnerAuthContext(), headers()]);
  const previewFlags = getOwnerPreviewFlags();
  const pathname = requestHeaders.get("x-owner-pathname") ?? "/";
  const canUsePreviewShell =
    !auth &&
    hasOwnerPreviewDataFallback() &&
    pathname !== "/login" &&
    pathname !== "/auth/recover" &&
    !pathname.startsWith("/auth/confirm");
  const shellAuth = auth ?? (canUsePreviewShell ? getPreviewOwnerAuthContext() : null);

  const userName = shellAuth?.profile.full_name || shellAuth?.user.email || "";
  const roleLabel =
    shellAuth?.profile.role === "super_admin" ? "Süper Yönetici" : "Affiliate Yetkilisi";

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="owner-panel" suppressHydrationWarning>
        <ThemeProvider defaultTheme="light" enableSystem disableTransitionOnChange={false}>
          {shellAuth ? (
            <OwnerShellFrame
              userName={userName}
              roleLabel={roleLabel}
              previewTitle={getOwnerPreviewBannerTitle()}
              previewMessage={getOwnerPreviewBannerMessage()}
              showPreviewBanner={previewFlags.previewMode || previewFlags.writeActionsDisabled}
            >
              {children}
            </OwnerShellFrame>
          ) : (
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
