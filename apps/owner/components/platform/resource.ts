"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePlatformResource<T extends { available: boolean; observedAt?: string }>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!url) { setData(null); setLoading(false); return null; }
    setLoading(true);
    try {
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Oturum ve doğrulama durumunuzu kontrol edin." : "Kaynağa şu anda ulaşılamıyor.");
      const body = await response.json() as T;
      if (body.available !== true) throw new Error("Bu veri kaynağı henüz kullanılamıyor.");
      if (request === sequence.current) { setData(body); setError(null); }
      return body;
    } catch (cause) {
      if (request === sequence.current) setError(cause instanceof Error ? cause.message : "Veri alınamadı.");
      return null;
    } finally { if (request === sequence.current) setLoading(false); }
  }, [url]);
  useEffect(() => { setData(null); setError(null); void refresh(); return () => { sequence.current++; }; }, [refresh]);
  return { data, loading, error, stale: Boolean(error && data), refresh };
}

export type Resource<T> = ReturnType<typeof usePlatformResource<T & { available: boolean; observedAt?: string }>>;
