/** Run `fn` over `items` with at most `concurrency` calls in flight. */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++;
        await fn(items[i]!, i);
      }
    },
  );
  await Promise.all(workers);
}
