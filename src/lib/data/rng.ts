/** Small seeded PRNG (mulberry32) so the synthetic dataset is reproducible. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** integer in [a, b] */
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** pick by weight: [[value, weight], ...] */
  weighted<T>(pairs: readonly (readonly [T, number])[]): T {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of pairs) {
      r -= w;
      if (r <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle([...arr]).slice(0, Math.min(n, arr.length));
  }

  /** roughly normal via sum of uniforms */
  normal(mean: number, sd: number): number {
    const u = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + u * sd * 1.22;
  }

  digits(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += this.int(0, 9);
    return s;
  }
}

export const round = (v: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
