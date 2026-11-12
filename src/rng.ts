// Seeded RNG (mulberry32). D1 uses its own LCG; exact roll sequences are not reproduced (deviation), only the distributions.
export class Rng {
  constructor(public s: number) { this.s = s >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** D1 random_(idx, n): 0..n-1, 0 when n <= 0. */
  int(n: number): number { return n <= 0 ? 0 : Math.floor(this.next() * n); }
  range(a: number, b: number): number { return a + this.int(b - a + 1); }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
}
