/**
 * The fastest of `runs` timings, in milliseconds. A speed budget is meant to catch code
 * that is too slow, not a garbage-collection pause or a cold start on a busy CI machine,
 * and the minimum of a few runs ignores those.
 */
export function fastestOf(runs: number, work: () => void): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    work();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}
