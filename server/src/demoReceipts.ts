export const DEMO_CHAIN = {
  txs: {
    "c-margin": "0x7158f1b908f5387d2ceae25314255a46a5f1c86e4c02f18bab0650c5ab341270",
    "c-driver": "0x6ad4b49228c917e03fc93ee559bb543a4692b300a99ad91aa61f4e88a734ae2e",
    "c-flip": "0x8b1806a8c2ddbcefad822945710b9e3107e22d77b60e4da12999bc0cf8d9a0ac",
  },
  actions: {
    "c-margin": "PAID",
    "c-driver": "PAID",
    "c-flip": "FLAGGED",
  },
  closeTx: "0x6b8d527f57cbe9231cb258e4ae89224f91e81268f1f1447b285e7431414bc2b2",
} as const;

export function txForRecordedAction(claimId: string, action: string): string | undefined {
  const recorded = DEMO_CHAIN.actions[claimId as keyof typeof DEMO_CHAIN.actions];
  if (recorded !== action) return undefined;
  return DEMO_CHAIN.txs[claimId as keyof typeof DEMO_CHAIN.txs];
}

export function recordedCloseTx(actions: Array<{ claimId: string; action: string }>): string | undefined {
  const matches = actions.every((item) => DEMO_CHAIN.actions[item.claimId as keyof typeof DEMO_CHAIN.actions] === item.action);
  return matches ? DEMO_CHAIN.closeTx : undefined;
}
