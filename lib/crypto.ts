/**
 * AES-256-GCM Encryption Module
 * ─────────────────────────────
 * Used for encrypting sensitive health card data at rest.
 * Uses Node.js built-in crypto module with AES-256-GCM.
 *
 * Key is derived from HEALTH_ENCRYPTION_KEY env var.
 * Falls back to a deterministic key for development only.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "smart-wallet-health-module-salt"; // fixed salt for key derivation

function getEncryptionKey(): Buffer {
  const secret =
    process.env.HEALTH_ENCRYPTION_KEY ??
    process.env.ENCRYPTION_KEY ??
    "dev-health-encryption-key-change-in-production";
  // Derive a 32-byte key from the secret using scrypt
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a hex string: iv:encrypted:authTag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Store as iv:encrypted:authTag (all hex)
  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

/**
 * Decrypt a ciphertext string (iv:encrypted:authTag format).
 * Returns the original plaintext.
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypt a JSON object. Serializes to JSON string then encrypts.
 */
export function encryptJSON(data: Record<string, unknown>): string {
  return encrypt(JSON.stringify(data));
}

/**
 * Decrypt an encrypted JSON string back to an object.
 */
export function decryptJSON(ciphertext: string): Record<string, unknown> {
  const plaintext = decrypt(ciphertext);
  return JSON.parse(plaintext);
}
