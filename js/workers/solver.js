// 퍼즐 풀이 탐색 Worker: 탐색이 몇 초 걸려도 화면이 멈추지 않게 따로 돈다.
// 빌드(tools/build.mjs)가 이 파일을 따로 묶어 문자열로 본 스크립트에 넣고, js/app/solver.js가 Blob Worker로 띄운다.
import { runSolverTask } from "../modes/puzzle-solver.js";

const scope = /** @type {any} */ (self);
scope.onmessage = (/** @type {MessageEvent} */ event) => {
  const { id, task } = event.data;
  scope.postMessage({ id, result: runSolverTask(task) });
};
