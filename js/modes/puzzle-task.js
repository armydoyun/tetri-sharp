import { isDailyPuzzleDate } from "./daily-puzzle.js";
import { generateDay } from "./daily-puzzle-generation.js";
import { runSolverTask } from "./puzzle-solver.js";

/** @typedef {import("./puzzle-solver.js").SolverTask | { type: "daily", key: string }} PuzzleTask */

/** @param {PuzzleTask} task */
export const runPuzzleTask = task => {
  if (task.type !== "daily") return runSolverTask(task);
  if (!isDailyPuzzleDate(task.key)) return null;
  try {
    const { key, seed, family, code, pieces, cells, goal } = generateDay(task.key);
    return { key, seed, family, code, pieces, cells, goal };
  } catch {
    return null;
  }
};
