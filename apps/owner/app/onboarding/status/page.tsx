import {OnboardingStatus} from "../../../components/self-serve/OnboardingStatus.tsx";
import {parseOwnerStagingAuthConfig} from "../../../lib/self-serve-auth-authority/config.ts";
import {DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE} from "../../../../../packages/platform-config/src/saas.ts";
export const dynamic="force-dynamic";
export default function OnboardingStatusPage() {
 let authority=DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE;
 try{authority=parseOwnerStagingAuthConfig(process.env).authority;}catch{/* The mounted reader remains fail closed. */}
 const scope={ownerOrigin:authority.ownerOrigin,panelOrigin:authority.panelOrigin,platformDomainSuffix:authority.platformDomainSuffix};
 return <OnboardingStatus scope={scope}/>;
}
