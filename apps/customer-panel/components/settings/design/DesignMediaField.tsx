"use client";

import type { DesignMediaReference, StorefrontDesignMediaOption } from "@celebix/saas-contracts";
import { useRef } from "react";
import { DesignImageField } from "./DesignImageField";

export function DesignMediaField({ label, value, media, storeName, disabled, onChange, onUpload, onBusyChange, frame = "wide", emptyLabel }: Readonly<{
  label: string; value: DesignMediaReference; media: readonly StorefrontDesignMediaOption[]; storeName: string; disabled: boolean;
  onChange(value: DesignMediaReference): void; onUpload(file: File, altText: string): Promise<StorefrontDesignMediaOption>;
  onBusyChange?(id: string, busy: boolean): void; frame?: "wide" | "portrait" | "logo" | "square"; emptyLabel?: string;
}>) {
  const retained = useRef(value); retained.current = value;
  const attempt = useRef<{ file: File; altText: string } | null>(null);
  const options = media.map(item => ({ ...item, key: `media:${item.id}` }));
  if (value?.kind === "legacy_https") options.push({ id: "legacy", key: "legacy", url: value.url, altText: `${storeName} ${label}`, mediaType: "image/png", width: 0, height: 0 });
  return <DesignImageField label={label} value={value?.kind === "media" ? `media:${value.mediaId}` : value ? "legacy" : ""} options={options} disabled={disabled} frame={frame} emptyLabel={emptyLabel} onBusyChange={onBusyChange} onPendingChange={onBusyChange}
    onChange={key => onChange(key.startsWith("media:") ? { kind: "media", mediaId: key.slice(6) } : key === "legacy" ? retained.current : null)}
    onUpload={async file => {
      if (attempt.current?.file !== file) attempt.current = { file, altText: `${storeName} ${label}`.trim().slice(0, 500) };
      const created = await onUpload(file, attempt.current.altText);
      attempt.current = null;
      return { ...created, key: `media:${created.id}` };
    }} />;
}
