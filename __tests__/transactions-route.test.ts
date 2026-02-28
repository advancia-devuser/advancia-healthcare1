import { GET } from "@/app/api/transactions/route";
import { requireApprovedUser } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("alchemy-sdk", () => ({
  Alchemy: jest.fn().mockImplementation(() => ({
    core: {
      getAssetTransfers: jest.fn(),
    },
  })),
  Network: { ARB_SEPOLIA: "arb-sepolia" },
  AssetTransfersCategory: {
    EXTERNAL: "external",
    INTERNAL: "internal",
    ERC20: "erc20",
    ERC721: "erc721",
    ERC1155: "erc1155",
  },
}));

// We need to get the mocked Alchemy instance
const { Alchemy } = require("alchemy-sdk");

describe("Transactions Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when requireApprovedUser throws Unauthorized Error", async () => {
    (requireApprovedUser as jest.Mock).mockRejectedValue(
      new Error("Unauthorized")
    );

    const req = new Request("http://localhost/api/transactions");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("returns 500 when requireApprovedUser throws a Response object", async () => {
    (requireApprovedUser as jest.Mock).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const req = new Request("http://localhost/api/transactions");
    const res = await GET(req);
    // Response is not instanceof Error, so message = "An unknown error occurred" → 500
    expect(res.status).toBe(500);
  });

  test("returns deduplicated and sorted transfers", async () => {
    const mockUser = { id: "u1", address: "0xuser" };
    (requireApprovedUser as jest.Mock).mockResolvedValue(mockUser);

    // Need to get the mock instance used by the route
    const alchemyInstance = new Alchemy();
    // Override the prototype to affect the instance created in the module
    Alchemy.mockImplementation(() => ({
      core: {
        getAssetTransfers: jest.fn()
          .mockResolvedValueOnce({
            transfers: [
              { hash: "0xa", blockNum: "0x10", category: "external" },
              { hash: "0xb", blockNum: "0x20", category: "erc20" },
            ],
          })
          .mockResolvedValueOnce({
            transfers: [
              { hash: "0xa", blockNum: "0x10", category: "external" }, // duplicate
              { hash: "0xc", blockNum: "0x15", category: "internal" },
            ],
          }),
      },
    }));

    // Re-import to use the new mock
    jest.resetModules();
    jest.mock("@/lib/auth", () => ({
      requireApprovedUser: jest.fn().mockResolvedValue(mockUser),
    }));
    jest.mock("alchemy-sdk", () => ({
      Alchemy: jest.fn().mockImplementation(() => ({
        core: {
          getAssetTransfers: jest.fn()
            .mockResolvedValueOnce({
              transfers: [
                { hash: "0xa", blockNum: "0x10", category: "external" },
                { hash: "0xb", blockNum: "0x20", category: "erc20" },
              ],
            })
            .mockResolvedValueOnce({
              transfers: [
                { hash: "0xa", blockNum: "0x10", category: "external" },
                { hash: "0xc", blockNum: "0x15", category: "internal" },
              ],
            }),
        },
      })),
      Network: { ARB_SEPOLIA: "arb-sepolia" },
      AssetTransfersCategory: {
        EXTERNAL: "external",
        INTERNAL: "internal",
        ERC20: "erc20",
        ERC721: "erc721",
        ERC1155: "erc1155",
      },
    }));

    const { GET: GET2 } = require("@/app/api/transactions/route");
    const req = new Request("http://localhost/api/transactions");
    const res = await GET2(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Deduplicated: 0xa, 0xb, 0xc (3 unique)
    expect(body).toHaveLength(3);
    // Sorted by blockNum desc: 0xb (0x20), 0xc (0x15), 0xa (0x10)
    expect(body[0].hash).toBe("0xb");
    expect(body[1].hash).toBe("0xc");
    expect(body[2].hash).toBe("0xa");
  });

  test("returns 500 on Alchemy error", async () => {
    (requireApprovedUser as jest.Mock).mockResolvedValue({ id: "u1", address: "0xuser" });
    
    jest.resetModules();
    jest.mock("@/lib/auth", () => ({
      requireApprovedUser: jest.fn().mockResolvedValue({ id: "u1", address: "0xuser" }),
    }));
    jest.mock("alchemy-sdk", () => ({
      Alchemy: jest.fn().mockImplementation(() => ({
        core: {
          getAssetTransfers: jest.fn().mockRejectedValue(new Error("API down")),
        },
      })),
      Network: { ARB_SEPOLIA: "arb-sepolia" },
      AssetTransfersCategory: {
        EXTERNAL: "external",
        INTERNAL: "internal",
        ERC20: "erc20",
        ERC721: "erc721",
        ERC1155: "erc1155",
      },
    }));

    const { GET: GET3 } = require("@/app/api/transactions/route");
    const req = new Request("http://localhost/api/transactions");
    const res = await GET3(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("API down");
  });
});
