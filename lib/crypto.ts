import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Run `npm run bootstrap` to generate one.",
    );
  }
  if (raw.length === 44 && raw.endsWith("=")) {
    return Buffer.from(raw, "base64");
  }
  return scryptSync(raw, "jira-collector-salt", 32);
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, encB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !encB64) {
    throw new Error("Invalid encrypted payload format.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function generateKeyB64(): string {
  return randomBytes(32).toString("base64");
}
