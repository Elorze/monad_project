import { keccak256, toBytes } from "viem";

export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    throw new Error("证据 JSON 不能包含 bigint，金额用字符串");
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("证据 JSON 含有无法编码的值");
}

export function evidenceHashOf(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(value)));
}
