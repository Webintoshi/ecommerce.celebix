'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { resolveStorefrontCommercePolicy, createDefaultWhatsAppOrderConfig, type StorefrontCommercePolicy } from '@celebix/saas-contracts';
const CommercePolicyContext = createContext<StorefrontCommercePolicy>(resolveStorefrontCommercePolicy(createDefaultWhatsAppOrderConfig()));
export function CommercePolicyProvider({policy,children}:Readonly<{policy:StorefrontCommercePolicy;children:ReactNode}>) {return <CommercePolicyContext.Provider value={policy}>{children}</CommercePolicyContext.Provider>;}
export function useCommercePolicy() {return useContext(CommercePolicyContext);}
