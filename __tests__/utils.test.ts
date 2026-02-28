import { cn, formatAddress, shortenAddress } from "@/lib/utils";

describe("Utils Library Unit Tests", () => {
  describe("cn (className merge)", () => {
    test("merges class names", () => {
      const result = cn("bg-red-500", "text-white");
      expect(result).toContain("bg-red-500");
      expect(result).toContain("text-white");
    });

    test("handles conditional classes", () => {
      const result = cn("base", false && "hidden", "visible");
      expect(result).toContain("base");
      expect(result).toContain("visible");
      expect(result).not.toContain("hidden");
    });

    test("resolves tailwind conflicts (last wins)", () => {
      const result = cn("bg-red-500", "bg-blue-500");
      // twMerge should resolve and keep the last one
      expect(result).toBe("bg-blue-500");
    });

    test("handles empty input", () => {
      const result = cn();
      expect(result).toBe("");
    });
  });

  describe("formatAddress", () => {
    test("shortens a full address", () => {
      const address = "0x1234567890abcdef1234567890abcdef12345678";
      const formatted = formatAddress(address);
      expect(formatted).toBe("0x1234...5678");
    });

    test("shows first 6 and last 4 chars", () => {
      const address = "0xABCDEF1122334455667788990011AABBCCDDEEFF";
      const formatted = formatAddress(address);
      expect(formatted.startsWith("0xABCD")).toBe(true);
      expect(formatted.endsWith("EEFF")).toBe(true);
      expect(formatted).toContain("...");
    });
  });

  describe("shortenAddress", () => {
    test("is an alias for formatAddress", () => {
      const address = "0x1234567890abcdef1234567890abcdef12345678";
      expect(shortenAddress(address)).toBe(formatAddress(address));
    });
  });
});
