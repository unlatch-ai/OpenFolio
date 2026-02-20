import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const keyHex = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256)"
    );
  }
  return Buffer.from(keyHex, "hex");
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(data: string): string {
  const key = getKey();
  const parts = data.split(":");
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new Error("Invalid encrypted data format");
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return (
    decipher.update(Buffer.from(encryptedHex, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}
