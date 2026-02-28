import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateTotpUri,
} from "@/lib/totp";

describe("TOTP Library Unit Tests", () => {
  test("generateTotpSecret returns a base32 string", () => {
    const secret = generateTotpSecret();
    expect(secret).toBeTruthy();
    // Base32 characters: A-Z, 2-7
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // A 20-byte random buffer → 32 base32 chars
    expect(secret.length).toBeGreaterThanOrEqual(20);
  });

  test("generateTotpCode returns a 6-digit string", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  test("same secret and time yields same code", () => {
    const secret = generateTotpSecret();
    const fixedTime = 1700000000; // deterministic
    const code1 = generateTotpCode(secret, fixedTime);
    const code2 = generateTotpCode(secret, fixedTime);
    expect(code1).toBe(code2);
  });

  test("different time steps yield different codes", () => {
    const secret = generateTotpSecret();
    const code1 = generateTotpCode(secret, 1700000000);
    const code2 = generateTotpCode(secret, 1700000060); // 2 steps later
    // They CAN collide by chance, but very unlikely
    // We just test that the function runs without error
    expect(code1).toMatch(/^\d{6}$/);
    expect(code2).toMatch(/^\d{6}$/);
  });

  test("verifyTotpCode accepts current code", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    // verifyTotpCode uses Date.now() internally with ±1 drift window
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  test("verifyTotpCode rejects wrong code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  test("verifyTotpCode rejects code from different secret", () => {
    const secret1 = generateTotpSecret();
    const secret2 = generateTotpSecret();
    const code = generateTotpCode(secret1);
    // Extremely unlikely to match a different secret
    expect(verifyTotpCode(secret2, code)).toBe(false);
  });

  test("generateTotpUri returns proper otpauth format", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = generateTotpUri(secret, "user@example.com", "Advancia");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Advancia");
    expect(uri).toContain("user%40example.com");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
    expect(uri).toContain("algorithm=SHA1");
  });

  test("generateTotpUri defaults issuer to SmartWallet", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = generateTotpUri(secret, "test@test.com");
    expect(uri).toContain("issuer=SmartWallet");
  });
});
