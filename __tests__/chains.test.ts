/**
 * Tests for lib/chains.ts
 * Verifies chain data structure, contract addresses, and completeness.
 */

// Mock the ESM-only @account-kit/infra package with plain objects
jest.mock("@account-kit/infra", () => {
  const makeChain = (id: number, name: string) => ({ id, name });
  return {
    arbitrumSepolia: makeChain(421614, "Arbitrum Sepolia"),
    baseSepolia: makeChain(84532, "Base Sepolia"),
    sepolia: makeChain(11155111, "Sepolia"),
    polygonAmoy: makeChain(80002, "Polygon Amoy"),
    shapeSepolia: makeChain(11011, "Shape Sepolia"),
    soneiumMinato: makeChain(1946, "Soneium Minato"),
    unichainSepolia: makeChain(1301, "Unichain Sepolia"),
    inkSepolia: makeChain(763373, "Ink Sepolia"),
    monadTestnet: makeChain(10143, "Monad Testnet"),
    riseTestnet: makeChain(11473, "Rise Testnet"),
    storyAeneid: makeChain(1315, "Story Aeneid"),
    teaSepolia: makeChain(10218, "Tea Sepolia"),
  };
});

import { chainNFTMintContractData, type ChainData } from "@/lib/chains";

describe("chainNFTMintContractData", () => {
  it("exports a non-empty record", () => {
    expect(Object.keys(chainNFTMintContractData).length).toBeGreaterThanOrEqual(1);
  });

  it("every entry has a valid chain and NFT contract address", () => {
    for (const [id, data] of Object.entries(chainNFTMintContractData)) {
      expect(data.chain).toBeDefined();
      expect(data.chain.id).toBe(Number(id));
      expect(data.nftContractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("includes arbitrumSepolia (421614)", () => {
    const entry = chainNFTMintContractData[421614];
    expect(entry).toBeDefined();
    expect(entry.chain.id).toBe(421614);
  });

  it("includes baseSepolia (84532)", () => {
    const entry = chainNFTMintContractData[84532];
    expect(entry).toBeDefined();
  });

  it("includes sepolia (11155111)", () => {
    const entry = chainNFTMintContractData[11155111];
    expect(entry).toBeDefined();
  });
});
