// Shift cutoffs at 07:30 and 19:30 plant time (UTC+8).
// 07:30 UTC+8 = 23:30 UTC (previous day); 19:30 UTC+8 = 11:30 UTC.
const OFFSET_MS = 8 * 3600_000;
const CUTOFF_MINUTES = [7 * 60 + 30, 19 * 60 + 30];

export type Shift = "Day" | "Night";

export function shiftOf(iso: string): Shift {
  const local = new Date(new Date(iso).getTime() + OFFSET_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minutes >= CUTOFF_MINUTES[0]! && minutes < CUTOFF_MINUTES[1]! ? "Day" : "Night";
}

/** Cutoff instants strictly between start and end (ms). */
export function cutoffsBetween(startMs: number, endMs: number): number[] {
  const out: number[] = [];
  const local = new Date(startMs + OFFSET_MS);
  const dayStartLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (let day = dayStartLocal; day - OFFSET_MS < endMs; day += 86_400_000) {
    for (const m of CUTOFF_MINUTES) {
      const t = day + m * 60_000 - OFFSET_MS;
      if (t > startMs && t < endMs) out.push(t);
    }
  }
  return out;
}
