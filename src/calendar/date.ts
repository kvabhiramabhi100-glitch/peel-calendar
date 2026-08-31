// date.ts — owns the calendar's date state: the current day, decrement-by-one
// (each peel), reset, and week-number derivation. The styled readout + printed
// face live in face.ts / the HTML overlay (Step 7); this is just the state.

// Flip this one line to start from today instead of a fixed date.
export const START_DATE = new Date(2025, 7, 31); // 2025-08-31 (month is 0-indexed)

export interface DateState {
  get(): Date;
  decrement(): Date; // step back one day, returns the new date
  reset(): Date;
}

export function createDateState(start: Date = START_DATE): DateState {
  let current = new Date(start.getTime());
  return {
    get: () => new Date(current.getTime()),
    decrement: () => {
      current = new Date(current.getTime());
      current.setDate(current.getDate() - 1);
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
