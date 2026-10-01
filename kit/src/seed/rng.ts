// Deterministic PRNG so a given demo slug always generates the same
// "random" seed data. Never use Math.random() in seed code — check:static
// greps for it.

export type Rand = () => number;

function hashSeed(slug: string): number {
  let h = 1779033703 ^ slug.length;
  for (let i = 0; i < slug.length; i++) {
    h = Math.imul(h ^ slug.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function rng(slug: string): Rand {
  let seed = hashSeed(slug);
  return function mulberry32() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rand: Rand, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export function pickOne<T>(rand: Rand, items: readonly T[]): T {
  return items[randomInt(rand, 0, items.length - 1)];
}

export function pickWeighted<T>(rand: Rand, items: readonly [T, number][]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

export function shuffle<T>(rand: Rand, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(rand, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
