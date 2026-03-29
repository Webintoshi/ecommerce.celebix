import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getKeyBuffer() {
  const rawKey = (process.env.MARKETPLACE_CREDENTIALS_KEY || "").trim();
  if (!rawKey) {
    throw new Error("MARKETPLACE_CREDENTIALS_KEY tanimli degil.");
  }

  const base64Candidate = Buffer.from(rawKey, "base64");
  if (base64Candidate.length === 32) {
    return base64Candidate;
  }

  if (Buffer.byteLength(rawKey) === 32) {
    return Buffer.from(rawKey, "utf8");
  }

  return createHash("sha256").update(rawKey).digest();
}

export function encryptMarketplaceCredentials(payload: Record<string, string>) {
  const key = getKeyBuffer();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptMarketplaceCredentials(encryptedPayload: string | null | undefined) {
  if (!encryptedPayload) return {};

  const parts = encryptedPayload.split(".");
  if (parts.length !== 3) {
    throw new Error("Gecersiz sifreli pazaryeri payload formati.");
  }

  const [ivBase64, authTagBase64, cipherTextBase64] = parts;
  const key = getKeyBuffer();
  const iv = Buffer.from(ivBase64, "base64url");
  const authTag = Buffer.from(authTagBase64, "base64url");
  const cipherText = Buffer.from(cipherTextBase64, "base64url");

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(decrypted) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Pazaryeri credential payload parse edilemedi.");
  }

  return parsed as Record<string, string>;
}
