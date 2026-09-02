// date.ts — owns the calendar's date state: the current day, advance-by-one
// (each peel), reset, and week-number derivation. The styled readout + printed
// face live in face.ts / the HTML overlay; this is just the state.

/**
 * The date shown on the top sheet. Defaults to TODAY, so the calendar is always
 * correct without anyone editing the source. To pin a fixed date instead (handy
 * for screenshots), replace the body with e.g. `new Date(2025, 7, 31)` —
 * month is 0-indexed.
 */
export function startDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight
}

export interface DateState {
  get(): Date;
  /**
   * Tear off the current sheet, revealing the next day. A real peel-off
   * calendar counts FORWARD: you remove today to expose tomorrow.
   */
  advance(): Date;
  reset(): Date;
}

export function createDateState(start: Date = startDate()): DateState {
  let current = new Date(start.getTime());
  return {
    get: () => new Date(current.getTime()),
    advance: () => {
      current = new Date(current.getTime());
      current.setDate(current.getDate() + 1);
      return new Date(current.getTime());
    },
    reset: () => {
      current = new Date(start.getTime());
      return new Date(current.getTime());
    },
  };
}

// ISO-8601 week number (Mon-based), handy for the "WEEK" line later.
export function weekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}
