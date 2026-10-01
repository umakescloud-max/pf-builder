import { pickOne, randomInt, shuffle, type Rand } from "./rng";

const FIRST_NAMES = [
  "Jordan", "Maria", "Wei", "Fatima", "Daniel", "Aisha", "Lucas", "Priya",
  "Noah", "Sofia", "Kwame", "Elena", "Marcus", "Yuki", "Samuel", "Ines",
  "Devon", "Grace", "Omar", "Hannah", "Carlos", "Mei", "Julian", "Zara",
  "Ethan", "Nadia", "Victor", "Lena", "Tariq", "Olivia",
];

const LAST_NAMES = [
  "Alvarez", "Chen", "Nguyen", "Okafor", "Reyes", "Patel", "Johansson",
  "Kowalski", "Haddad", "Mensah", "Rossi", "Fitzgerald", "Hernandez",
  "Oduya", "Lindqvist", "Baptiste", "Silva", "Kaur", "Novak", "Walsh",
];

/** A plausible fictional full name, deterministic for the given rand. */
export function fakeName(rand: Rand): string {
  return `${pickOne(rand, FIRST_NAMES)} ${pickOne(rand, LAST_NAMES)}`;
}

/** A fictional person's name formatted as "F. Last", for shorthand references. */
export function fakeInitialName(rand: Rand): string {
  const first = pickOne(rand, FIRST_NAMES);
  const last = pickOne(rand, LAST_NAMES);
  return `${first[0]}. ${last}`;
}

/**
 * A full-name generator that cycles through every surname once (in a
 * shuffled order) before any surname repeats, reshuffling only once the
 * pool is exhausted. Use this instead of calling `fakeName` independently
 * per record whenever a dataset has more than a handful of entries — pure
 * independent random picks produce near-immediate, coincidental surname
 * repeats that read as a bug rather than a 20-surname pool being reused.
 */
export function createNameGenerator(rand: Rand) {
  let surnameQueue: string[] = [];
  function nextSurname(): string {
    if (surnameQueue.length === 0) {
      surnameQueue = shuffle(rand, LAST_NAMES);
    }
    return surnameQueue.pop() as string;
  }
  return {
    next(): string {
      return `${pickOne(rand, FIRST_NAMES)} ${nextSurname()}`;
    },
  };
}

/** A reserved, non-dialable 555-01xx number — never a real exchange. */
export function fakePhone(rand: Rand): string {
  const line = String(randomInt(rand, 0, 99)).padStart(2, "0");
  return `555-01${line}`;
}

/** A clearly synthetic medical record number. */
export function fakeMrn(rand: Rand): string {
  const n = String(randomInt(rand, 0, 999999)).padStart(6, "0");
  return `DEMO-${n}`;
}
