import "server-only";
import {createAdminIngressVerifier} from "../../../../packages/saas-data/src/admin-login-security/ingress.ts";

import { resolveDefaultPublicStorefrontRuntime } from "../default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";

export const defaultAccountRouteDependencies = Object.freeze({
  selectAuthority: (headers: Headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.identity ?? null,
  resolveBrand: async (hostname: string) => {
    const runtime = await resolveDefaultPublicStorefrontRuntime(); if (!runtime) return null;
    const storefront = await runtime.repository.getPublicStorefront({ hostname, now: new Date() });
    const logo = "logo" in storefront.presentation ? storefront.presentation.logo : undefined;
    return Object.freeze({ storeName: storefront.name, logoUrl: logo?.url ?? null, primaryColor: null });
  },
  // Only the signed ingress supplies a rate-limit IP; forwarded headers have
  // no authority on the directly reachable Traefik deployment.
  requestAuthority: (_headers:Headers)=>"authenticated_unknown_ip",
  authenticateIngress: (request:Request)=>{
    try{const authority=selectTrustedStorefrontHostAuthority(request.headers);if(authority.kind!=="trusted")return {authenticated:false,trustedIp:null};const origin=`https://${authority.hostname}`;if(request.headers.get('origin')!==origin)return {authenticated:false,trustedIp:null};const raw=process.env.CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX;if(!raw||!/^[a-f0-9]{64}$/u.test(raw))return {authenticated:false,trustedIp:null};const verified=createAdminIngressVerifier({secret:Buffer.from(raw,'hex'),centralOrigin:origin,allowedPaths:['/api/account/auth/start']})(request);return {authenticated:verified.authenticated,trustedIp:verified.trustedIp??null};}catch{return {authenticated:false,trustedIp:null};}
  },
});
