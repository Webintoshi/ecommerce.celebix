import 'server-only';
import type { ReactNode } from 'react';
import { resolveStorefrontPage } from '../lib/page-context.ts';
import { UNAVAILABLE_COMMERCE_POLICY } from '../lib/commerce-policy-snapshot.ts';
import { CommercePolicyPageBoundary } from './CommercePolicyPageBoundary';

/** Pages execute for each new Flight response, unlike reused ancestor layouts/templates. */
export function withCommercePolicyPage<Props extends object>(Page:(props:Props)=>ReactNode|Promise<ReactNode>) {
  return async function CommercePolicyServerPage(props:Props) {
    const page=await resolveStorefrontPage();
    const policy=page.kind==='active'?page.context.commercePolicy:UNAVAILABLE_COMMERCE_POLICY;
    return <CommercePolicyPageBoundary policy={policy}><Page {...props}/></CommercePolicyPageBoundary>;
  };
}
