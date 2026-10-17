export function gasLimit(estimate: bigint): bigint {
  if (estimate <= 0n) throw new Error("gas 估算无效");
  return (estimate * 1075n) / 1000n;
}
