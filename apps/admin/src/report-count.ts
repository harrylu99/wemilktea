export function createReportCountRefresher(
  fetchCount: () => Promise<number>,
  onCount: (count: number | null) => void
) {
  let generation = 0;

  return {
    dispose() {
      generation += 1;
    },
    refresh() {
      const requestGeneration = ++generation;
      return fetchCount()
        .then((count) => {
          if (requestGeneration === generation) onCount(count);
        })
        .catch(() => {
          if (requestGeneration === generation) onCount(null);
        });
    }
  };
}
