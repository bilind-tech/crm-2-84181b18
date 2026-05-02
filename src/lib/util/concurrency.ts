// Kleiner Concurrency-Limiter. Führt `fn` für jedes Item aus,
// aber höchstens `limit` parallel. Behält die Eingabe-Reihenfolge
// im Result-Array. Wenn `fn` wirft, landet der Fehler im Result-Array
// statt die ganze Pipeline zu killen.

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function runWithConcurrency<I, O>(
  items: I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<Settled<O>[]> {
  const out: Settled<O>[] = new Array(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(limit, items.length));

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i]!, i);
        out[i] = { ok: true, value };
      } catch (error) {
        out[i] = { ok: false, error };
      }
    }
  }

  const workers = Array.from({ length: n }, () => worker());
  await Promise.all(workers);
  return out;
}
