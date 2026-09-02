import { expect, test } from "bun:test";
import { createReportCountRefresher } from "./report-count";

test("keeps the latest report count response", async () => {
  let resolveFirst!: (count: number) => void;
  let resolveSecond!: (count: number) => void;
  const first = new Promise<number>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<number>((resolve) => {
    resolveSecond = resolve;
  });
  let requestCount = 0;
  const fetchCount = async () => (requestCount++ === 0 ? first : second);
  const counts: (number | null)[] = [];
  const refresher = createReportCountRefresher(fetchCount, (count) => {
    counts.push(count);
  });

  const firstRequest = refresher.refresh();
  const secondRequest = refresher.refresh();

  resolveSecond(1);
  await secondRequest;
  resolveFirst(2);
  await firstRequest;

  expect(counts).toEqual([1]);
});
