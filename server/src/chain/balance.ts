import { createPublicClient, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain.ts";

const key = process.env.OPERATOR_PRIVATE_KEY;
if (!key || !key.startsWith("0x")) throw new Error("缺少 OPERATOR_PRIVATE_KEY");

const account = privateKeyToAccount(key as `0x${string}`);
const rpc = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const client = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
const balance = await client.getBalance({ address: account.address });
const block = await client.getBlockNumber();
console.log(JSON.stringify({ address: account.address, mon: formatUnits(balance, 18), block: block.toString() }));
