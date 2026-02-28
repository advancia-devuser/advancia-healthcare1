/**
 * Tests for lib/logger.ts
 */
import { logger } from "@/lib/logger";

beforeEach(() => jest.clearAllMocks());

describe("logger", () => {
  it("exposes debug, info, warn, error, fatal methods", () => {
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.fatal).toBe("function");
  });

  it("logs info messages to console.log", () => {
    const spy = jest.spyOn(console, "log").mockImplementation();
    logger.info("test message", { userId: "u1" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs error messages to console.error", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    logger.error("oops", { err: new Error("boom") });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs fatal messages to console.error", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    logger.fatal("critical failure");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("serialises Error instances in extra", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    logger.error("fail", { err: new Error("test-error") });

    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("test-error");
    spy.mockRestore();
  });

  it("child logger merges default fields", () => {
    const spy = jest.spyOn(console, "log").mockImplementation();
    const child = logger.child({ service: "cron" });
    child.info("tick", { job: "deposits" });

    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("cron");
    expect(output).toContain("deposits");
    spy.mockRestore();
  });

  it("does not throw for missing extra", () => {
    const spy = jest.spyOn(console, "log").mockImplementation();
    expect(() => logger.info("bare message")).not.toThrow();
    spy.mockRestore();
  });
});
