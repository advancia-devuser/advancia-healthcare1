import {
  PROVIDERS,
  getTransakUrl,
  getMoonPayUrl,
  getRampUrl,
  generateWidgetUrl,
} from "@/lib/onramp-providers";
import type { OnRampParams } from "@/lib/onramp-providers";

const baseParams: OnRampParams = {
  walletAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
  cryptoAsset: "ETH",
  fiatCurrency: "USD",
  fiatAmount: "100",
  chainId: 421614,
  orderId: "order-001",
  email: "user@test.com",
};

describe("OnRamp Providers", () => {
  describe("PROVIDERS metadata", () => {
    test("has at least 3 providers", () => {
      expect(PROVIDERS.length).toBeGreaterThanOrEqual(3);
    });

    test("each provider has required fields", () => {
      for (const p of PROVIDERS) {
        expect(p.name).toBeTruthy();
        expect(p.key).toBeTruthy();
        expect(p.minAmount).toBeLessThan(p.maxAmount);
        expect(p.supportedCrypto.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getTransakUrl", () => {
    test("returns a valid Transak URL", () => {
      const url = getTransakUrl(baseParams);
      expect(url).toContain("transak.com");
      expect(url).toContain("walletAddress=" + baseParams.walletAddress);
      expect(url).toContain("cryptoCurrencyCode=ETH");
      expect(url).toContain("fiatCurrency=USD");
      expect(url).toContain("fiatAmount=100");
      expect(url).toContain("partnerOrderId=order-001");
    });

    test("includes email when provided", () => {
      const url = getTransakUrl(baseParams);
      expect(url).toContain("email=user%40test.com");
    });

    test("excludes email when not provided", () => {
      const { email, ...noEmail } = baseParams;
      const url = getTransakUrl(noEmail as OnRampParams);
      expect(url).not.toContain("email=");
    });
  });

  describe("getMoonPayUrl", () => {
    test("returns a valid MoonPay URL", () => {
      const url = getMoonPayUrl(baseParams);
      expect(url).toContain("moonpay.com");
      expect(url).toContain("walletAddress=" + baseParams.walletAddress);
      expect(url).toContain("baseCurrencyAmount=100");
    });

    test("uses sandbox base URL by default", () => {
      const url = getMoonPayUrl(baseParams);
      expect(url).toContain("buy-sandbox.moonpay.com");
    });
  });

  describe("getRampUrl", () => {
    test("returns a valid Ramp URL", () => {
      const url = getRampUrl(baseParams);
      expect(url).toContain("ramp.network");
      expect(url).toContain("userAddress=" + baseParams.walletAddress);
      expect(url).toContain("fiatCurrency=USD");
      expect(url).toContain("fiatValue=100");
    });

    test("composes swapAsset from network and crypto", () => {
      const url = getRampUrl(baseParams);
      expect(url).toContain("swapAsset=ARBITRUM_ETH");
    });
  });

  describe("generateWidgetUrl", () => {
    test("delegates to Transak", () => {
      const url = generateWidgetUrl("TRANSAK", baseParams);
      expect(url).toContain("transak.com");
    });

    test("delegates to MoonPay", () => {
      const url = generateWidgetUrl("MOONPAY", baseParams);
      expect(url).toContain("moonpay.com");
    });

    test("delegates to Ramp", () => {
      const url = generateWidgetUrl("RAMP", baseParams);
      expect(url).toContain("ramp.network");
    });

    test("throws for unknown provider", () => {
      expect(() => generateWidgetUrl("UNKNOWN" as any, baseParams)).toThrow("Unknown provider");
    });
  });

  describe("Chain mapping fallback", () => {
    test("falls back to default network for unknown chainId", () => {
      const params = { ...baseParams, chainId: 999999 };
      const url = getTransakUrl(params);
      // Should still produce a URL with fallback network
      expect(url).toContain("network=arbitrum");
    });
  });
});
