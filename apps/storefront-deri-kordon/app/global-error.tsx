"use client";

import { useEffect } from "react";
import {
  attemptAutoRecovery,
  shouldAutoRecover,
} from "@/lib/error-recovery";

/**
 * Global Error Boundary — catches errors that escape the root layout.
 * Most common cause: stale chunks or route payload mismatches right after a
 * deployment. These usually recover after one hard reload.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (shouldAutoRecover(error)) {
      const recovered = attemptAutoRecovery(error);
      if (recovered) {
        return;
      }
    }

    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="tr">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            background: "#fafafa",
            padding: "2rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "480px" }}>
            <div
              style={{
                fontSize: "3rem",
                marginBottom: "1rem",
              }}
            >
              ⚠️
            </div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#111",
                marginBottom: "0.75rem",
              }}
            >
              Bir Hata Oluştu
            </h1>
            <p
              style={{
                color: "#666",
                marginBottom: "2rem",
                lineHeight: 1.6,
              }}
            >
              Sayfa yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "#111",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Sayfayı Yenile
              </button>
              <button
                onClick={() => reset()}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "#fff",
                  color: "#333",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Tekrar Dene
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
