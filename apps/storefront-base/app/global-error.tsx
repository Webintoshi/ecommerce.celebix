"use client";

import { useEffect } from "react";

/**
 * Global Error Boundary — catches errors that escape the root layout.
 * Most common cause: ChunkLoadError after a new deployment invalidates
 * old JS bundles. Fix: auto-reload the page once so the browser fetches
 * fresh assets.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // ChunkLoadError / Failed to fetch dynamically imported module
        const isChunkError =
            error.name === "ChunkLoadError" ||
            error.message?.includes("Loading chunk") ||
            error.message?.includes("Failed to fetch dynamically imported module") ||
            error.message?.includes("Importing a module script failed");

        if (isChunkError) {
            // Auto-reload once to fetch new chunks
            const reloaded = sessionStorage.getItem("chunk-reload");
            if (!reloaded) {
                sessionStorage.setItem("chunk-reload", "1");
                window.location.reload();
                return;
            }
            // Already reloaded once, clear flag
            sessionStorage.removeItem("chunk-reload");
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
                            Sayfa yüklenirken bir sorun oluştu. Lütfen sayfayı
                            yenileyin.
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
