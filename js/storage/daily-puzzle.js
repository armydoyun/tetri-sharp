import { isDailyPuzzleDate } from "../modes/daily-puzzle.js";

export const DAILY_PUZZLE_CLEARED = "daily-puzzle:cleared";

export const sanitizeDailyPuzzleCleared = days =>
  Array.isArray(days) ? [...new Set(days.filter(isDailyPuzzleDate))].sort() : [];

export const createDailyPuzzleProgress = store => {
  const read = () => sanitizeDailyPuzzleCleared(store.get(DAILY_PUZZLE_CLEARED, []));
  return {
    solved: key => read().includes(key),
    mark: key => store.set(DAILY_PUZZLE_CLEARED, sanitizeDailyPuzzleCleared([...read(), key])),
  };
};
