import { assertAdminPasswordEnv, assertRedisRestEnvPair } from "@/lib/env";

describe("Environment validation helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.REDIS_REST_URL;
    delete process.env.REDIS_REST_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("assertAdminPasswordEnv", () => {
    test("throws in production when ADMIN_PASSWORD_HASH is missing", () => {
      process.env = { ...process.env, NODE_ENV: "production" };
      process.env.ADMIN_PASSWORD = "dev-only";

      expect(() => assertAdminPasswordEnv()).toThrow(
        "ADMIN_PASSWORD_HASH is required in production"
      );
    });

    test("does not throw in production when ADMIN_PASSWORD_HASH is present", () => {
      process.env = { ...process.env, NODE_ENV: "production" };
      process.env.ADMIN_PASSWORD_HASH = "$2b$12$examplehashvalueexamplehashvalueexamplehashvalue";

      expect(() => assertAdminPasswordEnv()).not.toThrow();
    });

    test("warns in non-production when both admin password envs are missing", () => {
      process.env = { ...process.env, NODE_ENV: "development" };
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      expect(() => assertAdminPasswordEnv()).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("assertRedisRestEnvPair", () => {
    test("throws in production when only REDIS_REST_URL is set", () => {
      process.env = { ...process.env, NODE_ENV: "production" };
      process.env.REDIS_REST_URL = "https://example.upstash.io";

      expect(() => assertRedisRestEnvPair()).toThrow(
        "REDIS_REST_URL and REDIS_REST_TOKEN must be provided together."
      );
    });

    test("warns in development when pair is incomplete", () => {
      process.env = { ...process.env, NODE_ENV: "development" };
      process.env.REDIS_REST_TOKEN = "token-only";
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      expect(() => assertRedisRestEnvPair()).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    test("does not throw when both REDIS_REST_URL and REDIS_REST_TOKEN are set", () => {
      process.env = { ...process.env, NODE_ENV: "production" };
      process.env.REDIS_REST_URL = "https://example.upstash.io";
      process.env.REDIS_REST_TOKEN = "token";

      expect(() => assertRedisRestEnvPair()).not.toThrow();
    });
  });
});
