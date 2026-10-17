import { contentHashOf, type SourceRecord } from "../hardChecks.ts";

export type RegisteredSource = SourceRecord & {
  title: string;
  publisher: string;
  isOriginal: boolean;
  payee: `0x${string}`;
  pricePerClaim: string;
};

const META = [
  {
    sourceId: "report-beilan",
    title: "北岚科技2026年第二季度业绩点评",
    publisher: "北岚研究",
    isOriginal: true,
    payee: "0x1111111111111111111111111111111111111111",
    pricePerClaim: "1000",
    file: "report-beilan.md",
  },
  {
    sourceId: "news-caijing",
    title: "北岚科技二季度毛利率下降",
    publisher: "临江财经",
    isOriginal: true,
    payee: "0x2222222222222222222222222222222222222222",
    pricePerClaim: "1000",
    file: "news-caijing.md",
  },
  {
    sourceId: "reprint-aggregator",
    title: "北岚科技毛利率回升",
    publisher: "快转资讯",
    isOriginal: false,
    payee: "0x3333333333333333333333333333333333333333",
    pricePerClaim: "1000",
    file: "reprint-aggregator.md",
  },
  {
    sourceId: "logistics",
    title: "港湾物流运价下跌",
    publisher: "港湾物流",
    isOriginal: true,
    payee: "0x4444444444444444444444444444444444444444",
    pricePerClaim: "1000",
    file: "logistics.md",
  },
] as const;

export async function loadSources(): Promise<RegisteredSource[]> {
  const loaded: RegisteredSource[] = [];
  for (const item of META) {
    const file = Bun.file(new URL(`./${item.file}`, import.meta.url));
    const body = (await file.text()).replace(/\r\n/g, "\n").trim();
    loaded.push({
      sourceId: item.sourceId,
      title: item.title,
      publisher: item.publisher,
      isOriginal: item.isOriginal,
      payee: item.payee,
      pricePerClaim: item.pricePerClaim,
      body,
      active: true,
      contentHash: contentHashOf(body),
    });
  }
  return loaded;
}

export function toSourceMap(sources: RegisteredSource[]): Map<string, SourceRecord> {
  return new Map(sources.map((source) => [source.sourceId, source]));
}

export function priceMap(sources: RegisteredSource[]): Map<string, string> {
  return new Map(sources.map((source) => [source.sourceId, source.pricePerClaim]));
}
