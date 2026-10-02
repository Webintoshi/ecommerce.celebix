"use client";

import { parseStorefrontAsset, type StorefrontAsset, type StorefrontAssetKind } from "@celebix/saas-contracts";
import { useEffect, useRef } from "react";
import { DesignImageField, type DesignImageOption } from "./DesignImageField";

type AssetOption = Readonly<{ id: string; url: string; altText: string; width: number; height: number }>;

/** Asset-backed fields retain asset IDs; direct design media uses its own adapter. */
export function DesignAssetField({ label, value, assets, kind, disabled, onChange, onUploaded, onBusyChange, altText, emptyLabel, frame = "wide" }: Readonly<{
  label: string; value: string; assets: readonly AssetOption[]; kind: StorefrontAssetKind; disabled: boolean;
  onChange(value: string): void; onUploaded?(asset: StorefrontAsset): void;
  onBusyChange?(id: string, busy: boolean): void; altText?: string; emptyLabel?: string;
  frame?: "wide" | "portrait" | "logo" | "square";
}>) {
  const attempt = useRef<{ file: File; operationId: string; kind: StorefrontAssetKind; altText: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onUploaded, disabled }); callbacks.current = { onUploaded, disabled };
  useEffect(() => () => controller.current?.abort(), []);
  async function upload(file: File): Promise<DesignImageOption> {
    if (callbacks.current.disabled) throw new Error("Görsel yüklenemedi.");
    if (attempt.current?.file !== file) attempt.current = { file, operationId: crypto.randomUUID(), kind, altText: (altText || label).trim().slice(0, 500) };
    const current = attempt.current!;
    const body = new FormData(); body.set("file", current.file); body.set("kind", current.kind); body.set("altText", current.altText);
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch("/api/storefront-assets", { method: "POST", credentials: "same-origin", headers: { "idempotency-key": current.operationId }, body, signal: request.signal });
      if (!response.ok) throw new Error("Görsel yüklenemedi.");
      const result = await response.json() as { asset: unknown };
      const asset = parseStorefrontAsset(result.asset);
      if (asset.id !== current.operationId || asset.kind !== current.kind || asset.status !== "active") throw new Error("Görsel yüklenemedi.");
      if (request.signal.aborted) throw new Error("Görsel yüklenemedi.");
      callbacks.current.onUploaded?.(asset); attempt.current = null;
      return { key: asset.id, url: asset.publicUrl, altText: asset.altText, width: asset.width, height: asset.height };
    } finally { if (controller.current === request) controller.current = null; }
  }
  return <DesignImageField label={label} value={value} options={assets.map(asset => ({ ...asset, key: asset.id }))} disabled={disabled} onChange={onChange} onUpload={upload} onBusyChange={onBusyChange} onPendingChange={onBusyChange} emptyLabel={emptyLabel} frame={frame} />;
}
