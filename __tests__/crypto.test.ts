
import { encrypt, decrypt, encryptJSON, decryptJSON } from "@/lib/crypto";

describe("Crypto Library Unit Tests", () => {
  const originalSecret = process.env.HEALTH_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.HEALTH_ENCRYPTION_KEY = "test-encryption-key-1234567890";
  });

  afterAll(() => {
    process.env.HEALTH_ENCRYPTION_KEY = originalSecret;
  });

  test("encrypt and decrypt returns original plaintext", () => {
    const plaintext = "Hello Advanced Smart Wallet!";
    const encrypted = encrypt(plaintext);
    
    // Format should be iv:encrypted:authTag
    expect(encrypted.split(":")).toHaveLength(3);
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("encrypt and decrypt works for empty string", () => {
    const plaintext = "";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("decrypting with wrong format throws error", () => {
    expect(() => decrypt("invalid-format")).toThrow("Invalid encrypted data format");
    expect(() => decrypt("iv:encrypted")).toThrow("Invalid encrypted data format");
  });

  test("decrypting tampered data fails (AES-GCM integrity check)", () => {
    const plaintext = "Sensitive user data";
    const encrypted = encrypt(plaintext);
    const [iv, body, tag] = encrypted.split(":");
    
    // Tamper with the encrypted body - flip the last character if it's hex
    const tamperedBody = body.substring(0, body.length - 1) + (body.endsWith("a") ? "b" : "a");
    const tamperedCipher = `${iv}:${tamperedBody}:${tag}`;
    
    // AES-GCM should throw an error on authentication failure
    expect(() => decrypt(tamperedCipher)).toThrow();
  });

  test("decrypting for total garbage string (longer than parts) fails", () => {
    // Ensuring it throws on decipher.final() or similar if parts are not valid hex
    expect(() => decrypt("zzzz:zzzz:zzzz")).toThrow();
  });

  test("encryptJSON and decryptJSON handle objects", () => {
    const sensitiveObj = { userId: "u123", healthCode: "ABC-456", sensitive: true };
    const encrypted = encryptJSON(sensitiveObj);
    const decrypted = decryptJSON(encrypted);
    
    expect(decrypted).toEqual(sensitiveObj);
  });

  test("changing key makes decryption fail", () => {
    const plaintext = "Cannot decrypt me with another key";
    const encrypted = encrypt(plaintext);
    
    // Temporarily change key
    const currentKey = process.env.HEALTH_ENCRYPTION_KEY;
    process.env.HEALTH_ENCRYPTION_KEY = "completely-different-key";
    
    // Should throw or return garbage (AES-GCM will throw on auth failure)
    expect(() => decrypt(encrypted)).toThrow();
    
    // Restore
    process.env.HEALTH_ENCRYPTION_KEY = currentKey;
  });
});
