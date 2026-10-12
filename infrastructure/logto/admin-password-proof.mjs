/**
 * Server-only Logto 1.41 compatibility extension. This runs at the current
 * ExperienceInteraction submission, before the authorization code is minted.
 * It must never accept a browser-supplied verification flag.
 */
export async function createCelebixAdminPasswordLogin(input) {
  const login = { accountId: input.user.id };
  const params = input.params ?? {};
  if (params.client_id !== '1n93icpphr11h4fmrup9w' ||
      params.resource !== 'urn:celebix:admin-signin-proof' ||
      typeof params.scope !== 'string' || !params.scope.split(' ').includes('signin:proof')) return login;

  // Fixed once on this interaction's first submission. Consent reuses this
  // login result rather than assigning the later consent timestamp.
  login.ts = Math.floor(input.now / 1000);
  if (!Number.isSafeInteger(login.ts) || login.ts < 1) throw Error('admin_password_proof_unavailable');
  login.amr = [];
  if (input.interactionEvent !== 'SignIn' || !Array.isArray(input.records)) return login;
  const passwords = input.records.filter(record => record?.type === 'Password');
  if (passwords.length !== 1) return login;
  const record = passwords[0];
  if (record.isVerified !== true || !/^[a-z0-9]{21}$/.test(record.id ?? '') ||
      typeof record.identifyUser !== 'function') return login;
  const identified = await record.identifyUser();
  if (identified?.id !== input.user.id) return login;
  login.amr = ['pwd', `celebix:admin-password-record:${record.id}`];
  return login;
}

/** Scoped code snapshot only; the mutable session extension is not consulted. */
export function emitCelebixAdminPasswordAmr(input) {
  if (input.clientId !== '1n93icpphr11h4fmrup9w' ||
      input.audience !== 'urn:celebix:admin-signin-proof' ||
      typeof input.scope !== 'string' || !input.scope.split(' ').includes('signin:proof')) return;
  const amr = input.codeAmr;
  if (Array.isArray(amr) && amr.length === 2 && amr[0] === 'pwd' &&
      typeof amr[1] === 'string' && /^celebix:admin-password-record:[a-z0-9]{21}$/.test(amr[1])) {
    // token.set is the existing vendor API used for nonce/at_hash. It ensures
    // this required signed claim is not removed by the default ID claim mask.
    input.token.set('amr', [...amr]);
  }
}
