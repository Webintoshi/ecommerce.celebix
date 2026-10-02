"use client";

import { useId } from "react";
import type { BannerDestination, DesignDestination, StorefrontDesignDestinationOption } from "@celebix/saas-contracts";
import { DESIGN_LINK_GROUPS, DESIGN_STORE_LINKS, designPathLabel, designPathOptions } from "./design-link-options";
import styles from "../design-settings.module.css";

type SelectOption = Readonly<{ key: string; label: string; group: string }>;
type FieldProps = Readonly<{ label?: string; id?: string; disabled: boolean; emptyLabel?: string; invalid?: boolean; describedBy?: string }>;
type Destinations = Readonly<{ destinations: readonly StorefrontDesignDestinationOption[] }>;

function LinkSelect({ value, options, currentLabel = "Mevcut bağlantı", onChange, label = "Bağlantı", id, disabled, emptyLabel = "Bağlantı yok", invalid, describedBy }: FieldProps & Readonly<{ value: string; options: readonly SelectOption[]; currentLabel?: string; onChange(key: string): void }>) {
  const generatedId = useId();
  const groups = [...new Set(options.map(item => item.group))];
  return <label className={styles.linkField} htmlFor={id ?? generatedId}>{label}
    <select id={id ?? generatedId} value={value} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={event => {
      const key = event.currentTarget.value;
      if (!key || options.some(item => item.key === key)) onChange(key);
    }}>
      <option value="">{emptyLabel}</option>
      {value && !options.some(item => item.key === value) ? <option value={value}>{currentLabel}</option> : null}
      {groups.map(group => <optgroup key={group} label={group}>{options.filter(item => item.group === group).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup>)}
    </select>
  </label>;
}

export function DesignPathField({ value, destinations, onChange, ...props }: FieldProps & Destinations & Readonly<{ value: string; onChange(path: string): void }>) {
  return <LinkSelect {...props} value={value} currentLabel={designPathLabel(value, destinations)} options={designPathOptions(destinations).map(item => ({ ...item, key: item.path }))} onChange={onChange} />;
}

function resourceOptions(destinations: readonly StorefrontDesignDestinationOption[]) {
  return destinations.map(item => ({ key: `${item.kind}:${item.resourceId}`, label: item.label, group: DESIGN_LINK_GROUPS[item.kind] }));
}

export function DesignResourceField({ value, destinations, onChange, ...props }: FieldProps & Destinations & Readonly<{ value: DesignDestination; onChange(destination: DesignDestination): void }>) {
  return <LinkSelect {...props} value={value.kind === "none" ? "" : `${value.kind}:${value.resourceId}`} options={resourceOptions(destinations)} onChange={key => {
    const item = destinations.find(item => `${item.kind}:${item.resourceId}` === key);
    onChange(item ? { kind: item.kind, resourceId: item.resourceId } : { kind: "none" });
  }} />;
}

export function DesignBannerLinkField({ value, destinations, onChange, ...props }: FieldProps & Destinations & Readonly<{ value: BannerDestination; onChange(destination: BannerDestination): void }>) {
  const key = value.kind === "none" ? "" : value.kind === "path" ? `path:${value.path}` : `${value.kind}:${value.resourceId}`;
  const options = [...DESIGN_STORE_LINKS.map(item => ({ ...item, key: `path:${item.path}` })), ...resourceOptions(destinations)];
  return <LinkSelect {...props} value={key} options={options} currentLabel={value.kind === "path" ? designPathLabel(value.path, destinations) : undefined} onChange={selected => {
    const page = DESIGN_STORE_LINKS.find(item => `path:${item.path}` === selected);
    const resource = destinations.find(item => `${item.kind}:${item.resourceId}` === selected);
    onChange(page ? { kind: "path", path: page.path } : resource ? { kind: resource.kind, resourceId: resource.resourceId } : { kind: "none" });
  }} />;
}
