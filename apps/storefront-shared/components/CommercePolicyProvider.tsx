'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { resolveStorefrontCommercePolicy, createDefaultWhatsAppOrderConfig, type StorefrontCommercePolicy } from '@celebix/saas-contracts';

type Props=Readonly<{policy:StorefrontCommercePolicy;children:ReactNode}>;
type UpdatePolicy=(policy:StorefrontCommercePolicy)=>void;
const CommercePolicyContext=createContext<StorefrontCommercePolicy>(resolveStorefrontCommercePolicy(createDefaultWhatsAppOrderConfig()));
const CommercePolicyUpdaterContext=createContext<UpdatePolicy|null>(null);
const POLICY_FIELDS=['schemaVersion','enabled','phone','hidePrices','hideAddToCart','messageIntro','checkoutAllowed','version'] as const;
const samePolicy=(left:StorefrontCommercePolicy,right:StorefrontCommercePolicy)=>POLICY_FIELDS.every(key=>left[key]===right[key]);

/** Local server snapshot; keep the outer shell's updater available to page boundaries. */
export function CommercePolicySnapshotProvider({policy,children}:Props) {
  return <CommercePolicyContext.Provider value={policy}>{children}</CommercePolicyContext.Provider>;
}

export function CommercePolicyProvider({policy,children}:Props) {
  const [current,setCurrent]=useState(policy);
  const previousServerProp=useRef(policy);
  const update=useCallback<UpdatePolicy>(next=>setCurrent(previous=>samePolicy(previous,next)?previous:next),[]);
  useLayoutEffect(()=>{
    // A persistent layout keeps its initial prop. Only a genuinely changed layout
    // prop can replace a newer policy supplied by the current page template.
    if(!samePolicy(previousServerProp.current,policy)){
      previousServerProp.current=policy;
      update(policy);
    }
  },[policy,update]);
  return <CommercePolicyUpdaterContext.Provider value={update}><CommercePolicySnapshotProvider policy={current}>{children}</CommercePolicySnapshotProvider></CommercePolicyUpdaterContext.Provider>;
}

export function useCommercePolicy(){return useContext(CommercePolicyContext);}
export function useCommercePolicyUpdater(){return useContext(CommercePolicyUpdaterContext);}
