import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { Alchemy, Network } from "alchemy-sdk";

const config = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  network: Network.ARB_SEPOLIA,
};

const alchemy = new Alchemy(config);

/**
 * GET /api/transactions
 * Returns the current user's on-chain transaction history via Alchemy.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const transfers = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      toAddress: user.address,
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: 100,
      category: ["external", "internal", "erc20", "erc721", "erc1155"],
    });

    // Also query transfers sent *from* the user's address
    const sentTransfers = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      fromAddress: user.address,
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: 100,
      category: ["external", "internal", "erc20", "erc721", "erc1155"],
    });

    // Combine and sort transfers by block number
    const allTransfers = [...transfers.transfers, ...sentTransfers.transfers];
    allTransfers.sort((a, b) => parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16));

    // Deduplicate based on transaction hash
    const uniqueTransfers = allTransfers.filter(
      (transfer, index, self) =>
        index === self.findIndex((t) => t.hash === transfer.hash)
    );

    return NextResponse.json(uniqueTransfers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

