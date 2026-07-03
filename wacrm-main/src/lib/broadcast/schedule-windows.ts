export interface ScheduleWindow {
  start: string; // "HH:MM" 24h
  end: string;   // "HH:MM" 24h
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function currentMinsInTZ(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value);
  const m = parseInt(parts.find((p) => p.type === 'minute')!.value);
  return h * 60 + m;
}

/** Returns true if `now` (in `tz`) falls within any of the windows. */
export function isInScheduleWindow(now: Date, windows: ScheduleWindow[], tz: string): boolean {
  if (!windows.length) return true;
  const mins = currentMinsInTZ(now, tz);
  return windows.some((w) => mins >= timeToMins(w.start) && mins < timeToMins(w.end));
}

/**
 * Returns the Unix ms timestamp of the start of the next schedule window
 * after `now`. If there is a window later today, returns its start today;
 * otherwise returns the first window's start tomorrow.
 *
 * NOTE: uses wall-clock minutes so it is off by ≤1 h during DST transitions,
 * which is acceptable for broadcast scheduling.
 */
export function nextWindowOpenMs(now: Date, windows: ScheduleWindow[], tz: string): number {
  const mins = currentMinsInTZ(now, tz);
  const sorted = [...windows].sort((a, b) => timeToMins(a.start) - timeToMins(b.start));

  const next = sorted.find((w) => timeToMins(w.start) > mins);
  const minsUntilNext = next
    ? timeToMins(next.start) - mins
    : 24 * 60 - mins + timeToMins(sorted[0].start);

  return now.getTime() + minsUntilNext * 60 * 1000;
}

/**
 * Given a target time (ms), return the timestamp to actually use:
 * - if target falls inside a window → use it as-is
 * - otherwise → next window opening from now
 */
export function clampToWindow(
  targetMs: number,
  windows: ScheduleWindow[],
  tz: string,
): number {
  if (!windows.length) return targetMs;
  if (isInScheduleWindow(new Date(targetMs), windows, tz)) return targetMs;
  return nextWindowOpenMs(new Date(), windows, tz);
}
