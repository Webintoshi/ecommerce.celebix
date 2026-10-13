/** Merchant phone authority. Customer and platform TOTP credentials are separate. */
export type MerchantWhatsAppBinding=Readonly<{pendingId:string;pendingDigest:string;browserDigest:string;environment:string}>;
export type MerchantWhatsAppActor=Readonly<{actorTokenKeyId:string;actorTokenDigest:string}>;
export type MerchantWhatsAppPendingActor=Readonly<{actorTokenKeyId?:string;actorTokenDigest?:string}>;
export type MerchantWhatsAppSession=Readonly<{operationId:string;sessionId:string;familyId:string;tokenKeyId:string;tokenDigest:string;completionCiphertext:string}>;
export type MerchantStaffRole='admin'|'editor'|'analyst'|'cashier';
export type MerchantWhatsAppInputs={
 prepare:MerchantWhatsAppBinding&Readonly<{operationId:string;purpose:'login'|'bind_phone'|'signup';phoneKeyId:string;phoneDigest:string;phoneCiphertext:string;phoneMasked:string;destinationHostname:string;ipDigest:string|null;recipientBudgetDigest:string;challengeId:string;codeDigest:string;actorTokenKeyId?:string;actorTokenDigest?:string}>;
 resend:MerchantWhatsAppBinding&MerchantWhatsAppPendingActor&Readonly<{operationId:string;challengeId:string;codeDigest:string;ipDigest:string|null;recipientBudgetDigest:string}>;
 read:MerchantWhatsAppBinding&MerchantWhatsAppPendingActor;
 finish_delivery:MerchantWhatsAppBinding&Readonly<{challengeId:string;status:'accepted'|'failed'|'ambiguous'}>;
 verify:MerchantWhatsAppBinding&MerchantWhatsAppPendingActor&MerchantWhatsAppSession&Readonly<{challengeId:string;codeDigest:string}>;
 claim_signup:MerchantWhatsAppBinding&MerchantWhatsAppSession&Readonly<{storeId:string}>;
 self_state:MerchantWhatsAppActor;
 staff_list:MerchantWhatsAppActor;
 staff_create:MerchantWhatsAppActor&Readonly<{operationId:string;expectedVersion:number;phoneKeyId:string;phoneDigest:string;phoneCiphertext:string;phoneMasked:string;displayName:string;role:MerchantStaffRole;existingMembershipId?:string}>;
 staff_update:MerchantWhatsAppActor&Readonly<{operationId:string;staffId:string;expectedVersion:number;displayName:string;role:MerchantStaffRole;enabled:boolean}>;
};
export type MerchantWhatsAppCommand={[A in keyof MerchantWhatsAppInputs]:Readonly<{action:A;input:MerchantWhatsAppInputs[A]}>}[keyof MerchantWhatsAppInputs];
export type MerchantWhatsAppOutcome='prepared'|'pending'|'accepted'|'failed'|'ambiguous'|'completed'|'issued'|'phone_bound'|'phone_verified'|'operation_replayed'|'operation_mismatch'|'consumed'|'invalid_input'|'unauthenticated'|'membership_denied'|'owner_required'|'phone_conflict'|'not_ready'|'invalid_code'|'locked'|'rate_limited'|'staff_limit_reached'|'version_conflict'|'created'|'updated'|'listed'|'disabled'|'invalidated';
export type MerchantWhatsAppAuthority=Readonly<Record<string,unknown>>;
export type MerchantWhatsAppResult=Readonly<{outcome:MerchantWhatsAppOutcome;authority:MerchantWhatsAppAuthority|null}>;

export type CreatePhoneStarterTenantInput=Omit<import('../types.ts').CreateStarterTenantInput,'principal'>&Readonly<{principal:Readonly<{kind:'whatsapp';proof:MerchantWhatsAppBinding}>}>;
export type MerchantPhonePrincipalRecord=Readonly<{id:import('../types.ts').PrincipalId;issuer:string;subject:string;authorityKind:'phone';email:null;emailVerified:false;createdAt:string;updatedAt:string}>;

export type MerchantStaffAuthority=Readonly<{version:number;staff:readonly Readonly<{staffId:string;displayName:string;role:MerchantStaffRole;enabled:boolean;version:number;phoneMasked:string|null;phoneVerified:boolean;membershipId:string|null;principalId:string|null}>[]}>;
export type MerchantSelfAuthority=Readonly<{phoneMasked:string|null;phoneVerified:boolean}>;
export type MerchantPhoneSecurityResetInput=Readonly<{operatorId:string;principalId:string;operationId:string;reason:string}>;
