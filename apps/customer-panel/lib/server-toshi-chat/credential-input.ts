// Recognizable credentials belong in the encrypted connection form, never chat history.
const CREDENTIAL = /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9_.-]{24,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:postgres(?:ql)?|mysql):\/\/[^\s/]+:[^\s@]+@/i;
export function containsToshiCredential(text: string): boolean { return CREDENTIAL.test(text); }
