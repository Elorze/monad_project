import { describe, expect, test } from "bun:test";
import { type Hash } from "viem";
import { type EscrowIo, settlePaidClaims } from "./liveSettle.ts";

const HASH = `0x${"ab".repeat(32)}` as Hash;

function fakeIo(source: { active: boolean; price: bigint } = { active: true, price: 1000n }) {
  const calls: string[] = [];
  const io: EscrowIo = {
    readSource: async () => source,
    registerSource: async () => {
      calls.push("register");
      return HASH;
    },
    balance: async () => 10_000n,
    allowance: async () => 10_000n,
    mint: async () => {
      calls.push("mint");
      return HASH;
    },
    approve: async () => {
      calls.push("approve");
      return HASH;
    },
    deposit: async () => {
      calls.push("deposit");
      return HASH;
    },
    settleClaim: async () => {
      calls.push("settle");
      return `0x${"11".repeat(32)}` as Hash;
    },
    closeAnswer: async () => {
      calls.push("close");
      return `0x${"22".repeat(32)}` as Hash;
    },
  };
  return { io, calls };
}

describe("通过才上链", () => {
  test("没有通过的说法时不存款、不结算", async () => {
    const { io, calls } = fakeIo();
    const result = await settlePaidClaims(io, {
      answerId: "a",
      budget: 5000n,
      operator: "0x5555555555555555555555555555555555555555",
      claims: [],
    });
    expect(result.txByClaim).toEqual({});
    expect(calls).toEqual([]);
  });

  test("已注册的来源只存款、结算、退回剩余预算", async () => {
    const { io, calls } = fakeIo();
    const result = await settlePaidClaims(io, {
      answerId: "a",
      budget: 5000n,
      operator: "0x5555555555555555555555555555555555555555",
      claims: [
        {
          claimId: "c-ok",
          sourceId: "cc-1032",
          body: "原文",
          evidenceHash: HASH,
        },
      ],
    });
    expect(calls).toEqual(["deposit", "settle", "close"]);
    expect(result.txByClaim["c-ok"]).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.closeTx).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  test("来源没注册时先注册，余额不够时先铸造", async () => {
    const { io, calls } = fakeIo({ active: false, price: 0n });
    io.balance = async () => 0n;
    io.allowance = async () => 0n;
    await settlePaidClaims(io, {
      answerId: "a",
      budget: 5000n,
      operator: "0x5555555555555555555555555555555555555555",
      claims: [{ claimId: "c-ok", sourceId: "cc-1032", body: "原文", evidenceHash: HASH }],
    });
    expect(calls).toEqual(["register", "mint", "approve", "deposit", "settle", "close"]);
  });
});
