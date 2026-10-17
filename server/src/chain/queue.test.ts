import { describe, expect, test } from "bun:test";
import { createSerialQueue } from "./queue.ts";

describe("结算队列", () => {
  test("两笔任务不会同时开始", async () => {
    const enqueue = createSerialQueue();
    let active = 0;
    let maxActive = 0;
    const job = () =>
      enqueue(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Bun.sleep(20);
        active -= 1;
      });
    await Promise.all([job(), job(), job()]);
    expect(maxActive).toBe(1);
  });
});
