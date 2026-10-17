import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  http,
  keccak256,
  toBytes,
  type Abi,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { evidenceHashOf } from "../evidence.ts";
import { loadSources } from "../sources/registry.ts";
import { monadTestnet } from "./chain.ts";
import { gasLimit } from "./gas.ts";

const key = process.env.OPERATOR_PRIVATE_KEY;
if (!key?.startsWith("0x")) throw new Error("缺少 OPERATOR_PRIVATE_KEY");

const account = privateKeyToAccount(key as `0x${string}`);
const rpc = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(rpc) });

const root = new URL("../../../contracts/out/", import.meta.url);
const mockArtifact = await readArtifact(new URL("MockUSDC.sol/MockUSDC.json", root));
const escrowArtifact = await readArtifact(new URL("CiteEscrow.sol/CiteEscrow.json", root));

const usdcAddress = await deploy(mockArtifact.abi, mockArtifact.bytecode, []);
await write(usdcAddress, mockArtifact.abi, "mint", [account.address, 10_000_000n]);
const escrowAddress = await deploy(escrowArtifact.abi, escrowArtifact.bytecode, [usdcAddress, account.address, 500]);

const sources = await loadSources();
for (const source of sources) {
  await write(escrowAddress, escrowArtifact.abi, "registerSource", [
    idOf(source.sourceId),
    source.payee,
    BigInt(source.pricePerClaim),
    source.contentHash,
  ]);
}

const answerId = idOf("demo-beilan-q2");
await write(usdcAddress, mockArtifact.abi, "approve", [escrowAddress, 5_000n]);
await write(escrowAddress, escrowArtifact.abi, "deposit", [answerId, 5_000n]);

const paid = ["c-margin", "c-driver"];
const tx: Record<string, string> = {};
for (const claimId of paid) {
  const receipt = await write(escrowAddress, escrowArtifact.abi, "settleClaim", [
    answerId,
    idOf(claimId),
    idOf(claimId === "c-driver" ? "report-beilan" : "report-beilan"),
    evidenceHashOf({ claimId, verdict: "SUPPORTED" }),
  ]);
  tx[claimId] = receipt.transactionHash;
}
const flagged = await write(escrowAddress, escrowArtifact.abi, "flagClaim", [
  answerId,
  idOf("c-flip"),
  idOf("news-caijing"),
  1,
  evidenceHashOf({ claimId: "c-flip", verdict: "CONTRADICTED" }),
]);
tx["c-flip"] = flagged.transactionHash;
const closed = await write(escrowAddress, escrowArtifact.abi, "closeAnswer", [answerId]);

const budgetLeft = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowArtifact.abi,
  functionName: "budget",
  args: [answerId],
});
if (budgetLeft !== 0n) throw new Error(`退款后预算应为 0，实际 ${budgetLeft}`);

await updateEnv(usdcAddress, escrowAddress);
console.log(
  JSON.stringify({
    operator: account.address,
    usdc: usdcAddress,
    escrow: escrowAddress,
    settled: tx,
    closeTx: closed.transactionHash,
    explorer: "https://testnet.monadexplorer.com",
  }),
);

function idOf(value: string): Hash {
  return keccak256(toBytes(value));
}

async function readArtifact(url: URL): Promise<{ abi: Abi; bytecode: `0x${string}` }> {
  const json = (await Bun.file(url).json()) as { abi: Abi; bytecode: { object: `0x${string}` } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

async function deploy(abi: Abi, bytecode: `0x${string}`, args: unknown[]): Promise<`0x${string}`> {
  const data = encodeDeployData({ abi, bytecode, args });
  const estimate = await publicClient.estimateGas({ account, data });
  const hash = await walletClient.deployContract({ abi, bytecode, args, gas: gasLimit(estimate) });
  const receipt = await waitFinal(hash);
  if (!receipt.contractAddress) throw new Error("部署没有返回合约地址");
  return receipt.contractAddress;
}

async function write(address: `0x${string}`, abi: Abi, functionName: string, args: unknown[]): Promise<TransactionReceipt> {
  const estimate = await publicClient.estimateContractGas({
    address,
    abi,
    functionName,
    args,
    account,
  });
  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName,
    args,
    gas: gasLimit(estimate),
  });
  return waitFinal(hash);
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

async function updateEnv(usdc: string, escrow: string): Promise<void> {
  const path = new URL("../../../.env", import.meta.url);
  const text = await Bun.file(path).text();
  const next = text
    .replace(/^USDC_ADDRESS=.*$/m, `USDC_ADDRESS=${usdc}`)
    .replace(/^ESCROW_ADDRESS=.*$/m, `ESCROW_ADDRESS=${escrow}`)
    .replace(/^USE_MOCK_USDC=.*$/m, "USE_MOCK_USDC=1");
  await Bun.write(path, next);
}
