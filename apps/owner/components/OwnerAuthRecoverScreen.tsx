"use client";

import { useEffect } from "react";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { clearOwnerBrowserAuthArtifacts } from "@/lib/owner-supabase-browser";

interface OwnerAuthRecoverScreenProps {
  nextPath?: string | null;
  error?: string | null;
}

export function OwnerAuthRecoverScreen({ nextPath, error }: OwnerAuthRecoverScreenProps) {
  const safeNextPath = sanitizeInternalRedirectPath(nextPath, "/login");

  useEffect(() => {
    const targetPath =
      safeNextPath === "/login" ? "/login" : `/login?next=${encodeURIComponent(safeNextPath)}`;

    const clearBrowserState = async () => {
      clearOwnerBrowserAuthArtifacts();

      try {
        if (typeof caches !== "undefined") {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }
      } catch {
        // Ignore cache cleanup failures. Cookie and storage cleanup is the primary recovery path.
      }

      window.location.replace(targetPath);
    };

    void clearBrowserState();
  }, [safeNextPath]);

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Owner panel oturum kurtarma">
        <div className="login-brand">
          <div className="login-badge" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <h1 className="login-heading">Oturum duzeltiliyor</h1>
          <p className="login-subtitle">Owner panel icin bozuk tarayici verileri temizleniyor.</p>
        </div>

        {error === "unauthorized" ? (
          <p className="login-message is-error">Yetkisiz ya da bozuk oturum algilandi. Temiz giris ekranina yonlendiriliyorsun.</p>
        ) : (
          <p className="login-message is-notice">Birkac saniye icinde giris ekranina yonlendirileceksin.</p>
        )}
      </section>
    </main>
  );
}
