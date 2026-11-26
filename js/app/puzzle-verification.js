import { canSearch, solutionTask } from "../modes/custom-puzzle.js";

const AUTO_CHECK_PIECES = 12;
const AUTO_CHECK_DELAY = 600;

/** @typedef {{ type: string, hold: boolean, board: Uint8Array, cells: Array<[number, number]> }} SolutionMove */
/** @typedef {{ code: string, state: "checking" | "solvable" | "unsolvable" | "exhausted", moves?: SolutionMove[] }} Verified */

/**
 * @param {{
 *   solver: ReturnType<typeof import("./solver.js").createSolver>,
 *   getPuzzle: () => import("../modes/custom-puzzle.js").CustomPuzzle,
 *   getKey: () => string | null,
 *   hasWarnings: () => boolean,
 * }} options
 */
export const createPuzzleVerification = ({ solver, getPuzzle, getKey, hasWarnings }) => {
  /** @type {Verified | null} */
  let result = null;
  /** @type {ReturnType<typeof solver.run> | null} */
  let search = null;
  let timer = 0;
  /** @type {string | null} */
  let stoppedKey = null;

  const suspend = () => {
    clearTimeout(timer);
    search?.cancel();
    search = null;
    if (result?.state === "checking") result = null;
  };
  const isStopped = () => Boolean(stoppedKey && stoppedKey === getKey());
  const isSmall = () => getPuzzle().pieces.length <= AUTO_CHECK_PIECES;
  const canAutoCheck = () => {
    const code = getKey();
    return Boolean(
      code &&
        isSmall() &&
        canSearch(getPuzzle()) &&
        !hasWarnings() &&
        !search &&
        code !== stoppedKey &&
        code !== result?.code
    );
  };

  return {
    get result() {
      return result;
    },
    get checking() {
      return Boolean(search);
    },
    isSmall,
    isStopped,
    suspend,
    begin() {
      clearTimeout(timer);
      stoppedKey = null;
    },
    reset() {
      suspend();
      result = null;
    },
    sync() {
      if (!result || result.code === getKey()) return;
      suspend();
      result = null;
    },
    stop() {
      stoppedKey = getKey();
      suspend();
    },
    schedule(isOpen, run) {
      clearTimeout(timer);
      if (!canAutoCheck()) return;
      timer = setTimeout(() => {
        if (isOpen() && canAutoCheck()) run();
      }, AUTO_CHECK_DELAY);
    },
    start(onComplete) {
      const code = getKey();
      const puzzle = getPuzzle();
      if (!code || search || !canSearch(puzzle)) return false;
      result = { code, state: "checking" };
      const job = solver.run(solutionTask(puzzle));
      search = job;
      job.promise.then(value => {
        if (search !== job) return;
        search = null;
        if (value === undefined) return;
        result =
          value && "moves" in value
            ? { code, state: "solvable", moves: value.moves }
            : { code, state: value ? "exhausted" : "unsolvable" };
        onComplete();
      });
      return true;
    },
  };
};
