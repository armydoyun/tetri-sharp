// 퍼즐 풀이 탐색을 화면 밖에서 돌린다. 배포본에는 Worker 소스가 문자열로 들어 있어(tools/build.mjs) Blob Worker로 띄운다.
// Worker를 쓸 수 없으면(개발용 모듈 실행, 막힌 환경) 잠깐 뒤 화면 쪽에서 돌린다 — "찾는 중" 문구가 먼저 그려지도록.
import { runSolverTask } from "../modes/puzzle-solver.js";

/** 빌드가 넣는 전역 이름(tools/build.mjs의 SOLVER_GLOBAL과 같다) */
export const SOLVER_GLOBAL = "__TETRISHARP_SOLVER__";

/** @typedef {import("../modes/puzzle-solver.js").SolverTask} SolverTask */
/** @typedef {ReturnType<typeof runSolverTask>} SolverResult */

export const createSolver = () => {
  /** @type {Worker | null} */
  let worker = null;
  let workerUrl = "";
  let broken = false;
  let nextId = 1;
  /** @type {Map<number, { task: SolverTask, resolve: (r: SolverResult | undefined) => void }>} */
  const pending = new Map();

  /** 화면 쪽에서 돌린다(잠깐 뒤에) */
  const runHere = (id, task) =>
    setTimeout(() => {
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      job.resolve(runSolverTask(task));
    }, 30);

  const stop = () => {
    worker?.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = "";
  };

  const start = () => {
    if (worker || broken) return worker;
    const source = /** @type {any} */ (globalThis)[SOLVER_GLOBAL];
    if (typeof source !== "string" || typeof Worker === "undefined") {
      broken = true;
      return null;
    }
    try {
      workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      worker = new Worker(workerUrl);
    } catch {
      stop();
      broken = true;
      return null;
    }
    worker.onmessage = event => {
      const { id, result } = event.data;
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      job.resolve(result);
    };
    // Worker가 뜨지 못하면(막힌 환경) 남은 일은 화면 쪽에서
    worker.onerror = event => {
      event.preventDefault?.();
      stop();
      broken = true;
      for (const [id, job] of pending) runHere(id, job.task);
    };
    return worker;
  };

  return {
    /**
     * @param {SolverTask} task
     * @returns {{ promise: Promise<SolverResult | undefined>, cancel: () => void }}  취소하면 undefined로 끝난다
     */
    run(task) {
      const id = nextId++;
      /** @type {Promise<SolverResult | undefined>} */
      const promise = new Promise(resolve => pending.set(id, { task, resolve }));
      const w = start();
      if (w) w.postMessage({ id, task });
      else runHere(id, task);
      const cancel = () => {
        const job = pending.get(id);
        if (!job) return;
        pending.delete(id);
        job.resolve(undefined);
        if (!worker) return;
        // 도는 중인 탐색은 멈출 수 없으므로 Worker를 버리고, 남은 일은 새 Worker에 다시 보낸다
        stop();
        const left = [...pending];
        if (left.length) {
          const fresh = start();
          for (const [otherId, other] of left)
            if (fresh) fresh.postMessage({ id: otherId, task: other.task });
            else runHere(otherId, other.task);
        }
      };
      return { promise, cancel };
    },
    /** Worker로 도는지(테스트·확인용) */
    usesWorker: () => Boolean(start()),
  };
};
