'use client';

import { useLayoutEffect, type ReactNode } from 'react';
import type { StorefrontCommercePolicy } from '@celebix/saas-contracts';
import { CommercePolicySnapshotProvider, useCommercePolicyUpdater } from './CommercePolicyProvider';

/** New page content renders from its server policy while the persistent shell synchronizes before paint. */
export function CommercePolicyPageBoundary({policy,children}:Readonly<{policy:StorefrontCommercePolicy;children:ReactNode}>) {
  const update=useCommercePolicyUpdater();
  useLayoutEffect(()=>{update?.(policy);},[update,policy]);
  return <CommercePolicySnapshotProvider policy={policy}>{children}</CommercePolicySnapshotProvider>;
}
