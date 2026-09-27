import { createHmac } from "node:crypto";

const PURPOSE = "celebix:onboarding-status:v1\0";
const FORMAT = /^os1\.[A-Za-z0-9_-]{43}$/;

export function isOnboardingStatusCredential(value: unknown): value is string {
  if (typeof value !== "string" || !FORMAT.test(value)) return false;
  const encoded = value.slice(4);
  const bytes = Buffer.from(encoded, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === encoded;
}

export type OnboardingStatusCredentialCodec = Readonly<{
  issue(): Readonly<{ credential: string; digest: string }>;
  digest(value: unknown): string | null;
}>;

export function createOnboardingStatusCredentialCodec(input: Readonly<{
  key: Uint8Array;
  randomBytes(size: number): Uint8Array;
}>): OnboardingStatusCredentialCodec {
  if (!(input?.key instanceof Uint8Array) || input.key.byteLength !== 32 || typeof input.randomBytes !== "function") {
    throw new Error("onboarding_status_codec_invalid");
  }
  const key = Buffer.from(input.key);
  const randomBytes = input.randomBytes;
  const digest = (value: unknown): string | null => isOnboardingStatusCredential(value)
    ? createHmac("sha256", key).update(PURPOSE).update(value).digest("hex") : null;
  return Object.freeze({
    digest,
    issue() {
      const entropy = randomBytes(32);
      if (!(entropy instanceof Uint8Array) || entropy.byteLength !== 32) throw new Error("onboarding_status_entropy_invalid");
      const credential = `os1.${Buffer.from(entropy).toString("base64url")}`;
      return Object.freeze({ credential, digest: digest(credential)! });
    },
  });
}
