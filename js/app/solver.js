// 배포본은 내장 Blob Worker를, 개발 서버는 같은 출처의 모듈 Worker를 쓴다.
export const SOLVER_GLOBAL = "__TETRISHARP_SOLVER__";
export const SOLVER_UNAVAILABLE = Symbol("solver unavailable");

/** @typedef {import("../modes/puzzle-task.js").runPuzzleTask} RunPuzzleTask */
/** @typedef {Parameters<RunPuzzleTask>[0]} PuzzleTask */
/** @typedef {ReturnType<RunPuzzleTask>} Result */
/** @typedef {import("../modes/puzzle-solver.js").SolverTask} SolverTask */
/** @typedef {ReturnType<typeof import("../modes/puzzle-solver.js").runSolverTask>} SolverResult */
/** @typedef {Extract<Result, { key: string }>} DailyResult */
/** @template T @typedef {{ promise: Promise<T | typeof SOLVER_UNAVAILABLE | undefined>, cancel: () => void }} Job */

export const createSolver = () => {
  /** @type {Worker | null} */
  let worker = null;
  let workerUrl = "";
  let nextId = 1;
  /** @type {Map<number, { task: PuzzleTask, resolve: (result: Result | typeof SOLVER_UNAVAILABLE | undefined) => void }>} */
  const pending = new Map();

  const stop = () => {
    worker?.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = "";
  };

  const fail = () => {
    stop();
    for (const { resolve } of pending.values()) resolve(SOLVER_UNAVAILABLE);
    pending.clear();
  };

  const start = () => {
    if (worker || typeof Worker === "undefined") return worker;
    const source = /** @type {any} */ (globalThis)[SOLVER_GLOBAL];
    try {
      if (typeof source === "string") {
        workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        worker = new Worker(workerUrl);
      } else if (typeof document !== "undefined") {
        worker = new Worker(new URL("./js/workers/solver.js", document.baseURI), { type: "module" });
      }
    } catch {
      stop();
    }
    const current = worker;
    if (!current) return null;
    current.onmessage = ({ data: { id, result } }) => {
      if (worker !== current) return;
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      job.resolve(result);
    };
    const onFailure = (/** @type {Event} */ event) => {
      event.preventDefault();
      if (worker !== current) return;
      fail();
    };
    current.onerror = onFailure;
    current.onmessageerror = onFailure;
    return current;
  };

  const send = jobs => {
    const target = start();
    if (!target) return fail();
    try {
      for (const [id, { task }] of jobs) target.postMessage({ id, task });
    } catch {
      fail();
    }
  };

  /** @param {PuzzleTask} task */
  const dispatch = task => {
    const id = nextId++;
    /** @type {Job<Result>["promise"]} */
    const promise = new Promise(resolve => pending.set(id, { task, resolve }));
    send([[id, pending.get(id)]]);
    const cancel = () => {
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      job.resolve(undefined);
      // 동기 탐색을 중단하고, 아직 필요한 요청은 새 Worker에서 계속한다.
      stop();
      if (pending.size) send(pending);
    };
    return { promise, cancel };
  };

  return {
    /** @param {SolverTask} task */
    run: task => /** @type {Job<SolverResult>} */ (dispatch(task)),
    /** @param {string} key */
    generateDaily: key => /** @type {Job<DailyResult | null>} */ (dispatch({ type: "daily", key })),
  };
};
