import process from "node:process";

import {
  createDisabledOwnerSelfServeAuthRouteSet,
  createUnavailableOwnerStagingAuthRouteSet,
  type OwnerSelfServeAuthRouteSet,
} from "../self-serve-auth-route-mount/route-set.ts";
import { createOwnerStagingAuthRouteSetResolver } from "./resolver.ts";
import {resolveOnboardingStatusEnabled} from "../self-serve-status/types.ts";
import { initializeOwnerStagingAuthRouteSet } from "./runtime.ts";
import {parseOwnerAdminLoginSecurityConfig} from '../admin-login-security/config.ts';
import {parseMerchantWhatsAppConfig} from '../merchant-whatsapp/config.ts';

const resolver = createOwnerStagingAuthRouteSetResolver<OwnerSelfServeAuthRouteSet>({
  source: process.env,
  disabled: createDisabledOwnerSelfServeAuthRouteSet,
  unavailable: createUnavailableOwnerStagingAuthRouteSet,
  initialize: config => initializeOwnerStagingAuthRouteSet(config,{onboardingStatusEnabled:resolveOnboardingStatusEnabled(process.env.CELEBIX_ONBOARDING_STATUS_ENABLED),adminLoginSecurity:parseOwnerAdminLoginSecurityConfig(process.env),merchantWhatsApp:parseMerchantWhatsAppConfig(process.env)}),
  diagnostic(code) { console.error(code); },
});

export function resolveDefaultOwnerStagingAuthRouteSet(): Promise<OwnerSelfServeAuthRouteSet> {
  return resolver.resolve();
}
