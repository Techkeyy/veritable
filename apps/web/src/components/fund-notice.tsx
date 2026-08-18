"use client";

import { ArrowUpRight, CircleDollarSign, Fuel, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { parseEther, parseUnits } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { erc20Abi } from "../lib/abis";
import { activeChain, contracts, isMainnet, nativeTokenLabel, writesEnabled } from "../lib/chain";
import { formatAmount } from "../lib/format";

const FAUCET_URL = "https://faucet.botchain.ai/basic/";
const LOW_GAS = parseEther("0.02");
const LOW_USDT = parseUnits("1", 6);

export function FundNotice() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const [mintError, setMintError] = useState("");
  const onNetwork = isConnected && chainId === activeChain.id && Boolean(address);

  const gas = useBalance({
    address,
    chainId: activeChain.id,
    query: { enabled: onNetwork, refetchInterval: 12_000 },
  });
  const usdt = useReadContract({
    address: contracts.settlement,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChain.id,
    query: { enabled: onNetwork && Boolean(contracts.settlement), refetchInterval: 12_000 },
  });

  const needsGas = onNetwork && gas.data !== undefined && gas.data.value < LOW_GAS;
  const needsUsdt = onNetwork && !isMainnet && usdt.data !== undefined && usdt.data < LOW_USDT;
  if (!needsGas && !needsUsdt) return null;

  async function mintTestUsdt() {
    if (!address || !publicClient || !contracts.settlement || isMainnet) return;
    try {
      setMintError("");
      const hash = await writeContractAsync({
        address: contracts.settlement,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, parseUnits("10000", 6)],
        chainId: activeChain.id,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("TestUSDT mint reverted");
      await Promise.all([usdt.refetch(), gas.refetch()]);
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n")[0] : "Could not mint TestUSDT";
      setMintError(needsGas ? `Minting needs ${nativeTokenLabel} for gas. Get ${nativeTokenLabel} first. ${detail}` : detail);
    }
  }

  return (
    <div className="fund-notice shell" role="status">
      {needsGas && (
        <div className="fund-card gas">
          <Fuel size={18} />
          <div>
            <strong>You need {nativeTokenLabel} for gas</strong>
            <p>
              This wallet has {gas.data ? formatAmount(gas.data.value, 18) : "0"} {nativeTokenLabel}.
              Open the official faucet, request test tokens, then come back. Every on-chain action needs gas.
            </p>
          </div>
          <a className="fund-action" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Get {nativeTokenLabel} <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      {needsUsdt && (
        <div className="fund-card usdt">
          <CircleDollarSign size={18} />
          <div>
            <strong>You need TestUSDT</strong>
            <p>
              {needsGas
                ? `Get ${nativeTokenLabel} first, then mint TestUSDT here. You will use it to escrow income or buy shares.`
                : "Mint 10,000 TestUSDT to this wallet to escrow income or buy shares."}
            </p>
            {mintError && <p className="fund-error">{mintError}</p>}
          </div>
          <button
            type="button"
            className="fund-action"
            disabled={!writesEnabled || isPending || !contracts.settlement}
            onClick={() => void mintTestUsdt()}
          >
            {isPending ? <LoaderCircle className="spin" size={15} /> : <CircleDollarSign size={15} />}
            Get TestUSDT
          </button>
        </div>
      )}
    </div>
  );
}
