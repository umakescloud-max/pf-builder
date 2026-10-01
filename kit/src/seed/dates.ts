// Every date in seed data must be relative to render time, never a literal
// ISO string, so "today" in a demo is always today. check:static greps
// seed.ts files for literal ISO date strings and fails the build if found.

/** A date `daysOffset` days from right now, optionally at a fixed clock time. */
export function rel(daysOffset: number, time?: `${number}:${number}`): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Adds (or subtracts, for negative n) n business days to `date`. */
export function addBusinessDays(date: Date, n: number): Date {
  const d = new Date(date);
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

/**
 * Business days from `a` to `b`. Positive when `b` is after `a`. Weekends
 * are never counted as a day moved. Used for every on-screen countdown —
 * never write a day count as prose, always compute it from two dates.
 */
export function businessDaysBetween(a: Date, b: Date): number {
  const step = b.getTime() >= a.getTime() ? 1 : -1;
  const cur = new Date(a);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while ((step > 0 && cur < end) || (step < 0 && cur > end)) {
    cur.setDate(cur.getDate() + step);
    if (!isWeekend(cur)) count += step;
  }
  return count;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
