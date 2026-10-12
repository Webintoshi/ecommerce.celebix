/** Merchant administrator security only. Platform operator/support TOTP is separate. */
export type AdminLoginIdentity = Readonly<{ issuer:string; subject:string; destinationHostname:string; environment:string; now?:string }>;
export type AdminLoginBinding = Readonly<{pendingId:string;pendingDigest:string;browserDigest:string;environment:string;now?:string}>;
export type AdminLoginSessionMaterial = Readonly<{operationId:string;sessionId:string;familyId:string;tokenKeyId:string;tokenDigest:string;completionCiphertext?:string}>;
export type AdminLoginManagementBinding = Readonly<{operationId:string;tokenKeyId:string;tokenDigest:string;purpose:'manage'|'change_phone';destinationHostname:string;environment:string;browserDigest:string;now?:string}>;
export type AdminLoginCommandInputs = {
 inspect_identity:AdminLoginIdentity;
 begin:AdminLoginIdentity & AdminLoginBinding & Readonly<{passwordProofDigest:string;passwordVerifiedAt:string;operationId:string;purpose?:'login'|'change_phone'|'manage';}>;
 read:AdminLoginBinding;
 prepare_otp:AdminLoginBinding & Readonly<{challengeId:string;otpDigest:string;recipientDigest:string;phoneCiphertext?:string;phoneMasked?:string;ipDigest?:string}>;
 finish_delivery:AdminLoginBinding & Readonly<{challengeId:string;status:'accepted'|'failed'|'ambiguous'}>;
 verify_otp:AdminLoginBinding & AdminLoginSessionMaterial & Readonly<{challengeId:string;otpDigest:string;backupDigests?:readonly string[];rememberTrustDigest?:string}>;
 verify_backup:AdminLoginBinding & AdminLoginSessionMaterial & Readonly<{backupDigest:string}>;
 verify_trust:AdminLoginBinding & AdminLoginSessionMaterial & Readonly<{trustDigest:string}>;
 security_state:Readonly<{tokenKeyId:string;tokenDigest:string;destinationHostname?:string;now?:string}>;
 forget_devices:Readonly<{operationId:string;tokenKeyId:string;tokenDigest:string;trustDigest?:string;deviceId?:string;now?:string}>;
 prepare_management:AdminLoginManagementBinding;
 read_management:AdminLoginManagementBinding;
 finish_management:AdminLoginManagementBinding & Readonly<{completionCiphertext:string}>;
 regenerate_backups:AdminLoginBinding & Readonly<{operationId:string;backupDigests:readonly string[];completionCiphertext?:string}>;
};
export type AdminLoginSecurityCommand = {[A in keyof AdminLoginCommandInputs]:Readonly<{action:A;input:AdminLoginCommandInputs[A]}>}[keyof AdminLoginCommandInputs];
export type AdminLoginSecurityResult = Readonly<{outcome:string;authority:Readonly<Record<string,unknown>>|null}>;
export type AdminLoginInvalidationInput = Readonly<{issuer:string;subject:string;eventId:string;reason:'password_reset'|'identity_reset'|'suspension'|'deletion'|'support_reset';operatorId?:string;supportReason?:string;now?:string}>;
