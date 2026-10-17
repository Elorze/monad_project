import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  type Abi,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { contentHashOf } from "../hardChecks.ts";
import { payeeOf } from "../sources/registry.ts";
import { monadTestnet } from "./chain.ts";
import { gasLimit } from "./gas.ts";
import { createSerialQueue } from "./queue.ts";

const MAX_UINT = (1n << 256n) - 1n;
const PRICE = 1000n;

const escrowAbi = [
  {
    type: "function",
    name: "sources",
    stateMutability: "view",
    inputs: [{ name: "sourceId", type: "bytes32" }],
    outputs: [
      { name: "payee", type: "address" },
      { name: "pricePerClaim", type: "uint96" },
      { name: "contentHash", type: "bytes32" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "registerSource",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sourceId", type: "bytes32" },
      { name: "payee", type: "address" },
      { name: "price", type: "uint96" },
      { name: "contentHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "answerId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleClaim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "answerId", type: "bytes32" },
      { name: "claimId", type: "bytes32" },
      { name: "sourceId", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closeAnswer",
    stateMutability: "nonpayable",
    inputs: [{ name: "answerId", type: "bytes32" }],
    outputs: [],
  },
] as const satisfies Abi;

const usdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

export type PaidClaimSettlement = {
  claimId: string;
  sourceId: string;
  body: string;
  evidenceHash: `0x${string}`;
};

export type SettlementReceipts = {
  txByClaim: Record<string, `0x${string}`>;
  closeTx?: `0x${string}`;
};

export type EscrowIo = {
  readSource(sourceId: Hash): Promise<{ active: boolean; price: bigint }>;
  registerSource(sourceId: Hash, payee: `0x${string}`, price: bigint, contentHash: Hash): Promise<Hash>;
  balance(): Promise<bigint>;
  allowance(): Promise<bigint>;
  mint(amount: bigint): Promise<Hash>;
  approve(amount: bigint): Promise<Hash>;
  deposit(answerId: Hash, amount: bigint): Promise<Hash>;
  settleClaim(answerId: Hash, claimId: Hash, sourceId: Hash, evidenceHash: Hash): Promise<Hash>;
  closeAnswer(answerId: Hash): Promise<Hash>;
};

const enqueue = createSerialQueue();

export function idOf(value: string): Hash {
  return keccak256(toBytes(value));
}

export async function settlePaidClaims(
  io: EscrowIo,
  input: { answerId: string; budget: bigint; operator: `0x${string}`; claims: PaidClaimSettlement[] },
): Promise<SettlementReceipts> {
  const txByClaim: Record<string, `0x${string}`> = {};
  if (input.claims.length === 0 || input.budget <= 0n) return { txByClaim };

  const seen = new Set<string>();
  for (const claim of input.claims) {
    if (seen.has(claim.sourceId)) continue;
    seen.add(claim.sourceId);
    const sourceId = idOf(claim.sourceId);
    const current = await io.readSource(sourceId);
    if (current.active && current.price === PRICE) continue;
    await io.registerSource(sourceId, payeeOf(claim.sourceId) ?? input.operator, PRICE, contentHashOf(claim.body));
  }

  const balance = await io.balance();
  if (balance < input.budget) await io.mint(input.budget * 20n);
  const allowance = await io.allowance();
  if (allowance < input.budget) await io.approve(MAX_UINT);

  const answerId = idOf(input.answerId);
  await io.deposit(answerId, input.budget);
  let failed: unknown;
  let closeTx: `0x${string}` | undefined;
  try {
    for (const claim of input.claims) {
      txByClaim[claim.claimId] = await io.settleClaim(
        answerId,
        idOf(claim.claimId),
        idOf(claim.sourceId),
        claim.evidenceHash,
      );
    }
  } catch (error) {
    failed = error;
  }
  closeTx = await io.closeAnswer(answerId);
  if (failed) throw failed;
  return { txByClaim, closeTx };
}

export async function settleIfConfigured(input: {
  answerId: string;
  budget: bigint;
  claims: PaidClaimSettlement[];
}): Promise<SettlementReceipts | null> {
  const escrow = process.env.ESCROW_ADDRESS;
  const usdc = process.env.USDC_ADDRESS;
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!escrow?.startsWith("0x") || !usdc?.startsWith("0x") || !key?.startsWith("0x")) return null;
  if (input.claims.length === 0) return { txByClaim: {} };
  const account = privateKeyToAccount(key as `0x${string}`);
  return enqueue(() => settlePaidClaims(createLiveIo(account, usdc as `0x${string}`, escrow as `0x${string}`), { ...input, operator: account.address }));
}

function createLiveIo(account: ReturnType<typeof privateKeyToAccount>, usdc: `0x${string}`, escrow: `0x${string}`): EscrowIo {
  const rpc = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(rpc) });

  async function write(address: `0x${string}`, abi: Abi, functionName: string, args: unknown[]): Promise<Hash> {
    const estimate = await publicClient.estimateContractGas({ address, abi, functionName, args, account });
    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
      gas: gasLimit(estimate),
      chain: monadTestnet,
      account,
    });
    const receipt = await waitFinal(hash);
    return receipt.transactionHash;
  }

  async function waitFinal(hash: Hash): Promise<TransactionReceipt> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`交易失败 ${hash}`);
    for (let attempt = 0; attempt < 15; attempt++) {
      const finalized = await publicClient.getBlock({ blockTag: "finalized" });
      if (finalized.number >= receipt.blockNumber) return receipt;
      await Bun.sleep(400);
    }
    throw new Error(`尚未终局 ${hash}`);
  }

  return {
    readSource: async (sourceId) => {
      const row = await publicClient.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "sources",
        args: [sourceId],
      });
      return { active: row[3], price: row[1] };
    },
    registerSource: (sourceId, payee, price, contentHash) =>
      write(escrow, escrowAbi, "registerSource", [sourceId, payee, price, contentHash]),
    balance: () =>
      publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [account.address] }),
    allowance: () =>
      publicClient.readContract({
        address: usdc,
        abi: usdcAbi,
        functionName: "allowance",
        args: [account.address, escrow],
      }),
    mint: (amount) => write(usdc, usdcAbi, "mint", [account.address, amount]),
    approve: (amount) => write(usdc, usdcAbi, "approve", [escrow, amount]),
    deposit: (answerId, amount) => write(escrow, escrowAbi, "deposit", [answerId, amount]),
    settleClaim: (answerId, claimId, sourceId, evidenceHash) =>
      write(escrow, escrowAbi, "settleClaim", [answerId, claimId, sourceId, evidenceHash]),
    closeAnswer: (answerId) => write(escrow, escrowAbi, "closeAnswer", [answerId]),
  };
}
